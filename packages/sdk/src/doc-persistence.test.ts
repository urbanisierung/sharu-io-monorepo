import { describe, expect, it } from 'vitest';
import { MemoryDocStore } from './doc-store.js';
import { SyncDoc } from './sync-doc.js';

// Plan status.md next-step #2: SyncDoc is in-memory, so a reload loses the file
// list. A persisted CRDT snapshot must let the document survive restarts.

describe('SyncDoc persistence', () => {
  it('round-trips files, writers and the clock through a snapshot', async () => {
    const a = new SyncDoc('A');
    a.addWriter('B');
    a.setFile('notes.md', ['h1', 'h2'], 42, 1000);
    a.revokeWriter('B');

    const store = new MemoryDocStore();
    await store.save(a.serialize());
    const b = await SyncDoc.open('A', store);

    expect(b.files.value).toEqual(a.files.value);
    expect(b.authorized('B')).toBe(false);
    expect(b.serialize().hlc).toEqual(a.serialize().hlc);
  });

  it('persists to the store on every mutation', async () => {
    const store = new MemoryDocStore();
    const doc = await SyncDoc.open('A', store);

    doc.setFile('a.txt', ['x'], 1, 1);
    await doc.flush();

    const snapshot = await store.load();
    expect(snapshot?.entries.map((e) => e.path)).toEqual(['a.txt']);
  });

  it('persists accepted remote deltas, not just local writes', async () => {
    const store = new MemoryDocStore();
    const doc = await SyncDoc.open('OWNER', store);
    doc.addWriter('B');

    doc.applyRemote('B', {
      entries: [
        {
          path: 'remote.txt',
          entry: { blocks: ['r'], size: 3, modified: 7, deleted: false },
          stamp: { wall: 9, counter: 0, peer: 'B' },
        },
      ],
      writers: [],
    });
    await doc.flush();

    const reopened = await SyncDoc.open('OWNER', store);
    expect(reopened.files.value.map((f) => f.path)).toEqual(['remote.txt']);
  });

  it('recovers the file list after reopening from the store', async () => {
    const store = new MemoryDocStore();
    const first = await SyncDoc.open('A', store);
    first.setFile('keep.md', ['m'], 5, 5);
    await first.flush();

    const second = await SyncDoc.open('A', store);
    expect(second.files.value.map((f) => f.path)).toEqual(['keep.md']);
    expect(second.files.value[0]?.blocks).toEqual(['m']);
  });

  it('starts empty when the store has no snapshot', async () => {
    const doc = await SyncDoc.open('A', new MemoryDocStore());
    expect(doc.files.value).toEqual([]);
  });

  it('a write after restore still wins over the restored entry', async () => {
    const store = new MemoryDocStore();
    const a = new SyncDoc('A', store);
    a.setFile('f.txt', ['old'], 1, 1);
    await a.flush();

    const b = await SyncDoc.open('A', store);
    b.setFile('f.txt', ['new'], 2, 2);

    expect(b.files.value[0]?.blocks).toEqual(['new']);
  });
});
