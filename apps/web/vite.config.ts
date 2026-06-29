import preact from '@preact/preset-vite';
import { SITE_URL } from '@safu/config';
import { defineConfig } from 'vite';

// `@preact/preset-vite` aliases react/react-dom → preact/compat so Cascivo's
// React-typed components run under Preact (plan §0).
//
// `%SITE_URL%` placeholders in index.html (canonical/OG/Twitter URLs) are filled
// from the single source of truth (`project.config.json` via `@safu/config`), so
// a domain change is a one-file edit.
export default defineConfig({
  plugins: [
    preact(),
    {
      name: 'safu-html-site-url',
      transformIndexHtml(html) {
        return html.replaceAll('%SITE_URL%', SITE_URL);
      },
    },
  ],
});
