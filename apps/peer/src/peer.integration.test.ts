// Proof that the headless backup peer "keeps the architecture": over the
// in-process loopback transport, a normal device publishes a file to the shared
// allocation table, and the peer — built only from createPeer + the fs adapters
// — auto-pulls every referenced block and persists doc + blocks to disk, so a
// fresh process over the same dataDir restores them with no network. This is the
// existing sync.integration.test pattern, with the backup side swapped for the
// real fs-backed peer.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blake3 } from '@safu/crypto';
import {
  createSigner,
  DocSync,
  fetchBlock,
  MemoryBlockStore,
  pushBlock,
  SyncDoc,
  unpinBlock,
} from '@safu/sdk';
import { LoopbackNetwork } from '@safu/transport';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPeer } from './peer.js';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Poll until `predicate` holds or the timeout elapses (background auto-pull). */
const until = async (predicate: () => Promise<boolean>, timeout = 5000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('condition not met within timeout');
    await flush();
  }
};

describe('headless backup peer over loopback', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'safu-peer-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('auto-pulls and persists every block a paired device references', async () => {
    const net = new LoopbackNetwork();
    const deviceTransport = net.endpoint('device');
    const backupTransport = net.endpoint('backup');

    const deviceSigner = createSigner(new Uint8Array(32).fill(7));
    const backupSigner = createSigner(new Uint8Array(32).fill(8));

    // A normal device that already holds a file's blocks (the crypto pipeline is
    // covered elsewhere; here the bytes are opaque, as they are on the wire).
    const deviceDoc = new SyncDoc(deviceSigner.id, undefined, deviceSigner);
    deviceDoc.addWriter(backupSigner.id);
    const deviceStore = new MemoryBlockStore();
    const deviceSync = new DocSync(deviceTransport, deviceDoc, deviceStore);
    deviceSync.serve();

    const blocks: Record<string, Uint8Array> = {
      '00': new Uint8Array([1, 2, 3]),
      '01': new Uint8Array([4, 5, 6]),
      '02': new Uint8Array([7, 8, 9]),
    };
    const hashes = Object.keys(blocks);
    for (const [hash, bytes] of Object.entries(blocks)) await deviceStore.put(hash, bytes);
    deviceDoc.setFile('photo.bin', hashes, 9, 1000);

    // The headless backup peer pairs and converges into a full replica.
    const peer = await createPeer({
      dataDir: dir,
      signer: backupSigner,
      transport: backupTransport,
    });
    peer.authorize(deviceSigner.id);
    await peer.connect(deviceTransport.addr());

    await until(async () => {
      for (const hash of hashes) if (!(await peer.store.has(hash))) return false;
      return peer.doc.files.value.some((file) => file.path === 'photo.bin');
    });
    for (const [hash, bytes] of Object.entries(blocks)) {
      expect(await peer.store.get(hash)).toEqual(bytes);
    }
    await peer.close();

    // Durability: a fresh peer over the same dataDir restores the doc + blocks
    // with no network (the offline endpoint never connects).
    const reopened = await createPeer({
      dataDir: dir,
      signer: backupSigner,
      transport: net.endpoint('offline'),
    });
    expect(reopened.doc.files.value.map((file) => file.path)).toContain('photo.bin');
    expect(await reopened.store.get('00')).toEqual(blocks['00']);

    await reopened.close();
    await deviceSync.close();
  });

  it('pins a public-share block (off the allocation table) and serves it back', async () => {
    const net = new LoopbackNetwork();
    const deviceTransport = net.endpoint('device');
    const deviceSigner = createSigner(new Uint8Array(32).fill(7));
    const backupSigner = createSigner(new Uint8Array(32).fill(8));
    const stranger = createSigner(new Uint8Array(32).fill(3));

    const peer = await createPeer({
      dataDir: dir,
      signer: backupSigner,
      transport: net.endpoint('backup'),
    });
    peer.authorize(deviceSigner.id);
    await flush();

    // A share block: opaque ciphertext, addressed by its BLAKE3 — never recorded
    // in the allocation table, so only an explicit pin can reach the node.
    const block = new Uint8Array([10, 20, 30, 40, 50]);
    const hash = await blake3(block);

    // An unauthorized device cannot pin.
    expect(await pushBlock(deviceTransport, peer.addr, hash, block, stranger)).toBe(false);
    expect(await peer.store.has(hash)).toBe(false);

    // The authorized device pins it, and the node then serves it over BLOCK_PROTOCOL.
    expect(await pushBlock(deviceTransport, peer.addr, hash, block, deviceSigner)).toBe(true);
    const pulled = await fetchBlock(deviceTransport, peer.addr, hash, new MemoryBlockStore());
    expect(pulled).toEqual(block);

    // Revoking the share: a stranger cannot unpin, the owner can, and the block
    // is gone from the node afterwards (the link stops resolving).
    expect(await unpinBlock(deviceTransport, peer.addr, hash, stranger)).toBe(false);
    expect(await peer.store.has(hash)).toBe(true);
    expect(await unpinBlock(deviceTransport, peer.addr, hash, deviceSigner)).toBe(true);
    expect(await peer.store.has(hash)).toBe(false);

    await peer.close();
  });
});
