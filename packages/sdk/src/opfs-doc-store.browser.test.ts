import { beforeEach, describe, expect, it } from 'vitest';
import type { DocSnapshot } from './doc-store.js';
import { OpfsDocStore } from './opfs-doc-store.js';

// Status next-step #2: the document snapshot persists in OPFS so the file list
// survives a reload. Exercised in a real browser (vitest browser mode).
async function clearOpfs(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry('state', { recursive: true });
  } catch {
    // directory may not exist yet
  }
}

const sample: DocSnapshot = {
  entries: [
    {
      path: 'notes.md',
      entry: { blocks: ['h1', 'h2'], size: 42, modified: 1000, deleted: false },
      stamp: { wall: 1, counter: 0, peer: 'A' },
    },
  ],
  added: ['A'],
  revoked: [],
  hlc: { wall: 1, counter: 0 },
};

describe('OpfsDocStore', () => {
  beforeEach(clearOpfs);

  it('returns undefined before any snapshot is saved', async () => {
    expect(await new OpfsDocStore().load()).toBeUndefined();
  });

  it('round-trips a snapshot', async () => {
    const store = new OpfsDocStore();
    await store.save(sample);
    expect(await store.load()).toEqual(sample);
  });

  it('persists across store instances', async () => {
    await new OpfsDocStore().save(sample);
    expect(await new OpfsDocStore().load()).toEqual(sample);
  });
});
