// Open a public share (docs/public-share.md): fetch the sealed manifest, decrypt
// it with the key carried in the link's fragment, then fetch and decrypt each
// block, verifying it against its content address as it streams. The viewer's
// own browser is the "gateway": no wallet, no passphrase, and the serving node
// only ever handed over ciphertext. A share is either a single file (v:1) or a
// navigable multi-file site (v:2, phase 5) — `openShare` returns both, tagged.
// A site is opened *lazily*: only its manifest is decrypted up front, and each
// file is fetched + decrypted on demand (the service worker requests them as the
// site navigates), so a large site costs only what the viewer actually visits.
import { createEgressStreamWithKey, type EncryptedBlock, openBytes } from '@safu/crypto';
import {
  BLOCK_PROTOCOL,
  fetchBlock,
  MemoryBlockStore,
  parseAnyManifest,
  parseManifest,
  parseSiteManifest,
  type ShareBlockRef,
  type ShareManifest,
  type SiteManifest,
} from '@safu/sdk';
import { base64UrlToBytes } from './base64url.js';
import type { ShareInfo } from './share-code.js';

/** Fetch one block by its (ciphertext) address, or undefined if the serving node
 *  doesn't have it. In production this is the SDK's `fetchBlock` bound to the
 *  share's peer + a store; in tests it is a store-backed lookup. */
export type FetchBlock = (addr: string) => Promise<Uint8Array | undefined>;

/** Fetch and decrypt a single-file (v:1) manifest — kept for the file path and
 *  its round-trip test. Throws if the manifest is actually a site. */
export async function fetchManifest(
  info: ShareInfo,
  fetchBlock: FetchBlock,
): Promise<ShareManifest> {
  const sealed = await fetchBlock(info.root);
  if (!sealed) throw new Error('share: manifest unavailable');
  const key = base64UrlToBytes(info.key);
  return parseManifest(await openBytes(key, base64UrlToBytes(info.rootNonce), sealed));
}

/** Stream a single file's plaintext (the v:1 content). */
export async function fetchContent(
  info: ShareInfo,
  manifest: ShareManifest,
  fetchBlock: FetchBlock,
): Promise<ReadableStream<Uint8Array>> {
  return streamRefs(manifest.blocks, base64UrlToBytes(info.key), fetchBlock);
}

/** Fetch and decrypt the (v:2) site manifest only — the index of files. */
export async function fetchSiteManifest(
  info: ShareInfo,
  fetchBlock: FetchBlock,
): Promise<SiteManifest> {
  const sealed = await fetchBlock(info.root);
  if (!sealed) throw new Error('share: manifest unavailable');
  const key = base64UrlToBytes(info.key);
  return parseSiteManifest(await openBytes(key, base64UrlToBytes(info.rootNonce), sealed));
}

/** Fetch and decrypt one file of a site by path, or undefined if the manifest
 *  has no such path. Only this file's blocks are fetched (lazy). */
export async function fetchSiteFile(
  manifest: SiteManifest,
  path: string,
  key: Uint8Array,
  fetchBlock: FetchBlock,
): Promise<SiteFile | undefined> {
  const entry = manifest.files[path];
  if (!entry) return undefined;
  const bytes = await drain(await streamRefs(entry.blocks, key, fetchBlock));
  return { contentType: entry.contentType, bytes };
}

/** Stream the plaintext of one ordered block set under `key`, verifying each
 *  block against its content address as it decrypts. */
function streamRefs(
  refs: ShareBlockRef[],
  key: Uint8Array,
  fetchBlock: FetchBlock,
): Promise<ReadableStream<Uint8Array>> {
  async function* blocks(): AsyncIterable<EncryptedBlock> {
    for (const ref of refs) {
      const ciphertext = await fetchBlock(ref.addr);
      if (!ciphertext) throw new Error(`share: block ${ref.addr} unavailable`);
      yield { hash: ref.hash, nonce: base64UrlToBytes(ref.nonce), ciphertext };
    }
  }
  return createEgressStreamWithKey(blocks(), key);
}

/** One decrypted file of a site, ready to hand to the service worker. */
export interface SiteFile {
  contentType: string;
  bytes: Uint8Array;
}

/** An opened single-file share: its metadata plus the verified plaintext. */
export interface OpenedFile {
  kind: 'file';
  manifest: ShareManifest;
  bytes: Uint8Array;
}

/** An opened site share. Lazy: the manifest is decrypted, but each file is only
 *  fetched + decrypted when `getFile` asks for it. `id` is the manifest root
 *  (the URL prefix); `index` is the default document; `close` releases the
 *  transport the lazy fetches run over. */
export interface OpenedSite {
  kind: 'site';
  id: string;
  index: string;
  getFile(path: string): Promise<SiteFile | undefined>;
  close(): Promise<void>;
}

export type Opened = OpenedFile | OpenedSite;

/** Drain a plaintext stream into a single buffer. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const part of stream as unknown as AsyncIterable<Uint8Array>) {
    parts.push(part);
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Open a share with the given block fetcher: decrypt the manifest, then return
 *  a fully-decrypted single file, or a lazy site whose `getFile` decrypts one
 *  file at a time. `close` is a no-op here — the caller owns the fetcher's
 *  lifetime (see `openShareOverIroh`). */
export async function openShare(info: ShareInfo, fetchBlock: FetchBlock): Promise<Opened> {
  const sealed = await fetchBlock(info.root);
  if (!sealed) throw new Error('share: manifest unavailable');
  const key = base64UrlToBytes(info.key);
  const manifest = parseAnyManifest(await openBytes(key, base64UrlToBytes(info.rootNonce), sealed));
  if (manifest.v === 2) {
    return {
      kind: 'site',
      id: info.root,
      index: manifest.index,
      getFile: (path) => fetchSiteFile(manifest, path, key, fetchBlock),
      close: () => Promise.resolve(),
    };
  }
  const bytes = await drain(await streamRefs(manifest.blocks, key, fetchBlock));
  return { kind: 'file', manifest, bytes };
}

/** Open a share end-to-end in the browser: dial the serving node over a
 *  relay-only Iroh endpoint and decrypt under the fragment key. A single file is
 *  fully decrypted and the transport closed; a site keeps the transport open for
 *  lazy `getFile`, releasing it on `close`. No wallet, no passphrase, no
 *  persistence — the in-memory store is discarded with the transport. */
export async function openShareOverIroh(info: ShareInfo): Promise<Opened> {
  const { createIrohTransport } = await import('@safu/transport/iroh');
  const transport = await createIrohTransport([BLOCK_PROTOCOL]);
  const store = new MemoryBlockStore();
  const fetch: FetchBlock = (addr) => fetchBlock(transport, info.peer, addr, store);
  try {
    const opened = await openShare(info, fetch);
    if (opened.kind === 'file') {
      await transport.close();
      return opened;
    }
    return { ...opened, close: () => transport.close() };
  } catch (error) {
    await transport.close();
    throw error;
  }
}
