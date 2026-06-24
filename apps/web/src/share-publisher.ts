// Publish a file as a public share (docs/public-share.md): re-ingest it under a
// fresh *random* key — never the wallet passphrase — so the resulting ciphertext
// blocks are openable only by someone holding the link, while hosts and relays
// still see nothing but ciphertext. Returns the link plus the set of block
// addresses to pin to the always-on serving node so the link stays resolvable.
import { blake3, createIngestStreamWithKey, sealBytes } from '@safu/crypto';
import {
  type BlockStore,
  type ShareBlockRef,
  type ShareFileEntry,
  type ShareManifest,
  type SiteManifest,
  serializeManifest,
} from '@safu/sdk';
import type { PeerAddr } from '@safu/transport';
import { bytesToBase64Url } from './base64url.js';
import { encodeShareCode, type ShareInfo, shareLink } from './share-code.js';

export interface PublishInput {
  name: string;
  contentType: string;
  size: number;
  content: ReadableStream<Uint8Array>;
}

export interface PublishResult {
  info: ShareInfo;
  link: string;
  /** Every block address (manifest root first) that must be pinned to the
   *  serving node for the link to resolve. Revoking a share = unpinning these. */
  pin: string[];
}

export async function publishFile(
  input: PublishInput,
  store: BlockStore,
  peer: PeerAddr,
  origin: string,
): Promise<PublishResult> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const refs = await ingestUnderKey(input.content, key, store);
  const manifest: ShareManifest = {
    v: 1,
    name: input.name,
    contentType: input.contentType,
    size: input.size,
    blocks: refs,
  };
  return seal(
    manifest,
    key,
    peer,
    origin,
    store,
    refs.map((r) => r.addr),
  );
}

/** One file of a site share, identified by its relative path. All files in a
 *  {@link publishSite} call share one random key. */
export interface SiteFileInput {
  /** Relative path within the site, e.g. "index.html" or "css/app.css". */
  path: string;
  contentType: string;
  size: number;
  content: ReadableStream<Uint8Array>;
}

/** Publish a set of files as one navigable site (phase 5): re-ingest every file
 *  under a single fresh random key, seal a v:2 manifest mapping each path to its
 *  blocks, and return the link + the addresses to pin. `index` is the default
 *  document and must be one of the files. */
export async function publishSite(
  files: SiteFileInput[],
  index: string,
  store: BlockStore,
  peer: PeerAddr,
  origin: string,
): Promise<PublishResult> {
  if (!files.some((f) => f.path === index))
    throw new Error(`publishSite: index "${index}" missing`);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const entries: Record<string, ShareFileEntry> = {};
  const blockAddrs: string[] = [];
  for (const file of files) {
    const refs = await ingestUnderKey(file.content, key, store);
    entries[file.path] = { contentType: file.contentType, size: file.size, blocks: refs };
    for (const ref of refs) blockAddrs.push(ref.addr);
  }
  const manifest: SiteManifest = { v: 2, index, files: entries };
  return seal(manifest, key, peer, origin, store, blockAddrs);
}

/** Encrypt one stream under `key`, storing each ciphertext block and returning
 *  its content-addressed refs. */
async function ingestUnderKey(
  content: ReadableStream<Uint8Array>,
  key: Uint8Array,
  store: BlockStore,
): Promise<ShareBlockRef[]> {
  const refs: ShareBlockRef[] = [];
  for await (const block of await createIngestStreamWithKey(content, key)) {
    const addr = await blake3(block.ciphertext);
    await store.put(addr, block.ciphertext);
    refs.push({ addr, hash: block.hash, nonce: bytesToBase64Url(block.nonce) });
  }
  return refs;
}

/** Seal a manifest under `key` as one block and assemble the publish result. */
async function seal(
  manifest: ShareManifest | SiteManifest,
  key: Uint8Array,
  peer: PeerAddr,
  origin: string,
  store: BlockStore,
  blockAddrs: string[],
): Promise<PublishResult> {
  const sealed = await sealBytes(key, serializeManifest(manifest));
  const root = await blake3(sealed.ciphertext);
  await store.put(root, sealed.ciphertext);
  const info: ShareInfo = {
    root,
    rootNonce: bytesToBase64Url(sealed.nonce),
    key: bytesToBase64Url(key),
    peer,
  };
  return {
    info,
    link: shareLink(encodeShareCode(info), origin),
    pin: [root, ...blockAddrs],
  };
}
