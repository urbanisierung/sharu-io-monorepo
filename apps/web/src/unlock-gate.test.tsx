import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetUnlockGate, UnlockGate } from './unlock-gate.js';

beforeEach(resetUnlockGate);
afterEach(cleanup);

describe('UnlockGate (create mode)', () => {
  it('refuses to create until the two passwords match', () => {
    const onSubmit = vi.fn();
    render(<UnlockGate mode="create" onSubmit={onSubmit} />);

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } });
    fireEvent.input(screen.getByLabelText('Repeat password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/don’t match/)).toBeTruthy();
  });

  it('refuses a too-short password', () => {
    const onSubmit = vi.fn();
    render(<UnlockGate mode="create" onSubmit={onSubmit} />);
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.input(screen.getByLabelText('Repeat password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 8/)).toBeTruthy();
  });

  it('creates with a valid password and passes the wallet name', () => {
    const onSubmit = vi.fn();
    render(<UnlockGate mode="create" onSubmit={onSubmit} />);
    expect(screen.getByText(/only key/)).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Wallet name'), { target: { value: 'Work' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } });
    fireEvent.input(screen.getByLabelText('Repeat password'), {
      target: { value: 'correcthorse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
    expect(onSubmit).toHaveBeenCalledWith('correcthorse', 'Work');
  });

  it('shows the linking copy when arriving from a pairing URL', () => {
    render(<UnlockGate mode="create" pairing onSubmit={() => {}} />);
    expect(screen.getByText('Link this device')).toBeTruthy();
    expect(screen.getByText(/same password/)).toBeTruthy();
  });

  it('toggles password visibility', () => {
    render(<UnlockGate mode="create" onSubmit={() => {}} />);
    const field = screen.getByLabelText('Password') as HTMLInputElement;
    expect(field.type).toBe('password');
    fireEvent.click(screen.getByLabelText('Show password'));
    expect(field.type).toBe('text');
  });
});

describe('UnlockGate (unlock mode)', () => {
  it('greets a returning wallet by name and unlocks', () => {
    const onSubmit = vi.fn();
    render(<UnlockGate mode="unlock" walletName="Personal" onSubmit={onSubmit} />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.queryByLabelText('Repeat password')).toBeNull();

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(onSubmit).toHaveBeenCalledWith('correcthorse', '');
  });

  it('shows a clear message when the password is wrong for this wallet', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('wrong-password'));
    render(<UnlockGate mode="unlock" onSubmit={onSubmit} />);
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrongguess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/doesn’t match/)).toBeTruthy();
  });

  it('offers a way back to the wallet picker', () => {
    const onBack = vi.fn();
    render(<UnlockGate mode="unlock" walletName="Personal" onSubmit={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different wallet' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
