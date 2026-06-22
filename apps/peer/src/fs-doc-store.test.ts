import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DocSnapshot } from '@safu/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsDocStore } from './fs-doc-store.js';

const snapshot: DocSnapshot = {
  entries: [],
  added: ['peer-a'],
  revoked: [],
  hlc: { wall: 1, counter: 2 },
};

describe('FsDocStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'safu-doc-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns undefined before anything is saved', async () => {
    expect(await new FsDocStore(join(dir, 'doc.json')).load()).toBeUndefined();
  });

  it('round-trips a snapshot, creating parent directories', async () => {
    const store = new FsDocStore(join(dir, 'state', 'doc.json'));
    await store.save(snapshot);
    expect(await store.load()).toEqual(snapshot);
  });
});
