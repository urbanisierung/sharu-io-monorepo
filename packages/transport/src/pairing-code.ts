// A compact, copy-paste pairing code for exchanging a peer's dialable address
// out-of-band (plan §2.2 pairing UX). The code is the URL-safe base64 of the
// JSON `{ id, relayUrl }`, so it carries everything `connect` needs and can be
// wrapped in a QR later without changing the payload.

import type { PeerAddr } from './transport.js';

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('pairing code: not base64url');
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

/** Encode a peer address into a single URL-safe token to share out-of-band. */
export function encodePeerAddr(addr: PeerAddr): string {
  const payload: PeerAddr = { id: addr.id };
  if (addr.relayUrl !== undefined) payload.relayUrl = addr.relayUrl;
  return toBase64Url(JSON.stringify(payload));
}

/** Decode a pairing code back into a peer address. Throws if it is not a valid
 *  code or does not describe a peer (a string `id` is required). */
export function decodePeerAddr(code: string): PeerAddr {
  const parsed: unknown = JSON.parse(fromBase64Url(code));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('pairing code: not an object');
  const { id, relayUrl } = parsed as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) throw new Error('pairing code: missing id');
  if (relayUrl !== undefined && typeof relayUrl !== 'string') {
    throw new Error('pairing code: invalid relayUrl');
  }
  return relayUrl === undefined ? { id } : { id, relayUrl };
}
