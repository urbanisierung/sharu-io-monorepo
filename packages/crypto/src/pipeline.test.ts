import { describe, expect, it } from 'vitest';
import {
  type ChunkingParams,
  createEgressStream,
  createIngestStream,
  type EncryptedBlock,
} from './index.js';

// Small chunk band keeps tests fast while still forcing multiple chunks.
const CHUNKING: ChunkingParams = { min: 1024, avg: 4096, max: 16384 };
const PASS = 'correct horse battery staple';

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
      if (offset >= data.length) {
        controller.close();
        return;
      }
      controller.enqueue(data.subarray(offset, offset + window));
      offset += window;
    },
  });
}

async function collect(blocks: AsyncIterable<EncryptedBlock>): Promise<EncryptedBlock[]> {
  const out: EncryptedBlock[] = [];
  for await (const b of blocks) out.push(b);
  return out;
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

describe('crypto pipeline', () => {
  it('round-trips a multi-chunk payload with hash parity', async () => {
    const data = pseudo(200_000, 1);
    const { salt, blocks } = await createIngestStream(streamOf(data, 8192), PASS, {
      chunking: CHUNKING,
    });
    const stored = await collect(blocks);
    expect(stored.length).toBeGreaterThan(1);

    const out = await drain(await createEgressStream(iter(stored), PASS, salt));
    expect(out).toEqual(data);
  });

  it('produces ciphertext, never plaintext, across the boundary', async () => {
    const data = pseudo(50_000, 2);
    const { blocks } = await createIngestStream(streamOf(data, 4096), PASS, { chunking: CHUNKING });
    const needle = data.subarray(0, 16);
    for (const block of await collect(blocks)) {
      expect(indexOf(block.ciphertext, needle)).toBe(-1);
      expect(block.nonce.length).toBe(12);
    }
  });

  it('content-addresses identical chunks to identical hashes', async () => {
    const half = pseudo(20_000, 3);
    const data = new Uint8Array(half.length * 2);
    data.set(half, 0);
    data.set(half, half.length);
    const { blocks } = await createIngestStream(streamOf(data, data.length), PASS, {
      chunking: CHUNKING,
    });
    const hashes = (await collect(blocks)).map((b) => b.hash);
    expect(new Set(hashes).size).toBeLessThan(hashes.length); // duplicates collapse
  });

  it('fails egress when a block is tampered', async () => {
    const data = pseudo(40_000, 4);
    const { salt, blocks } = await createIngestStream(streamOf(data, 8192), PASS, {
      chunking: CHUNKING,
    });
    const stored = await collect(blocks);
    const target = stored[0]!.ciphertext;
    target[0] = (target[0] ?? 0) ^ 0x01;
    await expect(drain(await createEgressStream(iter(stored), PASS, salt))).rejects.toThrow();
  });

  it('fails egress under the wrong passphrase', async () => {
    const data = pseudo(40_000, 5);
    const { salt, blocks } = await createIngestStream(streamOf(data, 8192), PASS, {
      chunking: CHUNKING,
    });
    const stored = await collect(blocks);
    await expect(drain(await createEgressStream(iter(stored), 'wrong', salt))).rejects.toThrow();
  });

  it('round-trips an empty payload', async () => {
    const { salt, blocks } = await createIngestStream(streamOf(new Uint8Array(0), 64), PASS, {
      chunking: CHUNKING,
    });
    const stored = await collect(blocks);
    expect(stored).toHaveLength(0);
    const out = await drain(await createEgressStream(iter(stored), PASS, salt));
    expect(out).toEqual(new Uint8Array(0));
  });
});

async function* iter(blocks: EncryptedBlock[]): AsyncIterable<EncryptedBlock> {
  for (const b of blocks) yield b;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
