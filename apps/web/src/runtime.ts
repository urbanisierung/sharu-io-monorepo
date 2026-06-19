// Browser bootstrap (plan §2.4): wires the runtime-agnostic SDK to the concrete
// browser implementations — Iroh-over-WASM transport, OPFS block store, the
// streaming crypto pipeline — and exposes the domain signals the App renders.
// This is the only place the app names a concrete transport/store; everything
// downstream depends on the SDK's interfaces.

import { effect, type ReadonlySignal, signal } from '@preact/signals';
import {
  BLOCK_PROTOCOL,
  type BlockStore,
  DocSync,
  type FileView,
  OpfsBlockStore,
  OpfsDocStore,
  type Signer,
  SYNC_PROTOCOL,
  SyncDoc,
} from '@safu/sdk';
import type { Transport } from '@safu/transport';
import { loadOrCreateSigner } from './identity.js';
import { IngestController } from './ingest-controller.js';
import { decodePairingCode, encodePairingCode } from './pairing.js';
import { ingestFile, restoreFile } from './pipeline.js';
import { deriveSas } from './sas.js';

/** A paired peer as the UI shows it: its signing id, the out-of-band SAS to
 *  compare, and the verification verdict. `rejected` means write-revoked. */
export interface PeerInfo {
  id: string;
  sas: string;
  status: 'pending' | 'verified' | 'rejected';
}

export interface Runtime {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
  /** Reassemble a backed-up file's plaintext for download. */
  restore: (path: string) => Promise<Uint8Array>;
  /** Pair with a peer from the connection code they shared out-of-band. */
  pairWithCode: (code: string) => Promise<void>;
  /** Mark a peer's SAS as matching (trusted). */
  verifyPeer: (id: string) => void;
  /** Mark a peer's SAS as mismatched: revoke its write access. */
  rejectPeer: (id: string) => void;
  /** This device's connection code (empty until unlock derives the identity). */
  connectionCode: ReadonlySignal<string>;
  /** Desktop only: watch a folder and auto-ingest its files. Undefined in the
   *  browser (no filesystem access). */
  watchFolder?: (path: string) => Promise<void>;
}

/** True when running inside the Tauri desktop shell rather than a browser tab. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Pick the transport for the host runtime: the native Iroh core under Tauri
 *  (direct hole-punching), Iroh-over-WASM (relay-only) in the browser. Both
 *  satisfy the same `Transport` interface (plan §3.2). */
async function selectTransport(protocols: string[]): Promise<Transport> {
  if (isTauri()) {
    const { createTauriTransport } = await import('@safu/transport/tauri');
    return createTauriTransport();
  }
  const { createIrohTransport } = await import('@safu/transport/iroh');
  return createIrohTransport(protocols);
}

/** Pick the block store: the native filesystem-backed store under Tauri (plan
 *  §1.3 native impl), OPFS in the browser. Same `BlockStore` interface. */
async function selectBlockStore(): Promise<BlockStore> {
  if (isTauri()) {
    const { createTauriBlockStore } = await import('./tauri-store.js');
    return createTauriBlockStore();
  }
  return new OpfsBlockStore();
}

export async function createRuntime(): Promise<Runtime> {
  const transport = await selectTransport([SYNC_PROTOCOL, BLOCK_PROTOCOL]);
  const store = await selectBlockStore();

  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  const files = signal<readonly FileView[]>([]);
  const peers = signal<readonly PeerInfo[]>([]);
  const connectionCode = signal('');
  // The user's per-peer "SAS matched" verdict — session UI state, distinct from
  // the persisted authorization in the document.
  const verified = signal<ReadonlySet<string>>(new Set());
  const sasCache = new Map<string, string>();

  // The document and signing identity come online at unlock: the identity is
  // derived from the passphrase, and the doc is opened under it so every local
  // op is signed (status #7).
  let doc: SyncDoc | undefined;
  let sync: DocSync | undefined;
  let passphrase = '';

  const setup = async (pass: string): Promise<void> => {
    passphrase = pass;
    const id: Signer = await loadOrCreateSigner(pass);
    connectionCode.value = encodePairingCode({ addr: transport.addr(), signId: id.id });
    const ready = await SyncDoc.open(id.id, new OpfsDocStore(), id);
    doc = ready;
    const docSync = new DocSync(transport, ready, store);
    docSync.serve();
    sync = docSync;

    effect(() => {
      files.value = ready.files.value;
    });
    // The device list is the document's authorized writers (signing ids), so it
    // survives reloads via the persisted writer set. SAS binds the two signing
    // identities; a revoked writer shows as "rejected".
    effect(() => {
      const writerIds = ready.writers.value;
      const isVerified = verified.value;
      void (async () => {
        const list: PeerInfo[] = [];
        for (const peerId of writerIds) {
          let sas = sasCache.get(peerId);
          if (sas === undefined) {
            sas = await deriveSas(id.id, peerId);
            sasCache.set(peerId, sas);
          }
          const status = !ready.authorized(peerId)
            ? 'rejected'
            : isVerified.has(peerId)
              ? 'verified'
              : 'pending';
          list.push({ id: peerId, sas, status });
        }
        peers.value = list;
      })();
    });

    // Desktop: auto-ingest files dropped into watched folders (plan §3.3).
    if (isTauri()) {
      const { onWatchedFileChanged } = await import('./tauri-watch.js');
      await onWatchedFileChanged((name, bytes) =>
        ingest(new File([bytes as BlobPart], name), pass),
      );
    }
  };

  const ingest = async (file: File, pass: string): Promise<void> => {
    if (!doc) return;
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
    const file = doc?.files.value.find((f) => f.path === path);
    const manifest = file?.blocks[0];
    if (!manifest) throw new Error(`unknown file: ${path}`);
    return restoreFile(manifest, passphrase, store);
  };

  const pairWithCode = async (code: string): Promise<void> => {
    if (!doc || !sync) throw new Error('runtime not unlocked');
    const { addr, signId } = decodePairingCode(code);
    // Authorize the peer's signing identity, then dial its transport address.
    // The peer authorizes us symmetrically when it pairs back; DocSync then
    // auto-pulls any referenced blocks we lack.
    doc.addWriter(signId);
    await sync.connect(addr);
  };

  const verifyPeer = (id: string): void => {
    verified.value = new Set([...verified.value, id]);
  };

  const rejectPeer = (id: string): void => {
    // A mismatched SAS means a possible relay MITM: stop trusting this writer.
    doc?.revokeWriter(id);
  };

  const watchFolder = isTauri()
    ? async (path: string): Promise<void> => {
        const { watchFolder: watch } = await import('./tauri-watch.js');
        await watch(path);
      }
    : undefined;

  return {
    controller: new IngestController(ingest, (pass) => {
      void setup(pass);
    }),
    files,
    peers,
    syncStatus,
    restore,
    pairWithCode,
    verifyPeer,
    rejectPeer,
    connectionCode,
    watchFolder,
  };
}
