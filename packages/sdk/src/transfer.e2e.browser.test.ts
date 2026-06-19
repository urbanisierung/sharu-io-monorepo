// End-to-end transfer over the real n0.computer relay (plan §2.4 verify).
//
// GATED: opt-in via SAFU_E2E=1 (injected as `__SAFU_E2E__` by vitest.config.ts).
// Skipped by default so CI stays deterministic and offline-safe.
//
// KNOWN ENVIRONMENT LIMIT: in the headless CI sandbox this test cannot pass —
// Iroh's net-report HTTPS probes to the relays fail at the browser fetch/CORS
// layer (`TypeError: Failed to fetch`) even though the relay hosts answer plain
// HTTPS, so the endpoint never goes "online" and no home relay is selected. The
// transport code is correct up to that boundary (binds, configures pkarr/DNS,
// issues the right probes); run this from a normal browser origin with relay
// access to exercise the actual relay hop. The full pipeline minus the relay is
// proven over the loopback transport in `apps/web/src/sync.integration.test.ts`.
import { blake3 } from '@safu/crypto';
import { createIrohTransport } from '@safu/transport/iroh';
import { describe, expect, it } from 'vitest';
import { MemoryBlockStore } from './block-store.js';
import { DocSync } from './doc-sync.js';
import { SyncDoc } from './sync-doc.js';

declare const __SAFU_E2E__: boolean;
const enabled = typeof __SAFU_E2E__ !== 'undefined' && __SAFU_E2E__;

const until = async (predicate: () => boolean, timeout = 30_000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met within timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe.skipIf(!enabled)('browser-to-browser transfer over the relay', () => {
  it('converges the doc and transfers a block with hash parity', async () => {
    const protocols = ['safu/sync/1', 'safu/blocks/1'];
    // createIrohTransport waits until the endpoint is online (home relay set).
    const ta = await createIrohTransport(protocols);
    const tb = await createIrohTransport(protocols);

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
  }, 120_000);
});
