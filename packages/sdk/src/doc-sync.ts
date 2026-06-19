// Wires a SyncDoc + BlockStore to a Transport (plan §2.3): local mutations are
// broadcast to paired peers as deltas, inbound deltas are merged, and the blocks
// a peer is missing are pulled on demand. Transport state is fully decoupled
// from document state (blueprint §4) — this layer is the only seam between them.
//
// Only ciphertext crosses the wire (zero-knowledge invariant): blocks are moved
// as the opaque bytes the BlockStore holds, addressed by hash; the relay and the
// transport never see plaintext or keys.

import type { Channel, PeerAddr, Transport } from '@safu/transport';
import type { BlockStore } from './block-store.js';
import type { Delta, SyncDoc } from './sync-doc.js';

/** ALPN-style protocol tags for the two channel kinds. */
export const SYNC_PROTOCOL = 'safu/sync/1';
export const BLOCK_PROTOCOL = 'safu/blocks/1';

const enc = new TextEncoder();
const dec = new TextDecoder();

export class DocSync {
  readonly #transport: Transport;
  readonly #doc: SyncDoc;
  readonly #store: BlockStore;
  readonly #peers = new Set<Channel>();
  // The dialable address for each channel we initiated, so we can pull missing
  // blocks back from that peer. Channels we only accepted have no return addr.
  readonly #addrs = new Map<Channel, PeerAddr>();
  #unsubscribe: (() => void) | undefined;

  constructor(transport: Transport, doc: SyncDoc, store: BlockStore) {
    this.#transport = transport;
    this.#doc = doc;
    this.#store = store;
  }

  /** Begin accepting inbound sync and block channels. Runs until `close`. */
  serve(): void {
    this.#unsubscribe ??= this.#doc.onDelta((delta) => this.#broadcast(delta));
    void this.#acceptSync();
    void this.#acceptBlocks();
  }

  /** Dial `peer`, open a sync channel, and exchange deltas over it. */
  async connect(peer: PeerAddr): Promise<void> {
    this.#unsubscribe ??= this.#doc.onDelta((delta) => this.#broadcast(delta));
    const channel = await this.#transport.connect(peer, SYNC_PROTOCOL);
    this.#addrs.set(channel, peer);
    this.#track(channel);
  }

  /** Pull one block from `peer` by hash and persist it. Resolves to the bytes,
   *  or undefined if the peer does not have it. */
  async requestBlock(peer: PeerAddr, hash: string): Promise<Uint8Array | undefined> {
    const channel = await this.#transport.connect(peer, BLOCK_PROTOCOL);
    try {
      await channel.send(enc.encode(hash));
      const { value } = await channel.messages().next();
      if (!value || value.byteLength === 0) return undefined;
      await this.#store.put(hash, value);
      return value;
    } finally {
      await channel.close();
    }
  }

  async close(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    for (const channel of this.#peers) await channel.close();
    this.#peers.clear();
    this.#addrs.clear();
    await this.#transport.close();
  }

  async #acceptSync(): Promise<void> {
    for await (const channel of this.#transport.accept(SYNC_PROTOCOL)) {
      this.#track(channel);
    }
  }

  async #acceptBlocks(): Promise<void> {
    for await (const channel of this.#transport.accept(BLOCK_PROTOCOL)) {
      void this.#serveBlocks(channel);
    }
  }

  /** Answer block-by-hash requests from the local store until the channel ends. */
  async #serveBlocks(channel: Channel): Promise<void> {
    for await (const message of channel.messages()) {
      const hash = dec.decode(message);
      const block = await this.#store.get(hash);
      await channel.send(block ?? new Uint8Array(0));
    }
  }

  /** Register a sync channel: send our current state for catch-up, read inbound
   *  deltas, and remember it for broadcasting future mutations. */
  #track(channel: Channel): void {
    this.#peers.add(channel);
    void channel.send(enc.encode(JSON.stringify(this.#doc.snapshot())));
    void this.#readDeltas(channel);
  }

  async #readDeltas(channel: Channel): Promise<void> {
    for await (const message of channel.messages()) {
      const delta = JSON.parse(dec.decode(message)) as Delta;
      const accepted = this.#doc.applyRemote(channel.peer, delta);
      const addr = this.#addrs.get(channel);
      // A peer we dialed: pull any newly-referenced blocks we lack from it.
      if (addr && accepted.entries.length > 0) void this.#pullMissing(addr);
    }
    this.#peers.delete(channel);
    this.#addrs.delete(channel);
  }

  /** Fetch every block the document references but the local store lacks, from
   *  `peer`. Idempotent: a `has` guard skips blocks already held or concurrently
   *  fetched, so overlapping calls converge without double-pulling. */
  async #pullMissing(peer: PeerAddr): Promise<void> {
    for (const file of this.#doc.files.value) {
      for (const hash of file.blocks) {
        if (!(await this.#store.has(hash))) await this.requestBlock(peer, hash);
      }
    }
  }

  #broadcast(delta: Delta): void {
    const frame = enc.encode(JSON.stringify(delta));
    for (const channel of this.#peers) void channel.send(frame);
  }
}
