// Multiple wallets on one machine. A "wallet" is a named, passphrase-protected
// identity: its files, signing key, and synced document are isolated from every
// other wallet on the device. The registry — the list of wallets and their
// (non-secret) salts — is persisted in OPFS so the user can pick up where they
// left off and switch between wallets freely. Secrets are never stored: as
// elsewhere, only the salt is persisted; the signing key is derived from the
// passphrase in memory at unlock (zero-knowledge invariant).
import type { Signer } from '@safu/sdk';
import { deriveSigner } from './identity.js';
import {
  addWallet,
  fromHex,
  type Registry,
  recordOrVerify,
  removeFromRegistry,
  renameInRegistry,
  type StoredWallet,
  toHex,
} from './wallet-registry.js';

const SALT_BYTES = 16;
const REGISTRY_FILE = 'wallets.json';
const LEGACY_SALT_FILE = 'signer.salt';
const LEGACY_ID_FILE = 'signer.id';

/** The id reserved for a migrated pre-multi-wallet identity, so its existing
 *  document and blocks keep their original (un-namespaced) storage paths. */
export const LEGACY_WALLET_ID = 'default';

/** What the UI lists in the wallet picker. */
export interface WalletMeta {
  id: string;
  name: string;
}

/** A wallet plus the material needed to unlock it. `signerId` is recorded on
 *  first unlock and thereafter used to catch a mistyped passphrase. */
export interface Wallet {
  id: string;
  name: string;
  salt: Uint8Array;
  signerId?: string;
}

// ---- OPFS-backed registry --------------------------------------------------

async function identityDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('identity', { create: true });
}

async function readFileText(name: string): Promise<string | undefined> {
  const dir = await identityDir();
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
    throw error;
  }
}

async function readFileBytes(name: string): Promise<Uint8Array | undefined> {
  const dir = await identityDir();
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
    throw error;
  }
}

async function writeFileText(name: string, text: string): Promise<void> {
  const dir = await identityDir();
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}

/** Migrate a pre-multi-wallet identity (a bare `signer.salt`) into the registry
 *  as the reserved {@link LEGACY_WALLET_ID} wallet, so its files survive. */
async function migrateLegacy(): Promise<Registry> {
  const salt = await readFileBytes(LEGACY_SALT_FILE);
  if (!salt || salt.length !== SALT_BYTES) return { wallets: [] };
  const signerId = await readFileText(LEGACY_ID_FILE);
  const wallet: StoredWallet = { id: LEGACY_WALLET_ID, name: 'My wallet', salt: toHex(salt) };
  if (signerId) wallet.signerId = signerId;
  const reg: Registry = { wallets: [wallet] };
  await saveRegistry(reg);
  return reg;
}

async function loadRegistry(): Promise<Registry> {
  const raw = await readFileText(REGISTRY_FILE);
  if (raw === undefined) return migrateLegacy();
  try {
    const parsed = JSON.parse(raw) as Registry;
    if (Array.isArray(parsed.wallets)) return parsed;
  } catch {
    // fall through to an empty registry on a corrupt file
  }
  return { wallets: [] };
}

async function saveRegistry(reg: Registry): Promise<void> {
  await writeFileText(REGISTRY_FILE, JSON.stringify(reg));
}

function toWallet(stored: StoredWallet): Wallet {
  return {
    id: stored.id,
    name: stored.name,
    salt: fromHex(stored.salt),
    signerId: stored.signerId,
  };
}

/** Every wallet on this device, in creation order. */
export async function listWallets(): Promise<WalletMeta[]> {
  const reg = await loadRegistry();
  return reg.wallets.map((w) => ({ id: w.id, name: w.name }));
}

/** Load one wallet (with its salt) by id. */
export async function getWallet(id: string): Promise<Wallet | undefined> {
  const reg = await loadRegistry();
  const stored = reg.wallets.find((w) => w.id === id);
  return stored ? toWallet(stored) : undefined;
}

/** Create a new, empty wallet with a fresh random salt and persist it. */
export async function createWallet(name: string): Promise<Wallet> {
  const reg = await loadRegistry();
  const stored: StoredWallet = {
    id: crypto.randomUUID(),
    name: name.trim() || 'My wallet',
    salt: toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES))),
  };
  await saveRegistry({ wallets: [...reg.wallets, stored] });
  return toWallet(stored);
}

/** Add a wallet from a restored backup (name + salt). Idempotent by salt, so
 *  restoring the same file twice does not create a duplicate. */
export async function importWallet(name: string, salt: Uint8Array): Promise<Wallet> {
  const reg = await loadRegistry();
  const saltHex = toHex(salt);
  const existing = reg.wallets.find((w) => w.salt === saltHex);
  const stored: StoredWallet = existing
    ? { ...existing, name: name.trim() || existing.name }
    : { id: crypto.randomUUID(), name: name.trim() || 'My wallet', salt: saltHex };
  await saveRegistry(addWallet(reg, stored));
  return toWallet(stored);
}

export async function renameWallet(id: string, name: string): Promise<void> {
  await saveRegistry(renameInRegistry(await loadRegistry(), id, name.trim()));
}

/** Drop a wallet from the registry (used to roll back a half-created wallet
 *  whose first unlock failed). Any blocks it wrote are left content-addressed in
 *  OPFS, harmless and unreferenced. */
export async function removeWallet(id: string): Promise<void> {
  await saveRegistry(removeFromRegistry(await loadRegistry(), id));
}

/** Derive a wallet's signer from the passphrase, then verify it against the id
 *  recorded on first unlock (recording it the first time). Throws
 *  {@link WrongPasswordError} when the passphrase is wrong for a known wallet. */
export async function unlockWallet(wallet: Wallet, passphrase: string): Promise<Signer> {
  const signer = await deriveSigner(passphrase, wallet.salt);
  const reg = await loadRegistry();
  const next = recordOrVerify(reg, wallet.id, signer.id);
  if (next !== reg) await saveRegistry(next);
  return signer;
}
