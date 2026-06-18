// Universal loader for the `safu-crypto` WASM module. In Node (vitest) the
// binary is read from disk and instantiated directly; in the browser (Vite)
// wasm-bindgen's default URL resolution + fetch is used. Initialization runs
// once and is awaited via `ready()` before any primitive is called.
import init, { blake3_hash, Chunker, derive_key, open, seal } from '../wasm/safu_crypto.js';

let readyPromise: Promise<void> | undefined;

export function ready(): Promise<void> {
  readyPromise ??= boot();
  return readyPromise;
}

async function boot(): Promise<void> {
  const isNode =
    typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  if (isNode) {
    const { readFile } = await import(/* @vite-ignore */ 'node:fs/promises');
    const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url');
    const wasmUrl = new URL('../wasm/safu_crypto_bg.wasm', import.meta.url);
    const bytes = await readFile(fileURLToPath(wasmUrl));
    await init(bytes);
  } else {
    await init();
  }
}

export { blake3_hash, Chunker, derive_key, open, seal };
