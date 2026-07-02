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

## Self-hosting the relay

By default every runtime uses n0's public relay servers (iroh.computer). The
relay is a coordination + NAT-traversal fallback — it only ever forwards
encrypted QUIC, never plaintext — but it is a *liveness* dependency: if it is
unreachable, browser peers (which are relay-only) cannot connect. To drop that
dependency, run your own [`iroh-relay`](https://github.com/n0-computer/iroh)
server on a host with a public address + TLS, and point each runtime at it. No
fork required — it is configuration:

- **Web app** — set `VITE_SHARU_RELAY_URL` at build time (comma-separate for
  several relays), e.g. `VITE_SHARU_RELAY_URL=https://relay.example.com pnpm -r build`.
- **CLI node (`sharu`)** — pass `--relay https://relay.example.com` (repeatable)
  or set `SHARU_RELAY_URL` (comma-separated). `sharu info` / `serve` print the
  configured relays.
- **Headless peer (`apps/peer`) and desktop** — set `SHARU_RELAY_URL`.

Peer discovery still uses the N0 preset (n0 DNS/pkarr); only the relay map is
overridden. For a node you control, giving it a directly reachable address
(public IP / forwarded port / IPv6) lets your devices reach it over direct QUIC
with no relay on the data path at all — the strongest form of relay independence.

## Headers / cross-origin isolation

The app intentionally does **not** set `Cross-Origin-Opener-Policy` /
`Cross-Origin-Embedder-Policy`. The WASM is single-threaded (no
`SharedArrayBuffer`), OPFS access handles work without cross-origin isolation,
and the Iroh relay uses WebSockets (unaffected by COEP). Enabling
`COEP: require-corp` would instead break Iroh's cross-origin relay probes, so it
is left off. Cloudflare Pages already serves `.wasm` with the correct
`application/wasm` MIME type.
