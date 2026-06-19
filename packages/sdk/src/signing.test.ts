import { describe, expect, it } from 'vitest';
import { createSigner, verifySignature } from './signing.js';

const seed = (fill: number) => new Uint8Array(32).fill(fill);
const bytes = (text: string) => new TextEncoder().encode(text);

describe('signing identity', () => {
  it('derives a stable hex id from a seed and signs verifiably', () => {
    const signer = createSigner(seed(1));
    expect(signer.id).toMatch(/^[0-9a-f]{64}$/);
    const sig = signer.sign(bytes('hello'));
    expect(verifySignature(signer.id, bytes('hello'), sig)).toBe(true);
  });

  it('gives the same id for the same seed, a different id for a different seed', () => {
    expect(createSigner(seed(1)).id).toBe(createSigner(seed(1)).id);
    expect(createSigner(seed(1)).id).not.toBe(createSigner(seed(2)).id);
  });

  it('rejects a signature verified against a different author id', () => {
    const a = createSigner(seed(1));
    const b = createSigner(seed(2));
    const sig = a.sign(bytes('payload'));
    expect(verifySignature(b.id, bytes('payload'), sig)).toBe(false);
  });

  it('rejects a signature over tampered data', () => {
    const signer = createSigner(seed(3));
    const sig = signer.sign(bytes('original'));
    expect(verifySignature(signer.id, bytes('tampered'), sig)).toBe(false);
  });

  it('rejects a malformed author id without throwing', () => {
    const signer = createSigner(seed(4));
    const sig = signer.sign(bytes('x'));
    expect(verifySignature('not-hex', bytes('x'), sig)).toBe(false);
  });
});
