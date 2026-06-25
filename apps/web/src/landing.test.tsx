import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './landing.js';

afterEach(cleanup);

function renderLanding(overrides: Partial<Parameters<typeof Landing>[0]> = {}) {
  render(
    <Landing
      onLaunch={() => {}}
      onWhitepaper={() => {}}
      onComparison={() => {}}
      onFlow={() => {}}
      onCliDocs={() => {}}
      {...overrides}
    />,
  );
}

describe('Landing', () => {
  it('explains what Sharu is, the problem, and how it works', () => {
    renderLanding();
    expect(screen.getByText('Your data.')).toBeTruthy();
    expect(screen.getByText('Nobody else.')).toBeTruthy();
    expect(screen.getByText('The problem')).toBeTruthy();
    // "How it works" now appears twice: the section kicker and the hero link.
    expect(screen.getAllByText('How it works').length).toBeGreaterThan(0);
    expect(screen.getByText(/Encrypt on device/)).toBeTruthy();
    expect(screen.getByText('Zero-knowledge')).toBeTruthy();
  });

  it('offers the always-on backup node with a one-line install', () => {
    renderLanding();
    expect(screen.getByText('Backup node')).toBeTruthy();
    expect(screen.getByText(/install\.sh \| sh$/)).toBeTruthy();
  });

  it('opens the backup-node docs from its section', () => {
    const onCliDocs = vi.fn();
    renderLanding({ onCliDocs });
    fireEvent.click(screen.getByRole('button', { name: 'Read the backup-node docs' }));
    expect(onCliDocs).toHaveBeenCalledOnce();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    renderLanding({ onLaunch });
    fireEvent.click(screen.getAllByRole('button', { name: 'Launch the app' })[0] as HTMLElement);
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it('opens the whitepaper from the hero link', () => {
    const onWhitepaper = vi.fn();
    renderLanding({ onWhitepaper });
    fireEvent.click(screen.getByRole('button', { name: 'Read the whitepaper' }));
    expect(onWhitepaper).toHaveBeenCalledOnce();
  });

  it('opens the IPFS-vs-Iroh comparison from the hero link', () => {
    const onComparison = vi.fn();
    renderLanding({ onComparison });
    fireEvent.click(screen.getByRole('button', { name: 'IPFS vs. Iroh' }));
    expect(onComparison).toHaveBeenCalledOnce();
  });

  it('opens the interaction walkthrough from the hero link', () => {
    const onFlow = vi.fn();
    renderLanding({ onFlow });
    fireEvent.click(screen.getByRole('button', { name: 'How it works' }));
    expect(onFlow).toHaveBeenCalledOnce();
  });
});
