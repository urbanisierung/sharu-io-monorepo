import { describe, expect, it } from 'vitest';
import { MemoryBlockStore } from './block-store.js';

describe('MemoryBlockStore', () => {
  it('round-trips a block by hash', async () => {
    const store = new MemoryBlockStore();
    const block = new Uint8Array([1, 2, 3]);

    expect(await store.has('abc')).toBe(false);
    await store.put('abc', block);
    expect(await store.has('abc')).toBe(true);
    expect(await store.get('abc')).toEqual(block);
  });

  it('returns undefined for a missing hash', async () => {
    const store = new MemoryBlockStore();
    expect(await store.get('missing')).toBeUndefined();
  });
});
