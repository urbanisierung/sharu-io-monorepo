import { LoopbackNetwork } from '@safu/transport';
import { describe, expect, it } from 'vitest';
import { MemoryBlockStore } from './block-store.js';
import { DocSync } from './doc-sync.js';
import { SyncDoc } from './sync-doc.js';

/** Let queued microtasks (channel sends + accept loops) settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Poll until `predicate` holds or the timeout elapses (background auto-pull). */
const until = async (predicate: () => Promise<boolean>, timeout = 2000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('condition not met within timeout');
    await flush();
  }
};

describe('DocSync over a transport', () => {
  it('replicates a file mutation and transfers its block with hash parity', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('A');
    const tb = net.endpoint('B');

    // Pairing (done out-of-band in M2): each doc trusts the other as a writer.
    const docA = new SyncDoc('A');
    docA.addWriter('B');
    const docB = new SyncDoc('B');
    docB.addWriter('A');

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    // A ingests a block locally, then records it in the allocation table.
    const cipher = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = 'blake3-of-ciphertext';
    await storeA.put(hash, cipher);

    await syncB.connect(ta.addr());
    await flush();
    docA.setFile('photo.jpg', [hash], cipher.byteLength, 1000);
    await flush();

    // B's document converged on A's mutation...
    expect(docB.files.value.map((f) => f.path)).toEqual(['photo.jpg']);
    expect(docB.files.value[0]?.blocks).toEqual([hash]);

    // ...and an explicit pull of the referenced block returns it byte-for-byte.
    // (Auto-pull may have fetched it already; requestBlock is idempotent.)
    const pulled = await syncB.requestBlock(ta.addr(), hash);
    expect(pulled).toEqual(cipher);
    expect(await storeB.get(hash)).toEqual(cipher);

    await syncA.close();
    await syncB.close();
  });

  it('auto-pulls blocks the synced table references from the connected peer', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('A');
    const tb = net.endpoint('B');

    const docA = new SyncDoc('A');
    docA.addWriter('B');
    const docB = new SyncDoc('B');
    docB.addWriter('A');

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    const cipher = new Uint8Array([9, 8, 7, 6]);
    const hash = 'ciphertext-hash';
    await storeA.put(hash, cipher);

    await syncB.connect(ta.addr());
    await flush();
    docA.setFile('photo.jpg', [hash], cipher.byteLength, 1000);

    // B fetches the referenced block on its own — no manual requestBlock call.
    await until(() => storeB.has(hash));
    expect(await storeB.get(hash)).toEqual(cipher);

    await syncA.close();
    await syncB.close();
  });

  it('auto-pulls blocks already present in the catch-up snapshot at connect', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('A');
    const tb = net.endpoint('B');

    const docA = new SyncDoc('A');
    docA.addWriter('B');
    const docB = new SyncDoc('B');
    docB.addWriter('A');

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    // A already holds the file before B ever connects — it arrives via the
    // catch-up snapshot, not a live delta.
    const cipher = new Uint8Array([4, 4, 4]);
    const hash = 'pre-existing-hash';
    await storeA.put(hash, cipher);
    docA.setFile('old.bin', [hash], cipher.byteLength, 1);

    await syncB.connect(ta.addr());

    await until(() => storeB.has(hash));
    expect(await storeB.get(hash)).toEqual(cipher);

    await syncA.close();
    await syncB.close();
  });

  it('returns undefined when the peer lacks the requested block', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('A');
    const tb = net.endpoint('B');
    const syncA = new DocSync(ta, new SyncDoc('A'), new MemoryBlockStore());
    const syncB = new DocSync(tb, new SyncDoc('B'), new MemoryBlockStore());
    syncA.serve();
    syncB.serve();

    const missing = await syncB.requestBlock(ta.addr(), 'nope');
    expect(missing).toBeUndefined();

    await syncA.close();
    await syncB.close();
  });
});
