import { signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app.js';
import { IngestController } from './ingest-controller.js';
import type { PeerInfo } from './runtime.js';

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

afterEach(cleanup);

describe('App shell (plan §2.4)', () => {
  it('starts at the first-run passphrase gate and unlocks into the drop zone', () => {
    renderApp();
    expect(screen.getByText('Enter a passphrase to derive your encryption key')).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Passphrase'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    // Signal-driven: unlocking re-renders into the drop surface, no useState.
    expect(screen.getByLabelText('Drop files here to back them up')).toBeTruthy();
  });

  it('shows the zero-peer hint and the empty-files state once unlocked', async () => {
    const { controller } = renderApp();
    controller.unlock('p');
    expect(await screen.findByText(/No paired devices yet/)).toBeTruthy();
    expect(screen.getByText('Nothing backed up yet')).toBeTruthy();
  });

  it('renders synced files from the SDK signal', async () => {
    const { controller, files } = renderApp();
    controller.unlock('p');
    files.value = [{ path: 'photo.jpg', size: 3, modified: 1, blocks: ['h'] }];
    expect(await screen.findByText('photo.jpg')).toBeTruthy();
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
    expect(await screen.findByText(/writes blocked/)).toBeTruthy();
  });
});
