import { signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { PeerInfo } from './runtime.js';
import { StatusBanner } from './status-banner.js';

const file: FileView = { path: 'a.txt', size: 1, modified: 0, blocks: ['h'] };

function renderBanner(files: readonly FileView[], peers: readonly PeerInfo[]) {
  const { container } = render(
    <StatusBanner
      files={signal<readonly FileView[]>(files)}
      peers={signal<readonly PeerInfo[]>(peers)}
    />,
  );
  return container;
}

afterEach(cleanup);

describe('StatusBanner', () => {
  it('warns that files on a single device are not backed up', () => {
    renderBanner([file], []);
    expect(screen.getByText(/only on this device/)).toBeTruthy();
  });

  it('confirms backup once another device is linked', () => {
    renderBanner([file], [{ id: 'P', sas: '000000', status: 'pending' }]);
    expect(screen.getByText(/Backed up/)).toBeTruthy();
  });

  it('ignores a blocked device when counting backups', () => {
    renderBanner([file], [{ id: 'P', sas: '000000', status: 'rejected' }]);
    expect(screen.getByText(/only on this device/)).toBeTruthy();
  });

  it('shows nothing before the first file', () => {
    const container = renderBanner([], []);
    expect(container.textContent).toBe('');
  });
});
