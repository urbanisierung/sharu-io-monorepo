import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from './icon-button.js';

afterEach(cleanup);

describe('IconButton', () => {
  it('exposes the label as the accessible name', () => {
    render(<IconButton icon="download" label="Download" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<IconButton icon="trash" label="Delete" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('honours the disabled attribute', () => {
    render(<IconButton icon="share" label="Share" disabled onClick={() => {}} />);
    expect((screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
