import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeOnboarding } from './node-onboarding.js';
import { encodePairingCode } from './pairing.js';
import { resetReadingMode } from './reading-mode.js';

const NODE_CODE = encodePairingCode({
  addr: { id: 'tport', relayUrl: 'https://relay.example/' },
  signId: 'NODESIGNID0123456789',
});

function setHash(hash: string): void {
  window.location.hash = hash;
}

beforeEach(() => {
  resetReadingMode();
  setHash('');
});
afterEach(cleanup);

describe('NodeOnboarding', () => {
  it('shows the node identity and guided steps from a #node= deep link', () => {
    setHash(`#node=${encodeURIComponent(NODE_CODE)}`);
    render(<NodeOnboarding onContinue={() => {}} onCliDocs={() => {}} />);
    expect(screen.getByRole('heading', { name: /Link your backup node/i })).toBeTruthy();
    expect(screen.getByText(/NODESIGNID/)).toBeTruthy();
    expect(screen.getByText('https://relay.example/')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /safety number/i })).toBeTruthy();
  });

  it('hands the raw node code to onContinue', () => {
    setHash(`#node=${encodeURIComponent(NODE_CODE)}`);
    const onContinue = vi.fn();
    render(<NodeOnboarding onContinue={onContinue} onCliDocs={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Open Sharu and link this node/i }));
    expect(onContinue).toHaveBeenCalledWith(NODE_CODE);
  });

  it('falls back to guidance + docs CTA when the link carries no node code', () => {
    setHash('#nonsense=1');
    const onCliDocs = vi.fn();
    render(<NodeOnboarding onContinue={() => {}} onCliDocs={onCliDocs} />);
    expect(screen.getByText(/No node code in this link/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /backup-node docs/i }));
    expect(onCliDocs).toHaveBeenCalled();
  });

  it('treats a malformed node code as no code', () => {
    setHash('#node=not-valid-base64url!!');
    render(<NodeOnboarding onContinue={() => {}} onCliDocs={() => {}} />);
    expect(screen.getByText(/No node code in this link/i)).toBeTruthy();
  });
});
