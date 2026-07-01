// The copy-paste pairing code (plan §2.2 / status #7). It bundles what a peer
// needs to both *reach* this device (the transport address) and *trust* it (the
// signing identity, whose pubkey authorizes the peer's ops). Authorship is bound
// to the signing key, not the transport's ephemeral endpoint key, so the code
// must carry the signing id explicitly. URL-safe base64 of a small JSON, ready
// to wrap in a QR later.
import type { PeerAddr } from '@safu/transport';

export interface PairingInfo {
  addr: PeerAddr;
  signId: string;
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('pairing code: not base64url');
  return atob(code.replace(/-/g, '+').replace(/_/g, '/'));
}

export function encodePairingCode(info: PairingInfo): string {
  const payload: { id: string; relayUrl?: string; signId: string } = {
    id: info.addr.id,
    signId: info.signId,
  };
  if (info.addr.relayUrl !== undefined) payload.relayUrl = info.addr.relayUrl;
  return toBase64Url(JSON.stringify(payload));
}

export function decodePairingCode(code: string): PairingInfo {
  const parsed: unknown = JSON.parse(fromBase64Url(code));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('pairing code: not an object');
  const { id, relayUrl, signId } = parsed as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) throw new Error('pairing code: missing id');
  if (typeof signId !== 'string' || signId.length === 0) {
    throw new Error('pairing code: missing signing id');
  }
  if (relayUrl !== undefined && typeof relayUrl !== 'string') {
    throw new Error('pairing code: invalid relayUrl');
  }
  const addr: PeerAddr = relayUrl === undefined ? { id } : { id, relayUrl };
  return { addr, signId };
}

/** A deep link that carries a pairing code in the URL hash. It points straight
 *  at the app (`/app`) so opening it skips the landing page and lands the user
 *  in the unlock/link flow, where the code auto-links once they unlock. Scanning
 *  the QR with a phone's *native* camera needs no in-app scanner. The hash never
 *  leaves the device (browsers don't send it to servers). */
export function pairingLink(code: string, origin: string): string {
  return `${origin}/app#pair=${encodeURIComponent(code)}`;
}

/** Extract a pairing code from a URL hash (`#pair=…`), or undefined if absent.
 *  Lets a freshly-opened tab prefill the "link a device" field automatically. */
export function readPairingFromHash(hash: string): string | undefined {
  return readHashCode(hash, 'pair');
}

/** Extract a backup-node code from a URL hash (`#node=…`), or undefined if
 *  absent. The `sharu serve` deep link (`/link#node=…`) carries the node's
 *  pairing code here so the browser onboarding view can pick it up. Kept distinct
 *  from `#pair=` so the node link lands on the guided view, not the app's silent
 *  auto-link. */
export function readNodeFromHash(hash: string): string | undefined {
  return readHashCode(hash, 'node');
}

function readHashCode(hash: string, key: 'pair' | 'node'): string | undefined {
  const match = new RegExp(`[#&]${key}=([^&]+)`).exec(hash);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/** The deep link `sharu serve` prints for its pairing code: it opens the
 *  browser onboarding view (`/link`) with the node code in the hash, which never
 *  leaves the device. Mirrors `pairingLink` but targets the guided node flow. */
export function nodeLink(code: string, origin: string): string {
  return `${origin}/link#node=${encodeURIComponent(code)}`;
}
