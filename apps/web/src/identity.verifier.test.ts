import { describe, expect, it } from 'vitest';
import { type IdVerifierStore, verifyOrRecordId, WrongPasswordError } from './identity.js';

/** In-memory verifier store, so the verify/record logic is tested without OPFS. */
function fakeStore(): IdVerifierStore & { readonly recorded: string | undefined } {
  let id: string | undefined;
  return {
    load: () => Promise.resolve(id),
    save: (value) => {
      id = value;
      return Promise.resolve();
    },
    get recorded() {
      return id;
    },
  };
}

describe('verifyOrRecordId (wrong-password guard)', () => {
  it('records the id the first time a password is used', async () => {
    const store = fakeStore();
    await verifyOrRecordId('id-abc', store);
    expect(store.recorded).toBe('id-abc');
  });

  it('accepts the same id (same password) on later unlocks', async () => {
    const store = fakeStore();
    await verifyOrRecordId('id-abc', store);
    await expect(verifyOrRecordId('id-abc', store)).resolves.toBeUndefined();
  });

  it('rejects a different id (a mistyped password) with WrongPasswordError', async () => {
    const store = fakeStore();
    await verifyOrRecordId('id-abc', store);
    await expect(verifyOrRecordId('id-xyz', store)).rejects.toBeInstanceOf(WrongPasswordError);
    expect(new WrongPasswordError().message).toBe('wrong-password');
  });
});
