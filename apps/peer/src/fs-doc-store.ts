// Filesystem DocStore for a headless peer — the Node analogue of OpfsDocStore
// (packages/sdk). Same DocStore interface: the snapshot is a single JSON file,
// so SyncDoc.open() restores the CRDT, writer set, and HLC across restarts
// exactly as it does in the browser.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DocSnapshot, DocStore } from '@safu/sdk';
import { isNotFound } from './fs-util.js';

export class FsDocStore implements DocStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<DocSnapshot | undefined> {
    try {
      const text = await readFile(this.#path, 'utf8');
      return text ? (JSON.parse(text) as DocSnapshot) : undefined;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async save(snapshot: DocSnapshot): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(this.#path, JSON.stringify(snapshot));
  }
}
