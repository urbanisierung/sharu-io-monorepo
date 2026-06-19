// Browser bootstrap (plan §2.4): wires the runtime-agnostic SDK to the concrete
// browser implementations — Iroh-over-WASM transport, OPFS block store, the
// streaming crypto pipeline — and exposes the domain signals the App renders.
// This is the only place the app names a concrete transport/store; everything
// downstream depends on the SDK's interfaces.

import { effect, type ReadonlySignal, signal } from '@preact/signals';
import {
  BLOCK_PROTOCOL,
  DocSync,
  type FileView,
  OpfsBlockStore,
  OpfsDocStore,
  SYNC_PROTOCOL,
  SyncDoc,
} from '@safu/sdk';
import { decodePeerAddr, encodePeerAddr, type PeerAddr, type Transport } from '@safu/transport';
import { IngestController } from './ingest-controller.js';
import { ingestFile, restoreFile } from './pipeline.js';
import { deriveSas } from './sas.js';

/** A connected peer as the UI shows it: its id, the out-of-band SAS to compare,
 *  and the user's verification verdict. */
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
  /** This device's connection code, to share out-of-band for pairing. */
  connectionCode: string;
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

  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  let passphrase = '';

  // The peer list is derived from DocSync's live channels (so a peer that dials
  // us also appears), enriched with each peer's SAS and the user's verdict.
  const verified = signal<ReadonlySet<string>>(new Set());
  const rejected = signal<ReadonlySet<string>>(new Set());
  const peers = signal<readonly PeerInfo[]>([]);
  const sasCache = new Map<string, string>();
  effect(() => {
    const ids = sync.peers.value;
    const isVerified = verified.value;
    const isRejected = rejected.value;
    void (async () => {
      const list: PeerInfo[] = [];
      for (const id of ids) {
        let sas = sasCache.get(id);
        if (sas === undefined) {
          sas = await deriveSas(transport.id(), id);
          sasCache.set(id, sas);
        }
        const status = isRejected.has(id)
          ? 'rejected'
          : isVerified.has(id)
            ? 'verified'
            : 'pending';
        list.push({ id, sas, status });
      }
      peers.value = list;
    })();
  });

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

  const pairWithCode = async (code: string): Promise<void> => {
    const peer = decodePeerAddr(code);
    // Shared-passphrase trust model: both devices authorize each other (plan
    // §2.2). The peer authorizes us symmetrically when it pairs back. The peer
    // list and block auto-pull then follow from the live channel.
    doc.addWriter(peer.id);
    await sync.connect(peer);
  };

  const verifyPeer = (id: string): void => {
    verified.value = new Set([...verified.value, id]);
  };

  const rejectPeer = (id: string): void => {
    // A mismatched SAS means a possible relay MITM: stop trusting this writer.
    doc.revokeWriter(id);
    rejected.value = new Set([...rejected.value, id]);
  };

  return {
    controller: new IngestController(ingest, (pass) => {
      passphrase = pass;
    }),
    files: doc.files,
    peers,
    syncStatus,
    restore,
    pairWithCode,
    verifyPeer,
    rejectPeer,
    connectionCode: encodePeerAddr(transport.addr()),
    selfAddr: transport.addr(),
  };
}
