import { signal } from '@preact/signals-core';

export { type BlockStore, MemoryBlockStore } from './block-store.js';

/**
 * Domain state is exposed as framework-agnostic signals (`@preact/signals-core`,
 * never Preact) so the SDK stays runtime-agnostic (plan §0). The web app
 * consumes these directly via `@preact/signals`.
 */
export const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
