import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsBlockStore } from './fs-block-store.js';

describe('FsBlockStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'safu-blocks-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips a block by hash', async () => {
    const store = new FsBlockStore(join(dir, 'blocks'));
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(await store.has('a1b2c3')).toBe(false);
    expect(await store.get('a1b2c3')).toBeUndefined();
    await store.put('a1b2c3', bytes);
    expect(await store.has('a1b2c3')).toBe(true);
    expect(await store.get('a1b2c3')).toEqual(bytes);
  });

  it('persists across instances over the same directory', async () => {
    const path = join(dir, 'blocks');
    await new FsBlockStore(path).put('ff00', new Uint8Array([9]));
    expect(await new FsBlockStore(path).get('ff00')).toEqual(new Uint8Array([9]));
  });

  it('rejects non-hex hashes (path-traversal guard)', async () => {
    const store = new FsBlockStore(join(dir, 'blocks'));
    await expect(store.put('../escape', new Uint8Array([1]))).rejects.toThrow();
    await expect(store.has('../escape')).rejects.toThrow();
  });
});
