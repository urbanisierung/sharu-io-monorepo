import { afterEach, describe, expect, it } from 'vitest';
import { loadShareHost, saveShareHost } from './share-host.js';

afterEach(() => globalThis.localStorage?.clear());

describe('share host', () => {
  it('is undefined until chosen, then round-trips per wallet', () => {
    expect(loadShareHost('w1')).toBeUndefined();
    saveShareHost('w1', 'node-sign-id');
    expect(loadShareHost('w1')).toBe('node-sign-id');
    expect(loadShareHost('w2')).toBeUndefined();
  });

  it('overwrites a previous choice', () => {
    saveShareHost('w1', 'node-a');
    saveShareHost('w1', 'node-b');
    expect(loadShareHost('w1')).toBe('node-b');
  });
});
