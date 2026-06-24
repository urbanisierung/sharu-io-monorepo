import { signal } from '@preact/signals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishedShares, resetPublishedShares } from './published-shares.js';
import type { PublishedShare } from './shares-store.js';

const share = (root: string, path: string): PublishedShare => ({
  root,
  path,
  link: `https://safu.app/s#share=${root}`,
  pin: [root, `${root}-block`],
  created: Date.UTC(2026, 0, 2),
});

beforeEach(resetPublishedShares);
afterEach(cleanup);

describe('PublishedShares', () => {
  it('renders nothing when there are no shares', () => {
    const { container } = render(
      <PublishedShares shares={signal<readonly PublishedShare[]>([])} onUnpublish={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('lists each share with its link and revokes through onUnpublish', async () => {
    const shares = signal<readonly PublishedShare[]>([share('r1', 'photo.jpg')]);
    const onUnpublish = vi.fn().mockResolvedValue(undefined);
    render(<PublishedShares shares={shares} onUnpublish={onUnpublish} />);

    expect(screen.getByText('photo.jpg')).toBeTruthy();
    expect(screen.getByDisplayValue('https://safu.app/s#share=r1')).toBeTruthy();

    const item = screen.getByText('photo.jpg').closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Revoke' }));
    expect(onUnpublish).toHaveBeenCalledWith('r1');
  });
});
