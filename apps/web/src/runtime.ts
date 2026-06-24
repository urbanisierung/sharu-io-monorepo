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
  pushBlock,
  type Signer,
  SYNC_PROTOCOL,
  SyncDoc,
  unpinBlock,
} from '@safu/sdk';
import type { PeerAddr, Transport } from '@safu/transport';
import { loadDeviceNames, saveDeviceName } from './device-names.js';
import { IngestController } from './ingest-controller.js';
import { mimeOf } from './mime.js';
import { decodePairingCode, encodePairingCode } from './pairing.js';
import { loadPeerAddrs, savePeerAddr } from './peer-addrs.js';
import { ingestFile, restoreFile } from './pipeline.js';
import { deriveSas } from './sas.js';
import { loadShareHost, saveShareHost } from './share-host.js';
import {
  type PublishResult,
  publishFile,
  publishSite,
  type SiteFileInput,
} from './share-publisher.js';
import { addShare, loadShares, type PublishedShare, removeShare } from './shares-store.js';
import { LEGACY_WALLET_ID, unlockWallet, type Wallet } from './wallet.js';
import type { WalletBackup } from './wallet-backup.js';

/** Thrown by `publishShare` when no always-on node is paired to host the share.
 *  The message is matched in the UI to prompt the user to pair their node. */
export class NoShareHostError extends Error {
  constructor() {
    super('no-share-host');
    this.name = 'NoShareHostError';
  }
}

/** A paired peer as the UI shows it: its signing id, an optional friendly name,
 *  the out-of-band SAS to compare, and the verification verdict. `rejected`
 *  means write-revoked. */
export interface PeerInfo {
  id: string;
  name?: string;
  sas: string;
  status: 'pending' | 'verified' | 'rejected';
}

export interface Runtime {
  controller: IngestController;
  /** Unlock with a password: derives + verifies the identity, brings the doc
   *  online, then reveals the app. Rejects on a wrong password (returning user). */
  unlock: (passphrase: string) => Promise<void>;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
  /** Reassemble a backed-up file's plaintext for download. */
  restore: (path: string) => Promise<Uint8Array>;
  /** Remove a file from the backup set (a CRDT tombstone that syncs to peers). */
  remove: (path: string) => void;
  /** Publish a backed-up file as a public share: re-ingest it under a fresh
   *  random key, pin its blocks to the always-on node, and return an openable
   *  link. Rejects with {@link NoShareHostError} if no node is paired. */
  publishShare: (path: string) => Promise<string>;
  /** Publish a folder of files as one navigable public site (phase 5): re-ingest
   *  every file under a fresh random key, pin to the node, and return the link.
   *  Rejects with {@link NoShareHostError} if no node is paired. */
  publishSiteShare: (files: readonly File[]) => Promise<string>;
  /** Revoke a published share: unpin its blocks from the node and drop the local
   *  copy + listing. Best-effort if the node is unreachable. */
  unpublishShare: (root: string) => Promise<void>;
  /** The files this device has published as public shares, newest first. */
  publishedShares: ReadonlySignal<readonly PublishedShare[]>;
  /** The signing id of the peer chosen to host public shares (undefined → the
   *  first paired peer is used). */
  shareHostId: ReadonlySignal<string | undefined>;
  /** Choose which paired peer (by signing id) hosts public shares. */
  setShareHost: (id: string) => void;
  /** Pair with a peer from the connection code they shared out-of-band. */
  pairWithCode: (code: string) => Promise<void>;
  /** Mark a peer's SAS as matching (trusted). */
  verifyPeer: (id: string) => void;
  /** Mark a peer's SAS as mismatched: revoke its write access. */
  rejectPeer: (id: string) => void;
  /** Give a paired device a friendly local name (empty clears it). */
  renameDevice: (id: string, name: string) => void;
  /** This device's connection code (empty until unlock derives the identity). */
  connectionCode: ReadonlySignal<string>;
  /** Desktop only: watch a folder and auto-ingest its files. Undefined in the
   *  browser (no filesystem access). */
  watchFolder?: (path: string) => Promise<void>;
  /** The active wallet's friendly name, for the app header. */
  walletName: string;
  /** A portable backup of the unlocked wallet (name + passphrase + salt), for
   *  the user to download at any time. Only valid after `unlock`. */
  backup: () => WalletBackup;
  /** Tear down the transport so a different wallet can be unlocked cleanly. */
  close: () => Promise<void>;
}

/** True when running inside the Tauri desktop shell rather than a browser tab. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** A one-shot ReadableStream over `bytes`, for feeding restored plaintext back
 *  into the streaming ingest pipeline when publishing a share. */
function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** A site file's path relative to the site root: a folder picked with
 *  `webkitdirectory` yields paths like "mysite/index.html", so drop the leading
 *  folder segment. A plain multi-select falls back to the bare file name. */
function sitePath(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const slash = rel.indexOf('/');
  return slash >= 0 ? rel.slice(slash + 1) : rel;
}

/** A human label for a published site (the picked folder's name). */
function siteLabel(files: readonly File[]): string {
  const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
  const top = rel.split('/')[0];
  return top || 'site';
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
 *  §1.3 native impl), OPFS in the browser. Same `BlockStore` interface. Each
 *  wallet gets its own block directory so switching wallets never mixes data;
 *  the migrated legacy wallet keeps the original un-namespaced path. */
async function selectBlockStore(walletId: string): Promise<BlockStore> {
  if (isTauri()) {
    const { createTauriBlockStore } = await import('./tauri-store.js');
    return createTauriBlockStore();
  }
  return new OpfsBlockStore(walletId === LEGACY_WALLET_ID ? 'blocks' : `blocks-${walletId}`);
}

/** The per-wallet document store (the file allocation table). Namespaced by
 *  wallet id; the legacy wallet keeps the original `state/doc.json`. */
function selectDocStore(walletId: string): OpfsDocStore {
  return walletId === LEGACY_WALLET_ID
    ? new OpfsDocStore()
    : new OpfsDocStore(`${walletId}.json`, 'state');
}

export async function createRuntime(wallet: Wallet): Promise<Runtime> {
  const transport = await selectTransport([SYNC_PROTOCOL, BLOCK_PROTOCOL]);
  const store = await selectBlockStore(wallet.id);

  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  const files = signal<readonly FileView[]>([]);
  const peers = signal<readonly PeerInfo[]>([]);
  const connectionCode = signal('');
  const publishedShares = signal<readonly PublishedShare[]>(loadShares(wallet.id));
  // The signing id of the peer chosen to host public shares (undefined → fall
  // back to the first paired peer). Drives the "hosts shares" mark in Devices.
  const shareHostId = signal<string | undefined>(loadShareHost(wallet.id));
  // Friendly local device labels (peer id → name); drives PeerInfo.name.
  const deviceNames = signal<Record<string, string>>(loadDeviceNames());
  // The user's per-peer "SAS matched" verdict — session UI state, distinct from
  // the persisted authorization in the document.
  const verified = signal<ReadonlySet<string>>(new Set());
  const sasCache = new Map<string, string>();

  // The document and signing identity come online at unlock: the identity is
  // derived from the passphrase, and the doc is opened under it so every local
  // op is signed (status #7).
  let doc: SyncDoc | undefined;
  let sync: DocSync | undefined;
  let signer: Signer | undefined;
  let passphrase = '';

  const setup = async (pass: string): Promise<void> => {
    // Verify the password against the id recorded on this device *before* doing
    // anything else, so a returning user's typo is caught immediately (throws
    // WrongPasswordError) rather than silently producing a divergent identity.
    const id: Signer = await unlockWallet(wallet, pass);
    signer = id;
    passphrase = pass;
    connectionCode.value = encodePairingCode({ addr: transport.addr(), signId: id.id });
    const ready = await SyncDoc.open(id.id, selectDocStore(wallet.id), id);
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
      const names = deviceNames.value;
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
          list.push({ id: peerId, name: names[peerId], sas, status });
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

  const remove = (path: string): void => {
    // Tombstone the entry; it converges to peers and drops out of every file
    // list. Blocks are left in the store (no dedup yet, and BlockStore has no
    // delete) — reclaiming space is a deliberate future step.
    doc?.deleteFile(path);
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
    // Remember the address so we can pin public-share blocks to this peer later
    // (e.g. an always-on node) without re-pairing after a reload.
    savePeerAddr(wallet.id, signId, addr);
    await sync.connect(addr);
  };

  // The peer that hosts public shares: the user's explicit choice if set and
  // still known, else the first paired peer (the common single-node case).
  const shareHost = (): PeerAddr => {
    const addrs = loadPeerAddrs(wallet.id);
    const chosen = shareHostId.value;
    const host =
      (chosen ? addrs[chosen] : undefined) ?? (Object.values(addrs)[0] as PeerAddr | undefined);
    if (!host) throw new NoShareHostError();
    return host;
  };

  const setShareHost = (id: string): void => {
    saveShareHost(wallet.id, id);
    shareHostId.value = id;
  };

  // Pin every block of a published share to the node so the link resolves while
  // this device is offline (the node only ever receives ciphertext), then record
  // it locally. Shared by file and site publishing.
  const pinAndRecord = async (
    result: PublishResult,
    host: PeerAddr,
    path: string,
  ): Promise<string> => {
    for (const addr of result.pin) {
      const bytes = await store.get(addr);
      if (bytes && signer) await pushBlock(transport, host, addr, bytes, signer);
    }
    publishedShares.value = addShare(wallet.id, {
      root: result.info.root,
      path,
      link: result.link,
      pin: result.pin,
      created: Date.now(),
    });
    return result.link;
  };

  const publishShare = async (path: string): Promise<string> => {
    if (!doc || !signer) throw new Error('runtime not unlocked');
    const file = doc.files.value.find((f) => f.path === path);
    const manifestAddr = file?.blocks[0];
    if (!manifestAddr) throw new Error(`unknown file: ${path}`);
    const host = shareHost();
    // Re-ingest the plaintext under a fresh random key (publishFile).
    const plaintext = await restoreFile(manifestAddr, passphrase, store);
    const origin = globalThis.location?.origin ?? '';
    const result = await publishFile(
      {
        name: path,
        contentType: 'application/octet-stream',
        size: plaintext.length,
        content: streamOf(plaintext),
      },
      store,
      host,
      origin,
    );
    return pinAndRecord(result, host, path);
  };

  const publishSiteShare = async (files: readonly File[]): Promise<string> => {
    if (!doc || !signer) throw new Error('runtime not unlocked');
    if (files.length === 0) throw new Error('publishSiteShare: no files');
    const host = shareHost();
    const inputs: SiteFileInput[] = files.map((file) => {
      const path = sitePath(file);
      return {
        path,
        contentType: file.type || mimeOf(path),
        size: file.size,
        content: file.stream(),
      };
    });
    // Prefer a conventional entry point; otherwise the first file is the index.
    const index = inputs.find((f) => f.path === 'index.html')?.path ?? inputs[0]?.path ?? '';
    const origin = globalThis.location?.origin ?? '';
    const result = await publishSite(inputs, index, store, host, origin);
    return pinAndRecord(result, host, siteLabel(files));
  };

  const unpublishShare = async (root: string): Promise<void> => {
    // Revoke the share: unpin every block from the node (so the link stops
    // resolving) and drop our local copy, then forget the listing. Best-effort —
    // if the node is unreachable we still remove the listing rather than leaving
    // the user stuck; the node keeps serving until it next hears the unpin.
    const share = publishedShares.value.find((s) => s.root === root);
    if (share && signer) {
      const host = Object.values(loadPeerAddrs(wallet.id))[0] as PeerAddr | undefined;
      for (const addr of share.pin) {
        if (host) {
          try {
            await unpinBlock(transport, host, addr, signer);
          } catch {
            /* node unreachable — listing still removed below */
          }
        }
        await store.delete(addr);
      }
    }
    publishedShares.value = removeShare(wallet.id, root);
  };

  const verifyPeer = (id: string): void => {
    verified.value = new Set([...verified.value, id]);
  };

  const rejectPeer = (id: string): void => {
    // A mismatched SAS means a possible relay MITM: stop trusting this writer.
    doc?.revokeWriter(id);
  };

  const renameDevice = (id: string, name: string): void => {
    deviceNames.value = saveDeviceName(id, name);
  };

  const watchFolder = isTauri()
    ? async (path: string): Promise<void> => {
        const { watchFolder: watch } = await import('./tauri-watch.js');
        await watch(path);
      }
    : undefined;

  const controller = new IngestController(ingest);
  // The gate calls this and awaits it: on success the doc + identity are live
  // and the controller flips into the drop view; on a wrong password `setup`
  // rejects and the gate stays put with a clear message.
  const unlock = async (pass: string): Promise<void> => {
    await setup(pass);
    controller.unlock(pass);
  };

  const backup = (): WalletBackup => ({
    name: wallet.name,
    password: passphrase,
    salt: wallet.salt,
  });

  const close = async (): Promise<void> => {
    await transport.close();
  };

  return {
    controller,
    unlock,
    files,
    peers,
    syncStatus,
    restore,
    remove,
    publishShare,
    publishSiteShare,
    unpublishShare,
    publishedShares,
    shareHostId,
    setShareHost,
    pairWithCode,
    verifyPeer,
    rejectPeer,
    renameDevice,
    connectionCode,
    watchFolder,
    walletName: wallet.name,
    backup,
    close,
  };
}
