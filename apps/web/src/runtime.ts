// Browser bootstrap (plan §2.4): wires the runtime-agnostic SDK to the concrete
// browser implementations — Iroh-over-WASM transport, OPFS block store, the
// streaming crypto pipeline — and exposes the domain signals the App renders.
// This is the only place the app names a concrete transport/store; everything
// downstream depends on the SDK's interfaces.

import { type ReadonlySignal, signal } from '@preact/signals';
import { blake3, createIngestStream } from '@safu/crypto';
import {
  BLOCK_PROTOCOL,
  DocSync,
  type FileView,
  OpfsBlockStore,
  SYNC_PROTOCOL,
  SyncDoc,
} from '@safu/sdk';
import type { Transport } from '@safu/transport';
import { IngestController } from './ingest-controller.js';

/** Pick the transport for the host runtime: the native Iroh core under Tauri
 *  (direct hole-punching), Iroh-over-WASM (relay-only) in the browser. Both
 *  satisfy the same `Transport` interface (plan §3.2). */
async function selectTransport(protocols: string[]): Promise<Transport> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { createTauriTransport } = await import('@safu/transport/tauri');
    return createTauriTransport();
  }
  const { createIrohTransport } = await import('@safu/transport/iroh');
  return createIrohTransport(protocols);
}

export interface Runtime {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly string[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
}

function concat(nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const frame = new Uint8Array(nonce.length + ciphertext.length);
  frame.set(nonce, 0);
  frame.set(ciphertext, nonce.length);
  return frame;
}

export async function createRuntime(): Promise<Runtime> {
  const transport = await selectTransport([SYNC_PROTOCOL, BLOCK_PROTOCOL]);
  const store = new OpfsBlockStore();
  const doc = new SyncDoc(transport.id());
  const sync = new DocSync(transport, doc, store);
  sync.serve();

  const peers = signal<readonly string[]>([]);
  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');

  const ingest = async (file: File, passphrase: string): Promise<void> => {
    syncStatus.value = 'syncing';
    try {
      const { blocks } = await createIngestStream(file.stream(), passphrase);
      const addresses: string[] = [];
      // Streaming: one block at a time. Each block is stored as nonce‖ciphertext,
      // content-addressed by its BLAKE3 — only ciphertext touches storage.
      for await (const block of blocks) {
        const frame = concat(block.nonce, block.ciphertext);
        const address = await blake3(frame);
        await store.put(address, frame);
        addresses.push(address);
      }
      doc.setFile(file.name, addresses, file.size, file.lastModified);
      syncStatus.value = 'idle';
    } catch (cause) {
      syncStatus.value = 'error';
      throw cause;
    }
  };

  return {
    controller: new IngestController(ingest),
    files: doc.files,
    peers,
    syncStatus,
  };
}
