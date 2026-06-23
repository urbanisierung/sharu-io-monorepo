import { signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, resetAppView } from './app.js';
import { resetDevicesView } from './devices.js';
import { resetFileTableView } from './file-table.js';
import { IngestController } from './ingest-controller.js';
import type { PeerInfo } from './runtime.js';
import { resetUnlockGate } from './unlock-gate.js';

function renderApp(props: Partial<Parameters<typeof App>[0]> = {}) {
  const controller = new IngestController(async () => {});
  const files = signal<readonly FileView[]>([]);
  const peers = signal<readonly PeerInfo[]>([]);
  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  render(
    <App controller={controller} files={files} peers={peers} syncStatus={syncStatus} {...props} />,
  );
  return { controller, files, peers, syncStatus };
}

afterEach(() => {
  cleanup();
  resetFileTableView();
  resetUnlockGate();
  resetDevicesView();
  resetAppView();
});

describe('App shell (plan §2.4)', () => {
  it('shows a calm, plain-language sync status in the top bar', async () => {
    const { syncStatus } = renderApp();
    expect(screen.getByText('Up to date')).toBeTruthy();
    syncStatus.value = 'syncing';
    expect(await screen.findByText('Syncing…')).toBeTruthy();
  });

  it('reveals the drop surface only while a file is dragged over the list', async () => {
    const { controller } = renderApp();
    controller.unlock('hunter2pass');
    // Nothing covers the file list until a drag begins...
    expect(screen.queryByLabelText('Drop files here to back them up')).toBeNull();
    // ...a drag over the surface reveals the drop overlay...
    controller.dragOver(true);
    expect(await screen.findByLabelText('Drop files here to back them up')).toBeTruthy();
    // ...and leaving the surface hides it again.
    controller.dragLeave();
    await waitFor(() =>
      expect(screen.queryByLabelText('Drop files here to back them up')).toBeNull(),
    );
  });

  it('shows the active wallet name and backup/switch controls in Settings', () => {
    const onBackup = vi.fn();
    const onSwitchWallet = vi.fn();
    renderApp({ walletName: 'Personal', onBackup, onSwitchWallet });
    // The wallet name stays in the top bar across views...
    expect(screen.getByText('Personal')).toBeTruthy();
    // ...while the wallet controls live behind the Settings tab.
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back up this wallet' }));
    expect(onBackup).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Switch wallet' }));
    expect(onSwitchWallet).toHaveBeenCalledOnce();
  });

  it('keeps the files view as the default landing view', async () => {
    const { controller } = renderApp({ onPair: async () => {}, onBackup: () => {} });
    controller.unlock('p');
    // Files content is visible without touching the nav...
    expect(await screen.findByLabelText('Add files')).toBeTruthy();
    // ...and the device/wallet controls are tucked away until their tab is picked.
    expect(screen.queryByLabelText('Paste the link code from your other device')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back up this wallet' })).toBeNull();
  });

  it('shows the zero-peer hint and the empty-files state once unlocked', async () => {
    const { controller } = renderApp();
    controller.unlock('p');
    expect(await screen.findByText(/No other devices yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
  });

  it('offers an Add files control so backing up needs no drag (touch-friendly)', async () => {
    const { controller } = renderApp();
    controller.unlock('p');
    const input = (await screen.findByLabelText('Add files')) as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
  });

  it('renders synced files from the SDK signal', async () => {
    const { controller, files } = renderApp();
    controller.unlock('p');
    files.value = [{ path: 'photo.jpg', size: 3, modified: 1, blocks: ['h'] }];
    expect(await screen.findByText('photo.jpg')).toBeTruthy();
  });

  it('surfaces a clear error when a restore fails (e.g. wrong passphrase)', async () => {
    const { controller, files } = renderApp({
      onRestore: () => Promise.reject(new Error('aes-gcm open failed')),
    });
    controller.unlock('p');
    files.value = [{ path: 'secret.bin', size: 1, modified: 1, blocks: ['m'] }];

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(await screen.findByText(/same password/)).toBeTruthy();
  });

  it('shows a paired peer with its SAS and confirms it (plan §2.2)', async () => {
    const onVerify = vi.fn();
    const { controller, peers } = renderApp({
      connectionCode: signal('MY-CODE'),
      onPair: async () => {},
      onVerify,
      onReject: () => {},
    });
    controller.unlock('p');
    peers.value = [{ id: 'PEER1', sas: '123456', status: 'pending' }];

    // Devices live behind their own tab now.
    fireEvent.click(screen.getByRole('button', { name: /Devices/ }));
    // The SAS is shown for out-of-band comparison...
    expect(await screen.findByText('123456')).toBeTruthy();
    // ...and confirming it calls back with the peer id.
    fireEvent.click(screen.getByRole('button', { name: 'Codes match' }));
    expect(onVerify).toHaveBeenCalledWith('PEER1');
  });

  it('reflects a rejected peer as writes-blocked', async () => {
    const { controller, peers } = renderApp({
      connectionCode: signal('MY-CODE'),
      onPair: async () => {},
      onVerify: () => {},
      onReject: () => {},
    });
    controller.unlock('p');
    peers.value = [{ id: 'PEER1', sas: '123456', status: 'rejected' }];
    fireEvent.click(screen.getByRole('button', { name: /Devices/ }));
    expect(await screen.findByText(/no longer make changes/)).toBeTruthy();
  });
});
