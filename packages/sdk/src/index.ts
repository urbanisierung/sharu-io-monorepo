import { signal } from '@preact/signals-core';

export {
  AllocationTable,
  type FileEntry,
  Hlc,
  type Stamp,
  type StampedEntry,
} from './allocation-table.js';
export { type BlockStore, MemoryBlockStore } from './block-store.js';
export { type DocSnapshot, type DocStore, MemoryDocStore } from './doc-store.js';
export { BLOCK_PROTOCOL, DocSync, SYNC_PROTOCOL } from './doc-sync.js';
export { OpfsBlockStore } from './opfs-block-store.js';
export { OpfsDocStore } from './opfs-doc-store.js';
export { type Delta, type FileView, SyncDoc, type WriterOp } from './sync-doc.js';

/**
 * Domain state is exposed as framework-agnostic signals (`@preact/signals-core`,
 * never Preact) so the SDK stays runtime-agnostic (plan §0). The web app
 * consumes these directly via `@preact/signals`.
 */
export const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
