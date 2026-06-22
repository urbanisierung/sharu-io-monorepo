# Deploying the web app to Cloudflare Pages

The Safu web app (`apps/web`) is a static Vite + Preact SPA that depends on two
**Rust→WASM** packages built with `wasm-pack`: `@safu/crypto` and
`@safu/transport` (Iroh, relay-only). Cloudflare Pages' native Git build image
has no Rust toolchain, so we build in GitHub Actions and let Wrangler upload the
finished `dist/` (workflow: [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml)).

## One-time setup

1. **Create the Pages project** named `safu-web` (must match
   [`apps/web/wrangler.toml`](../apps/web/wrangler.toml)). Either:
   - run `pnpm -r build && cd apps/web && npx wrangler pages deploy` locally once
     (Wrangler creates the project on first deploy), or
   - create an empty "Direct Upload" project in the Cloudflare dashboard.
2. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — a token with the **Cloudflare Pages: Edit**
     permission.
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account id.
3. The Pages project's **production branch** should be `main`; the workflow runs
   on push to `main` (and via manual `workflow_dispatch`), so those deploys
   publish to production.

## Build pipeline

`pnpm -r build` runs in topological order: the two WASM crates compile first
(`wasm-pack build … --target web`), then `vite build` emits `apps/web/dist`
(default output dir). `apps/desktop` is excluded from the pnpm workspace, so it
is never part of this build.

## Headers / cross-origin isolation

The app intentionally does **not** set `Cross-Origin-Opener-Policy` /
`Cross-Origin-Embedder-Policy`. The WASM is single-threaded (no
`SharedArrayBuffer`), OPFS access handles work without cross-origin isolation,
and the Iroh relay uses WebSockets (unaffected by COEP). Enabling
`COEP: require-corp` would instead break Iroh's cross-origin relay probes, so it
is left off. Cloudflare Pages already serves `.wasm` with the correct
`application/wasm` MIME type.
