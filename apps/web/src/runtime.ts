// Browser bootstrap (plan §2.4): wires the runtime-agnostic SDK to the concrete
// browser implementations — Iroh-over-WASM transport, OPFS block store, the
// streaming crypto pipeline — and exposes the domain signals the App renders.
// This is the only place the app names a concrete transport/store; everything
// downstream depends on the SDK's interfaces.

import { type ReadonlySignal, signal } from '@preact/signals';
import {
  BLOCK_PROTOCOL,
  DocSync,
  type FileView,
  OpfsBlockStore,
  OpfsDocStore,
  SYNC_PROTOCOL,
  SyncDoc,
} from '@safu/sdk';
import type { PeerAddr, Transport } from '@safu/transport';
import { IngestController } from './ingest-controller.js';
import { ingestFile, restoreFile } from './pipeline.js';

export interface Runtime {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly string[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
  /** Reassemble a backed-up file's plaintext for download. */
  restore: (path: string) => Promise<Uint8Array>;
  /** Pair with a peer (id + relay) discovered out-of-band, and sync with it. */
  pair: (peer: PeerAddr) => Promise<void>;
  selfAddr: PeerAddr;
}

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

export async function createRuntime(): Promise<Runtime> {
  const transport = await selectTransport([SYNC_PROTOCOL, BLOCK_PROTOCOL]);
  const store = new OpfsBlockStore();
  // Persist the allocation table to OPFS so the backup list survives a reload
  // (status next-step #2); blocks already persist in the OpfsBlockStore.
  const doc = await SyncDoc.open(transport.id(), new OpfsDocStore());
  const sync = new DocSync(transport, doc, store);
  sync.serve();

  const peers = signal<readonly string[]>([]);
  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  let passphrase = '';

  const ingest = async (file: File, pass: string): Promise<void> => {
    syncStatus.value = 'syncing';
    try {
      const { manifest, blocks, size } = await ingestFile(file, pass, store);
      // Record every referenced address so a peer can auto-pull the whole file
      // from the synced table without parsing the manifest.
      doc.setFile(file.name, [manifest, ...blocks], size, file.lastModified);
      syncStatus.value = 'idle';
    } catch (cause) {
      syncStatus.value = 'error';
      throw cause;
    }
  };

  const restore = async (path: string): Promise<Uint8Array> => {
    const file = doc.files.value.find((f) => f.path === path);
    const manifest = file?.blocks[0];
    if (!manifest) throw new Error(`unknown file: ${path}`);
    return restoreFile(manifest, passphrase, store);
  };

  const pair = async (peer: PeerAddr): Promise<void> => {
    // Shared-passphrase trust model: both devices authorize each other (plan
    // §2.2). The peer authorizes us symmetrically when it pairs back.
    doc.addWriter(peer.id);
    await sync.connect(peer);
    peers.value = [...new Set([...peers.value, peer.id])];
    // DocSync auto-pulls any blocks the synced table references but we lack,
    // from the peer we just connected to — including the manifest itself.
  };

  return {
    controller: new IngestController(ingest, (pass) => {
      passphrase = pass;
    }),
    files: doc.files,
    peers,
    syncStatus,
    restore,
    pair,
    selfAddr: transport.addr(),
  };
}
