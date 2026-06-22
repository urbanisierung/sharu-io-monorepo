// The headless always-on peer: a backup replica assembled entirely from the
// existing runtime-agnostic SDK. It opens a SyncDoc over the filesystem stores,
// serves DocSync, and — because DocSync already auto-pulls every block the
// synced allocation table references but the local store lacks — converges into
// a full ciphertext replica of whatever its paired devices back up. No protocol,
// CRDT, crypto, or SDK public-API change: only the host adapters (fs stores,
// identity) and the transport are runtime-specific, and the transport is
// injected so this assembly is identical in tests (loopback) and production (Iroh).
import { join } from 'node:path';
import { DocSync, type Signer, SyncDoc } from '@safu/sdk';
import type { PeerAddr, PeerId, Transport } from '@safu/transport';
import { FsBlockStore } from './fs-block-store.js';
import { FsDocStore } from './fs-doc-store.js';

export interface PeerConfig {
  /** Directory this node owns: the identity salt, the doc snapshot, the blocks. */
  dataDir: string;
  /** This node's signing identity (see {@link loadOrCreateSigner}). */
  signer: Signer;
  /** The P2P transport — loopback in tests, headless Iroh in production. */
  transport: Transport;
}

export interface Peer {
  /** This node's signing id (its public key) — the id devices authorize. */
  readonly id: PeerId;
  /** This node's dialable transport address — what devices pair against. */
  readonly addr: PeerAddr;
  /** The replicated document (file allocation table + writer set). */
  readonly doc: SyncDoc;
  /** The persistent block store this node fills as it replicates. */
  readonly store: FsBlockStore;
  /** Authorize a device's signing id to write to the shared document. */
  authorize(peer: PeerId): void;
  /** Permanently revoke a device's write access (e.g. a lost device). */
  revoke(peer: PeerId): void;
  /** Dial a device and begin syncing + auto-pulling its referenced blocks. */
  connect(addr: PeerAddr): Promise<void>;
  /** Stop serving and flush the latest doc snapshot to disk. */
  close(): Promise<void>;
}

export async function createPeer(config: PeerConfig): Promise<Peer> {
  const { dataDir, signer, transport } = config;
  const store = new FsBlockStore(join(dataDir, 'blocks'));
  const docStore = new FsDocStore(join(dataDir, 'doc.json'));
  const doc = await SyncDoc.open(signer.id, docStore, signer);
  const sync = new DocSync(transport, doc, store);
  sync.serve();

  return {
    id: signer.id,
    addr: transport.addr(),
    doc,
    store,
    authorize: (peer) => {
      doc.addWriter(peer);
    },
    revoke: (peer) => {
      doc.revokeWriter(peer);
    },
    connect: (addr) => sync.connect(addr),
    close: async () => {
      await sync.close();
      await doc.flush();
    },
  };
}
