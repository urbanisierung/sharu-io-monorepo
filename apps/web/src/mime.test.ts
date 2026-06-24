import { describe, expect, it } from 'vitest';
import { mimeOf } from './mime.js';

describe('mimeOf', () => {
  it('maps common web extensions, case-insensitively', () => {
    expect(mimeOf('index.html')).toBe('text/html');
    expect(mimeOf('css/app.CSS')).toBe('text/css');
    expect(mimeOf('app.js')).toBe('text/javascript');
    expect(mimeOf('logo.png')).toBe('image/png');
    expect(mimeOf('photo.JPEG')).toBe('image/jpeg');
  });

  it('falls back to a binary type for unknown or extensionless paths', () => {
    expect(mimeOf('data.bin')).toBe('application/octet-stream');
    expect(mimeOf('LICENSE')).toBe('application/octet-stream');
  });
});
