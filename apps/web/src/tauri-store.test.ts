import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { createTauriBlockStore } = await import('./tauri-store.js');

describe('TauriBlockStore', () => {
  beforeEach(() => invoke.mockReset());

  it('puts a block as a byte array via the native command', async () => {
    invoke.mockResolvedValue(undefined);
    await createTauriBlockStore().put('hash1', new Uint8Array([1, 2, 3]));
    expect(invoke).toHaveBeenCalledWith('block_put', { hash: 'hash1', data: [1, 2, 3] });
  });

  it('gets and rehydrates a block, and maps null to undefined', async () => {
    invoke.mockResolvedValueOnce([4, 5, 6]);
    expect(await createTauriBlockStore().get('h')).toEqual(new Uint8Array([4, 5, 6]));
    invoke.mockResolvedValueOnce(null);
    expect(await createTauriBlockStore().get('missing')).toBeUndefined();
  });

  it('reports presence via block_has', async () => {
    invoke.mockResolvedValue(true);
    expect(await createTauriBlockStore().has('h')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('block_has', { hash: 'h' });
  });
});
