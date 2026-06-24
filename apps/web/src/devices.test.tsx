import { signal } from '@preact/signals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Devices, resetDevicesView } from './devices.js';
import type { PeerInfo } from './runtime.js';

const code = signal('LINKCODE');
const noPeers = signal<readonly PeerInfo[]>([]);

beforeEach(resetDevicesView);
afterEach(cleanup);

describe('Devices', () => {
  it('shows a scannable QR for this device’s link', () => {
    render(<Devices connectionCode={code} peers={noPeers} onPair={async () => {}} />);
    expect(screen.getByRole('img', { name: /link another device/i })).toBeTruthy();
  });

  it('pairs with the entered link code', () => {
    const onPair = vi.fn().mockResolvedValue(undefined);
    render(<Devices connectionCode={code} peers={noPeers} onPair={onPair} />);
    fireEvent.input(screen.getByLabelText(/Paste the link code/), { target: { value: 'THEIRS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link device' }));
    expect(onPair).toHaveBeenCalledWith('THEIRS');
  });

  it('renames a paired device through onRename', () => {
    const onRename = vi.fn();
    const peers = signal<readonly PeerInfo[]>([{ id: 'PEER1', sas: '123456', status: 'verified' }]);
    render(
      <Devices connectionCode={code} peers={peers} onPair={async () => {}} onRename={onRename} />,
    );
    // Unnamed until labelled.
    expect(screen.getByText('Unnamed device')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.input(screen.getByLabelText(/Name this device/), {
      target: { value: 'Mom’s phone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRename).toHaveBeenCalledWith('PEER1', 'Mom’s phone');
  });

  it('lets the user choose which peer hosts public shares', () => {
    const onSetShareHost = vi.fn();
    const shareHostId = signal<string | undefined>(undefined);
    const peers = signal<readonly PeerInfo[]>([{ id: 'NODE1', sas: '123456', status: 'verified' }]);
    render(
      <Devices
        connectionCode={code}
        peers={peers}
        onPair={async () => {}}
        shareHostId={shareHostId}
        onSetShareHost={onSetShareHost}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Host shares here' }));
    expect(onSetShareHost).toHaveBeenCalledWith('NODE1');
  });

  it('marks the current share host instead of offering the button', () => {
    const shareHostId = signal<string | undefined>('NODE1');
    const peers = signal<readonly PeerInfo[]>([{ id: 'NODE1', sas: '123456', status: 'verified' }]);
    render(
      <Devices
        connectionCode={code}
        peers={peers}
        onPair={async () => {}}
        shareHostId={shareHostId}
        onSetShareHost={vi.fn()}
      />,
    );
    expect(screen.getByText('Hosts public shares')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Host shares here' })).toBeNull();
  });

  it('shows a friendly name when one is set', () => {
    const peers = signal<readonly PeerInfo[]>([
      { id: 'PEER1', name: 'Mom’s phone', sas: '123456', status: 'verified' },
    ]);
    render(<Devices connectionCode={code} peers={peers} onPair={async () => {}} />);
    expect(screen.getByText('Mom’s phone')).toBeTruthy();
  });

  it('walks through the safety-number check for a pending peer', () => {
    const onVerify = vi.fn();
    const onReject = vi.fn();
    const peers = signal<readonly PeerInfo[]>([{ id: 'PEER1', sas: '654321', status: 'pending' }]);
    render(
      <Devices
        connectionCode={code}
        peers={peers}
        onPair={async () => {}}
        onVerify={onVerify}
        onReject={onReject}
      />,
    );
    const row = screen.getByText('654321').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Codes match' }));
    expect(onVerify).toHaveBeenCalledWith('PEER1');
  });
});
