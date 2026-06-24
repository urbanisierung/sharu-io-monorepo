// Desktop block store: the SDK's `BlockStore` backed by the native,
// filesystem-backed content-addressed store in the Tauri shell (plan §1.3 native
// impl), reached through Tauri commands. Same interface as `OpfsBlockStore`;
// only the implementation differs (native FS vs. OPFS). Loaded only under Tauri.

import type { BlockStore } from '@safu/sdk';
import { invoke } from '@tauri-apps/api/core';

export function createTauriBlockStore(): BlockStore {
  return {
    async put(hash: string, block: Uint8Array): Promise<void> {
      await invoke('block_put', { hash, data: Array.from(block) });
    },
    async get(hash: string): Promise<Uint8Array | undefined> {
      const bytes = await invoke<number[] | null>('block_get', { hash });
      return bytes === null ? undefined : Uint8Array.from(bytes);
    },
    has(hash: string): Promise<boolean> {
      return invoke<boolean>('block_has', { hash });
    },
    async delete(hash: string): Promise<void> {
      await invoke('block_delete', { hash });
    },
  };
}
