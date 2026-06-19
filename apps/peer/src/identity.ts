// This node's stable signing identity — the Node analogue of the web app's
// identity.ts. The Ed25519 secret is derived from a passphrase and a per-node
// random salt via Argon2id; only the non-secret salt is persisted to disk, so
// the secret never lives in plaintext (zero-knowledge invariant). The same
// passphrase + dataDir yields the same identity across restarts, keeping the
// node's authored ops and writer authorizations valid.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deriveKey } from '@safu/crypto';
import { createSigner, type Signer } from '@safu/sdk';
import { isNotFound } from './fs-util.js';

const SALT_BYTES = 16;

async function loadOrCreateSalt(dataDir: string): Promise<Uint8Array> {
  const path = join(dataDir, 'identity', 'signer.salt');
  try {
    const buffer = await readFile(path);
    if (buffer.length === SALT_BYTES) return new Uint8Array(buffer);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const salt = new Uint8Array(randomBytes(SALT_BYTES));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, salt);
  return salt;
}

/** Load, or first-time create, this node's persistent signing identity. */
export async function loadOrCreateSigner(dataDir: string, passphrase: string): Promise<Signer> {
  return createSigner(await deriveKey(passphrase, await loadOrCreateSalt(dataDir)));
}
