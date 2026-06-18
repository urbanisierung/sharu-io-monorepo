import { MemoryBlockStore } from '@safu/sdk';
import { describe, expect, it } from 'vitest';
import {
  blake3,
  type ChunkingParams,
  createEgressStream,
  createIngestStream,
  type EncryptedBlock,
} from './index.js';

// Plan §1.4: stream a payload through ingest → BlockStore → egress and assert
// BLAKE3 hash parity of output vs input. Blocks are content-addressed in the
// store by BLAKE3(ciphertext).
const CHUNKING: ChunkingParams = { min: 1024, avg: 4096, max: 16384 };
const PASS = 'a long enough passphrase for the test';

interface ManifestEntry {
  address: string; // BLAKE3(ciphertext) — the BlockStore key
  hash: string; // BLAKE3(plaintext) — integrity fingerprint
  nonce: Uint8Array;
}

function pseudo(len: number, seed: number): Uint8Array {
  let x = seed | 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    x ^= x << 13;
    x ^= x >>> 7;
    x ^= x << 17;
    out[i] = (x >>> 24) & 0xff;
  }
  return out;
}

function streamOf(data: Uint8Array, window: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.length) return controller.close();
      controller.enqueue(data.subarray(offset, offset + window));
      offset += window;
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const part of stream as unknown as AsyncIterable<Uint8Array>) {
    parts.push(part);
    total += part.length;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    joined.set(p, offset);
    offset += p.length;
  }
  return joined;
}

describe('round-trip through a BlockStore', () => {
  it('persists encrypted blocks and reassembles with hash parity', async () => {
    const data = pseudo(250_000, 11);
    const store = new MemoryBlockStore();

    // Ingest → persist ciphertext keyed by its BLAKE3 address.
    const { salt, blocks } = await createIngestStream(streamOf(data, 8192), PASS, {
      chunking: CHUNKING,
    });
    const manifest: ManifestEntry[] = [];
    for await (const block of blocks) {
      const address = await blake3(block.ciphertext);
      await store.put(address, block.ciphertext);
      manifest.push({ address, hash: block.hash, nonce: block.nonce });
    }
    expect(manifest.length).toBeGreaterThan(1);

    // Egress ← fetch ciphertext from the store in manifest order.
    async function* restore(): AsyncIterable<EncryptedBlock> {
      for (const entry of manifest) {
        const ciphertext = await store.get(entry.address);
        if (!ciphertext) throw new Error(`missing block ${entry.address}`);
        yield { hash: entry.hash, nonce: entry.nonce, ciphertext };
      }
    }

    const output = await drain(await createEgressStream(restore(), PASS, salt));
    expect(await blake3(output)).toBe(await blake3(data));
  });

  it('round-trips data spanning many maximum-size chunks', async () => {
    const data = pseudo(CHUNKING.max * 8, 22);
    const store = new MemoryBlockStore();

    const { salt, blocks } = await createIngestStream(streamOf(data, 64 * 1024), PASS, {
      chunking: CHUNKING,
    });
    const manifest: ManifestEntry[] = [];
    for await (const block of blocks) {
      const address = await blake3(block.ciphertext);
      await store.put(address, block.ciphertext);
      manifest.push({ address, hash: block.hash, nonce: block.nonce });
    }

    async function* restore(): AsyncIterable<EncryptedBlock> {
      for (const entry of manifest) {
        const ciphertext = await store.get(entry.address);
        if (!ciphertext) throw new Error(`missing block ${entry.address}`);
        yield { hash: entry.hash, nonce: entry.nonce, ciphertext };
      }
    }

    const output = await drain(await createEgressStream(restore(), PASS, salt));
    expect(output).toEqual(data);
  });
});
