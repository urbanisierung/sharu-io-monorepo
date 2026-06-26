// Post-build step: bake the static marketing routes into real HTML files so
// crawlers and link unfurlers get content (not an empty #app) and first paint is
// instant. Runs after `vite build` (client) and the SSR build of prerender.tsx.
//
//   dist/index.html            (template, also the landing output)
//   .ssr/prerender.js          (SSR build of src/prerender.tsx)
//     → dist/index.html, dist/whitepaper/index.html, …  (one per route)
//
// Cloudflare Pages serves these static files for their paths; the _redirects SPA
// fallback still covers every other path. The client hydrates them (main.tsx).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const dist = join(webRoot, 'dist');

const { prerender } = await import(join(webRoot, '.ssr', 'prerender.js'));

const template = await readFile(join(dist, 'index.html'), 'utf8');

const escapeAttr = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replace a whole `<meta …>` tag (matched by an identifying attribute) — robust
 *  to attribute wrapping/minification — with a fresh single-line tag. */
function setMeta(html, attr, value) {
  const re = new RegExp(`<meta\\s+${attr}[\\s\\S]*?>`, 'i');
  return html.replace(re, `<meta ${attr} content="${value}" />`);
}

function applyHead(html, title, description) {
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`);
  out = setMeta(out, 'name="description"', d);
  out = setMeta(out, 'property="og:title"', t);
  out = setMeta(out, 'property="og:description"', d);
  out = setMeta(out, 'name="twitter:title"', t);
  out = setMeta(out, 'name="twitter:description"', d);
  return out;
}

const pages = prerender();
if (!template.includes('<div id="app">')) {
  throw new Error('prerender: could not find <div id="app"> in dist/index.html');
}

for (const { path, html, title, description } of pages) {
  let out = template.replace(/<div id="app">\s*<\/div>/, `<div id="app">${html}</div>`);
  out = applyHead(out, title, description);
  const file = path === '/' ? join(dist, 'index.html') : join(dist, path.slice(1), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, out, 'utf8');
  console.log(`prerendered ${path} → ${file.slice(dist.length + 1) || 'index.html'}`);
}
