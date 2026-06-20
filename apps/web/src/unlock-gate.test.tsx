import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetUnlockGate, UnlockGate } from './unlock-gate.js';

beforeEach(resetUnlockGate);
afterEach(cleanup);

describe('UnlockGate (create mode)', () => {
  it('refuses to create until the two passwords match', () => {
    const onUnlock = vi.fn();
    render(<UnlockGate returning={false} onUnlock={onUnlock} />);

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } });
    fireEvent.input(screen.getByLabelText('Repeat password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create password' }));

    expect(onUnlock).not.toHaveBeenCalled();
    expect(screen.getByText(/don’t match/)).toBeTruthy();
  });

  it('refuses a too-short password', () => {
    const onUnlock = vi.fn();
    render(<UnlockGate returning={false} onUnlock={onUnlock} />);
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.input(screen.getByLabelText('Repeat password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create password' }));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 8/)).toBeTruthy();
  });

  it('creates with a valid, matching password and warns it cannot be reset', () => {
    const onUnlock = vi.fn();
    render(<UnlockGate returning={false} onUnlock={onUnlock} />);
    expect(screen.getByText(/only key/)).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } });
    fireEvent.input(screen.getByLabelText('Repeat password'), {
      target: { value: 'correcthorse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create password' }));
    expect(onUnlock).toHaveBeenCalledWith('correcthorse');
  });

  it('toggles password visibility', () => {
    render(<UnlockGate returning={false} onUnlock={() => {}} />);
    const field = screen.getByLabelText('Password') as HTMLInputElement;
    expect(field.type).toBe('password');
    fireEvent.click(screen.getByLabelText('Show password'));
    expect(field.type).toBe('text');
  });
});

describe('UnlockGate (returning mode)', () => {
  it('asks for the password once and unlocks', () => {
    const onUnlock = vi.fn();
    render(<UnlockGate returning onUnlock={onUnlock} />);
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.queryByLabelText('Repeat password')).toBeNull();

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(onUnlock).toHaveBeenCalledWith('correcthorse');
  });
});
