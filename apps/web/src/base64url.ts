// Binary ⇄ URL-safe base64 for the share key and AES-GCM nonces
// (docs/public-share.md). The string/JSON codecs in pairing.ts and share-code.ts
// encode text; these encode raw bytes, and base64url keeps the key compact in
// the link (43 chars vs 64 for hex).
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(code: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(code)) throw new Error('invalid base64url');
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < out.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
