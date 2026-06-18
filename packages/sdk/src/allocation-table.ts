// The replicated file allocation table (plan §2.3): a state-based CRDT mapping
// each path to its ordered block hashes + metadata. Conflict resolution lives
// here, fully decoupled from transport (blueprint §4 invariant).
//
// Design decision — resolved (handoff §6 open question "LWW vs CRDT"):
//   The table is a *map of last-writer-wins registers*, keyed by path, with the
//   winner chosen by a Hybrid Logical Clock (HLC) timestamp and a deterministic
//   peer-id tiebreak. This is a join-semilattice, so `merge` is commutative,
//   associative and idempotent ⇒ every replica converges regardless of the
//   order deltas arrive in.
//
//   We deliberately do NOT use a single whole-document LWW register: that would
//   let a write to one path clobber a concurrent insert at a *different* path.
//   A backup tool must never silently drop a write, so per-path resolution is
//   required. We also do not use a sequence CRDT (e.g. RGA): a file entry is
//   replaced wholesale on each save, never co-edited element-by-element, so the
//   extra machinery would be unjustified complexity (CLAUDE.md "simplicity").
//
//   Concurrent edits to the *same* path still converge deterministically (the
//   higher HLC wins, ties broken by peer id) — a deletion is a tombstone entry
//   carrying its own stamp, so a delete racing an edit resolves by stamp rather
//   than one silently winning.

import type { PeerId } from '@safu/transport';

/** A Hybrid Logical Clock timestamp: wall-clock millis, a monotonic counter to
 *  order events within the same milli, and the originating peer for tiebreaks. */
export interface Stamp {
  wall: number;
  counter: number;
  peer: PeerId;
}

/** Metadata + ordered block hashes for one path. `deleted` marks a tombstone. */
export interface FileEntry {
  blocks: string[];
  size: number;
  modified: number;
  deleted: boolean;
}

/** A stamped entry as it lives in the table and travels on the wire. */
export interface StampedEntry {
  path: string;
  entry: FileEntry;
  stamp: Stamp;
}

/** Total order over stamps: wall, then counter, then peer id. Deterministic on
 *  every replica, so the same two stamps always resolve the same way. */
export function compareStamp(a: Stamp, b: Stamp): number {
  if (a.wall !== b.wall) return a.wall - b.wall;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0;
}

/** A Hybrid Logical Clock. `tick` returns a stamp strictly greater than any it
 *  has produced or observed, so locally-ordered writes get ordered stamps even
 *  when the wall clock stalls or steps backward. */
export class Hlc {
  #wall = 0;
  #counter = 0;

  constructor(private readonly peer: PeerId) {}

  /** Issue a stamp for a local mutation. */
  tick(now: number): Stamp {
    if (now > this.#wall) {
      this.#wall = now;
      this.#counter = 0;
    } else {
      this.#counter += 1;
    }
    return { wall: this.#wall, counter: this.#counter, peer: this.peer };
  }

  /** Fold a remote stamp into local time so subsequent local stamps dominate it. */
  observe(stamp: Stamp, now: number): void {
    const wall = Math.max(this.#wall, stamp.wall, now);
    if (wall === this.#wall && wall === stamp.wall) {
      this.#counter = Math.max(this.#counter, stamp.counter) + 1;
    } else if (wall === stamp.wall) {
      this.#counter = stamp.counter + 1;
    } else if (wall !== this.#wall) {
      this.#counter = 0;
    }
    this.#wall = wall;
  }
}

/** The CRDT itself: a path → stamped-entry map with a semilattice `merge`. */
export class AllocationTable {
  readonly #entries = new Map<string, StampedEntry>();

  /** Apply one stamped entry, keeping whichever stamp is greater. Returns true
   *  if this changed local state (i.e. the incoming entry won). Idempotent. */
  apply(incoming: StampedEntry): boolean {
    const current = this.#entries.get(incoming.path);
    if (current && compareStamp(incoming.stamp, current.stamp) <= 0) return false;
    this.#entries.set(incoming.path, incoming);
    return true;
  }

  /** Join another table into this one. Order-independent; returns the entries
   *  that won so callers can propagate just the delta. */
  merge(other: AllocationTable): StampedEntry[] {
    const changed: StampedEntry[] = [];
    for (const incoming of other.#entries.values()) {
      if (this.apply(incoming)) changed.push(incoming);
    }
    return changed;
  }

  /** The live (non-tombstone) entry for `path`, if any. */
  get(path: string): FileEntry | undefined {
    const stamped = this.#entries.get(path);
    return stamped && !stamped.entry.deleted ? stamped.entry : undefined;
  }

  /** Live paths in sorted order (deterministic snapshots for the UI/tests). */
  paths(): string[] {
    const live: string[] = [];
    for (const [path, stamped] of this.#entries) {
      if (!stamped.entry.deleted) live.push(path);
    }
    return live.sort();
  }

  /** Full state, including tombstones, for syncing or persistence. */
  state(): StampedEntry[] {
    return [...this.#entries.values()];
  }
}
