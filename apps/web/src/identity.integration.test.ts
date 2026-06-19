import { describe, expect, it } from 'vitest';
import { deriveSigner } from './identity.js';

const salt = (fill: number) => new Uint8Array(16).fill(fill);

// The signing identity is derived deterministically from passphrase + salt, so a
// device recovers the same id (and can keep authoring) across reloads (status #7).
describe('deriveSigner', () => {
  it('is stable for the same passphrase and salt', async () => {
    const a = await deriveSigner('open sesame', salt(7));
    const b = await deriveSigner('open sesame', salt(7));
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for a different passphrase or a different device salt', async () => {
    const base = await deriveSigner('pw', salt(1));
    expect((await deriveSigner('pw', salt(2))).id).not.toBe(base.id);
    expect((await deriveSigner('other', salt(1))).id).not.toBe(base.id);
  });
});
