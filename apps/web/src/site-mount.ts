// Mount an opened site share so the browser can navigate it (phase 5), lazily.
// A static site needs real origin URLs for its relative subresources and links
// to resolve, and it must keep working as the user clicks around — but we only
// want to fetch+decrypt the files actually visited. So:
//
//   1. Register a service worker (public/sw.js, scope `/s/`).
//   2. Hand it one end of a MessageChannel; the page keeps the other end and the
//      live `OpenedSite` (whose transport serves the lazy fetches).
//   3. Load the site in a *sandboxed* iframe at `/s/<id>/<index>`. The SW
//      intercepts every `/s/<id>/…` request: a cache hit is served directly; a
//      miss is requested from this page over the port, decrypted on demand,
//      cached, and returned.
//
// The host only ever served ciphertext; decryption happens here, per file. The
// iframe is sandboxed to an opaque origin so untrusted site script cannot reach
// this origin's storage (OPFS blocks, share links) — it can render and navigate,
// nothing more.
import type { OpenedSite } from './share-viewer.js';

/** The origin-absolute URL prefix a site's files live under. */
export function siteBase(siteId: string): string {
  return `/s/${siteId}/`;
}

/** Resolve a requested path within a site to a manifest file path: an empty
 *  path or a directory ("docs/") maps to the site's index document. */
export function resolveSitePath(path: string, index: string): string {
  return path === '' || path.endsWith('/') ? path + index : path;
}

/** Register the share service worker (scope `/s/`) and resolve its active worker.
 *  Browser-only; throws where the Cache API or service workers are unavailable. */
async function registerWorker(): Promise<ServiceWorker> {
  const sw = globalThis.navigator?.serviceWorker;
  if (!globalThis.caches || !sw) throw new Error('site shares require a service worker');
  const registration = await sw.register('/sw.js', { scope: '/s/' });
  await activated(registration);
  const worker = registration.active;
  if (!worker) throw new Error('service worker did not activate');
  return worker;
}

/** Resolve once the registration has an active worker (it controls `/s/`). */
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

/** Mount a lazy site: register the SW, give it a port to request files from this
 *  page over, and return the URL to load the (sandboxed) site at. The page keeps
 *  `site` alive — its transport serves the lazy fetches — until it tears down. */
export async function mountSite(site: OpenedSite): Promise<string> {
  const worker = await registerWorker();
  const channel = new MessageChannel();
  channel.port1.onmessage = (event: MessageEvent) => {
    void answer(site, channel.port1, event.data);
  };
  worker.postMessage({ type: 'register-site', siteId: site.id }, [channel.port2]);
  return siteBase(site.id) + site.index;
}

/** Answer a service-worker file request by decrypting that path on demand. */
async function answer(site: OpenedSite, port: MessagePort, request: unknown): Promise<void> {
  const req = request as { type?: string; id?: number; path?: string };
  if (req?.type !== 'fetch' || typeof req.id !== 'number' || typeof req.path !== 'string') return;
  try {
    const file = await site.getFile(resolveSitePath(req.path, site.index));
    if (!file) {
      port.postMessage({ type: 'file', id: req.id, ok: false });
      return;
    }
    // Copy into a right-sized buffer and transfer it (zero-copy across threads).
    const body = file.bytes.slice().buffer;
    port.postMessage({ type: 'file', id: req.id, ok: true, body, contentType: file.contentType }, [
      body,
    ]);
  } catch {
    port.postMessage({ type: 'file', id: req.id, ok: false });
  }
}
