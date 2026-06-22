// Pure wallet-registry logic — no crypto, no OPFS, no Preact — so it is fully
// unit-testable in Node. `wallet.ts` layers OPFS persistence and key derivation
// on top of these helpers; keeping them here also lets `wallet-backup.ts` reuse
// the hex codecs without pulling in the WASM crypto module.

/** Thrown when a derived signing id doesn't match the one recorded for a wallet
 *  — i.e. the entered passphrase differs from the one that created it. The
 *  message is matched by string elsewhere, so the class identity is incidental. */
export class WrongPasswordError extends Error {
  constructor() {
    super('wrong-password');
    this.name = 'WrongPasswordError';
  }
}

export interface StoredWallet {
  id: string;
  name: string;
  salt: string;
  signerId?: string;
}

export interface Registry {
  wallets: StoredWallet[];
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Append a wallet, reusing an existing entry with the same salt so restoring
 *  the same backup twice is idempotent (no duplicate wallets). */
export function addWallet(reg: Registry, wallet: StoredWallet): Registry {
  const existing = reg.wallets.find((w) => w.salt === wallet.salt);
  if (existing) {
    return {
      wallets: reg.wallets.map((w) => (w === existing ? { ...existing, name: wallet.name } : w)),
    };
  }
  return { wallets: [...reg.wallets, wallet] };
}

export function renameInRegistry(reg: Registry, id: string, name: string): Registry {
  return { wallets: reg.wallets.map((w) => (w.id === id ? { ...w, name } : w)) };
}

export function removeFromRegistry(reg: Registry, id: string): Registry {
  return { wallets: reg.wallets.filter((w) => w.id !== id) };
}

/** Verify a freshly derived signing id against the one recorded for a wallet,
 *  recording it on first unlock. Returns the registry to persist (the same
 *  reference when the id already matched); throws {@link WrongPasswordError} on a
 *  mismatch — a returning user who mistyped their passphrase. */
export function recordOrVerify(reg: Registry, id: string, derivedId: string): Registry {
  const wallet = reg.wallets.find((w) => w.id === id);
  if (!wallet) throw new Error(`unknown wallet: ${id}`);
  if (wallet.signerId === undefined) {
    return { wallets: reg.wallets.map((w) => (w.id === id ? { ...w, signerId: derivedId } : w)) };
  }
  if (wallet.signerId !== derivedId) throw new WrongPasswordError();
  return reg;
}
