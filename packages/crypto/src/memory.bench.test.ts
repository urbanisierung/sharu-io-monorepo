import { describe, expect, it } from 'vitest';
import { type ChunkingParams, createIngestStream } from './index.js';

// Opt-in memory benchmark (plan §1.4, §5: large runs behind a flag). Run with:
//   SAFU_BENCH=1 NODE_OPTIONS=--expose-gc pnpm exec vitest run --project node \
//     packages/crypto/src/memory.bench.test.ts
const PARAMS: ChunkingParams = { min: 256 * 1024, avg: 512 * 1024, max: 1024 * 1024 };

function lazyStream(totalBytes: number, window: number): ReadableStream<Uint8Array> {
  let produced = 0;
  let x = 0x12345678 >>> 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced >= totalBytes) return controller.close();
      const n = Math.min(window, totalBytes - produced);
      const buf = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        x ^= x << 13;
        x >>>= 0;
        x ^= x >>> 7;
        x ^= x << 17;
        x >>>= 0;
        buf[i] = (x >>> 24) & 0xff;
      }
      produced += n;
      controller.enqueue(buf);
    },
  });
}

describe.skipIf(!process.env.SAFU_BENCH)('memory ceiling (opt-in: SAFU_BENCH=1)', () => {
  it('keeps peak live heap far below the total payload while ingesting', async () => {
    const gc = globalThis.gc;
    if (!gc) throw new Error('run with --expose-gc (the node vitest project enables it)');

    const total = PARAMS.max * 64; // 64 MiB through a 1 MiB max chunk
    gc();
    const base = process.memoryUsage().heapUsed;
    let peak = 0;
    let bytes = 0;
    let i = 0;

    const { blocks } = await createIngestStream(lazyStream(total, 64 * 1024), 'bench passphrase', {
      chunking: PARAMS,
    });
    for await (const block of blocks) {
      bytes += block.ciphertext.length; // consume and drop, as a store sink would
      if (++i % 8 === 0) {
        gc();
        peak = Math.max(peak, process.memoryUsage().heapUsed - base);
      }
    }

    expect(bytes).toBeGreaterThan(total / 2);
    // Streaming, not buffered: live heap stays within a few chunks, not the 64 MiB total.
    expect(peak).toBeLessThan(PARAMS.max * 4);
  });
});
