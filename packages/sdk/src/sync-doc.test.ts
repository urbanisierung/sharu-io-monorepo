import { describe, expect, it } from 'vitest';
import { MemoryDocStore } from './doc-store.js';
import { createSigner } from './signing.js';
import { type Delta, SyncDoc } from './sync-doc.js';

const seed = (fill: number) => new Uint8Array(32).fill(fill);

/** Pair two docs so each accepts the other's locally-emitted deltas in real
 *  time, as the transport layer will wire them. Returns nothing; convergence is
 *  asserted by callers. */
function link(a: SyncDoc, aId: string, b: SyncDoc, bId: string): void {
  a.onDelta((d) => b.applyRemote(aId, d));
  b.onDelta((d) => a.applyRemote(bId, d));
}

describe('SyncDoc replication', () => {
  it('converges a mutation from an authorized peer onto the other (plan §2.3)', () => {
    const a = new SyncDoc('A');
    const b = new SyncDoc('B');
    a.addWriter('B');
    b.applyRemote('A', {
      entries: [],
      writers: [{ kind: 'add', peer: 'B', stamp: { wall: 1, counter: 0, peer: 'A' } }],
    });
    link(a, 'A', b, 'B');

    b.setFile('notes.md', ['h1', 'h2'], 42, 1000);
    expect(a.files.value.map((f) => f.path)).toEqual(['notes.md']);
    expect(a.files.value[0]?.blocks).toEqual(['h1', 'h2']);
  });

  it('converges identically regardless of delta arrival order', () => {
    const a = new SyncDoc('A');
    a.addWriter('B');
    const grant: Delta = {
      entries: [],
      writers: [{ kind: 'add', peer: 'B', stamp: { wall: 1, counter: 0, peer: 'A' } }],
    };

    const d1 = a.setFile('a.txt', ['x'], 1, 1);
    const b = new SyncDoc('B');
    b.applyRemote('A', grant);
    const d2 = b.setFile('b.txt', ['y'], 2, 2);

    // Cross-apply in opposite orders into two fresh observers.
    const left = new SyncDoc('A');
    left.applyRemote('A', grant);
    left.applyRemote('A', d1);
    left.applyRemote('B', d2);

    const right = new SyncDoc('A');
    right.applyRemote('A', grant);
    right.applyRemote('B', d2);
    right.applyRemote('A', d1);

    expect(left.files.value).toEqual(right.files.value);
    expect(left.files.value.map((f) => f.path)).toEqual(['a.txt', 'b.txt']);
  });

  it('rejects mutations from a revoked device (handoff open question)', () => {
    const owner = new SyncDoc('OWNER');
    owner.addWriter('LOST');

    // LOST authors a write while still trusted — accepted.
    const ok = owner.applyRemote('LOST', {
      entries: [
        {
          path: 'ok.txt',
          entry: { blocks: ['a'], size: 1, modified: 1, deleted: false },
          stamp: { wall: 5, counter: 0, peer: 'LOST' },
        },
      ],
      writers: [],
    });
    expect(ok.entries).toHaveLength(1);
    expect(owner.files.value.map((f) => f.path)).toEqual(['ok.txt']);

    // Owner revokes the lost device.
    owner.revokeWriter('LOST');
    expect(owner.authorized('LOST')).toBe(false);

    // A later write authored by LOST is rejected and does not change state.
    const rejected = owner.applyRemote('LOST', {
      entries: [
        {
          path: 'evil.txt',
          entry: { blocks: ['z'], size: 9, modified: 9, deleted: false },
          stamp: { wall: 9, counter: 0, peer: 'LOST' },
        },
      ],
      writers: [],
    });
    expect(rejected.entries).toHaveLength(0);
    expect(owner.files.value.map((f) => f.path)).toEqual(['ok.txt']);
  });

  it('rejects entries authored by a never-authorized peer', () => {
    const doc = new SyncDoc('OWNER');
    const rejected = doc.applyRemote('STRANGER', {
      entries: [
        {
          path: 'x',
          entry: { blocks: [], size: 0, modified: 0, deleted: false },
          stamp: { wall: 1, counter: 0, peer: 'STRANGER' },
        },
      ],
      writers: [],
    });
    expect(rejected.entries).toHaveLength(0);
    expect(doc.files.value).toHaveLength(0);
  });

  it('signed mode: accepts a genuinely-signed op, rejects a forged author (status #7)', () => {
    const alice = createSigner(seed(1));
    const bob = createSigner(seed(2));
    const mallory = createSigner(seed(3));

    const owner = new SyncDoc(alice.id, undefined, alice);
    owner.addWriter(bob.id);

    // Bob authors and signs with his own key — accepted and converges.
    const bobDoc = new SyncDoc(bob.id, undefined, bob);
    const good = bobDoc.setFile('ok.txt', ['h'], 1, 1);
    expect(owner.applyRemote('sender', good).entries).toHaveLength(1);
    expect(owner.files.value.map((f) => f.path)).toEqual(['ok.txt']);

    // Mallory forges Bob's authorship (stamp.peer = bob) but can only sign with
    // her own key. Bob is authorized, yet the signature does not match his id.
    const forger = new SyncDoc(bob.id, undefined, mallory);
    const forged = forger.setFile('evil.txt', ['z'], 9, 9);
    expect(forged.entries[0]?.stamp.peer).toBe(bob.id);
    expect(owner.applyRemote('sender', forged).entries).toHaveLength(0);
    expect(owner.files.value.map((f) => f.path)).toEqual(['ok.txt']);
  });

  it('signed mode: rejects an unsigned op', () => {
    const alice = createSigner(seed(4));
    const bob = createSigner(seed(5));
    const owner = new SyncDoc(alice.id, undefined, alice);
    owner.addWriter(bob.id);

    const rejected = owner.applyRemote('sender', {
      entries: [
        {
          path: 'x',
          entry: { blocks: ['h'], size: 1, modified: 1, deleted: false },
          stamp: { wall: 5, counter: 0, peer: bob.id },
        },
      ],
      writers: [],
    });
    expect(rejected.entries).toHaveLength(0);
    expect(owner.files.value).toHaveLength(0);
  });

  it('exposes authorized writers (excluding self), keeping revoked ones listed', () => {
    const owner = new SyncDoc('SELF');
    expect(owner.writers.value).toEqual([]);
    owner.addWriter('B');
    owner.addWriter('C');
    expect([...owner.writers.value].sort()).toEqual(['B', 'C']);
    // A revoked peer stays listed so the UI can show "writes blocked"; the
    // authorization verdict is separate from membership.
    owner.revokeWriter('B');
    expect([...owner.writers.value].sort()).toEqual(['B', 'C']);
    expect(owner.authorized('B')).toBe(false);
  });

  it('restores the writer list from a persisted snapshot', async () => {
    const store = new MemoryDocStore();
    const first = new SyncDoc('SELF', store);
    first.addWriter('B');
    await first.flush();

    const reopened = await SyncDoc.open('SELF', store);
    expect(reopened.writers.value).toEqual(['B']);
  });

  it('a revoked peer cannot revoke or re-add writers', () => {
    const owner = new SyncDoc('OWNER');
    owner.addWriter('B');
    owner.revokeWriter('B');
    // B tries to re-add itself — its writer op is authored by an unauthorized peer.
    const rejected = owner.applyRemote('B', {
      entries: [],
      writers: [{ kind: 'add', peer: 'B', stamp: { wall: 9, counter: 0, peer: 'B' } }],
    });
    expect(rejected.writers).toHaveLength(0);
    expect(owner.authorized('B')).toBe(false);
  });
});
