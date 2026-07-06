# R1 — Discovery Hardening: Implementation Plan

> Status: **plan** — not yet implemented. This turns Layer R1 of
> [`resilient-transport-research.md`](./resilient-transport-research.md) §6.1
> into a concrete, verifiable engineering task, following the milestone
> discipline of [`implementation-plan.md`](./implementation-plan.md) (each step
> states a **verify**; each phase has **exit criteria**; additions only — no
> breaking change to the SDK `Transport` API).

## Goal

Remove n0 from Safu's **liveness equation**. Today the relay is configurable
(`SHARU_RELAY_URL`) but **discovery is hardcoded** to `presets::N0`
(`native.rs:40`, `wasm.rs:43`) — the one dependency that cannot be swapped
without a rebuild. If `dns.iroh.link` goes dark, dial-by-`EndpointId` fails
everywhere.

R1 makes discovery configurable the same way relays already are, and adds a
**company-less discovery path** (BitTorrent Mainline DHT + local mDNS) on
native. Success = *n0 could disappear tomorrow and nothing breaks except
convenience.*

## Guiding constraint: mirror the relay seam exactly

The relay override is a proven, four-layer pattern. R1 adds a **parallel**
discovery override at each of the same four points. Nothing else changes.

| Layer | Relay override (exists) | Discovery override (add) |
| --- | --- | --- |
| Rust native | `NativeEndpoint::bind_with_relays(protocols, relays)` — `native.rs:38` | `bind_with(protocols, relays, discovery)` |
| Rust wasm | `IrohEndpoint::create(protocols, relays)` — `wasm.rs:40` | `IrohEndpoint::create(protocols, relays, discovery)` |
| TS entry | `createIrohTransport(protocols, timeout, relays)` + `parseRelays(env)` — `iroh.ts:119,134` | add `discovery` arg + `parseDiscovery(env)` |
| Runtime wiring | `SHARU_RELAY_URL` / `VITE_SHARU_RELAY_URL` / `--relay` read in `apps/peer/src/transport.ts`, `apps/web/src/runtime.ts`, `crates/sharu/src/main.rs` | `SHARU_DISCOVERY` / `VITE_SHARU_DISCOVERY` / `--discovery` at the same sites |

Because the SDK depends only on the `Transport` interface (never on
`@safu/transport/iroh`), **none of this touches the SDK's public API** — R1 is
purely additive at the transport-construction boundary, exactly like the relay
work was.

---

## The discovery config shape

Model discovery as a **list of provider tokens**, parsed from a comma-separated
env string — structurally identical to `parseRelays`. This composes (n0's own
docs recommend running DNS + DHT + mDNS *together*), stays a plain string on the
wire, and degrades cleanly per-runtime.

Tokens:

| Token | Meaning | Native | Browser | n0 infra? |
| --- | --- | --- | --- | --- |
| `n0` | DNS discovery via `dns.iroh.link` + pkarr publish (today's behavior) | ✅ | ✅ | **Yes** |
| `dns:<origin>` | Self-hosted `iroh-dns-server`: publish + resolve pkarr at your own origin (e.g. `dns:https://dns.example.com`) | ✅ | ✅ (HTTPS) | No |
| `dht` | BitTorrent Mainline DHT via pkarr signed packets — no operator at all | ✅ | ❌ (UDP) | No |
| `mdns` | Local-network mDNS/swarm discovery | ✅ | ❌ (no multicast) | No |

Rules:
- **Unset → `n0`.** Preserves current behavior byte-for-byte; R1 is opt-in and
  non-breaking. (Assumption: we do *not* flip the default to a hardened profile
  in R1 — that is a deployment decision in R1.4, tracked separately, so this
  change ships risk-free.)
- **Browser drops `dht`/`mdns`** with a one-line `console.warn`, keeping any
  `n0`/`dns:` tokens. A browser given only `dht,mdns` falls back to `n0` and
  warns (never silently unreachable).
- **Recommended hardened native profile:** `n0,dht,mdns` (keep n0 as one of
  several, add the company-less paths) or `dns:<own>,dht,mdns` (fully
  n0-independent). Documented in R1.4, not defaulted in R1.

---

## Phase R1.1 — Discovery-config seam (no new discovery yet)

Thread a discovery config through all four layers, implementing only the two
tokens that need no new dependency: `n0` (existing) and `dns:<origin>`
(self-hosted DNS). This lands the plumbing and the self-hosting story with the
smallest possible diff; `dht`/`mdns` follow in R1.2.

### Rust (`crates/safu-transport`)

- Add a `Discovery` type (an ordered set of provider specs) and a parser
  mirroring `split_relays`.
- **`native.rs`:** rename the internal builder to `bind_with(protocols, relays,
  discovery)`; keep `bind` and `bind_with_relays` as thin wrappers
  (`bind_with_relays(p, r)` = `bind_with(p, r, Discovery::N0)`) so **no existing
  caller breaks**. Construct the endpoint from the chosen discovery providers
  instead of unconditionally `presets::N0`.
- **`wasm.rs`:** add a `discovery: Vec<String>` param to
  `IrohEndpoint::create`; parse and apply the same way (browser-valid tokens
  only).
- **⚠️ Spike first (blocks the exact API):** determine, against the pinned
  `iroh = "1"`, how to compose discovery — whether to start from
  `presets::Minimal` and add `RelayMode::custom` + explicit discovery builders,
  or start from `presets::N0` and *replace* its discovery. The N0 preset bundles
  DNS discovery **and** relay; overriding one must not silently drop the other.
  Capture the answer in a code comment (the relay comments in `native.rs:32-37`
  are the model).

### TypeScript (`packages/transport/src/iroh.ts`)

- Add `export function parseDiscovery(value: string | undefined): string[]`
  next to `parseRelays` (same trim/filter logic).
- Add a `discovery: string[] = []` param to `createIrohTransport`; pass it to
  `IrohEndpoint.create(protocols, relays, discovery)`. Empty → the binding
  defaults to `n0`.

### Runtime wiring (read env, pass through)

- `apps/peer/src/transport.ts`: `parseDiscovery(process.env.SHARU_DISCOVERY)`.
- `apps/web/src/runtime.ts`: `parseDiscovery(import.meta.env.VITE_SHARU_DISCOVERY)`.
- `crates/sharu/src/main.rs`: seed from `SHARU_DISCOVERY`, add a repeatable
  `--discovery <token>` flag (mirror `--relay` at `main.rs:829`), print the
  active discovery in `info`/`serve` (mirror the relay print at `main.rs:144`),
  and add the `--help` line (mirror `main.rs:787`).

**Verify:**
- Existing `bind`/`bind_with_relays`/`createIrohTransport` call sites compile
  unchanged; `cargo test` + vitest green (behavior identical when unset).
- Unit: `parseDiscovery` splits/trims/filters like `parseRelays` (table test).
- Unit (Rust): the `Discovery` parser rejects malformed `dns:` origins and
  accepts a bare `n0`.
- A `SHARU_DISCOVERY=dns:https://dns.invalid` run surfaces a clear bind error,
  not a silent fall-through to n0 (fail-fast per CLAUDE.md error handling).

**Exit criteria:** discovery is configurable end-to-end via env/flag on all
three runtimes; default-unset behavior is byte-identical to today; `n0` and
`dns:<origin>` both work against a locally-run `iroh-dns-server`; typecheck +
Biome + `cargo test` clean.

---

## Phase R1.2 — Company-less discovery on native (Mainline DHT + mDNS)

Implement the `dht` and `mdns` tokens for the native path only.

- **Dependency (justified):** add `iroh-mainline-address-lookup` (the 1.x crate
  exposing `DhtAddressLookup`; pre-1.0 this was iroh's `discovery-pkarr-dht`
  feature). Justification for the PR against the CLAUDE.md "only if really
  needed" rule: this is the *entire point* of R1 — company-independent
  discovery over a 20-year-old, ~10M-node DHT that no company operates, and
  which publishes the same pkarr signed packets iroh already uses. mDNS is
  in-tree (no new dep). Gate the DHT crate behind a Cargo feature
  (`mainline`, default-on for native, **off for wasm** — Mainline is UDP, not
  browser-reachable) so the wasm build neither pulls nor grows from it.
- Wire `dht` → `DhtAddressLookup`, `mdns` → the in-tree local discovery, into
  the `Discovery` composition from R1.1. Multiple tokens compose (add several
  discovery providers to one endpoint).
- **Republish ownership (research open-Q #2):** pkarr records expire in hours.
  Decide and document who republishes: for the always-on node (`crates/sharu`,
  `apps/peer`) the endpoint stays online so the provider handles it; for
  mostly-offline desktop devices, publishing to DHT is best-effort and paired
  peers rely on the `{id, relayUrl}` already embedded in pairing codes. State
  this explicitly rather than implying always-on DHT presence.

**Verify:**
- Two native endpoints on the same LAN discover each other by `EndpointId`
  alone via **mDNS**, with **no relay and no DNS** configured
  (`SHARU_DISCOVERY=mdns`, no `SHARU_RELAY_URL`) — proves a fully sovereign
  local path. Deterministic (same-host loopback + mDNS), gated behind an
  opt-in flag if timing is environment-sensitive.
- Two native endpoints discover each other by `EndpointId` via **`dht`** with
  n0 DNS disabled — gated (`SAFU_E2E`-style) since it hits the public Mainline
  DHT and is non-deterministic; run locally, not in the offline CI sandbox
  (same treatment as the existing relay e2e, `status.md` §"CI-only limitation").
- wasm build unchanged in size/behavior (feature off); `cargo test` + both WASM
  builds green.

**Exit criteria:** a native node reaches a peer by id with **zero n0
infrastructure** (mDNS locally, Mainline DHT globally); the wasm build is
unaffected; the republish policy is documented.

---

## Phase R1.3 — Browser verification spike (the gating unknown)

Custom relay + custom discovery in the WASM build is documented **nowhere**
upstream (research §6.1.3). It *should* work — relays are plain
`RelayMode::custom`; pkarr publish/resolve is HTTPS — but this must be **proven**
before we tell anyone the web app is n0-independent. This phase is verification,
not new product code.

**Verify (the spike):**
- Stand up a self-hosted `iroh-relay` + `iroh-dns-server` (local/CI or a scratch
  VPS). Build the web app / peer WASM with `VITE_SHARU_DISCOVERY=dns:<origin>`
  and `VITE_SHARU_RELAY_URL=<own>`.
- Two browser endpoints (or two in-Node WASM endpoints, mirroring
  `transfer.e2e.browser.test.ts`) pair and transfer one block **with n0's
  DNS and relay unreachable** (blocked at the network layer for the test).
- Confirm pkarr publish/resolve works over HTTPS from wasm (no UDP path taken).

**Exit criteria:** a documented, reproducible test showing browser↔browser (or
WASM↔WASM) pairing + block transfer against **only** self-hosted relay+DNS, with
n0 blocked. If the spike *fails* (e.g. wasm hard-ties discovery to n0), that is a
finding: record it, keep `n0` as the browser default, and escalate to the R3
WebRTC hedge — do not paper over it.

---

## Phase R1.4 — Self-hosted-first deployment posture (docs + defaults)

Code from R1.1–R1.3 exists; this phase changes *guidance and defaults*, not
mechanics.

- Extend [`deployment.md`](./deployment.md) §"Self-hosting the relay" with a
  parallel §"Self-hosting discovery": running `iroh-dns-server` (pkarr origin),
  the `dns:<origin>` token, and the recommended hardened profiles per runtime.
- Demote n0 public infra from *default* to *one fallback entry* in a
  **multi-operator** relay+discovery list (iroh's `RelayMap`/discovery APIs
  already accept lists — research §5). Document `n0,dht,mdns` as the suggested
  resilient native default and the rationale (n0 stays as convenience, not
  dependence).
- Note the relay-economics open question (research open-Q #5) so operators size
  a self-hosted relay realistically.

**Exit criteria:** an operator can follow `deployment.md` to run Safu with **no
n0 dependency on any runtime** (native: self-DNS or DHT + own relay; browser:
self-DNS + own relay, contingent on R1.3), and understands the fallback-list
model.

---

## Dependencies added

| Crate | Layer | Justification (for the PR) |
| --- | --- | --- |
| `iroh-mainline-address-lookup` | native only, `mainline` feature | The company-less discovery path — R1's core goal; publishes the pkarr packets iroh already uses to a no-operator DHT. Excluded from wasm (UDP). |

No JS/TS dependencies added — `parseDiscovery` is a few lines beside
`parseRelays`. mDNS discovery is in-tree in `iroh`.

## Sequencing & risk

1. **R1.1** first — pure plumbing, non-breaking, unblocks the rest. Low risk.
2. **R1.2** next — native company-less discovery; medium risk (new dep, DHT
   non-determinism handled by gating the e2e).
3. **R1.3** is the **critical unknown** and can run in parallel with R1.2; its
   outcome decides whether the browser is truly hardenable via iroh or needs the
   R3 WebRTC hedge. Do not claim "n0-independent web app" until R1.3 passes.
4. **R1.4** last — flips guidance once the mechanics are proven.

**Assumption to confirm before starting:** the R1.1 spike (iroh 1.x discovery
composition API) resolves cleanly. If iroh 1.x turns out to *not* let you keep
the N0 relay while replacing discovery (or vice versa), R1.1's `Discovery` type
absorbs that — but flag it early, as it shapes the enum.

## Out of scope (deferred to R2/R3)

Multi-host share links, multi-relay pairing codes, origin-independent share
links, the community relay pool, the IPFS public-share mirror, WebRTC/Nostr
browser transport, and Tor/arti — all tracked in
[`resilient-transport-research.md`](./resilient-transport-research.md) §6.2–6.3.
