import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './landing.js';

afterEach(cleanup);

describe('Landing', () => {
  it('explains what Sharu is, the problem, and how it works', () => {
    render(<Landing onLaunch={() => {}} onWhitepaper={() => {}} onFlow={() => {}} />);
    expect(screen.getByText('Your data.')).toBeTruthy();
    expect(screen.getByText('Nobody else.')).toBeTruthy();
    expect(screen.getByText('The problem')).toBeTruthy();
    expect(screen.getByText('How it works')).toBeTruthy();
    expect(screen.getByText(/Encrypt on device/)).toBeTruthy();
    expect(screen.getByText('Zero-knowledge')).toBeTruthy();
  });

  it('offers the always-on backup node with a one-line install', () => {
    render(<Landing onLaunch={() => {}} onWhitepaper={() => {}} onFlow={() => {}} />);
    expect(screen.getByText('Backup node')).toBeTruthy();
    expect(screen.getByText(/install\.sh \| sh$/)).toBeTruthy();
    const docs = screen.getByRole('link', { name: 'Read the backup-node docs' });
    expect(docs.getAttribute('href')).toContain('crates/safu-node');
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<Landing onLaunch={onLaunch} onWhitepaper={() => {}} onFlow={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Launch the app' })[0] as HTMLElement);
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it('opens the whitepaper from the hero link', () => {
    const onWhitepaper = vi.fn();
    render(<Landing onLaunch={() => {}} onWhitepaper={onWhitepaper} onFlow={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read the whitepaper' }));
    expect(onWhitepaper).toHaveBeenCalledOnce();
  });

  it('opens the interaction walkthrough from the hero link', () => {
    const onFlow = vi.fn();
    render(<Landing onLaunch={() => {}} onWhitepaper={() => {}} onFlow={onFlow} />);
    fireEvent.click(screen.getByRole('button', { name: 'Watch the data flow' }));
    expect(onFlow).toHaveBeenCalledOnce();
  });
});
