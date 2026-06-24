// Open a public share (docs/public-share.md): fetch the sealed manifest, decrypt
// it with the key carried in the link's fragment, then fetch and decrypt each
// block, verifying it against its content address as it streams. The viewer's
// own browser is the "gateway": no wallet, no passphrase, and the serving node
// only ever handed over ciphertext.
import { createEgressStreamWithKey, type EncryptedBlock, openBytes } from '@safu/crypto';
import {
  BLOCK_PROTOCOL,
  fetchBlock,
  MemoryBlockStore,
  parseManifest,
  type ShareManifest,
} from '@safu/sdk';
import { base64UrlToBytes } from './base64url.js';
import type { ShareInfo } from './share-code.js';

/** Fetch one block by its (ciphertext) address, or undefined if the serving node
 *  doesn't have it. In production this is the SDK's `fetchBlock` bound to the
 *  share's peer + a store; in tests it is a store-backed lookup. */
export type FetchBlock = (addr: string) => Promise<Uint8Array | undefined>;

/** Fetch and decrypt the share's manifest — the index of what to fetch next. */
export async function fetchManifest(
  info: ShareInfo,
  fetchBlock: FetchBlock,
): Promise<ShareManifest> {
  const sealed = await fetchBlock(info.root);
  if (!sealed) throw new Error('share: manifest unavailable');
  const key = base64UrlToBytes(info.key);
  const bytes = await openBytes(key, base64UrlToBytes(info.rootNonce), sealed);
  return parseManifest(bytes);
}

/** Stream the share's plaintext by fetching, decrypting, and verifying each
 *  block in order. A missing block or an integrity mismatch errors the stream. */
export async function fetchContent(
  info: ShareInfo,
  manifest: ShareManifest,
  fetchBlock: FetchBlock,
): Promise<ReadableStream<Uint8Array>> {
  const key = base64UrlToBytes(info.key);
  async function* blocks(): AsyncIterable<EncryptedBlock> {
    for (const ref of manifest.blocks) {
      const ciphertext = await fetchBlock(ref.addr);
      if (!ciphertext) throw new Error(`share: block ${ref.addr} unavailable`);
      yield { hash: ref.hash, nonce: base64UrlToBytes(ref.nonce), ciphertext };
    }
  }
  return createEgressStreamWithKey(blocks(), key);
}

/** A fully-opened share: its manifest metadata plus the verified plaintext. */
export interface OpenedShare {
  manifest: ShareManifest;
  bytes: Uint8Array;
}

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

/** Open a share end-to-end in the browser: dial the serving node over a
 *  relay-only Iroh endpoint, fetch + decrypt the manifest and every block, and
 *  return the verified plaintext. No wallet, no passphrase, no persistence — the
 *  in-memory store is discarded with the transport when this resolves. */
export async function openShareOverIroh(info: ShareInfo): Promise<OpenedShare> {
  const { createIrohTransport } = await import('@safu/transport/iroh');
  const transport = await createIrohTransport([BLOCK_PROTOCOL]);
  try {
    const store = new MemoryBlockStore();
    const fetch: FetchBlock = (addr) => fetchBlock(transport, info.peer, addr, store);
    const manifest = await fetchManifest(info, fetch);
    const bytes = await drain(await fetchContent(info, manifest, fetch));
    return { manifest, bytes };
  } finally {
    await transport.close();
  }
}
