import { describe, expect, it } from 'vitest';
import {
  decodePairingCode,
  encodePairingCode,
  nodeLink,
  pairingLink,
  readNodeFromHash,
  readPairingFromHash,
} from './pairing.js';

describe('pairing code', () => {
  it('round-trips the dial address and the signing identity', () => {
    const info = { addr: { id: 'tport', relayUrl: 'https://relay/' }, signId: 'deadbeef' };
    expect(decodePairingCode(encodePairingCode(info))).toEqual(info);
  });

  it('round-trips without a relay URL', () => {
    const info = { addr: { id: 'tport' }, signId: 'abc' };
    expect(decodePairingCode(encodePairingCode(info))).toEqual(info);
  });

  it('produces a URL-safe code', () => {
    const code = encodePairingCode({ addr: { id: 'a', relayUrl: 'https://r/?x=1' }, signId: 'f0' });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a malformed code', () => {
    expect(() => decodePairingCode('!!nope!!')).toThrow();
  });

  it('rejects a code missing the signing id', () => {
    const payload = btoa(JSON.stringify({ id: 'tport' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => decodePairingCode(payload)).toThrow();
  });
});

describe('pairing deep link', () => {
  it('builds a #pair= link and reads the code back from the hash', () => {
    const link = pairingLink('CODE-123', 'https://safu.app');
    expect(link).toBe('https://safu.app/app#pair=CODE-123');
    expect(readPairingFromHash(new URL(link).hash)).toBe('CODE-123');
  });

  it('round-trips codes that need URL-encoding', () => {
    const code = 'a b/c+d';
    const hash = new URL(pairingLink(code, 'https://x')).hash;
    expect(readPairingFromHash(hash)).toBe(code);
  });

  it('returns undefined when no pair param is present', () => {
    expect(readPairingFromHash('#other=1')).toBeUndefined();
    expect(readPairingFromHash('')).toBeUndefined();
  });
});

describe('node deep link', () => {
  it('builds a /link#node= link and reads the code back from the hash', () => {
    const link = nodeLink('CODE-123', 'https://safu.app');
    expect(link).toBe('https://safu.app/link#node=CODE-123');
    expect(readNodeFromHash(new URL(link).hash)).toBe('CODE-123');
  });

  it('keeps #node= and #pair= distinct so the node link lands on the guided view', () => {
    expect(readNodeFromHash('#pair=ABC')).toBeUndefined();
    expect(readPairingFromHash('#node=ABC')).toBeUndefined();
    expect(readNodeFromHash('#node=ABC')).toBe('ABC');
  });

  it('round-trips codes that need URL-encoding', () => {
    const code = 'a b/c+d';
    const hash = new URL(nodeLink(code, 'https://x')).hash;
    expect(readNodeFromHash(hash)).toBe(code);
  });
});
