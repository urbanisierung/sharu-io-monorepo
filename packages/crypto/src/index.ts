// Streaming ingest → chunk → hash → encrypt → (store) → decrypt → reassemble
// pipeline (plan §1.2), orchestrated in TS over the `safu-crypto` WASM
// primitives. Files are never fully buffered: chunks flow through as the source
// stream yields, and buffered bytes never exceed one maximum chunk.
import { blake3_hash, Chunker, derive_key, open, ready, seal } from './wasm.js';

/** Content-defined chunking bounds. Defaults are the plan's 512 KiB–4 MiB band. */
export interface ChunkingParams {
  min: number;
  avg: number;
  max: number;
}

const DEFAULT_CHUNKING: ChunkingParams = {
  min: 512 * 1024,
  avg: 1024 * 1024,
  max: 4 * 1024 * 1024,
};

const SALT_LEN = 16;
const NONCE_LEN = 12;
const KEY_LEN = 32;

/** An encrypted block. `hash` is the BLAKE3 of the *plaintext* chunk — an
 *  integrity fingerprint verified on egress. Storage keys blocks by the BLAKE3
 *  of the *ciphertext* (random nonce ⇒ no plaintext-equality leak). */
export interface EncryptedBlock {
  hash: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

/** Result of ingesting a source stream. `salt` derives the key on egress and
 *  must be persisted with the backup manifest (it is not secret). */
export interface IngestResult {
  salt: Uint8Array;
  blocks: AsyncIterable<EncryptedBlock>;
}

export interface IngestOptions {
  chunking?: ChunkingParams;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[b];
  return out;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/**
 * Ingest `input` under a caller-supplied 32-byte `key` — no passphrase, no
 * Argon2id. Used by public shares, where the key is random and travels in the
 * share link's fragment rather than being derived from a passphrase. Returns a
 * lazy async iterable; nothing is read from the source until it is consumed.
 */
export async function createIngestStreamWithKey(
  input: ReadableStream<Uint8Array>,
  key: Uint8Array,
  options: IngestOptions = {},
): Promise<AsyncIterable<EncryptedBlock>> {
  await ready();
  if (key.length !== KEY_LEN) throw new Error(`key must be ${KEY_LEN} bytes, got ${key.length}`);
  return ingest(input, key, options.chunking ?? DEFAULT_CHUNKING);
}

/**
 * Ingest `input`, deriving a key from `passphrase` + a fresh salt. Returns the
 * salt and a lazy async iterable of encrypted blocks. Nothing is read from the
 * source until the iterable is consumed.
 */
export async function createIngestStream(
  input: ReadableStream<Uint8Array>,
  passphrase: string,
  options: IngestOptions = {},
): Promise<IngestResult> {
  await ready();
  const salt = randomBytes(SALT_LEN);
  const key = derive_key(new TextEncoder().encode(passphrase), salt);
  return { salt, blocks: await createIngestStreamWithKey(input, key, options) };
}

async function* ingest(
  input: ReadableStream<Uint8Array>,
  key: Uint8Array,
  chunking: ChunkingParams,
): AsyncIterable<EncryptedBlock> {
  const chunker = new Chunker(chunking.min, chunking.avg, chunking.max);
  const reader = input.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* emit(chunker.push(value), chunker.lengths, key);
    }
    yield* emit(chunker.finish(), chunker.lengths, key);
  } finally {
    reader.releaseLock();
    chunker.free();
  }
}

function* emit(
  bytes: Uint8Array,
  lengths: Uint32Array,
  key: Uint8Array,
): Generator<EncryptedBlock> {
  let offset = 0;
  for (const len of lengths) {
    const chunk = bytes.subarray(offset, offset + len);
    offset += len;
    const hash = toHex(blake3_hash(chunk));
    const nonce = randomBytes(NONCE_LEN);
    const ciphertext = seal(key, nonce, chunk);
    yield { hash, nonce, ciphertext };
  }
}

/**
 * Reassemble plaintext from `blocks` in order using a caller-supplied 32-byte
 * `key` — the egress counterpart to `createIngestStreamWithKey`. Each block is
 * authenticated by AES-GCM and verified against its BLAKE3 content address; a
 * mismatch (tamper, or the wrong key) errors the stream.
 */
export async function createEgressStreamWithKey(
  blocks: AsyncIterable<EncryptedBlock>,
  key: Uint8Array,
): Promise<ReadableStream<Uint8Array>> {
  await ready();
  if (key.length !== KEY_LEN) throw new Error(`key must be ${KEY_LEN} bytes, got ${key.length}`);
  const iterator = blocks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      const plaintext = open(key, value.nonce, value.ciphertext);
      const actual = toHex(blake3_hash(plaintext));
      if (actual !== value.hash) {
        controller.error(new Error(`block hash mismatch: expected ${value.hash}, got ${actual}`));
        return;
      }
      controller.enqueue(plaintext);
    },
  });
}

/**
 * Reassemble plaintext from `blocks` in order, deriving the key from
 * `passphrase` + `salt`. Each block is authenticated by AES-GCM and verified
 * against its BLAKE3 content address; a mismatch errors the stream.
 */
export async function createEgressStream(
  blocks: AsyncIterable<EncryptedBlock>,
  passphrase: string,
  salt: Uint8Array,
): Promise<ReadableStream<Uint8Array>> {
  await ready();
  const key = derive_key(new TextEncoder().encode(passphrase), salt);
  return createEgressStreamWithKey(blocks, key);
}

export { ready } from './wasm.js';

/** BLAKE3 content address (hex) of `data`. Awaits WASM init. */
export async function blake3(data: Uint8Array): Promise<string> {
  await ready();
  return toHex(blake3_hash(data));
}

/** Argon2id-derive a 32-byte key from `passphrase` and `salt`. Used both for
 *  per-file encryption and to derive a device's stable signing seed (status #7).
 *  The passphrase never leaves the caller; only the non-secret salt is stored. */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  await ready();
  return derive_key(new TextEncoder().encode(passphrase), salt);
}
