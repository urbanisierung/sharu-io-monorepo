import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeWalletBackup } from './wallet-backup.js';
import { resetWalletPicker, WalletPicker } from './wallet-picker.js';

beforeEach(resetWalletPicker);
afterEach(cleanup);

const wallets = [
  { id: 'a', name: 'Personal' },
  { id: 'b', name: 'Work' },
];

describe('WalletPicker', () => {
  it('opens a chosen wallet', () => {
    const onOpen = vi.fn();
    render(
      <WalletPicker wallets={wallets} onOpen={onOpen} onCreate={() => {}} onRestore={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  it('starts creating a new wallet', () => {
    const onCreate = vi.fn();
    render(
      <WalletPicker wallets={wallets} onOpen={() => {}} onCreate={onCreate} onRestore={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create a new wallet' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('restores a wallet from a valid backup file', async () => {
    const onRestore = vi.fn();
    render(
      <WalletPicker wallets={[]} onOpen={() => {}} onCreate={() => {}} onRestore={onRestore} />,
    );
    const text = serializeWalletBackup({
      name: 'Restored',
      password: 'correcthorse',
      salt: new Uint8Array([1, 2, 3]),
    });
    const file = new File([text], 'sharu-wallet-restored.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Restore from a backup'), { target: { files: [file] } });
    await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
    expect(onRestore.mock.calls[0]?.[0]?.name).toBe('Restored');
  });

  it('shows an error for a file that is not a wallet backup', async () => {
    render(
      <WalletPicker wallets={[]} onOpen={() => {}} onCreate={() => {}} onRestore={() => {}} />,
    );
    const file = new File(['garbage'], 'x.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Restore from a backup'), { target: { files: [file] } });
    expect(await screen.findByText(/isn’t a valid Sharu wallet backup/)).toBeTruthy();
  });
});
