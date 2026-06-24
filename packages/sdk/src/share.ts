// The manifest of a published file — the public-share analog of an
// allocation-table FileEntry (docs/public-share.md). It is the only object a
// keyless viewer needs to reassemble a share: an ordered list of blocks, each
// addressed by ciphertext hash (the fetch key) and verified by plaintext hash.
//
// This module is crypto-free on purpose: it defines the shape and its wire
// encoding only. Sealing the manifest under the share key, and decrypting it,
// happen at the app layer where the crypto pipeline already lives — so the SDK
// keeps handling opaque, content-addressed bytes and never touches keys.

/** One block of a published file. `addr` (BLAKE3 of ciphertext) is what the
 *  viewer fetches over BLOCK_PROTOCOL; `hash` (BLAKE3 of plaintext) is what it
 *  verifies the decrypted bytes against; `nonce` is the AES-GCM nonce. */
export interface ShareBlockRef {
  addr: string;
  hash: string;
  nonce: string; // base64url
}

/** A published file: its display metadata plus the ordered blocks that, once
 *  fetched and decrypted under the share key, reassemble the original bytes. */
export interface ShareManifest {
  v: 1;
  name: string;
  contentType: string;
  size: number;
  blocks: ShareBlockRef[];
}

/** One file within a multi-file site share: its type/size and ordered blocks.
 *  The path is the key in {@link SiteManifest.files}. */
export interface ShareFileEntry {
  contentType: string;
  size: number;
  blocks: ShareBlockRef[];
}

/** A published *site*: many files addressed by relative path, all sealed under
 *  one share key, so a single link opens a navigable static site (phase 5). The
 *  `index` is the default document served at the site root. */
export interface SiteManifest {
  v: 2;
  index: string;
  files: Record<string, ShareFileEntry>;
}

/** Either kind of share manifest, discriminated by `v`. */
export type AnyManifest = ShareManifest | SiteManifest;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Encode a manifest to the bytes that get sealed and stored as one block. */
export function serializeManifest(manifest: AnyManifest): Uint8Array {
  return enc.encode(JSON.stringify(manifest));
}

/** Decode and validate single-file (v:1) manifest bytes (already decrypted).
 *  Throws on anything malformed — the bytes are authenticated but still
 *  externally authored, so every field is checked before a viewer acts on it. */
export function parseManifest(bytes: Uint8Array): ShareManifest {
  return validateFileManifest(decode(bytes));
}

/** Decode and validate site (v:2) manifest bytes (already decrypted). */
export function parseSiteManifest(bytes: Uint8Array): SiteManifest {
  return validateSiteManifest(decode(bytes));
}

/** Decode either manifest version, dispatching on `v`. */
export function parseAnyManifest(bytes: Uint8Array): AnyManifest {
  const parsed = decode(bytes);
  if (parsed.v === 2) return validateSiteManifest(parsed);
  return validateFileManifest(parsed);
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  const parsed: unknown = JSON.parse(dec.decode(bytes));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('manifest: not an object');
  return parsed as Record<string, unknown>;
}

function validateFileManifest(parsed: Record<string, unknown>): ShareManifest {
  const { v, name, contentType, size, blocks } = parsed;
  if (v !== 1) throw new Error(`manifest: unsupported version ${String(v)}`);
  if (typeof name !== 'string') throw new Error('manifest: invalid name');
  return { v: 1, name, ...validateEntry({ contentType, size, blocks }) };
}

function validateSiteManifest(parsed: Record<string, unknown>): SiteManifest {
  const { v, index, files } = parsed;
  if (v !== 2) throw new Error(`manifest: unsupported version ${String(v)}`);
  if (typeof index !== 'string' || index.length === 0) throw new Error('manifest: invalid index');
  if (typeof files !== 'object' || files === null) throw new Error('manifest: invalid files');
  const out: Record<string, ShareFileEntry> = {};
  for (const [path, entry] of Object.entries(files as Record<string, unknown>)) {
    out[path] = validateEntry((entry ?? {}) as Record<string, unknown>);
  }
  if (!(index in out)) throw new Error('manifest: index not among files');
  return { v: 2, index, files: out };
}

function validateEntry(entry: Record<string, unknown>): ShareFileEntry {
  const { contentType, size, blocks } = entry;
  if (typeof contentType !== 'string') throw new Error('manifest: invalid contentType');
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
    throw new Error('manifest: invalid size');
  }
  if (!Array.isArray(blocks)) throw new Error('manifest: blocks must be an array');
  return { contentType, size, blocks: blocks.map(parseBlockRef) };
}

function parseBlockRef(ref: unknown): ShareBlockRef {
  if (typeof ref !== 'object' || ref === null) throw new Error('manifest: invalid block ref');
  const { addr, hash, nonce } = ref as Record<string, unknown>;
  if (typeof addr !== 'string' || addr.length === 0)
    throw new Error('manifest: invalid block addr');
  if (typeof hash !== 'string' || hash.length === 0)
    throw new Error('manifest: invalid block hash');
  if (typeof nonce !== 'string' || nonce.length === 0) {
    throw new Error('manifest: invalid block nonce');
  }
  return { addr, hash, nonce };
}
