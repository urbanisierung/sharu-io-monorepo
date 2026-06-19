import { beforeEach, describe, expect, it } from 'vitest';
import { loadOrCreateSigner } from './identity.js';

// The per-device signing salt persists in OPFS, so the same passphrase recovers
// the same identity across reloads (separate store instances), status #7.
async function clearOpfs(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry('identity', { recursive: true });
  } catch {
    // directory may not exist yet
  }
}

describe('loadOrCreateSigner', () => {
  beforeEach(clearOpfs);

  it('recovers the same identity for the same passphrase across calls', async () => {
    const first = await loadOrCreateSigner('passphrase');
    const second = await loadOrCreateSigner('passphrase');
    expect(second.id).toBe(first.id);
  });

  it('derives a different identity for a different passphrase on the same device', async () => {
    const a = await loadOrCreateSigner('one');
    const b = await loadOrCreateSigner('two');
    expect(b.id).not.toBe(a.id);
  });
});
