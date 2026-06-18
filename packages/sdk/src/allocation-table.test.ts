import { describe, expect, it } from 'vitest';
import { AllocationTable, compareStamp, Hlc, type StampedEntry } from './allocation-table.js';

function entry(path: string, wall: number, counter: number, peer: string): StampedEntry {
  return {
    path,
    entry: { blocks: [`${path}@${wall}.${counter}`], size: wall, modified: wall, deleted: false },
    stamp: { wall, counter, peer },
  };
}

describe('compareStamp', () => {
  it('orders by wall, then counter, then peer (total + deterministic)', () => {
    const base = { wall: 5, counter: 2, peer: 'b' };
    expect(compareStamp({ ...base, wall: 6 }, base)).toBeGreaterThan(0);
    expect(compareStamp({ ...base, counter: 3 }, base)).toBeGreaterThan(0);
    expect(compareStamp({ ...base, peer: 'c' }, base)).toBeGreaterThan(0);
    expect(compareStamp({ ...base, peer: 'a' }, base)).toBeLessThan(0);
    expect(compareStamp(base, base)).toBe(0);
  });
});

describe('Hlc', () => {
  it('produces strictly increasing stamps even when the wall clock stalls', () => {
    const hlc = new Hlc('p');
    const a = hlc.tick(1000);
    const b = hlc.tick(1000); // same milli → counter advances
    const c = hlc.tick(900); // clock steps back → still dominated
    expect(compareStamp(b, a)).toBeGreaterThan(0);
    expect(compareStamp(c, b)).toBeGreaterThan(0);
  });

  it('dominates an observed remote stamp', () => {
    const hlc = new Hlc('p');
    hlc.observe({ wall: 5000, counter: 9, peer: 'q' }, 1000);
    const next = hlc.tick(1000);
    expect(compareStamp(next, { wall: 5000, counter: 9, peer: 'q' })).toBeGreaterThan(0);
  });
});

describe('AllocationTable (CvRDT)', () => {
  it('converges regardless of arrival order', () => {
    const ops = [
      entry('a.txt', 1, 0, 'x'),
      entry('a.txt', 2, 0, 'y'),
      entry('b.txt', 1, 0, 'x'),
      entry('a.txt', 1, 5, 'z'),
    ];
    const forward = new AllocationTable();
    const reverse = new AllocationTable();
    for (const op of ops) forward.apply(op);
    for (const op of [...ops].reverse()) reverse.apply(op);
    expect(forward.state()).toEqual(reverse.state());
    // a.txt resolves to the highest stamp (wall 2 wins over wall 1 variants).
    expect(forward.get('a.txt')?.size).toBe(2);
  });

  it('preserves concurrent inserts at different paths (no silent drop)', () => {
    const t = new AllocationTable();
    t.apply(entry('photos/1.jpg', 7, 0, 'phone'));
    t.apply(entry('docs/cv.pdf', 7, 0, 'laptop'));
    expect(t.paths()).toEqual(['docs/cv.pdf', 'photos/1.jpg']);
  });

  it('resolves a same-path edit/delete race by stamp, not by deletion', () => {
    const edit = entry('f', 10, 0, 'a');
    const del: StampedEntry = {
      path: 'f',
      entry: { blocks: [], size: 0, modified: 9, deleted: true },
      stamp: { wall: 9, counter: 0, peer: 'b' },
    };
    const t1 = new AllocationTable();
    t1.apply(del);
    t1.apply(edit); // newer edit wins over older delete
    expect(t1.get('f')?.size).toBe(10);

    const t2 = new AllocationTable();
    t2.apply(edit);
    t2.apply(del); // older delete must NOT clobber the newer edit
    expect(t2.get('f')?.size).toBe(10);
  });

  it('merge is idempotent and commutative', () => {
    const a = new AllocationTable();
    const b = new AllocationTable();
    a.apply(entry('p', 1, 0, 'x'));
    b.apply(entry('p', 2, 0, 'y'));
    b.apply(entry('q', 1, 0, 'x'));
    a.merge(b);
    a.merge(b); // idempotent
    const c = new AllocationTable();
    c.apply(entry('q', 1, 0, 'x'));
    c.apply(entry('p', 2, 0, 'y'));
    c.apply(entry('p', 1, 0, 'x'));
    const byPath = (s: StampedEntry[]) => [...s].sort((x, y) => x.path.localeCompare(y.path));
    expect(byPath(a.state())).toEqual(byPath(c.state()));
  });
});
