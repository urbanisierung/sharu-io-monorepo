import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './landing.js';

afterEach(cleanup);

function renderLanding(overrides: Partial<Parameters<typeof Landing>[0]> = {}) {
  render(
    <Landing
      onLaunch={() => {}}
      onWhitepaper={() => {}}
      onComparison={() => {}}
      onFlow={() => {}}
      onCliDocs={() => {}}
      {...overrides}
    />,
  );
}

describe('Landing', () => {
  it('explains what Sharu is, the problem, and how it works', () => {
    renderLanding();
    expect(screen.getByText('Your data.')).toBeTruthy();
    expect(screen.getByText('Nobody else.')).toBeTruthy();
    expect(screen.getByText('The problem')).toBeTruthy();
    // "How it works" now appears twice: the section kicker and the hero link.
    expect(screen.getAllByText('How it works').length).toBeGreaterThan(0);
    expect(screen.getByText(/Encrypt on device/)).toBeTruthy();
    expect(screen.getByText('Zero-knowledge')).toBeTruthy();
  });

  it('offers the always-on backup node with a one-line install', () => {
    renderLanding();
    expect(screen.getByText('Backup node')).toBeTruthy();
    expect(screen.getByText(/install\.sh \| sh$/)).toBeTruthy();
  });

  it('opens the backup-node docs from its section', () => {
    const onCliDocs = vi.fn();
    renderLanding({ onCliDocs });
    // The label also appears in the footer nav; the section button comes first.
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Read the backup-node docs' })[0] as HTMLElement,
    );
    expect(onCliDocs).toHaveBeenCalledOnce();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    renderLanding({ onLaunch });
    fireEvent.click(screen.getAllByRole('button', { name: 'Launch the app' })[0] as HTMLElement);
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it('opens the whitepaper from the hero link', () => {
    const onWhitepaper = vi.fn();
    renderLanding({ onWhitepaper });
    // Hero link first; the same label is repeated in the footer nav.
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Read the whitepaper' })[0] as HTMLElement,
    );
    expect(onWhitepaper).toHaveBeenCalledOnce();
  });

  it('opens the IPFS-vs-Iroh comparison from the hero link', () => {
    const onComparison = vi.fn();
    renderLanding({ onComparison });
    fireEvent.click(screen.getAllByRole('button', { name: 'IPFS vs. Iroh' })[0] as HTMLElement);
    expect(onComparison).toHaveBeenCalledOnce();
  });

  it('opens the interaction walkthrough from the hero link', () => {
    const onFlow = vi.fn();
    renderLanding({ onFlow });
    fireEvent.click(screen.getAllByRole('button', { name: 'How it works' })[0] as HTMLElement);
    expect(onFlow).toHaveBeenCalledOnce();
  });

  it('links to the public source from the footer', () => {
    renderLanding();
    const source = screen.getByRole('link', { name: 'View the source' }) as HTMLAnchorElement;
    expect(source.getAttribute('href')).toBe('https://github.com/sharu-io');
  });

  it('repeats the section links in the footer nav', () => {
    const onWhitepaper = vi.fn();
    renderLanding({ onWhitepaper });
    const footer = screen.getByRole('contentinfo');
    const links = footer.querySelectorAll('button');
    // whitepaper, how-it-works, comparison, backup-node docs.
    expect(links.length).toBe(4);
    fireEvent.click(links[0] as HTMLElement);
    expect(onWhitepaper).toHaveBeenCalledOnce();
  });
});
