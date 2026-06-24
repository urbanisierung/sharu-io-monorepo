import { describe, expect, it } from 'vitest';
import { resolveSitePath, siteBase } from './site-mount.js';

describe('site path resolution', () => {
  it('prefixes a site id into an origin-absolute base', () => {
    expect(siteBase('abc123')).toBe('/s/abc123/');
  });

  it('maps the root and directory paths to the index document', () => {
    expect(resolveSitePath('', 'index.html')).toBe('index.html');
    expect(resolveSitePath('docs/', 'index.html')).toBe('docs/index.html');
  });

  it('leaves a concrete file path unchanged', () => {
    expect(resolveSitePath('style.css', 'index.html')).toBe('style.css');
    expect(resolveSitePath('assets/app.js', 'index.html')).toBe('assets/app.js');
  });
});
