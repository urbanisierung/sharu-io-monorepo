import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// root.tsx pulls in the runtime/wallet/share modules, which load the crypto +
// transport WASM that isn't built for the unit env. Stub those leaf modules so
// the routing logic under test imports without the WASM chain.
vi.mock('./runtime.js', () => ({ createRuntime: vi.fn() }));
vi.mock('./wallet.js', () => ({
  createWallet: vi.fn(),
  getWallet: vi.fn(),
  importWallet: vi.fn(),
  listWallets: vi.fn(async () => []),
  removeWallet: vi.fn(),
}));
vi.mock('./share-page.js', () => ({ ShareViewer: () => null }));

const { encodePairingCode } = await import('./pairing.js');
const { linkNode } = await import('./root.js');
const { route } = await import('./router.js');
const { activeView, resetAppView } = await import('./view-state.js');

const NODE_CODE = encodePairingCode({
  addr: { id: 'tport', relayUrl: 'https://relay.example/' },
  signId: 'NODESIGNID0123456789',
});

beforeEach(() => {
  resetAppView();
  route.value = 'link';
});

afterEach(() => {
  resetAppView();
  route.value = 'landing';
});

describe('linkNode (continuing from the /link onboarding view)', () => {
  it('lands on the Devices view so the node appears and this device’s code is copyable', () => {
    // Without this the operator drops onto Files and never sees the freshly
    // linked node or their own device code to send back to the CLI.
    expect(activeView.value).toBe('files');
    linkNode(NODE_CODE);
    expect(activeView.value).toBe('devices');
    expect(route.value).toBe('app');
  });
});
