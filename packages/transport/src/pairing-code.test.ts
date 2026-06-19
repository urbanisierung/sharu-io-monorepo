import { describe, expect, it } from 'vitest';
import { decodePeerAddr, encodePeerAddr } from './pairing-code.js';

describe('pairing code', () => {
  it('round-trips a peer address through a compact code', () => {
    const addr = { id: 'abc123z', relayUrl: 'https://relay.n0.example/' };
    expect(decodePeerAddr(encodePeerAddr(addr))).toEqual(addr);
  });

  it('round-trips an address without a relay URL', () => {
    const addr = { id: 'soloPeer' };
    expect(decodePeerAddr(encodePeerAddr(addr))).toEqual(addr);
  });

  it('produces a URL-safe code (no +, /, or = padding)', () => {
    const code = encodePeerAddr({ id: 'a'.repeat(40), relayUrl: 'https://r/?x=1&y=2' });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a malformed code', () => {
    expect(() => decodePeerAddr('not!base64!!')).toThrow();
  });

  it('rejects a code whose payload lacks a string id', () => {
    // Valid base64url, but the decoded object has no string `id`.
    const payload = btoa(JSON.stringify({ relayUrl: 'https://r/' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => decodePeerAddr(payload)).toThrow();
  });
});
