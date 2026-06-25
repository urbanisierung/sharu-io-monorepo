import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Comparison } from './comparison.js';

afterEach(cleanup);

describe('Comparison', () => {
  it('contrasts the IPFS and Iroh approaches across the page', () => {
    render(<Comparison onLaunch={() => {}} />);
    expect(screen.getByText('IPFS vs. Iroh')).toBeTruthy();
    expect(screen.getByText('Original (IPFS)')).toBeTruthy();
    expect(screen.getByText('Project Safu (Iroh)')).toBeTruthy();
    // Both sides get advantages and disadvantages...
    expect(screen.getByText('IPFS · the case for')).toBeTruthy();
    expect(screen.getByText('IPFS · the cost')).toBeTruthy();
    expect(screen.getByText('Iroh · the case for')).toBeTruthy();
    expect(screen.getByText('Iroh · the trade-offs')).toBeTruthy();
    // ...and the page states why the new system is built this way.
    expect(screen.getByText('Why Sharu is built this way.')).toBeTruthy();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<Comparison onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch the app' }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });
});
