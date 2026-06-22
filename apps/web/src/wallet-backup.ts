// A portable wallet backup the user can save anywhere and restore from later or
// on another device. It carries everything needed to reconstruct the wallet:
// its name, the passphrase (the only secret, exactly as the recovery sheet
// already exposes it), and the non-secret signing salt so the *same* device
// identity is reproduced on restore. Plain JSON, so it is human-inspectable.
import { fromHex, toHex } from './wallet-registry.js';

const KIND = 'sharu-wallet';
const VERSION = 1;

export interface WalletBackup {
  name: string;
  password: string;
  salt: Uint8Array;
}

interface BackupFile {
  kind: typeof KIND;
  version: number;
  name: string;
  password: string;
  salt: string;
}

/** Serialize a wallet backup to the JSON text written to the downloaded file. */
export function serializeWalletBackup(backup: WalletBackup): string {
  const file: BackupFile = {
    kind: KIND,
    version: VERSION,
    name: backup.name,
    password: backup.password,
    salt: toHex(backup.salt),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Parse and validate a backup file's text. Throws on anything that is not a
 *  well-formed Sharu wallet backup, so the UI can show a clear error. */
export function parseWalletBackup(text: string): WalletBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('not a wallet backup: invalid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not a wallet backup');
  const { kind, name, password, salt } = parsed as Record<string, unknown>;
  if (kind !== KIND) throw new Error('not a Sharu wallet backup');
  if (typeof name !== 'string' || name.length === 0) throw new Error('backup: missing name');
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('backup: missing password');
  }
  if (typeof salt !== 'string') throw new Error('backup: missing salt');
  return { name, password, salt: fromHex(salt) };
}

/** A filesystem-safe download name for a wallet's backup. */
export function backupFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `sharu-wallet-${slug || 'backup'}.json`;
}
