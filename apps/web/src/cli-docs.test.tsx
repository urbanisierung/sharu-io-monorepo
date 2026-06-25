import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliSpec } from './cli-docs/cli-spec.generated.js';
import { CliDocs } from './cli-docs.js';
import { readingMode, resetReadingMode } from './reading-mode.js';

afterEach(() => {
  cleanup();
  resetReadingMode();
});

describe('CliDocs', () => {
  it('renders the version and every command from the generated spec', () => {
    render(<CliDocs onLaunch={() => {}} />);
    expect(screen.getByText(`${cliSpec.binary} · v${cliSpec.version}`)).toBeTruthy();
    for (const command of cliSpec.commands) {
      // Each command's summary (the CLI's own help text) appears in the table.
      expect(screen.getByText(command.summary)).toBeTruthy();
    }
  });

  it('documents every option, its env var, and a required marker', () => {
    render(<CliDocs onLaunch={() => {}} />);
    for (const option of cliSpec.options) {
      if (option.env) expect(screen.getByText(option.env)).toBeTruthy();
    }
    // --passphrase is required, so the page shows a Required badge.
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('re-voices the prose with the reading mode', () => {
    const page = () => <CliDocs onLaunch={() => {}} />;
    const { rerender } = render(page());
    expect(screen.getByText('What it is')).toBeTruthy();
    readingMode.value = 'machine';
    rerender(page());
    expect(screen.getByText('def')).toBeTruthy();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<CliDocs onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch the app' }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });
});
