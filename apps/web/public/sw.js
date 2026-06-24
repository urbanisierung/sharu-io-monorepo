// Service worker for navigable public-share sites (docs/public-share.md, phase
// 5), lazy. It serves a site's files from the Cache API; on a miss it asks the
// viewer page — over a MessagePort the page handed it at mount — to decrypt that
// one file (the page holds the key + an Iroh transport; the host only ever
// served ciphertext). It holds no keys and does no crypto. Plain JS, served from
// /sw.js so it registers with scope `/s/`. SITE_CACHE mirrors site-mount.ts.
const SITE_CACHE = 'safu-sites-v1';
const ports = new Map(); // siteId -> MessagePort to the viewer page
const pending = new Map(); // requestId -> resolve(reply)
let nextId = 1;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The viewer page registers a site and gives us a port we can request files on.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'register-site' && typeof data.siteId === 'string' && event.ports[0]) {
    const port = event.ports[0];
    port.onmessage = (reply) => {
      const file = reply.data;
      if (file?.type === 'file' && pending.has(file.id)) {
        pending.get(file.id)(file);
        pending.delete(file.id);
      }
    };
    ports.set(data.siteId, port);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const match = /^\/s\/([^/]+)\/(.*)$/.exec(url.pathname);
  if (!match) return;
  event.respondWith(serve(match[1], url.pathname, match[2]));
});

async function serve(siteId, pathname, path) {
  const cache = await caches.open(SITE_CACHE);
  const hit = await cache.match(pathname, { ignoreSearch: true });
  if (hit) return hit;
  const port = ports.get(siteId);
  if (!port) return notFound();
  const reply = await requestFile(port, path);
  if (!reply?.ok) return notFound();
  const response = new Response(reply.body, {
    headers: { 'content-type': reply.contentType || 'application/octet-stream' },
  });
  await cache.put(pathname, response.clone());
  return response;
}

function requestFile(port, path) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    port.postMessage({ type: 'fetch', id, path });
    // If the viewer tab is gone, don't hang the request forever.
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve(null);
      }
    }, 15000);
  });
}

function notFound() {
  return new Response('Not found', { status: 404, statusText: 'Not Found' });
}
