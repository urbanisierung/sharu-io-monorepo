import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowPage } from './flow.js';
import { readingMode, resetReadingMode } from './reading-mode.js';

afterEach(() => {
  cleanup();
  resetReadingMode();
});

describe('FlowPage', () => {
  it('walks through the interaction between participants', () => {
    render(<FlowPage onLaunch={() => {}} />);
    expect(screen.getByText('Watch your devices talk.')).toBeTruthy();
    expect(screen.getByText('The interaction')).toBeTruthy();
    // Every participant in the conversation is named.
    expect(screen.getByText('Laptop')).toBeTruthy();
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('Iroh relay')).toBeTruthy();
    expect(screen.getByText('Backup node')).toBeTruthy();
  });

  it('lists the tech stack that powers each step', () => {
    render(<FlowPage onLaunch={() => {}} />);
    expect(screen.getByText('Tech stack')).toBeTruthy();
    expect(screen.getByText('BLAKE3')).toBeTruthy();
    expect(screen.getByText('AES-256-GCM')).toBeTruthy();
  });

  it('links each technology to its canonical home', () => {
    render(<FlowPage onLaunch={() => {}} />);
    const iroh = screen.getByRole('link', { name: 'Iroh (QUIC)' });
    expect(iroh.getAttribute('href')).toBe('https://www.iroh.computer');
    const cascivo = screen.getByRole('link', { name: 'Cascivo Flow' });
    expect(cascivo.getAttribute('href')).toBe('https://docs.cascivo.com/flow');
  });

  it('explains how everything ties back to a wallet', () => {
    render(<FlowPage onLaunch={() => {}} />);
    expect(screen.getByText('Around the wallet')).toBeTruthy();
    expect(screen.getByText('A wallet is your vault')).toBeTruthy();
  });

  it('retells the same structure at different depths as the reading mode changes', () => {
    const page = () => <FlowPage onLaunch={() => {}} />;
    const { rerender } = render(page());
    // Regular is the default.
    expect(screen.getByText('Watch your devices talk.')).toBeTruthy();

    // The global reading-mode signal (the navbar's toggle writes it) re-voices
    // the page over one shared structure.
    readingMode.value = 'eli5';
    rerender(page());
    expect(screen.getByText('How it works, the easy way.')).toBeTruthy();
    expect(screen.getByText('A box for your stuff')).toBeTruthy();

    readingMode.value = 'machine';
    rerender(page());
    expect(screen.getByText('peers=4 · trust=0 · payload=ciphertext')).toBeTruthy();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<FlowPage onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch the app' }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });
});
