import { describe, expect, it } from 'vitest';
import { dialPlan } from './iroh.js';

// R2.1: the IrohTransport dials the known relay first, then falls back to an
// id-only attempt so the configured discovery can recover a stale/changed
// address. `dialPlan` is the pure ordering that drives that fallback loop.
describe('dialPlan', () => {
  it('tries the known relay first, then id-only (discovery fallback)', () => {
    expect(dialPlan({ id: 'peer-a', relayUrl: 'https://relay.example.com' })).toEqual([
      'https://relay.example.com',
      '',
    ]);
  });

  it('goes straight to id-only when no relay is known', () => {
    expect(dialPlan({ id: 'peer-a' })).toEqual(['']);
  });
});
