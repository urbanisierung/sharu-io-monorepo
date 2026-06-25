// Reading mode — the app-wide explanation depth (regular / ELI5 / machine). One
// shared signal drives every page: the navbar's toggle writes it, and components
// render their copy through `tr` instead of `t`. `tr` looks up the active mode's
// variant of a message by key and translates it, falling back to the given
// message when no variant is registered — so switching to `tr` is the only
// call-site change, and module-level message tables need no restructuring.
// View state, so it lives in @preact/signals — the SDK never sees it.
import { type Message, t } from '@cascivo/i18n';
import { signal } from '@preact/signals';

export type Mode = 'regular' | 'eli5' | 'machine';

/** The active reading mode. Read in render via `tr`; written by the navbar. */
export const readingMode = signal<Mode>('regular');

/** Reset to the default — for deterministic tests (the signal is module-global). */
export function resetReadingMode(): void {
  readingMode.value = 'regular';
}

// Regular message key → its ELI5 / machine siblings. Populated by
// `registerVariants`, which the message barrel calls once per namespace.
const variants = new Map<string, { eli5: Message; machine: Message }>();

/**
 * Register a namespace's three parallel voices. The type forces the variants to
 * mirror every key of `regular` — a missing key is a compile error, the guard
 * that keeps three hand-written translations from drifting apart.
 */
export function registerVariants<T extends Record<string, Message>>(
  regular: T,
  eli5: { [K in keyof T]: Message },
  machine: { [K in keyof T]: Message },
): void {
  const eli5Map = eli5 as Record<string, Message>;
  const machineMap = machine as Record<string, Message>;
  for (const [key, message] of Object.entries(regular)) {
    const e = eli5Map[key];
    const m = machineMap[key];
    if (e && m) variants.set(message.key, { eli5: e, machine: m });
  }
}

/**
 * Translate `message` in the active reading mode. Same signature and inference
 * as `t`, except it substitutes the ELI5 / machine sibling when one is
 * registered for this message. Reading `readingMode.value` here is what
 * re-renders a component when the mode flips.
 */
export const tr = ((message: Message, ...args: unknown[]): string => {
  const call = t as (m: Message, ...a: unknown[]) => string;
  const mode = readingMode.value;
  if (mode !== 'regular') {
    const sibling = variants.get(message.key);
    if (sibling) return call(sibling[mode], ...args);
  }
  return call(message, ...args);
}) as typeof t;
