import { defineMessages } from '@cascivo/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { readingMode, registerVariants, resetReadingMode, tr } from './reading-mode.js';

const base = defineMessages('test.base', { greeting: 'Hello there', count: 'Items: {count}' });
const eli5 = defineMessages('test.base.eli5', { greeting: 'Hi!', count: 'Toys: {count}' });
const machine = defineMessages('test.base.machine', { greeting: 'greeting=1', count: 'n={count}' });
const unregistered = defineMessages('test.solo', { only: 'Only one' });

registerVariants(base, eli5, machine);
afterEach(resetReadingMode);

describe('tr', () => {
  it('translates the regular voice by default', () => {
    expect(tr(base.greeting)).toBe('Hello there');
  });

  it('swaps in the active mode variant', () => {
    readingMode.value = 'eli5';
    expect(tr(base.greeting)).toBe('Hi!');
    readingMode.value = 'machine';
    expect(tr(base.greeting)).toBe('greeting=1');
  });

  it('keeps placeholder substitution across voices', () => {
    readingMode.value = 'eli5';
    expect(tr(base.count, { count: 3 })).toBe('Toys: 3');
  });

  it('falls back to the given message when no variant is registered', () => {
    readingMode.value = 'machine';
    expect(tr(unregistered.only)).toBe('Only one');
  });
});
