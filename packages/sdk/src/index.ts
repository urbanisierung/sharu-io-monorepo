import { signal } from '@preact/signals-core';

export {
  AllocationTable,
  type FileEntry,
  Hlc,
  type Stamp,
  type StampedEntry,
} from './allocation-table.js';
export { BLOCK_PROTOCOL, fetchBlock } from './block-fetch.js';
export { PIN_PROTOCOL, type PinPolicy, pushBlock, servePins } from './block-pin.js';
export { type BlockStore, MemoryBlockStore } from './block-store.js';
export { type DocSnapshot, type DocStore, MemoryDocStore } from './doc-store.js';
export { DocSync, SYNC_PROTOCOL } from './doc-sync.js';
export { OpfsBlockStore } from './opfs-block-store.js';
export { OpfsDocStore } from './opfs-doc-store.js';
export {
  type AnyManifest,
  parseAnyManifest,
  parseManifest,
  parseSiteManifest,
  type ShareBlockRef,
  type ShareFileEntry,
  type ShareManifest,
  type SiteManifest,
  serializeManifest,
} from './share.js';
export { createSigner, type Signer, verifySignature } from './signing.js';
export { type Delta, type FileView, SyncDoc, type WriterOp } from './sync-doc.js';

/**
 * Domain state is exposed as framework-agnostic signals (`@preact/signals-core`,
 * never Preact) so the SDK stays runtime-agnostic (plan §0). The web app
 * consumes these directly via `@preact/signals`.
 */
export const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
