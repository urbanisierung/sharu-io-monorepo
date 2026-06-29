import { afterEach, describe, expect, it, vi } from 'vitest';
import { canWebShare, webShare } from './web-share.js';

afterEach(() => vi.unstubAllGlobals());

describe('web-share', () => {
  it('reports unavailable when navigator.share is missing', () => {
    vi.stubGlobal('navigator', {});
    expect(canWebShare()).toBe(false);
  });

  it('forwards the link and note to the native share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(canWebShare()).toBe(true);
    await webShare('https://safu.app/s#share=x', 'open it');
    expect(share).toHaveBeenCalledWith({ text: 'open it', url: 'https://safu.app/s#share=x' });
  });

  it('swallows a dismissed or rejected share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new Error('AbortError'));
    vi.stubGlobal('navigator', { share });
    await expect(webShare('u', 't')).resolves.toBeUndefined();
  });
});
