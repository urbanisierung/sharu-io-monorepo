import { signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './app.js';
import { IngestController } from './ingest-controller.js';

function renderApp() {
  const controller = new IngestController(async () => {});
  const files = signal<readonly FileView[]>([]);
  const peers = signal<readonly string[]>([]);
  const syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  render(<App controller={controller} files={files} peers={peers} syncStatus={syncStatus} />);
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
});
