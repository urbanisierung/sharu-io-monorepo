// App-layer signing identity (status next-step #7). Authorship of replicated
// ops is bound to an Ed25519 key whose public key IS the author id, so a
// still-trusted device cannot forge another peer's author id: it would have to
// produce a signature it cannot make. This is decoupled from the transport's
// (ephemeral) endpoint key, keeping the document transport-agnostic.
//
// Ed25519 is used synchronously (via @noble/curves) so SyncDoc's mutation API
// stays synchronous — WebCrypto's Ed25519 is async and would force a breaking
// change on the runtime-agnostic SDK.
import { ed25519 } from '@noble/curves/ed25519.js';

/** A signing identity. `id` is the lowercase-hex Ed25519 public key; signatures
 *  are returned as lowercase hex so they travel as plain JSON over the wire. */
export interface Signer {
  readonly id: string;
  sign(data: Uint8Array): string;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Build a signing identity from a 32-byte seed (the Ed25519 secret key). */
export function createSigner(seed: Uint8Array): Signer {
  const id = toHex(ed25519.getPublicKey(seed));
  return { id, sign: (data) => toHex(ed25519.sign(data, seed)) };
}

/** Verify hex `sig` over `data` was produced by the author whose id is `authorId`
 *  (its hex public key). Returns false on any malformed input rather than throwing. */
export function verifySignature(authorId: string, data: Uint8Array, sig: string): boolean {
  try {
    return ed25519.verify(fromHex(sig), data, fromHex(authorId));
  } catch {
    return false;
  }
}
