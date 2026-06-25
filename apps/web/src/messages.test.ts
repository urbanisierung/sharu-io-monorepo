import type { Message } from '@cascivo/i18n';
import { describe, expect, it } from 'vitest';
import * as m from './messages.js';

type Namespace = Record<string, Message>;

// Every reading-mode triple must share the same keys, and each key must carry
// the same `{placeholder}` tokens in all three voices — otherwise `t(m.x, {…})`
// would substitute nothing in a variant that dropped the token.
const TRIPLES: Record<string, [Namespace, Namespace, Namespace]> = {
  landing: [m.landing, m.landingEli5, m.landingMachine],
  whitepaper: [m.whitepaper, m.whitepaperEli5, m.whitepaperMachine],
  comparison: [m.comparison, m.comparisonEli5, m.comparisonMachine],
  cliDocs: [m.cliDocs, m.cliDocsEli5, m.cliDocsMachine],
  flow: [m.flow, m.flowEli5, m.flowMachine],
  share: [m.shareView, m.shareViewEli5, m.shareViewMachine],
  app: [m.messages, m.messagesEli5, m.messagesMachine],
};

const placeholders = (value: string): string =>
  [...value.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');

describe('reading-mode message parity', () => {
  for (const [name, [regular, eli5, machine]] of Object.entries(TRIPLES)) {
    it(`${name}: variants share the regular keyset`, () => {
      const keys = Object.keys(regular).sort();
      expect(Object.keys(eli5).sort()).toEqual(keys);
      expect(Object.keys(machine).sort()).toEqual(keys);
    });

    it(`${name}: variants preserve every placeholder`, () => {
      for (const [key, message] of Object.entries(regular)) {
        const want = placeholders(message.value as string);
        expect(placeholders((eli5[key] as Message).value as string), `${name}.${key} (eli5)`).toBe(
          want,
        );
        expect(
          placeholders((machine[key] as Message).value as string),
          `${name}.${key} (machine)`,
        ).toBe(want);
      }
    });
  }
});
