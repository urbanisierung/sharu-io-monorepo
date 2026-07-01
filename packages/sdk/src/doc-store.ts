import type { PeerId } from '@safu/transport';
import type { StampedEntry } from './allocation-table.js';

/**
 * A point-in-time, fully serializable image of a {@link SyncDoc}: the CRDT
 * entries (including tombstones), the writer set, and the Hybrid Logical Clock
 * state so locally-issued stamps stay monotonic across a restart.
 */
export interface DocSnapshot {
  entries: StampedEntry[];
  added: PeerId[];
  revoked: PeerId[];
  /** Wall-clock time (ms) each peer was granted write access — when it was
   *  linked — keyed by peer id. Optional so snapshots written before link times
   *  were tracked still load. */
  addedAt?: Record<PeerId, number>;
  hlc: { wall: number; counter: number };
}

/**
 * Persistence for a document snapshot. Web uses OPFS, desktop the native FS,
 * behind this one interface — mirroring {@link BlockStore} (plan §2.3 / status
 * next-step #2: backups must survive restarts).
 */
export interface DocStore {
  load(): Promise<DocSnapshot | undefined>;
  save(snapshot: DocSnapshot): Promise<void>;
}

/** In-memory DocStore. Test fake and reference implementation. */
export class MemoryDocStore implements DocStore {
  #snapshot: DocSnapshot | undefined;

  load(): Promise<DocSnapshot | undefined> {
    return Promise.resolve(this.#snapshot);
  }

  save(snapshot: DocSnapshot): Promise<void> {
    this.#snapshot = snapshot;
    return Promise.resolve();
  }
}
