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

async function acceptPin(channel: Channel, store: BlockStore, policy: PinPolicy): Promise<void> {
  try {
    const messages = channel.messages();
    const head = await messages.next();
    const body = await messages.next();
    if (head.done || body.done || !(await accepts(head.value, body.value, policy))) {
      await channel.send(Uint8Array.of(ACK_REJECT));
      return;
    }
    const { hash } = JSON.parse(dec.decode(head.value)) as PinRequest;
    await store.put(hash, body.value);
    await channel.send(Uint8Array.of(ACK_OK));
  } catch {
    // A malformed frame or a transport error: reject if we still can, else drop.
    try {
      await channel.send(Uint8Array.of(ACK_REJECT));
    } catch {
      /* channel already gone */
    }
  } finally {
    await channel.close();
  }
}

async function accepts(head: Uint8Array, body: Uint8Array, policy: PinPolicy): Promise<boolean> {
  let request: PinRequest;
  try {
    request = JSON.parse(dec.decode(head)) as PinRequest;
  } catch {
    return false;
  }
  if (typeof request?.hash !== 'string' || request.hash.length === 0) return false;
  if (typeof request.signId !== 'string' || typeof request.sig !== 'string') return false;
  if (!policy.authorized(request.signId)) return false;
  if (!verifySignature(request.signId, enc.encode(request.hash), request.sig)) return false;
  if (policy.verifyHash && !(await policy.verifyHash(request.hash, body))) return false;
  return true;
}
