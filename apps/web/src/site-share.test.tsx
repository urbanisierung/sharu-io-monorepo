import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSiteShare, SiteShare } from './site-share.js';

const folder = [
  new File(['<h1>hi</h1>'], 'index.html', { type: 'text/html' }),
  new File(['body{}'], 'style.css', { type: 'text/css' }),
];

beforeEach(resetSiteShare);
afterEach(cleanup);

/** Drive the hidden directory input with a set of files. */
function pickFiles(files: File[]): void {
  const input = screen.getByLabelText('Share a folder as a site') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

describe('SiteShare', () => {
  it('publishes the picked folder and surfaces the link', async () => {
    const onPublish = vi.fn().mockResolvedValue('https://safu.app/s#share=site');
    render(<SiteShare onPublish={onPublish} />);
    pickFiles(folder);

    expect(onPublish).toHaveBeenCalledWith(folder);
    const link = (await screen.findByDisplayValue(
      'https://safu.app/s#share=site',
    )) as HTMLInputElement;
    expect(link.readOnly).toBe(true);
  });

  it('prompts to pair a node when none is available', async () => {
    const onPublish = vi.fn().mockRejectedValue(new Error('no-share-host'));
    render(<SiteShare onPublish={onPublish} />);
    pickFiles(folder);
    expect(await screen.findByText(/Pair your always-on node first/)).toBeTruthy();
  });
});
