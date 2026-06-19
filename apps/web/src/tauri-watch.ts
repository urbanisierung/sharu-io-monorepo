// Desktop folder auto-ingest (plan §3.3). The native shell watches a folder and
// emits `file-changed` for each changed path; here we read the bytes and hand
// them to the caller to ingest. Loaded only under Tauri (dynamic import), so the
// browser bundle never pulls in the Tauri API.
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** Start watching `path` for changes (recursive). */
export async function watchFolder(path: string): Promise<void> {
  await invoke('watch_folder', { path });
}

/** Subscribe to watched-file changes; `onFile` receives (name, bytes) for each
 *  readable changed path. Returns an unlisten function. */
export function onWatchedFileChanged(
  onFile: (name: string, bytes: Uint8Array) => void | Promise<void>,
): Promise<UnlistenFn> {
  return listen<string>('file-changed', async (event) => {
    const path = event.payload;
    try {
      const bytes = await invoke<number[]>('read_file', { path });
      const name = path.split(/[\\/]/).pop() ?? path;
      await onFile(name, Uint8Array.from(bytes));
    } catch {
      // Path removed or unreadable (e.g. a delete event) — skip.
    }
  });
}
