// This device's stable signing identity (status #7). The Ed25519 secret is
// derived from the user's passphrase and a per-device random salt via Argon2id.
// Only the non-secret salt is persisted (OPFS); the secret key exists only in
// memory, honouring the zero-knowledge invariant ("keys never persisted in
// plaintext"). The same passphrase on a given device yields the same identity
// across reloads, so the writer set and authored ops stay valid.
import { deriveKey } from '@safu/crypto';
import { createSigner, type Signer } from '@safu/sdk';
import { WrongPasswordError } from './wallet-registry.js';

export { WrongPasswordError } from './wallet-registry.js';

const SALT_BYTES = 16;

/** Derive the signing identity from a passphrase and salt. Pure and runtime-free. */
export async function deriveSigner(passphrase: string, salt: Uint8Array): Promise<Signer> {
  return createSigner(await deriveKey(passphrase, salt));
}

async function identityDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('identity', { create: true });
}

async function loadOrCreateSalt(): Promise<Uint8Array> {
  const dir = await identityDir();
  try {
    const file = await (await dir.getFileHandle('signer.salt')).getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === SALT_BYTES) return bytes;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const handle = await dir.getFileHandle('signer.salt', { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(salt as unknown as BufferSource);
  } finally {
    await writable.close();
  }
  return salt;
}

/** Load, or first-time create, this device's persistent signing identity. */
export async function loadOrCreateSigner(passphrase: string): Promise<Signer> {
  return deriveSigner(passphrase, await loadOrCreateSalt());
}

/** Persistence for the expected signing id (a public key, safe to store). */
export interface IdVerifierStore {
  load(): Promise<string | undefined>;
  save(id: string): Promise<void>;
}

/** Record the id on first use; thereafter require a match. Pure logic over an
 *  injected store, so it is unit-tested without OPFS. A returning user who
 *  mistypes their password derives a different id and is rejected here —
 *  immediately and clearly — instead of failing later at restore. */
export async function verifyOrRecordId(derivedId: string, store: IdVerifierStore): Promise<void> {
  const expected = await store.load();
  if (expected === undefined) {
    await store.save(derivedId);
    return;
  }
  if (expected !== derivedId) throw new WrongPasswordError();
}
