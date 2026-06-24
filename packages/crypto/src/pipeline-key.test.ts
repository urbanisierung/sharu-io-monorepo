import { describe, expect, it } from 'vitest';
import {
  type ChunkingParams,
  createEgressStreamWithKey,
  createIngestStreamWithKey,
  type EncryptedBlock,
} from './index.js';

// Small chunk band keeps tests fast while still forcing multiple chunks.
const CHUNKING: ChunkingParams = { min: 1024, avg: 4096, max: 16384 };

function key(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
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

async function* iter(blocks: EncryptedBlock[]): AsyncIterable<EncryptedBlock> {
  for (const b of blocks) yield b;
}

describe('crypto pipeline (raw key)', () => {
  it('round-trips a multi-chunk payload under a random key', async () => {
    const data = pseudo(200_000, 1);
    const blocks = await createIngestStreamWithKey(streamOf(data, 8192), key(7), {
      chunking: CHUNKING,
    });
    const stored = await collect(blocks);
    expect(stored.length).toBeGreaterThan(1);

    const out = await drain(await createEgressStreamWithKey(iter(stored), key(7)));
    expect(out).toEqual(data);
  });

  it('fails egress when a block is tampered', async () => {
    const data = pseudo(40_000, 2);
    const stored = await collect(
      await createIngestStreamWithKey(streamOf(data, 8192), key(7), { chunking: CHUNKING }),
    );
    const target = stored[0]!.ciphertext;
    target[0] = (target[0] ?? 0) ^ 0x01;
    await expect(drain(await createEgressStreamWithKey(iter(stored), key(7)))).rejects.toThrow();
  });

  it('fails egress under the wrong key', async () => {
    const data = pseudo(40_000, 3);
    const stored = await collect(
      await createIngestStreamWithKey(streamOf(data, 8192), key(7), { chunking: CHUNKING }),
    );
    await expect(drain(await createEgressStreamWithKey(iter(stored), key(8)))).rejects.toThrow();
  });

  it('round-trips an empty payload', async () => {
    const stored = await collect(
      await createIngestStreamWithKey(streamOf(new Uint8Array(0), 64), key(7), {
        chunking: CHUNKING,
      }),
    );
    expect(stored).toHaveLength(0);
    const out = await drain(await createEgressStreamWithKey(iter(stored), key(7)));
    expect(out).toEqual(new Uint8Array(0));
  });

  it('rejects a key that is not 32 bytes', async () => {
    await expect(
      createIngestStreamWithKey(streamOf(new Uint8Array(0), 64), new Uint8Array(16)),
    ).rejects.toThrow(/32 bytes/);
    await expect(createEgressStreamWithKey(iter([]), new Uint8Array(16))).rejects.toThrow(
      /32 bytes/,
    );
  });
});
