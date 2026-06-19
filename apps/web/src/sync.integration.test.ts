// The whole pipeline wired together, minus the literal relay hop (which only
// works outside the CI sandbox — see transfer.e2e.browser.test.ts). Over the
// in-process loopback transport: A ingests a real multi-chunk file through the
// crypto pipeline, the allocation table syncs to B, B pulls the referenced
// blocks, and B restores the plaintext with BLAKE3 parity. This exercises
// crypto + storage + CRDT sync + transport + manifest restore as one system.
import { blake3 } from '@safu/crypto';
import { createSigner, DocSync, MemoryBlockStore, SyncDoc } from '@safu/sdk';
import { LoopbackNetwork } from '@safu/transport';
import { describe, expect, it } from 'vitest';
import { blockAddresses, ingestFile, restoreFile } from './pipeline.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Poll until `predicate` holds or the timeout elapses (background auto-pull). */
const until = async (predicate: () => Promise<boolean>, timeout = 5000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('condition not met within timeout');
    await flush();
  }
};

/** Random bytes of arbitrary length (getRandomValues caps at 64 KiB per call). */
function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 65536) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + 65536, length)));
  }
  return out;
}

describe('end-to-end pipeline over loopback (no relay)', () => {
  it('ingests on A, syncs the table to B, and B restores with hash parity', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('A');
    const tb = net.endpoint('B');

    // Pairing (out-of-band in M2): each device trusts the other as a writer.
    const docA = new SyncDoc('A');
    docA.addWriter('B');
    const docB = new SyncDoc('B');
    docB.addWriter('A');

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    // 3 MiB of random bytes → multiple content-defined chunks.
    const original = randomBytes(3 * 1024 * 1024);
    const file = new File([original as BlobPart], 'big.bin');
    const passphrase = 'correct horse battery staple';

    const { manifest, size } = await ingestFile(file, passphrase, storeA);

    await syncB.connect(ta.addr());
    await flush();
    docA.setFile('big.bin', [manifest], size, 1000);
    await flush();

    // B converged on the file via the synced allocation table.
    expect(docB.files.value.map((f) => f.path)).toEqual(['big.bin']);
    const manifestAddr = docB.files.value[0]?.blocks[0];
    expect(manifestAddr).toBe(manifest);

    // B pulls the manifest, then every data block it references.
    await syncB.requestBlock(ta.addr(), manifest);
    for (const address of await blockAddresses(manifest, storeB)) {
      await syncB.requestBlock(ta.addr(), address);
    }

    // B restores the plaintext and it matches the original byte-for-byte.
    const restored = await restoreFile(manifest, passphrase, storeB);
    expect(restored.length).toBe(original.length);
    expect(await blake3(restored)).toBe(await blake3(original));

    await syncA.close();
    await syncB.close();
  });

  it('B auto-pulls every referenced block on sync, then restores', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('A');
    const tb = net.endpoint('B');

    const docA = new SyncDoc('A');
    docA.addWriter('B');
    const docB = new SyncDoc('B');
    docB.addWriter('A');

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    const original = randomBytes(3 * 1024 * 1024);
    const file = new File([original as BlobPart], 'big.bin');
    const passphrase = 'correct horse battery staple';

    // The allocation table entry lists every address the file needs, so a peer
    // can pull them all without parsing the manifest.
    const { manifest, size, blocks } = await ingestFile(file, passphrase, storeA);

    await syncB.connect(ta.addr());
    await flush();
    docA.setFile('big.bin', [manifest, ...blocks], size, 1000);

    // B converges and fetches the manifest + every data block on its own.
    const needed = [manifest, ...blocks];
    await until(async () => {
      for (const hash of needed) if (!(await storeB.has(hash))) return false;
      return true;
    });

    const restored = await restoreFile(manifest, passphrase, storeB);
    expect(await blake3(restored)).toBe(await blake3(original));

    await syncA.close();
    await syncB.close();
  });

  it('signed identities: A signs ops, B verifies, auto-pulls and restores (status #7)', async () => {
    const net = new LoopbackNetwork();
    const ta = net.endpoint('ta');
    const tb = net.endpoint('tb');

    // Authorship is the Ed25519 signing id, decoupled from the transport id.
    const alice = createSigner(new Uint8Array(32).fill(11));
    const bob = createSigner(new Uint8Array(32).fill(22));
    const docA = new SyncDoc(alice.id, undefined, alice);
    docA.addWriter(bob.id);
    const docB = new SyncDoc(bob.id, undefined, bob);
    docB.addWriter(alice.id);

    const storeA = new MemoryBlockStore();
    const storeB = new MemoryBlockStore();
    const syncA = new DocSync(ta, docA, storeA);
    const syncB = new DocSync(tb, docB, storeB);
    syncA.serve();
    syncB.serve();

    const original = randomBytes(1024 * 1024);
    const file = new File([original as BlobPart], 'signed.bin');
    const passphrase = 'shared secret';
    const { manifest, blocks, size } = await ingestFile(file, passphrase, storeA);

    await syncB.connect(ta.addr());
    await flush();
    docA.setFile('signed.bin', [manifest, ...blocks], size, 1000);

    // B accepts only because Alice's signature verifies against her authorized id.
    const needed = [manifest, ...blocks];
    await until(async () => {
      for (const hash of needed) if (!(await storeB.has(hash))) return false;
      return true;
    });

    const restored = await restoreFile(manifest, passphrase, storeB);
    expect(await blake3(restored)).toBe(await blake3(original));

    await syncA.close();
    await syncB.close();
  }, 30_000);

  it('a single device restores what it ingested (round-trip)', async () => {
    const store = new MemoryBlockStore();
    const original = randomBytes(700 * 1024);
    const file = new File([original as BlobPart], 'note.bin');
    const { manifest } = await ingestFile(file, 'pw', store);
    const restored = await restoreFile(manifest, 'pw', store);
    expect(await blake3(restored)).toBe(await blake3(original));
  });

  it('restore fails on the wrong passphrase (authenticated decryption)', async () => {
    const store = new MemoryBlockStore();
    const file = new File([randomBytes(1024) as BlobPart], 'x.bin');
    const { manifest } = await ingestFile(file, 'right', store);
    await expect(restoreFile(manifest, 'wrong', store)).rejects.toThrow();
  });
});
