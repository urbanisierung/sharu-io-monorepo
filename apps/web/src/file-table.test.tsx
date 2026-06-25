import { signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileTable, resetFileTableView } from './file-table.js';

const sample: FileView[] = [
  { path: 'zebra.png', size: 2048, modified: Date.UTC(2024, 0, 2), blocks: ['a', 'b'] },
  { path: 'alpha.txt', size: 512, modified: Date.UTC(2024, 5, 1), blocks: ['c'] },
  { path: 'mid.pdf', size: 1024 * 1024, modified: Date.UTC(2023, 2, 3), blocks: ['d', 'e', 'f'] },
];

function renderTable(props: Partial<Parameters<typeof FileTable>[0]> = {}) {
  render(<FileTable files={signal<readonly FileView[]>(sample)} {...props} />);
}

/** The visual order of filenames as rendered (the table is sorted/filtered). */
function tableText(): string {
  return screen.getByRole('table').textContent ?? '';
}

/** Open a row's three-dots overflow menu and return the row element. */
function openRowMenu(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: 'Actions' }));
  return row;
}

beforeEach(resetFileTableView);
afterEach(cleanup);

describe('FileTable', () => {
  it('shows the empty state when nothing is backed up', () => {
    render(<FileTable files={signal<readonly FileView[]>([])} />);
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
  });

  it('renders metadata: human size, date, chunk count, and a storage summary', () => {
    renderTable();
    expect(screen.getByText('512 B')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('Jan 2, 2024')).toBeTruthy();
    expect(screen.getByText(/3 file\(s\)/)).toBeTruthy();
  });

  it('filters rows by the search box', () => {
    renderTable();
    fireEvent.input(screen.getByLabelText('Search files'), { target: { value: 'alpha' } });
    expect(screen.getByText('alpha.txt')).toBeTruthy();
    expect(screen.queryByText('zebra.png')).toBeNull();
  });

  it('shows a no-matches message when the filter excludes everything', () => {
    renderTable();
    fireEvent.input(screen.getByLabelText('Search files'), { target: { value: 'nope' } });
    expect(screen.getByText(/No files match/)).toBeTruthy();
  });

  it('sorts by name ascending by default and reverses on the header', () => {
    renderTable();
    let text = tableText();
    expect(text.indexOf('alpha.txt')).toBeLessThan(text.indexOf('mid.pdf'));
    expect(text.indexOf('mid.pdf')).toBeLessThan(text.indexOf('zebra.png'));

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    text = tableText();
    expect(text.indexOf('zebra.png')).toBeLessThan(text.indexOf('alpha.txt'));
  });

  it('sorts by size when the Size header is clicked', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Size/ }));
    const text = tableText();
    // 512 B < 2 KB < 1 MB, ascending
    expect(text.indexOf('alpha.txt')).toBeLessThan(text.indexOf('zebra.png'));
    expect(text.indexOf('zebra.png')).toBeLessThan(text.indexOf('mid.pdf'));
  });

  it('restores a file through onRestore from the row menu', () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    renderTable({ onRestore });
    const row = openRowMenu('alpha.txt');
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Download' }));
    expect(onRestore).toHaveBeenCalledWith('alpha.txt');
  });

  it('deletes only after a confirmation step', () => {
    const onDelete = vi.fn();
    renderTable({ onDelete });
    let row = openRowMenu('alpha.txt');
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();

    row = screen.getByText('alpha.txt').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalledWith('alpha.txt');
  });

  it('publishes a share and surfaces the link for copying', async () => {
    const link = 'https://safu.app/s#share=abc';
    const onShare = vi.fn().mockResolvedValue(link);
    renderTable({ onShare });
    const row = openRowMenu('alpha.txt');
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledWith('alpha.txt');

    const input = (await within(
      screen.getByText('alpha.txt').closest('tr') as HTMLElement,
    ).findByLabelText('Share link')) as HTMLInputElement;
    expect(input.value).toBe(link);
  });

  it('shows a prompt when no always-on node is paired', async () => {
    const onShare = vi.fn().mockRejectedValue(new Error('no-share-host'));
    renderTable({ onShare });
    const row = openRowMenu('alpha.txt');
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Share' }));
    expect(await screen.findByText(/Pair your always-on node first/)).toBeTruthy();
  });
});
