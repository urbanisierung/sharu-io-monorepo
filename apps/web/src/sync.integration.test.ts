// The whole pipeline wired together, minus the literal relay hop (which only
// works outside the CI sandbox — see transfer.e2e.browser.test.ts). Over the
// in-process loopback transport: A ingests a real multi-chunk file through the
// crypto pipeline, the allocation table syncs to B, B pulls the referenced
// blocks, and B restores the plaintext with BLAKE3 parity. This exercises
// crypto + storage + CRDT sync + transport + manifest restore as one system.
import { blake3 } from '@safu/crypto';
import { DocSync, MemoryBlockStore, SyncDoc } from '@safu/sdk';
import { LoopbackNetwork } from '@safu/transport';
import { describe, expect, it } from 'vitest';
import { blockAddresses, ingestFile, restoreFile } from './pipeline.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

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
