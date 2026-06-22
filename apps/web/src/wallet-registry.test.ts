import { describe, expect, it } from 'vitest';
import {
  addWallet,
  fromHex,
  recordOrVerify,
  removeFromRegistry,
  renameInRegistry,
  toHex,
  WrongPasswordError,
} from './wallet-registry.js';

const reg = (...wallets: { id: string; name: string; salt: string; signerId?: string }[]) => ({
  wallets,
});

describe('wallet registry (pure logic)', () => {
  it('round-trips bytes through hex', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(toHex(bytes)).toBe('00010f10ff');
    expect(fromHex(toHex(bytes))).toEqual(bytes);
  });

  it('rejects malformed hex', () => {
    expect(() => fromHex('xyz')).toThrow();
    expect(() => fromHex('abc')).toThrow();
  });

  it('appends a new wallet', () => {
    const next = addWallet(reg(), { id: 'a', name: 'A', salt: '00' });
    expect(next.wallets.map((w) => w.id)).toEqual(['a']);
  });

  it('is idempotent by salt — restoring the same backup twice does not duplicate', () => {
    const start = reg({ id: 'a', name: 'A', salt: 'ff' });
    const next = addWallet(start, { id: 'b', name: 'A (restored)', salt: 'ff' });
    expect(next.wallets).toHaveLength(1);
    expect(next.wallets[0]?.name).toBe('A (restored)');
  });

  it('renames and removes by id', () => {
    const start = reg({ id: 'a', name: 'A', salt: '00' }, { id: 'b', name: 'B', salt: '11' });
    expect(renameInRegistry(start, 'a', 'Aa').wallets[0]?.name).toBe('Aa');
    expect(removeFromRegistry(start, 'a').wallets.map((w) => w.id)).toEqual(['b']);
  });

  it('records a signing id on first unlock, then requires a match', () => {
    const start = reg({ id: 'a', name: 'A', salt: '00' });
    const recorded = recordOrVerify(start, 'a', 'sign-1');
    expect(recorded.wallets[0]?.signerId).toBe('sign-1');
    // Same id is accepted and returns the registry unchanged.
    expect(recordOrVerify(recorded, 'a', 'sign-1')).toBe(recorded);
    // A different id (a mistyped password) is rejected.
    expect(() => recordOrVerify(recorded, 'a', 'sign-2')).toThrow(WrongPasswordError);
  });

  it('throws for an unknown wallet id', () => {
    expect(() => recordOrVerify(reg(), 'missing', 'x')).toThrow(/unknown wallet/);
  });
});
