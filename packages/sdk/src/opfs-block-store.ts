import type { BlockStore } from './block-store.js';

/**
 * OPFS-backed BlockStore for the browser (plan §1.3). Blocks are files named by
 * their BLAKE3 hash in a private origin directory. The native (Tauri) store
 * implements the same interface in Phase 3.
 */
export class OpfsBlockStore implements BlockStore {
  readonly #dir: Promise<FileSystemDirectoryHandle>;

  constructor(subdirectory = 'blocks') {
    this.#dir = navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle(subdirectory, { create: true }));
  }

  async put(hash: string, block: Uint8Array): Promise<void> {
    const dir = await this.#dir;
    const handle = await dir.getFileHandle(hash, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(block as unknown as BufferSource);
    } finally {
      await writable.close();
    }
  }

  async get(hash: string): Promise<Uint8Array | undefined> {
    const dir = await this.#dir;
    const handle = await this.#fileHandle(dir, hash);
    if (!handle) return undefined;
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async has(hash: string): Promise<boolean> {
    const dir = await this.#dir;
    return (await this.#fileHandle(dir, hash)) !== undefined;
  }

  async #fileHandle(
    dir: FileSystemDirectoryHandle,
    hash: string,
  ): Promise<FileSystemFileHandle | undefined> {
    try {
      return await dir.getFileHandle(hash);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
      throw error;
    }
  }
}
