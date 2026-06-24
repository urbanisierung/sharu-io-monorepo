import { describe, expect, it } from 'vitest';
import { openBytes, sealBytes } from './index.js';

const key = (fill: number) => new Uint8Array(32).fill(fill);

describe('sealBytes / openBytes', () => {
  it('round-trips a blob under the same key', async () => {
    const plain = new TextEncoder().encode('{"v":1}');
    const sealed = await sealBytes(key(3), plain);
    expect(sealed.nonce.length).toBe(12);
    expect(await openBytes(key(3), sealed.nonce, sealed.ciphertext)).toEqual(plain);
  });

  it('appends an auth tag (ciphertext longer than plaintext)', async () => {
    const plain = new Uint8Array(8);
    const sealed = await sealBytes(key(3), plain);
    expect(sealed.ciphertext.length).toBe(plain.length + 16);
  });

  it('fails to open under the wrong key', async () => {
    const sealed = await sealBytes(key(3), new Uint8Array([1, 2, 3]));
    await expect(openBytes(key(4), sealed.nonce, sealed.ciphertext)).rejects.toThrow();
  });

  it('fails to open tampered ciphertext', async () => {
    const sealed = await sealBytes(key(3), new Uint8Array([1, 2, 3]));
    sealed.ciphertext[0] = (sealed.ciphertext[0] ?? 0) ^ 0x01;
    await expect(openBytes(key(3), sealed.nonce, sealed.ciphertext)).rejects.toThrow();
  });

  it('rejects a key that is not 32 bytes', async () => {
    await expect(sealBytes(new Uint8Array(16), new Uint8Array(0))).rejects.toThrow(/32 bytes/);
    await expect(
      openBytes(new Uint8Array(16), new Uint8Array(12), new Uint8Array(16)),
    ).rejects.toThrow(/32 bytes/);
  });
});
