import type { ShareManifest } from '@safu/sdk';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetShareViewer, ShareViewer } from './share-page.js';
import type { OpenedFile, OpenedSite } from './share-viewer.js';

const manifest = (over: Partial<ShareManifest> = {}): ShareManifest => ({
  v: 1,
  name: 'note.txt',
  contentType: 'text/plain',
  size: 5,
  blocks: [],
  ...over,
});

beforeEach(() => {
  resetShareViewer();
  // happy-dom has no object-URL support; add the two methods to the real URL
  // (rather than replacing it, which would break the iframe's Location).
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
});
afterEach(cleanup);

describe('ShareViewer', () => {
  it('prompts when the link carries no share', () => {
    render(<ShareViewer code="" open={vi.fn()} />);
    expect(screen.getByText('No share in this link')).toBeTruthy();
  });

  it('reports a failure without leaking detail when the share cannot be opened', async () => {
    const open = vi.fn().mockRejectedValue(new Error('boom'));
    render(<ShareViewer code="anything" open={open} />);
    expect(await screen.findByText('Couldn’t open this share')).toBeTruthy();
  });

  it('renders a text share with its name, size, a download link, and the body', async () => {
    const opened: OpenedFile = {
      kind: 'file',
      manifest: manifest(),
      bytes: new TextEncoder().encode('hello'),
    };
    render(<ShareViewer code="ok" open={() => Promise.resolve(opened)} />);

    expect(await screen.findByText('note.txt')).toBeTruthy();
    expect(screen.getByText('5 B')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Download' });
    expect(link.getAttribute('download')).toBe('note.txt');
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders an image share as an <img> preview', async () => {
    const opened: OpenedFile = {
      kind: 'file',
      manifest: manifest({ name: 'pic.png', contentType: 'image/png', size: 3 }),
      bytes: new Uint8Array([1, 2, 3]),
    };
    render(<ShareViewer code="ok" open={() => Promise.resolve(opened)} />);

    const img = (await screen.findByAltText('pic.png')) as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('blob:fake');
  });

  it('mounts a site share and renders it in a sandboxed iframe', async () => {
    const site: OpenedSite = {
      kind: 'site',
      id: 'root-hash',
      index: 'index.html',
      getFile: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mount = vi.fn().mockResolvedValue('/s/root-hash/index.html');
    render(<ShareViewer code="ok" open={() => Promise.resolve(site)} mount={mount} />);

    const frame = (await screen.findByTitle('Shared site')) as HTMLIFrameElement;
    expect(mount).toHaveBeenCalledWith(site);
    expect(frame.getAttribute('src')).toBe('/s/root-hash/index.html');
    // Untrusted content runs in an opaque origin (no allow-same-origin).
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });
});
