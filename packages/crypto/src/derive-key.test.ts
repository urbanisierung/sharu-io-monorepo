import { describe, expect, it } from 'vitest';
import { deriveKey } from './index.js';

const salt = (fill: number) => new Uint8Array(16).fill(fill);

describe('deriveKey (Argon2id)', () => {
  it('derives a deterministic 32-byte key', async () => {
    const a = await deriveKey('correct horse', salt(1));
    const b = await deriveKey('correct horse', salt(1));
    expect(a.length).toBe(32);
    expect([...a]).toEqual([...b]);
  });

  it('changes with the salt and the passphrase', async () => {
    const base = await deriveKey('pw', salt(1));
    expect([...base]).not.toEqual([...(await deriveKey('pw', salt(2)))]);
    expect([...base]).not.toEqual([...(await deriveKey('other', salt(1)))]);
  });
});
