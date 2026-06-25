// Keeps the docs page honest: the committed CLI spec must equal what we parse
// from the live Rust source. Change a flag, command, default, or the version in
// crates/safu-node and this fails until the spec is regenerated — so the page
// can never silently drift from the CLI. Regenerate with `pnpm gen:cli-docs`
// (which sets UPDATE_CLI_SPEC and reformats the output).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliSpec } from './cli-spec.generated.js';
import { parseCliSpec, renderModule } from './spec.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CRATE = join(HERE, '../../../../crates/safu-node');

function fromSource() {
  const mainRs = readFileSync(join(CRATE, 'src/main.rs'), 'utf8');
  const cargoToml = readFileSync(join(CRATE, 'Cargo.toml'), 'utf8');
  return parseCliSpec(mainRs, cargoToml);
}

describe('CLI spec', () => {
  it('matches the live crates/safu-node source (regenerate with pnpm gen:cli-docs)', () => {
    const parsed = fromSource();
    if (process.env.UPDATE_CLI_SPEC) {
      writeFileSync(join(HERE, 'cli-spec.generated.ts'), renderModule(parsed));
      return;
    }
    expect(parsed).toEqual(cliSpec);
  });

  it('captures every command and both options', () => {
    const parsed = fromSource();
    expect(parsed.commands.map((c) => c.name)).toEqual([
      'init',
      'info',
      'link',
      'unlink',
      'list',
      'serve',
      'version',
    ]);
    expect(parsed.options.map((o) => o.flag)).toEqual(['--data-dir', '--passphrase']);
    expect(parsed.options.find((o) => o.flag === '--passphrase')?.required).toBe(true);
  });
});
