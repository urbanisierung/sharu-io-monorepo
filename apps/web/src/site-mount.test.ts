import { describe, expect, it } from 'vitest';
import type { OpenedSite } from './share-viewer.js';
import { cacheSite, SITE_CACHE, siteBase } from './site-mount.js';

/** A minimal in-memory stand-in for the Cache + CacheStorage APIs: enough to
 *  assert what cacheSite writes, without a browser. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const cacheStorage = {
    open(name: string) {
      const entries = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, entries);
      return Promise.resolve({
        put(url: string, response: Response) {
          entries.set(url, response);
          return Promise.resolve();
        },
      });
    },
  } as unknown as CacheStorage;
  return { cacheStorage, stores };
}

const site: OpenedSite = {
  kind: 'site',
  id: 'abc123',
  index: 'index.html',
  files: new Map([
    ['index.html', { contentType: 'text/html', bytes: new TextEncoder().encode('<h1>hi</h1>') }],
    ['style.css', { contentType: 'text/css', bytes: new TextEncoder().encode('h1{color:red}') }],
  ]),
};

describe('cacheSite', () => {
  it('writes each file under /s/<id>/<path> with its content type', async () => {
    const { cacheStorage, stores } = fakeCaches();
    await cacheSite(site.id, site, cacheStorage);

    const entries = stores.get(SITE_CACHE);
    expect(entries).toBeDefined();
    expect([...(entries?.keys() ?? [])]).toEqual([
      `${siteBase('abc123')}index.html`,
      `${siteBase('abc123')}style.css`,
    ]);

    const indexResponse = entries?.get('/s/abc123/index.html');
    expect(indexResponse?.headers.get('content-type')).toBe('text/html');
    expect(await indexResponse?.text()).toBe('<h1>hi</h1>');
  });
});
