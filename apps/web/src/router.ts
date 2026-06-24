// Tiny path-based router (no dependency): the app is a handful of top-level
// views, each with its own URL so they can be bookmarked and shared. A single
// `route` signal mirrors `location.pathname`; `navigate` pushes history and
// updates it; the back/forward buttons stay in sync via `popstate`. The
// Cloudflare `_redirects` SPA fallback serves index.html for every path, so a
// hard refresh on `/app` or `/whitepaper` resolves client-side.
import { signal } from '@preact/signals';

export type Route = 'landing' | 'whitepaper' | 'comparison' | 'how-it-works' | 'app' | 'share';

/** Map a URL path to a known view. Unknown paths fall back to the landing page.
 *  `/flow` is kept as an alias of `/how-it-works` so older shared links resolve.
 *  `/s` is the keyless public-share viewer; the share itself rides in the hash. */
export function routeOf(pathname: string): Route {
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'app';
  if (pathname === '/whitepaper') return 'whitepaper';
  if (pathname === '/comparison') return 'comparison';
  if (pathname === '/how-it-works' || pathname === '/flow') return 'how-it-works';
  if (pathname === '/s') return 'share';
  return 'landing';
}

/** The canonical path for a view, for links and history. */
export function pathOf(route: Route): string {
  if (route === 'landing') return '/';
  if (route === 'share') return '/s';
  return `/${route}`;
}

const current = globalThis.location?.pathname ?? '/';
export const route = signal<Route>(routeOf(current));

/** Navigate to a view, pushing a history entry (so Back works) unless the path
 *  is unchanged. The hash is preserved by default so pairing deep links survive
 *  a landing→app transition; pass `dropHash` to clear it. */
export function navigate(next: Route, options: { dropHash?: boolean } = {}): void {
  route.value = next;
  if (typeof history === 'undefined') return;
  const hash = options.dropHash ? '' : (globalThis.location?.hash ?? '');
  const url = pathOf(next) + hash;
  if (url !== globalThis.location?.pathname + globalThis.location?.hash) {
    history.pushState(null, '', url);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    route.value = routeOf(window.location.pathname);
  });
}
