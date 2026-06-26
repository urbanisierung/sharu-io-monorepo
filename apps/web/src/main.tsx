import { hydrate, render } from 'preact';
import { init, Root } from './root.js';
import './theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

// Marketing routes are prerendered to static HTML (see prerender.tsx), so the
// container already holds real markup we hydrate in place. Other routes are
// served the empty SPA-fallback shell, where a fresh render is correct.
if (root.firstElementChild) hydrate(<Root />, root);
else render(<Root />, root);

void init();
