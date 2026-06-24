// Pull one content-addressed block from a peer over the transport, with no
// SyncDoc or wallet in scope. DocSync uses this for auto-pull; the public-share
// viewer uses it standalone to fetch a share's blocks by hash (docs/public-share.md).
//
// Only ciphertext crosses the wire (zero-knowledge invariant): the request is a
// bare hash, the response the opaque bytes the serving store holds.

import type { PeerAddr, Transport } from '@safu/transport';
import type { BlockStore } from './block-store.js';

/** ALPN-style protocol tag for block-by-hash transfer. */
export const BLOCK_PROTOCOL = 'safu/blocks/1';

const enc = new TextEncoder();

/** Dial `peer` over BLOCK_PROTOCOL, request the block named by `hash`, persist
 *  it to `store`, and return the bytes — or undefined if the peer lacks it. */
export async function fetchBlock(
  transport: Transport,
  peer: PeerAddr,
  hash: string,
  store: BlockStore,
): Promise<Uint8Array | undefined> {
  const channel = await transport.connect(peer, BLOCK_PROTOCOL);
  try {
    await channel.send(enc.encode(hash));
    const { value } = await channel.messages().next();
    if (!value || value.byteLength === 0) return undefined;
    await store.put(hash, value);
    return value;
  } finally {
    await channel.close();
  }
}
