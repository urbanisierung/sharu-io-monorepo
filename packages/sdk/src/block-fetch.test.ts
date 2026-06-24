import { LoopbackNetwork } from '@safu/transport';
import { describe, expect, it } from 'vitest';
import { BLOCK_PROTOCOL, fetchBlock } from './block-fetch.js';
import { MemoryBlockStore } from './block-store.js';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const dec = new TextDecoder();

/** Minimal block server: answer each hash request from `store`, empty if absent. */
function serveBlocks(transport: ReturnType<LoopbackNetwork['endpoint']>, store: MemoryBlockStore) {
  void (async () => {
    for await (const channel of transport.accept(BLOCK_PROTOCOL)) {
      void (async () => {
        for await (const msg of channel.messages()) {
          const block = await store.get(dec.decode(msg));
          await channel.send(block ?? new Uint8Array(0));
        }
      })();
    }
  })();
}

describe('fetchBlock', () => {
  it('pulls a block by hash and persists it locally', async () => {
    const net = new LoopbackNetwork();
    const server = net.endpoint('server');
    const client = net.endpoint('client');
    const remote = new MemoryBlockStore();
    const local = new MemoryBlockStore();

    const cipher = new Uint8Array([9, 8, 7, 6]);
    await remote.put('hash-1', cipher);
    serveBlocks(server, remote);
    await flush();

    const pulled = await fetchBlock(client, server.addr(), 'hash-1', local);
    expect(pulled).toEqual(cipher);
    expect(await local.get('hash-1')).toEqual(cipher);
  });

  it('resolves undefined when the peer lacks the block', async () => {
    const net = new LoopbackNetwork();
    const server = net.endpoint('server');
    const client = net.endpoint('client');
    const local = new MemoryBlockStore();

    serveBlocks(server, new MemoryBlockStore());
    await flush();

    const pulled = await fetchBlock(client, server.addr(), 'missing', local);
    expect(pulled).toBeUndefined();
    expect(await local.has('missing')).toBe(false);
  });
});
