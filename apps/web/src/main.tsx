import { hydrate, render } from 'preact';
import { init, Root } from './root.js';
import { route } from './router.js';
import './theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

// Marketing routes are prerendered to static HTML (see prerender.tsx). The SPA
// fallback serves the landing HTML for every non-prerendered path too (/app,
// /how-it-works, /s), so only hydrate when the served page was prerendered for
// *this* route; otherwise drop the stale markup and render fresh.
if (root.dataset.prerendered === route.value) {
  hydrate(<Root />, root);
} else {
  root.replaceChildren();
  render(<Root />, root);
}

void init();
