// Guard for the UI invariants (plan §2.4 verify): the signal-driven shell must
// use no React state hooks, and no user-facing string may be hardcoded — all
// copy goes through @cascivo/i18n. This runs as a normal test so CI fails on a
// violation, with the offending file/line in the message.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_HOOKS = /\buse(State|Effect|Context|Reducer)\b/;
// Raw alphabetic text sitting directly between JSX tags (e.g. `>Hello<`). The
// `(?<!=)` skips arrow functions (`=> Type<…>`); interpolations `>{t(...)}<` and
// closing tags are exempt. Applied to .tsx only, where JSX text lives.
const HARDCODED_JSX_TEXT = /(?<!=)>\s*[A-Za-z][^<>{}]*</;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function violations(predicate: (line: string) => boolean, ext = /\.tsx?$/): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (!ext.test(file)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const trimmed = line.trim();
        // Skip comment lines — prose may legitimately name a forbidden symbol.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }
        if (predicate(line)) hits.push(`${file}:${i + 1}: ${trimmed}`);
      });
  }
  return hits;
}

describe('UI invariants (plan §2.4)', () => {
  it('uses no React state hooks anywhere in the UI', () => {
    expect(violations((line) => FORBIDDEN_HOOKS.test(line))).toEqual([]);
  });

  it('has no hardcoded user-facing strings in JSX (all copy via @cascivo/i18n)', () => {
    expect(violations((line) => HARDCODED_JSX_TEXT.test(line), /\.tsx$/)).toEqual([]);
  });
});
