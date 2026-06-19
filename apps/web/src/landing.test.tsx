import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './landing.js';

afterEach(cleanup);

describe('Landing', () => {
  it('explains what Sharu is, the problem, and how it works', () => {
    render(<Landing onLaunch={() => {}} />);
    expect(screen.getByText('Your data. Your devices. Nobody else.')).toBeTruthy();
    expect(screen.getByText('The problem')).toBeTruthy();
    expect(screen.getByText('How it works')).toBeTruthy();
    expect(screen.getByText(/Encrypt on device/)).toBeTruthy();
    expect(screen.getByText('Zero-knowledge')).toBeTruthy();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<Landing onLaunch={onLaunch} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Launch the app' })[0] as HTMLElement);
    expect(onLaunch).toHaveBeenCalledOnce();
  });
});
