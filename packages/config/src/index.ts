// Shared, build-time configuration constants for every Safu app and package.
// Runtime-agnostic by design: plain constants only, no Preact/DOM/Node imports,
// so the SDK, the web app, and the desktop shell can all consume it the same way.
//
// The two values that change on a repo transfer or rebrand live in one place:
// `project.config.json` at the repo root. It is the single source of truth shared
// across runtimes — the TypeScript apps import it here, and the Rust node embeds
// the same file (see `crates/safu-node/src/brand.rs`).

import projectConfig from '../../../project.config.json' with { type: 'json' };

/** The canonical domain the Safu web app is served from. */
export const DOMAIN = projectConfig.domain;

/** The canonical site origin, derived from {@link DOMAIN}. */
export const SITE_URL = `https://${DOMAIN}`;

/** The project's GitHub repository, as an `owner/repo` slug. */
export const GITHUB_REPO = projectConfig.githubRepo;

/** The project's public source home — surfaced as a trust signal in the UI. */
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
