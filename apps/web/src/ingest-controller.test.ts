import { describe, expect, it, vi } from 'vitest';
import { IngestController } from './ingest-controller.js';

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name);

describe('IngestController interaction states', () => {
  it('starts at first-run and unlocks into idle once a passphrase is entered', () => {
    const c = new IngestController(async () => {});
    expect(c.phase.value).toEqual({ kind: 'first-run' });
    c.unlock('');
    expect(c.phase.value.kind).toBe('first-run'); // empty rejected
    c.unlock('hunter2');
    expect(c.phase.value).toEqual({ kind: 'idle' });
    expect(c.unlocked).toBe(true);
  });

  it('reflects drag-over valid/invalid and clears on leave', () => {
    const c = new IngestController(async () => {});
    c.unlock('p');
    c.dragOver(true);
    expect(c.phase.value).toEqual({ kind: 'drag', valid: true });
    c.dragOver(false);
    expect(c.phase.value).toEqual({ kind: 'drag', valid: false });
    c.dragLeave();
    expect(c.phase.value).toEqual({ kind: 'idle' });
  });

  it('ignores drag interactions before unlock', () => {
    const c = new IngestController(async () => {});
    c.dragOver(true);
    expect(c.phase.value).toEqual({ kind: 'first-run' });
  });

  it('advances chunking progress then reports success', async () => {
    const seen: string[] = [];
    const c = new IngestController(async () => {});
    c.unlock('p');
    c.phase.subscribe((p) => seen.push(p.kind));
    await c.drop([file('a.txt'), file('b.txt')]);
    expect(c.phase.value).toEqual({ kind: 'success', count: 2 });
    expect(seen).toContain('chunking');
  });

  it('surfaces an error if ingest throws and recovers on reset', async () => {
    const ingest = vi.fn().mockRejectedValue(new Error('disk full'));
    const c = new IngestController(ingest);
    c.unlock('p');
    await c.drop([file('a.txt')]);
    expect(c.phase.value).toEqual({ kind: 'error', message: 'disk full' });
    c.reset();
    expect(c.phase.value).toEqual({ kind: 'idle' });
  });

  it('tracks per-file progress to done and exposes file names + sizes', async () => {
    const c = new IngestController(async () => {});
    c.unlock('p');
    await c.drop([file('a.txt'), file('b.txt')]);
    expect(c.progress.value.map((p) => p.status)).toEqual(['done', 'done']);
    expect(c.progress.value.map((p) => p.name)).toEqual(['a.txt', 'b.txt']);
    expect(c.progress.value[0]?.size).toBe(3);
  });

  it('marks the failing file as error and clears the list on reset', async () => {
    const c = new IngestController(vi.fn().mockRejectedValue(new Error('x')));
    c.unlock('p');
    await c.drop([file('a.txt')]);
    expect(c.progress.value[0]?.status).toBe('error');
    c.reset();
    expect(c.progress.value).toEqual([]);
  });
});
