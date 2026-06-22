import { describe, expect, it } from 'vitest';
import { qrSvgPath } from './qr.js';

describe('qrSvgPath', () => {
  it('produces a non-empty module grid and path for a value', () => {
    const { count, path } = qrSvgPath('https://safu.app/#pair=abc');
    expect(count).toBeGreaterThan(20); // a real QR has many modules per side
    expect(path.length).toBeGreaterThan(0);
    expect(path.startsWith('M')).toBe(true);
  });

  it('encodes different values into different paths', () => {
    expect(qrSvgPath('one').path).not.toBe(qrSvgPath('two').path);
  });
});
