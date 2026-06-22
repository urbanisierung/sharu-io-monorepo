import { signal } from '@preact/signals';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { FileProgress } from './ingest-controller.js';
import { IngestProgress } from './ingest-progress.js';

afterEach(cleanup);

describe('IngestProgress', () => {
  it('renders nothing when no drop is in flight', () => {
    const { container } = render(<IngestProgress progress={signal<readonly FileProgress[]>([])} />);
    expect(container.textContent).toBe('');
  });

  it('lists each file with its size and human status', () => {
    const progress = signal<readonly FileProgress[]>([
      { name: 'a.png', size: 2048, status: 'done' },
      { name: 'b.pdf', size: 512, status: 'adding' },
    ]);
    render(<IngestProgress progress={progress} />);
    expect(screen.getByText('a.png')).toBeTruthy();
    expect(screen.getByText('b.pdf')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText(/Safe/)).toBeTruthy();
    expect(screen.getByText(/Adding/)).toBeTruthy();
  });
});
