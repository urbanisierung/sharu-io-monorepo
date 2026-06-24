// Service worker for navigable public-share sites (docs/public-share.md, phase
// 5). It serves a site's already-decrypted files from the Cache API: the viewer
// page fetches ciphertext over Iroh, decrypts it locally, writes each file to
// `/s/<id>/<path>`, then navigates into the site — and this worker replays those
// cached plaintext responses so relative subresources and links resolve like a
// normal website. It holds no keys and does no crypto. Plain JS, served from
// /sw.js so it registers with scope `/s/`. SITE_CACHE mirrors site-mount.ts.
const SITE_CACHE = 'safu-sites-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/s/')) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SITE_CACHE);
      const hit = await cache.match(url.pathname, { ignoreSearch: true });
      return hit ?? new Response('Not found', { status: 404, statusText: 'Not Found' });
    })(),
  );
});
