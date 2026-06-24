import { afterEach, describe, expect, it } from 'vitest';
import { addShare, loadShares, type PublishedShare, removeShare } from './shares-store.js';

const share = (root: string, created: number): PublishedShare => ({
  root,
  path: `${root}.txt`,
  link: `https://safu.app/s#share=${root}`,
  pin: [root, 'block-a'],
  created,
});

afterEach(() => globalThis.localStorage?.clear());

describe('shares store', () => {
  it('starts empty and round-trips an added share', () => {
    expect(loadShares('w1')).toEqual([]);
    addShare('w1', share('r1', 1));
    expect(loadShares('w1')).toEqual([share('r1', 1)]);
  });

  it('keeps shares newest-first and de-dupes by root', () => {
    addShare('w1', share('r1', 1));
    addShare('w1', share('r2', 2));
    expect(loadShares('w1').map((s) => s.root)).toEqual(['r2', 'r1']);
    // Re-publishing the same root replaces it and moves it to the front.
    addShare('w1', { ...share('r1', 3), path: 'renamed.txt' });
    const roots = loadShares('w1');
    expect(roots.map((s) => s.root)).toEqual(['r1', 'r2']);
    expect(roots[0]?.path).toBe('renamed.txt');
  });

  it('isolates shares per wallet', () => {
    addShare('w1', share('r1', 1));
    addShare('w2', share('r2', 1));
    expect(loadShares('w1').map((s) => s.root)).toEqual(['r1']);
    expect(loadShares('w2').map((s) => s.root)).toEqual(['r2']);
  });

  it('removes a share by root', () => {
    addShare('w1', share('r1', 1));
    addShare('w1', share('r2', 2));
    expect(removeShare('w1', 'r1').map((s) => s.root)).toEqual(['r2']);
    expect(loadShares('w1').map((s) => s.root)).toEqual(['r2']);
  });
});
