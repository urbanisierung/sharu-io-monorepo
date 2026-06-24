import { describe, expect, it } from 'vitest';
import { decodeShareCode, encodeShareCode, readShareFromHash, shareLink } from './share-code.js';

const info = {
  root: 'cipheraddr',
  rootNonce: 'bm9uY2U',
  key: 'a2V5',
  peer: { id: 'node', relayUrl: 'https://relay/' },
};

describe('share code', () => {
  it('round-trips root, nonce, key, and peer', () => {
    expect(decodeShareCode(encodeShareCode(info))).toEqual(info);
  });

  it('round-trips without a relay URL', () => {
    const noRelay = { ...info, peer: { id: 'node' } };
    expect(decodeShareCode(encodeShareCode(noRelay))).toEqual(noRelay);
  });

  it('produces a URL-safe code', () => {
    expect(encodeShareCode(info)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a malformed code', () => {
    expect(() => decodeShareCode('!!nope!!')).toThrow();
  });

  it('rejects a code missing the key', () => {
    const payload = btoa(JSON.stringify({ root: 'r', rootNonce: 'n', id: 'node' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => decodeShareCode(payload)).toThrow(/missing key/);
  });
});

describe('share deep link', () => {
  it('builds a #share= link and reads the code back from the hash', () => {
    const link = shareLink('CODE-123', 'https://safu.app');
    expect(link).toBe('https://safu.app/s#share=CODE-123');
    expect(readShareFromHash(new URL(link).hash)).toBe('CODE-123');
  });

  it('returns undefined when no share code is present', () => {
    expect(readShareFromHash('#pair=other')).toBeUndefined();
  });
});
