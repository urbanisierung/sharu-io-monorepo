// Shared, build-time configuration constants for every Safu app and package.
// Runtime-agnostic by design: plain constants only, no Preact/DOM/Node imports,
// so the SDK, the web app, and the desktop shell can all consume it the same way.

/** The canonical domain the Safu web app is served from. */
export const DOMAIN = 'new.sharu.io';

/** The canonical site origin, derived from {@link DOMAIN}. */
export const SITE_URL = `https://${DOMAIN}`;

/** The project's public source home — surfaced as a trust signal in the UI. */
export const GITHUB_URL = 'https://github.com/sharu-io';
