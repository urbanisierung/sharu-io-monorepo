import type { DocSnapshot, DocStore } from './doc-store.js';

/**
 * OPFS-backed DocStore for the browser (status next-step #2). The snapshot is a
 * single JSON file in a private origin directory; the native (Tauri) store
 * implements the same interface against the filesystem.
 */
export class OpfsDocStore implements DocStore {
  readonly #dir: Promise<FileSystemDirectoryHandle>;
  readonly #name: string;

  constructor(name = 'doc.json', subdirectory = 'state') {
    this.#name = name;
    this.#dir = navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle(subdirectory, { create: true }));
  }

  async load(): Promise<DocSnapshot | undefined> {
    const dir = await this.#dir;
    let handle: FileSystemFileHandle;
    try {
      handle = await dir.getFileHandle(this.#name);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
      throw error;
    }
    const text = await (await handle.getFile()).text();
    return text ? (JSON.parse(text) as DocSnapshot) : undefined;
  }

  async save(snapshot: DocSnapshot): Promise<void> {
    const dir = await this.#dir;
    const handle = await dir.getFileHandle(this.#name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(JSON.stringify(snapshot));
    } finally {
      await writable.close();
    }
  }
}
