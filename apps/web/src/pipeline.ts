// File ingest + restore over the streaming crypto pipeline and a BlockStore.
//
// A file becomes a set of content-addressed blocks plus a small per-file
// manifest (also a block) that records the ingest salt and, per block, its
// storage address and plaintext BLAKE3. The allocation table only needs to hold
// the manifest's address; restore fetches the manifest, then the data blocks,
// and reverses the pipeline with hash-parity verification.
//
// Only ciphertext is ever stored. Each block is persisted as `nonce ‖ ciphertext`
// so the random nonce travels with its block; the manifest holds the salt (not
// secret) needed to re-derive the key from the passphrase.
import { blake3, createEgressStream, createIngestStream, type EncryptedBlock } from '@safu/crypto';
import type { BlockStore } from '@safu/sdk';

const NONCE_LEN = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface ManifestBlock {
  address: string;
  hash: string;
}

interface Manifest {
  salt: number[];
  size: number;
  blocks: ManifestBlock[];
}

function frame(nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

/** Encrypt `file` into the store; returns the manifest address to record in the
 *  allocation table, the addresses of every data block it references (so the
 *  table entry can be self-describing for peer auto-pull), and the byte size. */
export async function ingestFile(
  file: File,
  passphrase: string,
  store: BlockStore,
): Promise<{ manifest: string; blocks: string[]; size: number }> {
  const { salt, blocks } = await createIngestStream(file.stream(), passphrase);
  const entries: ManifestBlock[] = [];
  for await (const block of blocks) {
    const bytes = frame(block.nonce, block.ciphertext);
    const address = await blake3(bytes);
    await store.put(address, bytes);
    entries.push({ address, hash: block.hash });
  }
  const manifest: Manifest = { salt: Array.from(salt), size: file.size, blocks: entries };
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const manifestAddress = await blake3(manifestBytes);
  await store.put(manifestAddress, manifestBytes);
  return { manifest: manifestAddress, blocks: entries.map((e) => e.address), size: file.size };
}

/** The storage addresses a manifest references, for a peer to pull before
 *  restoring (the manifest itself plus every data block). */
export async function blockAddresses(
  manifestAddress: string,
  store: BlockStore,
): Promise<string[]> {
  const manifest = await readManifest(manifestAddress, store);
  return manifest.blocks.map((b) => b.address);
}

/** Reassemble the plaintext bytes of the file described by `manifestAddress`.
 *  All referenced blocks must already be present in `store`. */
export async function restoreFile(
  manifestAddress: string,
  passphrase: string,
  store: BlockStore,
): Promise<Uint8Array> {
  const manifest = await readManifest(manifestAddress, store);
  const salt = Uint8Array.from(manifest.salt);

  async function* blocks(): AsyncIterable<EncryptedBlock> {
    for (const entry of manifest.blocks) {
      const bytes = await store.get(entry.address);
      if (!bytes) throw new Error(`missing block ${entry.address}`);
      yield {
        hash: entry.hash,
        nonce: bytes.subarray(0, NONCE_LEN),
        ciphertext: bytes.subarray(NONCE_LEN),
      };
    }
  }

  const stream = await createEgressStream(blocks(), passphrase, salt);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function readManifest(address: string, store: BlockStore): Promise<Manifest> {
  const bytes = await store.get(address);
  if (!bytes) throw new Error(`missing manifest ${address}`);
  return JSON.parse(decoder.decode(bytes)) as Manifest;
}
