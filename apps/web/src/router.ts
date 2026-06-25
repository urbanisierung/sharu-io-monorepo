// Tiny path-based router (no dependency): the app is a handful of top-level
// views, each with its own URL so they can be bookmarked and shared. A single
// `route` signal mirrors `location.pathname`; `navigate` pushes history and
// updates it; the back/forward buttons stay in sync via `popstate`. The
// Cloudflare `_redirects` SPA fallback serves index.html for every path, so a
// hard refresh on `/app` or `/whitepaper` resolves client-side.
import { signal } from '@preact/signals';

export type Route =
  | 'landing'
  | 'whitepaper'
  | 'comparison'
  | 'how-it-works'
  | 'cli-docs'
  | 'app'
  | 'share';

/** Map a URL path to a known view. Unknown paths fall back to the landing page.
 *  `/flow` is kept as an alias of `/how-it-works` so older shared links resolve.
 *  `/s` is the keyless public-share viewer; the share itself rides in the hash. */
export function routeOf(pathname: string): Route {
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'app';
  if (pathname === '/whitepaper') return 'whitepaper';
  if (pathname === '/comparison') return 'comparison';
  if (pathname === '/how-it-works' || pathname === '/flow') return 'how-it-works';
  if (pathname === '/cli-docs') return 'cli-docs';
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

/** Honour the user's reduced-motion preference for the view transition. */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Resolve once the next frame is painted — by then Preact has re-rendered the
 *  new view, so a wrapping view transition captures it rather than the old DOM. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else resolve();
  });
}

/** The View Transitions starter, or null when unsupported or motion is reduced
 *  (then callers just apply the change directly — no animation). */
function viewTransition(): ((update: () => void) => void) | null {
  const doc = globalThis.document;
  if (!doc || typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) return null;
  return (update) => {
    doc.startViewTransition(() => {
      update();
      return nextFrame();
    });
  };
}

/** Push the new path (and preserve or drop the hash) when the URL actually
 *  changes, so Back works and the address bar stays correct. */
function syncHistory(next: Route, dropHash: boolean): void {
  if (typeof history === 'undefined') return;
  const hash = dropHash ? '' : (globalThis.location?.hash ?? '');
  const url = pathOf(next) + hash;
  if (url !== globalThis.location?.pathname + globalThis.location?.hash) {
    history.pushState(null, '', url);
  }
}

/** Navigate to a view, pushing a history entry (so Back works) unless the path
 *  is unchanged. The hash is preserved by default so pairing deep links survive
 *  a landing→app transition; pass `dropHash` to clear it. A move to a different
 *  view scrolls back to the top and, where supported, cross-fades via the View
 *  Transitions API. */
export function navigate(next: Route, options: { dropHash?: boolean } = {}): void {
  const changed = route.value !== next;
  const apply = () => {
    route.value = next;
    syncHistory(next, options.dropHash ?? false);
    // A fresh page starts at the top. Back/forward keep the browser's restored
    // scroll position — those arrive via popstate, not here.
    if (changed) globalThis.scrollTo?.({ top: 0, left: 0 });
  };

  const start = changed ? viewTransition() : null;
  if (start) start(apply);
  else apply();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const apply = () => {
      route.value = routeOf(window.location.pathname);
    };
    const start = viewTransition();
    if (start) start(apply);
    else apply();
  });
}
