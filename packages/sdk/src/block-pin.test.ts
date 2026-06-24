import { LoopbackNetwork } from '@safu/transport';
import { describe, expect, it } from 'vitest';
import { type PinPolicy, pushBlock, servePins } from './block-pin.js';
import { MemoryBlockStore } from './block-store.js';
import { createSigner } from './signing.js';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const device = createSigner(new Uint8Array(32).fill(7));
const stranger = createSigner(new Uint8Array(32).fill(9));

/** A policy authorizing exactly the given signing ids. */
const allow = (...ids: string[]): PinPolicy => ({ authorized: (id) => ids.includes(id) });

function wire() {
  const net = new LoopbackNetwork();
  return { node: net.endpoint('node'), client: net.endpoint('client') };
}

describe('block pin', () => {
  it('stores a signed pin from an authorized device', async () => {
    const { node, client } = wire();
    const store = new MemoryBlockStore();
    const stop = servePins(node, store, allow(device.id));
    await flush();

    const block = new Uint8Array([1, 2, 3, 4]);
    const ok = await pushBlock(client, node.addr(), 'hash-1', block, device);
    expect(ok).toBe(true);
    // The block now lives in the node's store, ready to be served over
    // BLOCK_PROTOCOL by the DocSync the node already runs (peer integration test).
    expect(await store.get('hash-1')).toEqual(block);
    stop();
  });

  it('rejects a pin from an unauthorized signer', async () => {
    const { node, client } = wire();
    const store = new MemoryBlockStore();
    servePins(node, store, allow(device.id));
    await flush();

    const ok = await pushBlock(client, node.addr(), 'hash-1', new Uint8Array([9]), stranger);
    expect(ok).toBe(false);
    expect(await store.has('hash-1')).toBe(false);
  });

  it('rejects a pin whose bytes fail the injected hash check', async () => {
    const { node, client } = wire();
    const store = new MemoryBlockStore();
    const policy: PinPolicy = {
      authorized: (id) => id === device.id,
      verifyHash: (hash, bytes) => hash === `len-${bytes.length}`,
    };
    servePins(node, store, policy);
    await flush();

    expect(await pushBlock(client, node.addr(), 'len-2', new Uint8Array([1, 2]), device)).toBe(
      true,
    );
    expect(await pushBlock(client, node.addr(), 'len-2', new Uint8Array([1]), device)).toBe(false);
    expect(await store.has('len-2')).toBe(true);
  });
});
