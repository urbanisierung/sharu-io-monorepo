import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url } from './base64url.js';

describe('base64url bytes codec', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63]);
    expect([...base64UrlToBytes(bytesToBase64Url(bytes))]).toEqual([...bytes]);
  });

  it('round-trips an empty array', () => {
    expect(bytesToBase64Url(new Uint8Array(0))).toBe('');
    expect(base64UrlToBytes('')).toEqual(new Uint8Array(0));
  });

  it('produces URL-safe output (no +, /, or =)', () => {
    const out = bytesToBase64Url(new Uint8Array([251, 255, 191]));
    expect(out).toMatch(/^[A-Za-z0-9_-]*$/);
  });

  it('rejects non-base64url input', () => {
    expect(() => base64UrlToBytes('not/valid+')).toThrow();
  });
});
