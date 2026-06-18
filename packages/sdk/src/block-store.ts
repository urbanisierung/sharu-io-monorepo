/**
 * Content-addressed block storage. Blocks are keyed by their BLAKE3 hash
 * (lowercase hex). Web uses OPFS, desktop uses native FS behind this interface
 * (plan §1.3). `delete`/`list` are deferred to Phase 2 — no Phase 1 consumer.
 */
export interface BlockStore {
  put(hash: string, block: Uint8Array): Promise<void>;
  get(hash: string): Promise<Uint8Array | undefined>;
  has(hash: string): Promise<boolean>;
}

/** In-memory BlockStore. Test fake and reference implementation. */
export class MemoryBlockStore implements BlockStore {
  readonly #blocks = new Map<string, Uint8Array>();

  put(hash: string, block: Uint8Array): Promise<void> {
    this.#blocks.set(hash, block);
    return Promise.resolve();
  }

  get(hash: string): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.#blocks.get(hash));
  }

  has(hash: string): Promise<boolean> {
    return Promise.resolve(this.#blocks.has(hash));
  }
}
