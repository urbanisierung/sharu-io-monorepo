import { beforeEach, describe, expect, it } from 'vitest';
import { OpfsBlockStore } from './opfs-block-store.js';

// Plan §1.3: OPFS BlockStore exercised in a real browser (vitest browser mode,
// Playwright/Chromium). OPFS requires a secure context — localhost qualifies.
async function clearOpfs(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry('blocks', { recursive: true });
  } catch {
    // directory may not exist yet
  }
}

describe('OpfsBlockStore', () => {
  beforeEach(clearOpfs);

  it('round-trips a block by hash', async () => {
    const store = new OpfsBlockStore();
    const block = new Uint8Array([1, 2, 3, 4]);

    expect(await store.has('deadbeef')).toBe(false);
    await store.put('deadbeef', block);
    expect(await store.has('deadbeef')).toBe(true);
    expect(await store.get('deadbeef')).toEqual(block);
  });

  it('returns undefined for a missing hash', async () => {
    const store = new OpfsBlockStore();
    expect(await store.get('absent')).toBeUndefined();
  });

  it('persists blocks across store instances', async () => {
    await new OpfsBlockStore().put('persisted', new Uint8Array([9, 9, 9]));
    expect(await new OpfsBlockStore().get('persisted')).toEqual(new Uint8Array([9, 9, 9]));
  });
});
