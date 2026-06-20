// This device's stable signing identity (status #7). The Ed25519 secret is
// derived from the user's passphrase and a per-device random salt via Argon2id.
// Only the non-secret salt is persisted (OPFS); the secret key exists only in
// memory, honouring the zero-knowledge invariant ("keys never persisted in
// plaintext"). The same passphrase on a given device yields the same identity
// across reloads, so the writer set and authored ops stay valid.
import { deriveKey } from '@safu/crypto';
import { createSigner, type Signer } from '@safu/sdk';

const SALT_BYTES = 16;

/** Derive the signing identity from a passphrase and salt. Pure and runtime-free. */
export async function deriveSigner(passphrase: string, salt: Uint8Array): Promise<Signer> {
  return createSigner(await deriveKey(passphrase, salt));
}

async function identityDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('identity', { create: true });
}

/** Whether this device already has a stored identity (i.e. a password was set
 *  here before). Lets the UI show "create your password" on first run and
 *  "welcome back" afterwards, without creating anything. */
export async function hasStoredIdentity(): Promise<boolean> {
  const dir = await identityDir();
  try {
    await dir.getFileHandle('signer.salt');
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
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

const ID_FILE = 'signer.id';

/** Thrown when a derived id doesn't match the one recorded on this device —
 *  i.e. the entered password differs from the one used to create the identity
 *  here. Caught at the unlock screen and shown as a friendly message. */
export class WrongPasswordError extends Error {
  constructor() {
    super('wrong-password');
    this.name = 'WrongPasswordError';
  }
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

async function readIdFile(name: string): Promise<string | undefined> {
  const dir = await identityDir();
  let handle: FileSystemFileHandle;
  try {
    handle = await dir.getFileHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
    throw error;
  }
  return (await handle.getFile()).text();
}

async function writeIdFile(name: string, text: string): Promise<void> {
  const dir = await identityDir();
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}

const opfsIdStore: IdVerifierStore = {
  load: () => readIdFile(ID_FILE),
  save: (id) => writeIdFile(ID_FILE, id),
};

/** Derive this device's identity and check the password against the one used to
 *  create it here, recording the expected id the first time. Throws
 *  {@link WrongPasswordError} when a returning user mistypes their password. */
export async function unlockIdentity(passphrase: string): Promise<Signer> {
  const signer = await loadOrCreateSigner(passphrase);
  await verifyOrRecordId(signer.id, opfsIdStore);
  return signer;
}
