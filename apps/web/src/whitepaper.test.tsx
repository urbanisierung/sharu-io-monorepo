import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Whitepaper } from './whitepaper.js';

afterEach(cleanup);

describe('Whitepaper', () => {
  it('describes how the app works, section by section', () => {
    render(<Whitepaper onBack={() => {}} onLaunch={() => {}} />);
    expect(screen.getByText('Sharu Whitepaper')).toBeTruthy();
    expect(screen.getByText('Abstract')).toBeTruthy();
    expect(screen.getByText('Threat model')).toBeTruthy();
    expect(screen.getByText('Encryption & chunking')).toBeTruthy();
    expect(screen.getByText('Peer-to-peer sync')).toBeTruthy();
    expect(screen.getByText('Content addressing')).toBeTruthy();
  });

  it('returns to the landing page from the back control', () => {
    const onBack = vi.fn();
    render(<Whitepaper onBack={onBack} onLaunch={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<Whitepaper onBack={() => {}} onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch the app' }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });
});
