import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDeviceNames, saveDeviceName } from './device-names.js';

beforeEach(() => globalThis.localStorage?.clear());
afterEach(() => globalThis.localStorage?.clear());

describe('device names', () => {
  it('starts empty and persists a saved name', () => {
    expect(loadDeviceNames()).toEqual({});
    saveDeviceName('peer-1', 'Mom’s phone');
    expect(loadDeviceNames()).toEqual({ 'peer-1': 'Mom’s phone' });
  });

  it('trims, and an empty name clears the label', () => {
    saveDeviceName('peer-1', '  Laptop  ');
    expect(loadDeviceNames()['peer-1']).toBe('Laptop');
    saveDeviceName('peer-1', '   ');
    expect(loadDeviceNames()['peer-1']).toBeUndefined();
  });
});
