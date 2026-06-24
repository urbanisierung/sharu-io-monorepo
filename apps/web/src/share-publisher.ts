// Publish a file as a public share (docs/public-share.md): re-ingest it under a
// fresh *random* key — never the wallet passphrase — so the resulting ciphertext
// blocks are openable only by someone holding the link, while hosts and relays
// still see nothing but ciphertext. Returns the link plus the set of block
// addresses to pin to the always-on serving node so the link stays resolvable.
import { blake3, createIngestStreamWithKey, sealBytes } from '@safu/crypto';
import {
  type BlockStore,
  type ShareBlockRef,
  type ShareManifest,
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
  const refs: ShareBlockRef[] = [];
  for await (const block of await createIngestStreamWithKey(input.content, key)) {
    const addr = await blake3(block.ciphertext);
    await store.put(addr, block.ciphertext);
    refs.push({ addr, hash: block.hash, nonce: bytesToBase64Url(block.nonce) });
  }

  const manifest: ShareManifest = {
    v: 1,
    name: input.name,
    contentType: input.contentType,
    size: input.size,
    blocks: refs,
  };
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
    pin: [root, ...refs.map((r) => r.addr)],
  };
}
