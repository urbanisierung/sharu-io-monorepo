// The CLI's documented surface, parsed from its single source of truth — the
// Rust `print_usage()` text and `Args` parser in crates/safu-node/src/main.rs,
// plus the version in its Cargo.toml. The docs page renders from the resulting
// spec, and a drift test regenerates `cli-spec.generated.ts` from these same
// files, so any change to the CLI flows straight to the page (or fails CI).
//
// This module is pure (string in, spec out): no fs, no Node — the generator and
// the test read the files and hand the contents here.

export interface CliCommand {
  /** The subcommand name, e.g. `init`, `serve`. */
  name: string;
  /** A positional argument placeholder like `<code>`, or null if it takes none. */
  arg: string | null;
  /** One-line description, verbatim from the CLI's own help. */
  summary: string;
}

export interface CliOption {
  /** The long flag, e.g. `--data-dir`. */
  flag: string;
  /** The value placeholder like `<path>`, or null. */
  value: string | null;
  /** One-line description, verbatim from the CLI's own help. */
  summary: string;
  /** The environment variable that also sets it, or null. */
  env: string | null;
  /** Whether the CLI rejects an invocation that omits it. */
  required: boolean;
  /** The default value when omitted, or null. */
  default: string | null;
}

export interface CliSpec {
  /** The binary name, e.g. `safu-node`. */
  binary: string;
  /** The released version, e.g. `0.1.0`. */
  version: string;
  /** The one-line tagline from the top of the help. */
  tagline: string;
  /** The usage synopsis, e.g. `safu-node <command> [options]`. */
  usage: string;
  /** The default `--data-dir` value. */
  dataDirDefault: string;
  commands: CliCommand[];
  options: CliOption[];
}

function capture(source: string, re: RegExp, what: string): string {
  const m = source.match(re);
  if (!m?.[1]) throw new Error(`could not parse the CLI ${what} from the Rust source`);
  return m[1];
}

interface UsageLine {
  indent: number;
  text: string;
}

/** Read the `print_usage()` string literal back into its source lines, stripping
 *  Rust's `\n` escapes and `\` line-continuations but keeping each line's indent
 *  (which distinguishes section headers from their entries). */
function usageLines(mainRs: string): UsageLine[] {
  const block = capture(
    mainRs,
    /fn print_usage\(\)\s*\{[\s\S]*?println!\(\s*"([\s\S]*?)"\s*\)\s*;/,
    'usage text',
  );
  return block.split('\n').map((raw) => {
    const stripped = raw.replace(/\\$/, '').replace(/\\n$/, '');
    const indent = stripped.match(/^(\s*)/)?.[1]?.length ?? 0;
    return { indent, text: stripped.trim() };
  });
}

/** Entries indented under the `header:` line, until the next unindented line. */
function sectionEntries(lines: UsageLine[], header: string): string[] {
  const start = lines.findIndex((l) => l.text === header);
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.text === '') continue;
    if (line.indent === 0) break;
    out.push(line.text);
  }
  return out;
}

function parseCommands(lines: UsageLine[]): CliCommand[] {
  return sectionEntries(lines, 'COMMANDS:').map((entry) => {
    const m = entry.match(/^(\S+)(?:\s+(<[^>]+>))?\s{2,}(.+)$/);
    const name = m?.[1];
    const summary = m?.[3];
    if (!name || !summary) throw new Error(`could not parse the CLI command line: "${entry}"`);
    return { name, arg: m?.[2] ?? null, summary: summary.trim() };
  });
}

function parseOptions(lines: UsageLine[], dataDirDefault: string): CliOption[] {
  const entries = sectionEntries(lines, 'OPTIONS / ENVIRONMENT:');
  const options: CliOption[] = [];
  for (const entry of entries) {
    if (entry.startsWith('--')) {
      const m = entry.match(/^(--\S+)(?:\s+(<[^>]+>))?\s{2,}(.+?)(?:\s+\[env (\S+)\])?$/);
      const flag = m?.[1];
      const summary = m?.[3];
      if (!flag || !summary) throw new Error(`could not parse the CLI option line: "${entry}"`);
      options.push({
        flag,
        value: m?.[2] ?? null,
        summary: summary.trim(),
        env: m?.[4] ?? null,
        required: false,
        default: null,
      });
      continue;
    }
    // A continuation annotation for the option just above.
    const current = options[options.length - 1];
    if (!current) continue;
    if (/^\(required/.test(entry)) current.required = true;
    const def = entry.match(/^\(default:\s*(.+?)\)/);
    if (def?.[1]) current.default = def[1].replace('{DEFAULT_DATA_DIR}', dataDirDefault);
  }
  return options;
}

/** Parse the CLI spec from `main.rs` and `Cargo.toml` source. Throws if the
 *  expected shape is missing, so a Rust refactor that breaks parsing fails the
 *  drift test loudly rather than silently emptying the docs page. */
export function parseCliSpec(mainRs: string, cargoToml: string): CliSpec {
  const version = capture(cargoToml, /\bversion\s*=\s*"([^"]+)"/, 'version');
  const binary = capture(cargoToml, /\[\[bin\]\][\s\S]*?\bname\s*=\s*"([^"]+)"/, 'binary name');
  const dataDirDefault = capture(
    mainRs,
    /DEFAULT_DATA_DIR\s*:\s*&str\s*=\s*"([^"]+)"/,
    'default data dir',
  );

  const lines = usageLines(mainRs);
  const tagline = lines.find((l) => l.text !== '')?.text ?? binary;
  const usage = sectionEntries(lines, 'USAGE:')[0] ?? `${binary} <command> [options]`;

  return {
    binary,
    version,
    tagline,
    usage,
    dataDirDefault,
    commands: parseCommands(lines),
    options: parseOptions(lines, dataDirDefault),
  };
}

/** Serialize a spec to the body of `cli-spec.generated.ts`. Run through Biome
 *  afterward (see the `gen:cli-docs` script) so the committed file is formatted. */
export function renderModule(spec: CliSpec): string {
  return `// GENERATED by \`pnpm gen:cli-docs\` from crates/safu-node — do not edit by hand.
// It mirrors the CLI's own help; change the CLI, then regenerate.
import type { CliSpec } from './spec.js';

export const cliSpec: CliSpec = ${JSON.stringify(spec, null, 2)};
`;
}
