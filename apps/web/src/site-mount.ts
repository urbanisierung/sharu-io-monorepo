// Mount an opened site share so the browser can navigate it (phase 5). A static
// site needs real origin URLs for relative subresources (./style.css, images,
// links) to resolve and load. So we write every decrypted file into the Cache
// API under `/s/<id>/<path>` and register a service worker (public/sw.js, scope
// `/s/`) that serves those paths from the cache. The host only ever served
// ciphertext; decryption happened here, and the SW replays the plaintext.
//
// Whole-site prefetch (every file decrypted up front) keeps the SW trivial — no
// Iroh/WASM inside the worker — at the cost of not streaming huge sites. Static
// sites are small; lazy per-request fetch is a future optimization.
import type { OpenedSite } from './share-viewer.js';

/** Cache name, shared with public/sw.js — keep the two in sync. */
export const SITE_CACHE = 'safu-sites-v1';

/** The origin-absolute URL prefix a site's files live under. */
export function siteBase(siteId: string): string {
  return `/s/${siteId}/`;
}

/** Write every decrypted file of a site into `cacheStorage` under its
 *  `/s/<id>/<path>` URL, so the service worker can serve the navigable site. */
export async function cacheSite(
  siteId: string,
  site: OpenedSite,
  cacheStorage: CacheStorage,
): Promise<void> {
  const cache = await cacheStorage.open(SITE_CACHE);
  for (const [path, file] of site.files) {
    const response = new Response(file.bytes as BlobPart, {
      headers: { 'content-type': file.contentType || 'application/octet-stream' },
    });
    await cache.put(siteBase(siteId) + path, response);
  }
}

/** Cache the site, ensure the service worker is active, and navigate into it.
 *  Browser-only; throws where the Cache API or service workers are unavailable. */
export async function mountSite(site: OpenedSite): Promise<void> {
  const sw = globalThis.navigator?.serviceWorker;
  if (!globalThis.caches || !sw) throw new Error('site shares require a service worker');
  await cacheSite(site.id, site, globalThis.caches);
  const registration = await sw.register('/sw.js', { scope: '/s/' });
  await activated(registration);
  globalThis.location.assign(siteBase(site.id) + site.index);
}

/** Resolve once the registration has an active worker (it will control `/s/`). */
function activated(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return Promise.resolve();
  return new Promise((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  });
}
