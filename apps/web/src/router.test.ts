import { describe, expect, it } from 'vitest';
import { pathOf, routeOf } from './router.js';

describe('router', () => {
  it('maps known paths to views', () => {
    expect(routeOf('/')).toBe('landing');
    expect(routeOf('/whitepaper')).toBe('whitepaper');
    expect(routeOf('/app')).toBe('app');
    expect(routeOf('/app/anything')).toBe('app');
  });

  it('falls back to the landing page for unknown paths', () => {
    expect(routeOf('/nope')).toBe('landing');
  });

  it('round-trips a view to its canonical path', () => {
    expect(pathOf('landing')).toBe('/');
    expect(pathOf('whitepaper')).toBe('/whitepaper');
    expect(pathOf('app')).toBe('/app');
    expect(routeOf(pathOf('app'))).toBe('app');
  });
});
