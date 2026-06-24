// Filesystem BlockStore for a headless peer — the Node analogue of the browser's
// OpfsBlockStore (packages/sdk). It implements the exact same BlockStore
// interface the SDK already depends on, so nothing in the sync/transfer layers
// changes. Blocks are files named by their (hex) BLAKE3 hash under `dir`; only
// opaque ciphertext is ever written, honouring the zero-knowledge invariant.
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BlockStore } from '@safu/sdk';
import { isNotFound } from './fs-util.js';

/** Block hashes are lowercase hex; reject anything else so a hash decoded off
 *  the wire can never escape `dir` via a crafted filename (path traversal). */
const HEX = /^[0-9a-f]+$/;

export class FsBlockStore implements BlockStore {
  readonly #dir: string;
  #ready: Promise<unknown> | undefined;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async put(hash: string, block: Uint8Array): Promise<void> {
    await this.#ensureDir();
    await writeFile(this.#path(hash), block);
  }

  async get(hash: string): Promise<Uint8Array | undefined> {
    try {
      const buffer = await readFile(this.#path(hash));
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async has(hash: string): Promise<boolean> {
    try {
      await access(this.#path(hash));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async delete(hash: string): Promise<void> {
    // `force` makes deleting an absent block a no-op (idempotent unpin).
    await rm(this.#path(hash), { force: true });
  }

  #ensureDir(): Promise<unknown> {
    this.#ready ??= mkdir(this.#dir, { recursive: true });
    return this.#ready;
  }

  #path(hash: string): string {
    if (!HEX.test(hash)) throw new Error(`invalid block hash: ${hash}`);
    return join(this.#dir, hash);
  }
}
