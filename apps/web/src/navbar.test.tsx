import { signal } from '@preact/signals';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Navbar } from './navbar.js';
import { readingMode, resetReadingMode } from './reading-mode.js';
import type { Runtime } from './runtime.js';
import { activeView, resetAppView } from './view-state.js';

afterEach(() => {
  cleanup();
  resetReadingMode();
  resetAppView();
});

/** Navbar reads only the wallet name and sync status off the runtime. */
function fakeRuntime(sync: 'idle' | 'syncing' | 'error' = 'idle'): Runtime {
  return { walletName: 'Personal', syncStatus: signal(sync) } as unknown as Runtime;
}

describe('Navbar', () => {
  it('carries the reading-mode toggle on every surface', () => {
    render(<Navbar route="landing" runtime={null} onLaunch={() => {}} />);
    expect(screen.getByRole('toolbar', { name: 'Reading mode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Regular' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Machine' })).toBeTruthy();
  });

  it('re-voices its own labels when the reading mode changes', () => {
    render(<Navbar route="landing" runtime={null} onLaunch={() => {}} />);
    expect(screen.getByRole('button', { name: 'Read the whitepaper' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Machine' }));
    expect(readingMode.value).toBe('machine');
    expect(screen.getByRole('button', { name: 'whitepaper → read' })).toBeTruthy();
  });

  it('opens the app from the Launch control on marketing routes', () => {
    const onLaunch = vi.fn();
    render(<Navbar route="whitepaper" runtime={null} onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch the app' }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it('shows the wallet, sync status and section tabs in the unlocked app', () => {
    render(<Navbar route="app" runtime={fakeRuntime('syncing')} onLaunch={() => {}} />);
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByText('Syncing…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Files/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Devices/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Settings/ })).toBeTruthy();
  });

  it('selects a section from the tabs', () => {
    render(<Navbar route="app" runtime={fakeRuntime()} onLaunch={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Devices/ }));
    expect(activeView.value).toBe('devices');
  });

  it('drops the marketing links and tabs on the public share viewer', () => {
    render(<Navbar route="share" runtime={null} onLaunch={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Read the whitepaper' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Files/ })).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Reading mode' })).toBeTruthy();
  });
});
