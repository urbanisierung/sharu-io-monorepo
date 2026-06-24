// The public-share link (docs/public-share.md). Like the pairing code, it is
// URL-safe base64 of a small JSON carried in the URL *hash* — so the secret it
// contains (the share key `K_share`) never leaves the device: browsers don't
// send the fragment to servers. It bundles everything a keyless viewer needs to
// open a share: where to fetch the manifest block (`root` + `rootNonce`), the
// key to decrypt it (`key`), and which peer serves the blocks (`peer`).
import type { PeerAddr } from '@safu/transport';

export interface ShareInfo {
  /** Ciphertext address (BLAKE3) of the sealed manifest block. */
  root: string;
  /** base64url AES-GCM nonce that decrypts the manifest block. */
  rootNonce: string;
  /** base64url 32-byte share key. The secret — fragment-only, never on a server. */
  key: string;
  /** The always-on node that serves the share's blocks over BLOCK_PROTOCOL. */
  peer: PeerAddr;
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('share code: not base64url');
  return atob(code.replace(/-/g, '+').replace(/_/g, '/'));
}

export function encodeShareCode(info: ShareInfo): string {
  const payload: { root: string; rootNonce: string; key: string; id: string; relayUrl?: string } = {
    root: info.root,
    rootNonce: info.rootNonce,
    key: info.key,
    id: info.peer.id,
  };
  if (info.peer.relayUrl !== undefined) payload.relayUrl = info.peer.relayUrl;
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShareCode(code: string): ShareInfo {
  const parsed: unknown = JSON.parse(fromBase64Url(code));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('share code: not an object');
  const { root, rootNonce, key, id, relayUrl } = parsed as Record<string, unknown>;
  if (typeof root !== 'string' || root.length === 0) throw new Error('share code: missing root');
  if (typeof rootNonce !== 'string' || rootNonce.length === 0) {
    throw new Error('share code: missing rootNonce');
  }
  if (typeof key !== 'string' || key.length === 0) throw new Error('share code: missing key');
  if (typeof id !== 'string' || id.length === 0) throw new Error('share code: missing peer id');
  if (relayUrl !== undefined && typeof relayUrl !== 'string') {
    throw new Error('share code: invalid relayUrl');
  }
  const peer: PeerAddr = relayUrl === undefined ? { id } : { id, relayUrl };
  return { root, rootNonce, key, peer };
}

/** A deep link that opens a share in the keyless viewer route (`/s`). The code
 *  rides the hash, so the share key never reaches the server hosting the app. */
export function shareLink(code: string, origin: string): string {
  return `${origin}/s#share=${encodeURIComponent(code)}`;
}

/** Extract a share code from a URL hash (`#share=…`), or undefined if absent. */
export function readShareFromHash(hash: string): string | undefined {
  const match = /[#&]share=([^&]+)/.exec(hash);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
