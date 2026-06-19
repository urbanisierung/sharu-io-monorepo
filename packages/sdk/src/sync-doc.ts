// A replicated document over the allocation table, adding write-authorization
// (plan §2.3; handoff §6 open question "peer authorization / revocation").
//
// Authorization model — resolved:
//   Each mutation is *authored* by a peer (its id is in the HLC stamp). The
//   document carries a writer set that is itself a CRDT: a grow-only "added" set
//   minus a grow-only, permanent "revoked" set. A peer is authorized iff it has
//   been added and never revoked. Revocation is a permanent tombstone, so a lost
//   device — once revoked — can never re-authorize itself, and every replica
//   rejects its mutations as the revocation converges. This is what stops a
//   previously-paired device from continuing to push writes.
//
//   Admission control is by *author* (stamp.peer), not by the transport carrier:
//   a delta is merged only for entries/ops whose author is currently authorized.
//   The transport authenticates the immediate sender; cryptographic signing of
//   each op (to stop a still-trusted device forging another's author id) is a
//   deliberate M3+ hardening and is noted as such — out of scope for the
//   pair-wise, shared-passphrase trust model of M2.

import { type ReadonlySignal, signal } from '@preact/signals-core';
import type { PeerId } from '@safu/transport';
import {
  AllocationTable,
  type FileEntry,
  Hlc,
  type Stamp,
  type StampedEntry,
} from './allocation-table.js';

/** A grant or revocation of write access, authored by `stamp.peer`. */
export interface WriterOp {
  kind: 'add' | 'revoke';
  peer: PeerId;
  stamp: Stamp;
}

/** The unit of replication: stamped entries and writer-set ops to merge. */
export interface Delta {
  entries: StampedEntry[];
  writers: WriterOp[];
}

/** Snapshot of one live file for the UI layer. */
export interface FileView {
  path: string;
  size: number;
  modified: number;
  blocks: string[];
}

const now = () => Date.now();

export class SyncDoc {
  readonly #table = new AllocationTable();
  readonly #hlc: Hlc;
  readonly #added = new Set<PeerId>();
  readonly #revoked = new Set<PeerId>();
  readonly #files = signal<readonly FileView[]>([]);
  readonly #listeners = new Set<(delta: Delta) => void>();

  /** `self` is the genesis owner: authorized from creation. */
  constructor(self: PeerId) {
    this.#hlc = new Hlc(self);
    this.#added.add(self);
  }

  /** Live files, sorted by path — a domain signal the web app renders directly. */
  get files(): ReadonlySignal<readonly FileView[]> {
    return this.#files;
  }

  /** Is `peer` currently allowed to author mutations? */
  authorized(peer: PeerId): boolean {
    return this.#added.has(peer) && !this.#revoked.has(peer);
  }

  /** Record (or update) the allocation for `path`. Returns the delta to broadcast. */
  setFile(path: string, blocks: string[], size: number, modified: number): Delta {
    const entry: FileEntry = { blocks, size, modified, deleted: false };
    return this.#authorLocal({ path, entry, stamp: this.#hlc.tick(now()) });
  }

  /** Tombstone `path`. Resolves against concurrent edits by stamp. */
  deleteFile(path: string): Delta {
    const entry: FileEntry = { blocks: [], size: 0, modified: now(), deleted: true };
    return this.#authorLocal({ path, entry, stamp: this.#hlc.tick(now()) });
  }

  /** Grant write access to `peer`. */
  addWriter(peer: PeerId): Delta {
    const op: WriterOp = { kind: 'add', peer, stamp: this.#hlc.tick(now()) };
    this.#applyWriterOp(op);
    return { entries: [], writers: [op] };
  }

  /** Permanently revoke `peer`'s write access (e.g. a lost device). */
  revokeWriter(peer: PeerId): Delta {
    const op: WriterOp = { kind: 'revoke', peer, stamp: this.#hlc.tick(now()) };
    this.#applyWriterOp(op);
    return { entries: [], writers: [op] };
  }

  /**
   * Merge a delta received from `sender` (the transport-authenticated peer).
   * Writer ops are merged first so authorization reflects the latest grants and
   * revocations, then entries authored by an authorized peer are merged. Returns
   * the subset that actually changed local state, for onward gossip.
   */
  applyRemote(sender: PeerId, delta: Delta): Delta {
    const writers: WriterOp[] = [];
    for (const op of delta.writers) {
      this.#hlc.observe(op.stamp, now());
      // Only an authorized peer may change the writer set; the genesis grant of
      // a peer is authored by an already-authorized peer.
      if (!this.authorized(op.stamp.peer)) continue;
      if (this.#applyWriterOp(op)) writers.push(op);
    }
    const entries: StampedEntry[] = [];
    for (const stamped of delta.entries) {
      this.#hlc.observe(stamped.stamp, now());
      if (!this.authorized(stamped.stamp.peer)) continue;
      if (this.#table.apply(stamped)) entries.push(stamped);
    }
    if (entries.length > 0) this.#publish();
    void sender;
    return { entries, writers };
  }

  /** The full current entry state as a delta, for catching up a peer that
   *  connects after mutations have already happened. */
  snapshot(): Delta {
    return { entries: this.#table.state(), writers: [] };
  }

  /** Subscribe to locally-produced and accepted-remote deltas for broadcast. */
  onDelta(listener: (delta: Delta) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #authorLocal(stamped: StampedEntry): Delta {
    this.#table.apply(stamped);
    this.#publish();
    const delta: Delta = { entries: [stamped], writers: [] };
    this.#emit(delta);
    return delta;
  }

  #applyWriterOp(op: WriterOp): boolean {
    if (op.kind === 'add') {
      if (this.#added.has(op.peer)) return false;
      this.#added.add(op.peer);
      return true;
    }
    if (this.#revoked.has(op.peer)) return false;
    this.#revoked.add(op.peer);
    return true;
  }

  #publish(): void {
    this.#files.value = this.#table.paths().map((path) => {
      const entry = this.#table.get(path) as FileEntry;
      return { path, size: entry.size, modified: entry.modified, blocks: entry.blocks };
    });
  }

  #emit(delta: Delta): void {
    for (const listener of this.#listeners) listener(delta);
  }
}
