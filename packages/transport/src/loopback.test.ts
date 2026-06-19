import { describe, expect, it } from 'vitest';
import { LoopbackNetwork } from './loopback.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function first(channel: { messages(): AsyncIterableIterator<Uint8Array> }): Promise<string> {
  const { value } = await channel.messages().next();
  return dec.decode(value);
}

describe('LoopbackNetwork', () => {
  it('moves a frame from a dialer to an acceptor (plan §2.1 loopback)', async () => {
    const net = new LoopbackNetwork();
    const alice = net.endpoint('alice');
    const bob = net.endpoint('bob');

    const accepted = bob.accept('safu/block');
    const dialer = await alice.connect(bob.addr(), 'safu/block');
    await dialer.send(enc.encode('block-payload'));

    const { value: channel } = await accepted.next();
    expect(channel?.peer).toBe('alice');
    expect(await first(channel as never)).toBe('block-payload');
  });

  it('carries frames in both directions', async () => {
    const net = new LoopbackNetwork();
    const a = net.endpoint('a');
    const b = net.endpoint('b');

    const accepted = b.accept('safu/sync');
    const dialer = await a.connect(b.addr(), 'safu/sync');
    const { value: acceptor } = await accepted.next();

    await dialer.send(enc.encode('ping'));
    await (acceptor as never as { send(m: Uint8Array): Promise<void> }).send(enc.encode('pong'));

    expect(await first(acceptor as never)).toBe('ping');
    expect(await first(dialer)).toBe('pong');
  });

  it('reports the authenticated peer id on both ends', async () => {
    const net = new LoopbackNetwork();
    const a = net.endpoint('a');
    const b = net.endpoint('b');
    const accepted = b.accept('p');
    const dialer = await a.connect(b.addr(), 'p');
    const { value: acceptor } = await accepted.next();

    expect(dialer.peer).toBe('b');
    expect((acceptor as { peer: string }).peer).toBe('a');
  });

  it('rejects dialing a peer that is not accepting the protocol', async () => {
    const net = new LoopbackNetwork();
    const a = net.endpoint('a');
    const b = net.endpoint('b');
    await expect(a.connect(b.addr(), 'unlistened')).rejects.toThrow(/not accepting/);
  });
});
