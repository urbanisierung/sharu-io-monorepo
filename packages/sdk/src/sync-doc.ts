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
import type { DocSnapshot, DocStore } from './doc-store.js';
import { type Signer, verifySignature } from './signing.js';

/** A grant or revocation of write access, authored by `stamp.peer`. The optional
 *  `sig` is the author's signature over the op (status #7). */
export interface WriterOp {
  kind: 'add' | 'revoke';
  peer: PeerId;
  stamp: Stamp;
  sig?: string;
}

const enc = new TextEncoder();

/** Deterministic signable bytes for an entry — a fixed-order tuple, excluding
 *  the signature itself, so both signer and verifier hash the same input. */
function entryBytes(e: StampedEntry): Uint8Array {
  return enc.encode(
    JSON.stringify([
      e.path,
      e.entry.blocks,
      e.entry.size,
      e.entry.modified,
      e.entry.deleted,
      e.stamp.wall,
      e.stamp.counter,
      e.stamp.peer,
    ]),
  );
}

/** Deterministic signable bytes for a writer op. */
function writerBytes(op: WriterOp): Uint8Array {
  return enc.encode(
    JSON.stringify([op.kind, op.peer, op.stamp.wall, op.stamp.counter, op.stamp.peer]),
  );
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
  readonly #self: PeerId;
  readonly #added = new Set<PeerId>();
  readonly #revoked = new Set<PeerId>();
  readonly #writerIds = signal<readonly PeerId[]>([]);
  readonly #files = signal<readonly FileView[]>([]);
  readonly #listeners = new Set<(delta: Delta) => void>();
  readonly #store?: DocStore;
  readonly #signer?: Signer;
  #pending: Promise<void> | null = null;
  #dirty = false;

  /** `self` is the genesis owner: authorized from creation. A `store`, if given,
   *  receives a coalesced snapshot after every state change. A `signer`, if
   *  given, signs every local op and puts the doc in *signed mode*: remote ops
   *  must carry a valid signature by their claimed author or they are rejected
   *  (status #7). `self` must be the signer's id. */
  constructor(self: PeerId, store?: DocStore, signer?: Signer) {
    this.#hlc = new Hlc(self);
    this.#self = self;
    this.#added.add(self);
    this.#store = store;
    this.#signer = signer;
  }

  /** Open a document backed by `store`, restoring its last snapshot if present. */
  static async open(self: PeerId, store: DocStore, signer?: Signer): Promise<SyncDoc> {
    const doc = new SyncDoc(self, store, signer);
    const snapshot = await store.load();
    if (snapshot) doc.#load(snapshot);
    return doc;
  }

  /** Live files, sorted by path — a domain signal the web app renders directly. */
  get files(): ReadonlySignal<readonly FileView[]> {
    return this.#files;
  }

  /** The other peers in the writer set (every added peer except self, including
   *  revoked ones), as a signal — the device list the UI renders. Survives a
   *  reload because the writer set is part of the persisted snapshot. */
  get writers(): ReadonlySignal<readonly PeerId[]> {
    return this.#writerIds;
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
    if (this.#signer) op.sig = this.#signer.sign(writerBytes(op));
    if (this.#applyWriterOp(op)) this.#scheduleSave();
    return { entries: [], writers: [op] };
  }

  /** Permanently revoke `peer`'s write access (e.g. a lost device). */
  revokeWriter(peer: PeerId): Delta {
    const op: WriterOp = { kind: 'revoke', peer, stamp: this.#hlc.tick(now()) };
    if (this.#signer) op.sig = this.#signer.sign(writerBytes(op));
    if (this.#applyWriterOp(op)) this.#scheduleSave();
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
      // Reject a forged author before it touches our clock or state.
      if (!this.#signValid(op.stamp.peer, writerBytes(op), op.sig)) continue;
      this.#hlc.observe(op.stamp, now());
      // Only an authorized peer may change the writer set; the genesis grant of
      // a peer is authored by an already-authorized peer.
      if (!this.authorized(op.stamp.peer)) continue;
      if (this.#applyWriterOp(op)) writers.push(op);
    }
    const entries: StampedEntry[] = [];
    for (const stamped of delta.entries) {
      if (!this.#signValid(stamped.stamp.peer, entryBytes(stamped), stamped.sig)) continue;
      this.#hlc.observe(stamped.stamp, now());
      if (!this.authorized(stamped.stamp.peer)) continue;
      if (this.#table.apply(stamped)) entries.push(stamped);
    }
    if (entries.length > 0) this.#publish();
    if (entries.length > 0 || writers.length > 0) this.#scheduleSave();
    void sender;
    return { entries, writers };
  }

  /** The full current entry state as a delta, for catching up a peer that
   *  connects after mutations have already happened. */
  snapshot(): Delta {
    return { entries: this.#table.state(), writers: [] };
  }

  /** A fully serializable image of the document, for persistence. */
  serialize(): DocSnapshot {
    return {
      entries: this.#table.state(),
      added: [...this.#added],
      revoked: [...this.#revoked],
      hlc: this.#hlc.state(),
    };
  }

  /** Resolve once every pending snapshot write has flushed to the store. */
  async flush(): Promise<void> {
    while (this.#pending) await this.#pending;
  }

  /** Subscribe to locally-produced and accepted-remote deltas for broadcast. */
  onDelta(listener: (delta: Delta) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #authorLocal(stamped: StampedEntry): Delta {
    if (this.#signer) stamped.sig = this.#signer.sign(entryBytes(stamped));
    this.#table.apply(stamped);
    this.#publish();
    this.#scheduleSave();
    const delta: Delta = { entries: [stamped], writers: [] };
    this.#emit(delta);
    return delta;
  }

  /** In signed mode, an op is valid only if it carries a signature its claimed
   *  author actually produced. In unsigned mode (no signer), nothing to enforce. */
  #signValid(authorId: PeerId, bytes: Uint8Array, sig: string | undefined): boolean {
    if (!this.#signer) return true;
    return sig !== undefined && verifySignature(authorId, bytes, sig);
  }

  #load(snapshot: DocSnapshot): void {
    for (const entry of snapshot.entries) this.#table.apply(entry);
    for (const peer of snapshot.added) this.#added.add(peer);
    for (const peer of snapshot.revoked) this.#revoked.add(peer);
    this.#hlc.load(snapshot.hlc.wall, snapshot.hlc.counter);
    this.#refreshWriters();
    this.#publish();
  }

  // Coalesced persistence: a state change marks the doc dirty and the drain loop
  // writes the latest serialized snapshot, collapsing bursts into one write.
  #scheduleSave(): void {
    if (!this.#store) return;
    this.#dirty = true;
    if (!this.#pending) this.#pending = this.#drain();
  }

  async #drain(): Promise<void> {
    while (this.#dirty) {
      this.#dirty = false;
      await this.#store?.save(this.serialize());
    }
    this.#pending = null;
  }

  #applyWriterOp(op: WriterOp): boolean {
    if (op.kind === 'add') {
      if (this.#added.has(op.peer)) return false;
      this.#added.add(op.peer);
      this.#refreshWriters();
      return true;
    }
    if (this.#revoked.has(op.peer)) return false;
    this.#revoked.add(op.peer);
    this.#refreshWriters();
    return true;
  }

  #refreshWriters(): void {
    this.#writerIds.value = [...this.#added].filter((peer) => peer !== this.#self);
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
