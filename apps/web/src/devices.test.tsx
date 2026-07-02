import { signal } from '@preact/signals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Devices, maskCode, resetDevicesView } from './devices.js';
import { encodePairingCode } from './pairing.js';
import type { PeerInfo } from './runtime.js';

const code = signal('LINKCODE');
const noPeers = signal<readonly PeerInfo[]>([]);

beforeEach(resetDevicesView);
afterEach(cleanup);

/** Open a device row in the Manage table to reveal its details + actions. The
 *  row's expand toggle is the device-name button (the chevron is aria-hidden). */
function expandRow(name = 'Unnamed device'): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('maskCode', () => {
  it('shows only the first and last characters with an ellipsis between', () => {
    expect(maskCode('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('ABCDEF…UVWXYZ');
  });

  it('leaves short codes untouched', () => {
    expect(maskCode('SHORT')).toBe('SHORT');
  });
});

describe('Devices', () => {
  it('shows a scannable QR for this device’s link', () => {
    render(<Devices connectionCode={code} peers={noPeers} onPair={async () => {}} />);
    expect(screen.getByRole('img', { name: /link another device/i })).toBeTruthy();
  });

  it('copies the raw connection code (not the URL) with Copy code', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Devices connectionCode={code} peers={noPeers} onPair={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('LINKCODE');
  });

  it('groups the page into Share, Link and Manage sections', () => {
    const peers = signal<readonly PeerInfo[]>([{ id: 'PEER1', sas: '123456', status: 'verified' }]);
    render(<Devices connectionCode={code} peers={peers} onPair={async () => {}} />);
    expect(screen.getByRole('heading', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Link' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Manage' })).toBeTruthy();
  });

  it('masks this device’s link code instead of rendering it in full', () => {
    const longCode = signal('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    render(<Devices connectionCode={longCode} peers={noPeers} onPair={async () => {}} />);
    expect(screen.getByText('ABCDEF…UVWXYZ')).toBeTruthy();
    expect(screen.queryByText('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBeNull();
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

    expandRow();
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
    expandRow();
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
    expandRow();
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

  it('renders a "This device" card with the decoded signing id, transport and relay', () => {
    const realCode = signal(
      encodePairingCode({
        addr: { id: 'TRANSPORT-ID', relayUrl: 'https://relay.example' },
        signId: 'SIGNING-ID',
      }),
    );
    render(<Devices connectionCode={realCode} peers={noPeers} onPair={async () => {}} />);
    const card = screen.getByRole('heading', { name: 'This device' }).closest('article');
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByText('SIGNING-ID')).toBeTruthy();
    expect(within(card as HTMLElement).getByText('TRANSPORT-ID')).toBeTruthy();
    expect(within(card as HTMLElement).getByText('https://relay.example')).toBeTruthy();
  });

  it('omits the "This device" card when the connection code is not yet derivable', () => {
    render(<Devices connectionCode={signal('')} peers={noPeers} onPair={async () => {}} />);
    expect(screen.queryByRole('heading', { name: 'This device' })).toBeNull();
  });

  it('shows a linked peer’s transport address and relay when known', () => {
    const peers = signal<readonly PeerInfo[]>([
      {
        id: 'PEER-FULL-ID',
        sas: '123456',
        status: 'verified',
        addr: { id: 'PEER-TRANSPORT', relayUrl: 'https://peer-relay.example' },
      },
    ]);
    render(<Devices connectionCode={code} peers={peers} onPair={async () => {}} />);
    expandRow();
    expect(screen.getByText('PEER-TRANSPORT')).toBeTruthy();
    expect(screen.getByText('https://peer-relay.example')).toBeTruthy();
  });

  it('falls back to a "no relay yet" note for a peer with no remembered relay', () => {
    const peers = signal<readonly PeerInfo[]>([
      { id: 'PEER1', sas: '123456', status: 'verified', addr: { id: 'PEER-TRANSPORT' } },
    ]);
    render(<Devices connectionCode={code} peers={peers} onPair={async () => {}} />);
    expandRow();
    expect(screen.getByText('Not connected to a relay yet')).toBeTruthy();
  });

  it('shows when a device was linked', () => {
    const peers = signal<readonly PeerInfo[]>([
      // 2024-01-15T00:00:00Z — formatDate renders UTC, so this is deterministic.
      { id: 'PEER1', sas: '123456', status: 'verified', linkedAt: 1705276800000 },
    ]);
    render(<Devices connectionCode={code} peers={peers} onPair={async () => {}} />);
    expect(screen.getByText('Jan 15, 2024')).toBeTruthy();
  });

  it('keeps device details collapsed until the row is expanded', () => {
    const peers = signal<readonly PeerInfo[]>([
      { id: 'PEER-FULL-ID', sas: '123456', status: 'verified', linkedAt: 1705276800000 },
    ]);
    render(<Devices connectionCode={code} peers={peers} onPair={async () => {}} />);
    // The overview row shows name + linked date, but not the safety number or id.
    expect(screen.getByText('Jan 15, 2024')).toBeTruthy();
    expect(screen.queryByText('123456')).toBeNull();
    expect(screen.queryByText('PEER-FULL-ID')).toBeNull();

    expandRow();
    expect(screen.getByText('123456')).toBeTruthy();
    expect(screen.getByText('PEER-FULL-ID')).toBeTruthy();
  });

  it('removes a linked device after a confirmation step', () => {
    const onRemove = vi.fn();
    const peers = signal<readonly PeerInfo[]>([{ id: 'PEER1', sas: '123456', status: 'verified' }]);
    render(
      <Devices connectionCode={code} peers={peers} onPair={async () => {}} onRemove={onRemove} />,
    );
    expandRow();
    // First click asks to confirm — it must not remove yet.
    fireEvent.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }));
    expect(onRemove).toHaveBeenCalledWith('PEER1');
  });

  it('offers no Remove action for an already-removed (rejected) device', () => {
    const peers = signal<readonly PeerInfo[]>([{ id: 'PEER1', sas: '123456', status: 'rejected' }]);
    render(
      <Devices connectionCode={code} peers={peers} onPair={async () => {}} onRemove={vi.fn()} />,
    );
    expandRow();
    expect(screen.queryByRole('button', { name: 'Remove device' })).toBeNull();
  });

  it('opens a focused backup-node onboarding view showing this device’s full code', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Devices connectionCode={code} peers={noPeers} onPair={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Onboard a backup node' }));

    // The heading switches to the guided flow, and the device code is shown in
    // full (not masked) so it can be pasted at the CLI's "Device code:" prompt.
    expect(screen.getByRole('heading', { name: 'Onboard a backup node' })).toBeTruthy();
    expect(screen.getByText('LINKCODE')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('LINKCODE');
  });

  it('surfaces a pending node’s safety number prominently in the onboarding view', () => {
    const onVerify = vi.fn();
    const peers = signal<readonly PeerInfo[]>([{ id: 'NODE1', sas: '424242', status: 'pending' }]);
    render(
      <Devices
        connectionCode={code}
        peers={peers}
        onPair={async () => {}}
        onVerify={onVerify}
        onReject={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Onboard a backup node' }));
    // The safety number is visible straight away — no row to expand.
    expect(screen.getByText('424242')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Codes match' }));
    expect(onVerify).toHaveBeenCalledWith('NODE1');
  });

  it('returns from the onboarding view to the normal Devices layout', () => {
    render(<Devices connectionCode={code} peers={noPeers} onPair={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Onboard a backup node' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to devices/ }));
    expect(screen.getByRole('heading', { name: 'Share' })).toBeTruthy();
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
    expandRow();
    // The safety number is revealed in the expanded detail panel.
    expect(screen.getByText('654321')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Codes match' }));
    expect(onVerify).toHaveBeenCalledWith('PEER1');
  });
});
