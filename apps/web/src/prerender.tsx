// Build-time prerender of the static marketing routes (see scripts/prerender.mjs
// and the web `build` script). Rendered in Node by a Vite SSR build, so it must
// not pull the browser runtime: it renders the same <Navbar/> + page tree that
// `Root` produces for these routes (runtime is always null on marketing pages),
// which the client then hydrates in place (main.tsx). The animated /how-it-works
// page is deliberately left out — its motion-preference branch would mismatch on
// hydration — and stays a plain SPA route (still titled via the router).
import { renderToString } from 'preact-render-to-string';
import { CliDocs } from './cli-docs.js';
import { Comparison } from './comparison.js';
import { Landing } from './landing.js';
// Side-effect: registers the reading-mode variants the pages translate through.
import './messages.js';
import { Navbar } from './navbar.js';
import { pageMeta, type Route, routeOf } from './router.js';
import { Whitepaper } from './whitepaper.js';

const noop = (): void => {};

/** The routes baked to static HTML. Keep in sync with the client's marketing
 *  routes in root.tsx (minus how-it-works). */
const PATHS = ['/', '/whitepaper', '/comparison', '/cli-docs'] as const;

function page(route: Route) {
  if (route === 'whitepaper') return <Whitepaper onLaunch={noop} />;
  if (route === 'comparison') return <Comparison onLaunch={noop} />;
  if (route === 'cli-docs') return <CliDocs onLaunch={noop} />;
  return (
    <Landing
      onLaunch={noop}
      onWhitepaper={noop}
      onComparison={noop}
      onFlow={noop}
      onCliDocs={noop}
    />
  );
}

export interface Prerendered {
  path: string;
  html: string;
  title: string;
  description: string;
}

/** Render each marketing route to a body HTML string plus its head meta. */
export function prerender(): Prerendered[] {
  return PATHS.map((path) => {
    const route = routeOf(path);
    const html = renderToString(
      <>
        <Navbar route={route} runtime={null} onLaunch={noop} />
        {page(route)}
      </>,
    );
    const { title, description } = pageMeta(route);
    return { path, html, title, description };
  });
}
