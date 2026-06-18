// End-to-end transfer over the real n0.computer relay (plan §2.4 verify).
//
// GATED: opt-in via SAFU_E2E=1. It needs outbound WebSocket access to the public
// relay and a Chromium with the Iroh WASM module, so it is skipped by default to
// keep CI deterministic and offline-safe (same "note the gap" convention the
// handoff uses for the OPFS browser test). When enabled it proves the full stack:
// two endpoints rendezvous via the relay, the allocation table converges, and an
// encrypted block transfers with hash parity — no manual configuration.

import { blake3 } from '@safu/crypto';
import { createIrohTransport } from '@safu/transport/iroh';
import { describe, expect, it } from 'vitest';
import { MemoryBlockStore } from './block-store.js';
import { DocSync } from './doc-sync.js';
import { SyncDoc } from './sync-doc.js';

const enabled = (import.meta as { env?: Record<string, string> }).env?.SAFU_E2E === '1';

/** Wait until the endpoint has a home relay assigned, or fail after `timeout`. */
async function awaitRelay(addr: () => { relayUrl?: string }, timeout = 20_000): Promise<string> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const url = addr().relayUrl;
    if (url) return url;
    if (Date.now() > deadline) throw new Error('relay not assigned within timeout');
    await new Promise((r) => setTimeout(r, 250));
  }
}

const until = async (predicate: () => boolean, timeout = 20_000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met within timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe.skipIf(!enabled)('browser-to-browser transfer over the relay', () => {
  it('converges the doc and transfers a block with hash parity', async () => {
    const protocols = ['safu/sync/1', 'safu/blocks/1'];
    const ta = await createIrohTransport(protocols);
    const tb = await createIrohTransport(protocols);
    await awaitRelay(() => ta.addr());
    await awaitRelay(() => tb.addr());

    const docA = new SyncDoc(ta.id());
    docA.addWriter(tb.id());
    const docB = new SyncDoc(tb.id());
    docB.addWriter(ta.id());

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    const cipher = crypto.getRandomValues(new Uint8Array(64));
    const address = await blake3(cipher);
    await storeA.put(address, cipher);

    await syncB.connect(ta.addr());
    docA.setFile('secret.bin', [address], cipher.byteLength, Date.now());

    await until(() => docB.files.value.some((f) => f.path === 'secret.bin'));
    const pulled = await syncB.requestBlock(ta.addr(), address);
    expect(pulled).toEqual(cipher);

    await syncA.close();
    await syncB.close();
  }, 60_000);
});
