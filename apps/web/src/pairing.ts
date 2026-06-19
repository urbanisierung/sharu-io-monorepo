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
