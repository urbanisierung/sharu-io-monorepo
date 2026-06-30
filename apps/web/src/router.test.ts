import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigate, pathOf, route, routeOf } from './router.js';

afterEach(() => {
  route.value = 'landing';
  vi.restoreAllMocks();
});

describe('router', () => {
  it('maps known paths to views', () => {
    expect(routeOf('/')).toBe('landing');
    expect(routeOf('/whitepaper')).toBe('whitepaper');
    expect(routeOf('/comparison')).toBe('comparison');
    expect(routeOf('/how-it-works')).toBe('how-it-works');
    expect(routeOf('/cli-docs')).toBe('cli-docs');
    expect(routeOf('/link')).toBe('link');
    expect(routeOf('/app')).toBe('app');
    expect(routeOf('/app/anything')).toBe('app');
    expect(routeOf('/s')).toBe('share');
  });

  it('keeps the old /flow path as an alias of how-it-works', () => {
    expect(routeOf('/flow')).toBe('how-it-works');
  });

  it('falls back to the landing page for unknown paths', () => {
    expect(routeOf('/nope')).toBe('landing');
  });

  it('round-trips a view to its canonical path', () => {
    expect(pathOf('landing')).toBe('/');
    expect(pathOf('whitepaper')).toBe('/whitepaper');
    expect(pathOf('comparison')).toBe('/comparison');
    expect(pathOf('how-it-works')).toBe('/how-it-works');
    expect(pathOf('cli-docs')).toBe('/cli-docs');
    expect(pathOf('link')).toBe('/link');
    expect(routeOf(pathOf('link'))).toBe('link');
    expect(pathOf('app')).toBe('/app');
    expect(pathOf('share')).toBe('/s');
    expect(routeOf(pathOf('app'))).toBe('app');
    expect(routeOf(pathOf('how-it-works'))).toBe('how-it-works');
    expect(routeOf(pathOf('share'))).toBe('share');
  });

  it('scrolls to the top when navigating to a different view', () => {
    const scrollTo = vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {});
    navigate('whitepaper');
    expect(route.value).toBe('whitepaper');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it('does not scroll when the view is unchanged', () => {
    navigate('comparison');
    const scrollTo = vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {});
    navigate('comparison');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
