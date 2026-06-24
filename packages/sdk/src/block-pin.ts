// Push a content-addressed block to an always-on node so it stays reachable
// (docs/public-share.md). Public-share blocks are re-ingested under a random key
// and so are NOT in the wallet's allocation table — DocSync's auto-pull never
// sees them. This protocol is the explicit upload path: a device pins each share
// block to the node, which stores it and then serves it like any other block
// over BLOCK_PROTOCOL. Revoking a share later = the node dropping these blocks.
//
// Authorization mirrors the document's model (sync-doc.ts): admission is by
// *author* (signing id), proven by an Ed25519 signature, not by the transport
// carrier. The node accepts a pin only from a signing id in its writer set.

import type { Channel, PeerAddr, PeerId, Transport } from '@safu/transport';
import type { BlockStore } from './block-store.js';
import { type Signer, verifySignature } from './signing.js';

/** ALPN-style protocol tag for block pinning. */
export const PIN_PROTOCOL = 'safu/pin/1';

/** ALPN-style protocol tag for unpinning (revoking) a block. */
export const UNPIN_PROTOCOL = 'safu/unpin/1';

const ACK_OK = 1;
const ACK_REJECT = 0;
const enc = new TextEncoder();
const dec = new TextDecoder();

interface PinRequest {
  hash: string;
  signId: PeerId;
  sig: string;
}

/** Pin one block to `peer`: send a signed request naming the block's hash, then
 *  the bytes. Resolves true if the node accepted (stored) it. The signature is
 *  over the hash, so the node can bind the upload to an authorized signing id. */
export async function pushBlock(
  transport: Transport,
  peer: PeerAddr,
  hash: string,
  bytes: Uint8Array,
  signer: Signer,
): Promise<boolean> {
  const channel = await transport.connect(peer, PIN_PROTOCOL);
  try {
    const request: PinRequest = { hash, signId: signer.id, sig: signer.sign(enc.encode(hash)) };
    await channel.send(enc.encode(JSON.stringify(request)));
    await channel.send(bytes);
    const { value } = await channel.messages().next();
    return value?.length === 1 && value[0] === ACK_OK;
  } finally {
    await channel.close();
  }
}

/** Unpin (revoke) a block from `peer`: send a signed request naming the block's
 *  hash. Resolves true if the node accepted it and dropped the block. Revoking a
 *  public share unpins its blocks so the link stops resolving. */
export async function unpinBlock(
  transport: Transport,
  peer: PeerAddr,
  hash: string,
  signer: Signer,
): Promise<boolean> {
  const channel = await transport.connect(peer, UNPIN_PROTOCOL);
  try {
    const request: PinRequest = { hash, signId: signer.id, sig: signer.sign(enc.encode(hash)) };
    await channel.send(enc.encode(JSON.stringify(request)));
    const { value } = await channel.messages().next();
    return value?.length === 1 && value[0] === ACK_OK;
  } finally {
    await channel.close();
  }
}

/** What the node will accept a pin from, and (optionally) how it checks block
 *  integrity. `authorized` is the node's current writer set; `verifyHash`, if
 *  given, asserts the bytes actually hash to the claimed address — injected by
 *  the node, which has the BLAKE3 function, so this module stays crypto-free. */
export interface PinPolicy {
  authorized(signId: PeerId): boolean;
  verifyHash?(hash: string, bytes: Uint8Array): boolean | Promise<boolean>;
}

/** Accept inbound pin channels until the returned stop function is called. Each
 *  pin is stored only if its signer is authorized, its signature is valid, and
 *  (when `verifyHash` is given) its bytes match the claimed address. */
export function servePins(transport: Transport, store: BlockStore, policy: PinPolicy): () => void {
  let active = true;
  void (async () => {
    for await (const channel of transport.accept(PIN_PROTOCOL)) {
      if (!active) break;
      void acceptPin(channel, store, policy);
    }
  })();
  return () => {
    active = false;
  };
}

/** Accept inbound unpin channels until the returned stop function is called.
 *  A block is deleted only if the request is signed by an authorized peer. */
export function serveUnpins(
  transport: Transport,
  store: BlockStore,
  policy: PinPolicy,
): () => void {
  let active = true;
  void (async () => {
    for await (const channel of transport.accept(UNPIN_PROTOCOL)) {
      if (!active) break;
      void acceptUnpin(channel, store, policy);
    }
  })();
  return () => {
    active = false;
  };
}

async function acceptPin(channel: Channel, store: BlockStore, policy: PinPolicy): Promise<void> {
  try {
    const messages = channel.messages();
    const head = await messages.next();
    const body = await messages.next();
    const request = head.done ? undefined : authorize(head.value, policy);
    const ok =
      request !== undefined &&
      !body.done &&
      (!policy.verifyHash || (await policy.verifyHash(request.hash, body.value)));
    if (!ok || !request) {
      await channel.send(Uint8Array.of(ACK_REJECT));
      return;
    }
    await store.put(request.hash, body.value);
    await channel.send(Uint8Array.of(ACK_OK));
  } catch {
    await reject(channel);
  } finally {
    await channel.close();
  }
}

async function acceptUnpin(channel: Channel, store: BlockStore, policy: PinPolicy): Promise<void> {
  try {
    const messages = channel.messages();
    const head = await messages.next();
    const request = head.done ? undefined : authorize(head.value, policy);
    if (!request) {
      await channel.send(Uint8Array.of(ACK_REJECT));
      return;
    }
    await store.delete(request.hash);
    await channel.send(Uint8Array.of(ACK_OK));
  } catch {
    await reject(channel);
  } finally {
    await channel.close();
  }
}

/** Parse a request frame and return it only if it is well-formed, from an
 *  authorized signer, and carries that signer's signature over the hash. */
function authorize(head: Uint8Array, policy: PinPolicy): PinRequest | undefined {
  let request: PinRequest;
  try {
    request = JSON.parse(dec.decode(head)) as PinRequest;
  } catch {
    return undefined;
  }
  if (typeof request?.hash !== 'string' || request.hash.length === 0) return undefined;
  if (typeof request.signId !== 'string' || typeof request.sig !== 'string') return undefined;
  if (!policy.authorized(request.signId)) return undefined;
  if (!verifySignature(request.signId, enc.encode(request.hash), request.sig)) return undefined;
  return request;
}

/** Best-effort reject after a malformed frame or transport error. */
async function reject(channel: Channel): Promise<void> {
  try {
    await channel.send(Uint8Array.of(ACK_REJECT));
  } catch {
    /* channel already gone */
  }
}
