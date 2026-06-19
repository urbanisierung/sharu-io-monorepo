# Project Safu — Continuation Handoff

This document lets a fresh agent session (e.g. a cloud container) pick up the
build with full context. Read [`implementation-plan.md`](./implementation-plan.md)
and [`sharu_modernization_blueprint.md`](./sharu_modernization_blueprint.md)
first; this file covers **current state, environment setup, and the next steps**.

Branch: `claude/vision-doc-plan-lu8dhf`. All work below is committed.

---

## 1. Current State

| Milestone | Status | Commits |
| --- | --- | --- |
| **M0 — Scaffold** | ✅ done | `feat: M0 scaffold …` |
| **M1 — Crypto pipeline & local storage** | ✅ done (Phase 1 exit met) | `feat: M1 crypto pipeline …`, `test: complete M1 tail …` |
| **M2 — Web App & P2P sync (§2.1–2.4)** | ✅ core done; e2e gated | `feat(M2): transport contract …`, `feat(M2): iroh→WASM binding …` |
| **M3 — Tauri desktop (§3.1–3.4)** | 🟡 native core verified; shell scaffolded | `feat(M3): native transport + Tauri scaffold` |

### M2 / M3 progress (this session)

- **§2.1 spike confirmed:** `iroh` v1.0.0 compiles to `wasm32-unknown-unknown`.
  A real binding (`crates/safu-transport`, `wasm` module) exposes
  `IrohEndpoint`/`IrohChannel` (relay-only N0 preset, length-prefixed frames);
  `wasm-pack` produces the artifact. Browser adapter: `@safu/transport/iroh`.
- **Transport contract:** `packages/transport` defines the one `Transport`/
  `Channel` interface both runtimes implement, plus an in-process
  `LoopbackNetwork` for testing without a relay.
- **§2.3 doc sync (resolved open questions):** `AllocationTable` is a per-path
  LWW-register CvRDT over a Hybrid Logical Clock — converges regardless of
  arrival order, preserves concurrent inserts, never silently drops a write.
  `SyncDoc` adds write-authorization with **permanent revocation** (the
  "lost device" question). `DocSync` wires deltas + block transfer over the
  transport; only ciphertext crosses.
- **§2.4 web shell:** signal-driven Cascivo UI with all flagged interaction
  states (first-run/drag valid|invalid/chunking/success/error/zero-peer), i18n
  for all copy, plus a lint guard test rejecting React hooks + hardcoded strings.
- **Full pipeline proven end-to-end (minus the relay hop):**
  `apps/web/src/sync.integration.test.ts` drives the real crypto pipeline over
  the loopback transport — A ingests a 3 MiB file, the allocation table syncs to
  B, B pulls the referenced blocks, and B **restores** the plaintext with BLAKE3
  parity (plus single-device round-trip and wrong-passphrase rejection). The
  ingest/restore manifest design lives in `apps/web/src/pipeline.ts`.
- **Restore + pairing wired into the UI:** download (restore) per file, and a
  device-pairing affordance (show self id/relay, enter a peer's id+relay). The
  web app builds (`pnpm --filter @safu/web build`).
- **Live relay e2e is gated** (`SAFU_E2E=1`, injected as `__SAFU_E2E__`). It
  cannot pass in the headless CI sandbox: Iroh's net-report HTTPS probes to the
  relays fail at the browser `fetch`/CORS layer (`TypeError: Failed to fetch`)
  even though the relay hosts answer plain HTTPS, so `online()` never completes.
  This is an environment limit, not a code defect — the transport binds,
  configures pkarr/DNS, and issues correct probes. Run it from a normal browser
  origin with relay access to close §2.4's literal relay hop. (`createIrohTransport`
  now waits for `online()` so a dialable relay address is set before use.)
- **M3:** the **native** Iroh transport (`safu_transport::native`, direct
  hole-punching) is written and **verified to compile** (`cargo check -p
  safu-transport`). The Tauri shell (`apps/desktop`) is scaffolded — native FS
  block store, FS watcher, transport-bridge commands, tray/autostart, and the
  `@safu/transport/tauri` adapter — but needs a desktop host with the webview
  toolchain to build/run; see `apps/desktop/README.md` for what's verified vs.
  pending (incl. the §3.4 web→relay→desktop benchmark).

**Phase 1 exit criteria are met:** lossless, memory-bounded, authenticated local
round-trip (ingest → chunk → hash → encrypt → store → decrypt → reassemble) with
green unit + integration + browser suites and clean Biome/typecheck.

### What exists

- **`crates/safu-crypto`** (Rust → WASM): BLAKE3, Argon2id KDF (OWASP interactive
  64 MiB / t=3 / p=4), AES-256-GCM seal/open, and a streaming FastCDC chunker.
  Nonces and salts are supplied by the caller so the core is deterministic and
  needs no RNG. 10 native `cargo test`s (AES-256-GCM NIST vector, tamper
  detection, Argon2id salt separation, CDC push-window invariance, max-chunk
  bound).
- **`packages/crypto`** (`@safu/crypto`): TS streaming pipeline over the WASM
  primitives. `createIngestStream(input, passphrase, {chunking?})` →
  `{ salt, blocks }`; `createEgressStream(blocks, passphrase, salt)` →
  `ReadableStream`. Universal WASM loader (`src/wasm.ts`) works under Node
  (vitest reads the `.wasm` bytes) and the browser (Vite fetches). 8 vitest
  tests + 1 opt-in memory benchmark.
- **`packages/sdk`** (`@safu/sdk`): `BlockStore` interface, `MemoryBlockStore`,
  `OpfsBlockStore` (browser, tested in real Chromium), and domain state as
  `@preact/signals-core` signals (`syncStatus`).
- **`packages/transport`** (`@safu/transport`): scaffold only; Iroh bindings
  land in M2.
- **`apps/web`**: Vite + Preact shell, a Cascivo-derived `Button` driven by a
  `@preact/signals` signal, signal-driven smoke test (happy-dom).
- **`crates/safu-transport`**: scaffold crate (proves the Rust→WASM pipeline).

### Test inventory (`pnpm test` runs all three projects)

- `node` project — `packages/*/src/**/*.test.ts` (sdk + crypto).
- `web` project — `apps/web/src/**/*.test.tsx` (happy-dom).
- `opfs` project — `packages/sdk/src/**/*.browser.test.ts` (Playwright/Chromium).
- Opt-in benchmark — `packages/crypto/src/memory.bench.test.ts`, skipped unless
  `SAFU_BENCH=1`.

---

## 2. Environment Setup (fresh container)

The repo needs **Node ≥ 22 + pnpm ≥ 10**, a **Rust toolchain with the
`wasm32-unknown-unknown` target**, and **wasm-pack**. The OPFS browser test
additionally needs **Chromium via Playwright**.

```sh
# 1. Rust + wasm target + wasm-pack
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# 2. pnpm (via corepack) + JS deps
corepack enable
pnpm install

# 3. Browser for the OPFS test (optional but part of the gate)
pnpm exec playwright install --with-deps chromium chromium-headless-shell

# 4. Build the WASM crates, then verify everything
pnpm -r build
pnpm -r typecheck
pnpm test
cargo test
pnpm exec biome ci .
```

Reference versions this was built against: Node 24.17, pnpm 10.21, Rust/Cargo
1.96, wasm-pack 0.14. "Latest versions only" is a project constraint — newer is
fine, but re-run the full gate after any bump.

If Chromium cannot be installed in the container, run the non-browser projects
only and note the gap:

```sh
pnpm exec vitest run --project node --project web
```

---

## 3. Commands

| Task | Command |
| --- | --- |
| Build everything (wasm + tsc + vite) | `pnpm -r build` |
| Typecheck | `pnpm -r typecheck` |
| All tests (node + web + OPFS browser) | `pnpm test` |
| Rust tests | `cargo test` |
| Lint + format check | `pnpm exec biome ci .` |
| Auto-fix lint/format | `pnpm exec biome check --write .` |
| Build one wasm crate | `pnpm --filter @safu/crypto build:wasm` |
| Dev server | `pnpm --filter @safu/web dev` |
| Memory benchmark (opt-in) | `SAFU_BENCH=1 NODE_OPTIONS=--expose-gc pnpm exec vitest run --project node packages/crypto/src/memory.bench.test.ts` |

**The real lint gate is `pnpm exec biome ci .`** — `pnpm lint` is intercepted by
an unrelated environment wrapper on the original machine; verify in your own
environment.

---

## 4. Resolved Design Decisions

These were decided with the project owner; do not silently revisit them.

| Topic | Decision |
| --- | --- |
| State model | Signals everywhere — `@preact/signals-core` (SDK/domain), `@preact/signals` (view). No Zustand. No `useState/useEffect/useContext/useReducer`. |
| UI library | **Cascivo** (`@cascivo/core`, `@cascivo/i18n`) — the owner's own CSS-native, signal-driven, headless primitives library (FSM + signals: `Slot`, `cn`, `Portal`, `useMachine`, …). It has **no prebuilt components**; copy components in-repo under `apps/web/src/ui` and own them. Runs under Preact via `preact/compat`. |
| Chunking | Content-defined (FastCDC), 512 KiB–4 MiB band. |
| Key API | `createIngestStream(input, passphrase: string)`; Argon2id runs **inside** `@safu/crypto`; passphrase never leaves the caller; the per-ingest salt is returned and must be stored with the manifest. |
| Cross-device key | Shared passphrase out-of-band (e.g. QR/short code); each device derives the same key independently. No key is transmitted. |
| Block addressing / dedup | Blocks are stored content-addressed by **BLAKE3(ciphertext)** with a **random 12-byte nonce per block**. This is security-first (no plaintext-equality leak) and means **no plaintext dedup**. Convergent encryption (dedup, with a content-equality leak) is a deliberate *future* option, not chosen. |
| Browser transport | Iroh in the browser is **relay-only over WebSocket** via the public **n0.computer** relay network — browsers cannot do direct UDP/QUIC. Direct hole-punching is desktop-only (M3). This is a confirmed constraint, not a risk. |
| Relay | Use Iroh's public n0.computer relay for M2; self-hosting decision deferred. |
| SDK API contract | Later phases may **add** to the `packages/sdk` public API but must not make **breaking changes** (removals/signature changes). |

---

## 5. Non-Obvious Gotchas

- **`getrandom` "js" feature**: `safu-crypto` pulls `getrandom` transitively via
  `rand_core` (aes-gcm/argon2). `Cargo.toml` enables its `js` feature *only* for
  `cfg(target_arch = "wasm32")` so the WASM build links. We never use it for key
  material.
- **Packages export TypeScript source** (`"exports": "./src/index.ts"`), not a
  compiled `dist`: `@safu/crypto`, `@safu/transport`, and `@safu/sdk` all do.
  All consumers are Vite/vitest and compile the source directly, so there is no
  build step to forget and no stale-`dist` hazard. (`@safu/sdk` previously
  shipped a `dist`, which meant app-level tests silently ran old SDK code until
  a rebuild — fixed by exporting source like its siblings.) `crypto`/`transport`
  keep a `build` script only for `wasm-pack`; `sdk` has none.
- **vitest 4 browser provider** is a factory: `provider: playwright()` imported
  from `@vitest/browser-playwright` — *not* the string `'playwright'`.
- **`--expose-gc` for the memory bench**: vitest project-level
  `poolOptions.execArgv` did **not** propagate; pass `NODE_OPTIONS=--expose-gc`
  instead.
- **Commits are unsigned** here (`--no-gpg-sign`) because no GPG key was
  available; sign normally if your environment has one.
- **WASM artifacts** (`packages/*/wasm/`) and `dist/`/`target/` are gitignored;
  regenerate with `pnpm -r build`.

---

## 6. How to Continue — M2 (Web App & P2P Synchronization)

Goal: a browser client that discovers a peer, syncs the file allocation table,
and transfers an encrypted asset browser-to-browser with no manual config.
Exit criterion: unattended browser-to-browser encrypted transfer passing e2e,
with no breaking change to the `@safu/sdk` public API.

Suggested order (each step: write tests first, keep all gates green):

1. **§2.1 Spike Iroh-in-WASM first (highest risk).** Before building on it,
   prove the relay-only browser path: compile `iroh` (+ `iroh-blobs`,
   `iroh-docs`) for `wasm32-unknown-unknown`, load in a Web Worker, and move one
   block between two in-process endpoints over the n0.computer relay (or a test
   relay). Put the binding behind a small TS interface in `packages/transport`
   (define that interface here — it does not exist yet). If the spike fails,
   stop and report rather than building M2 on top of it. Confirm `iroh`'s
   current browser support and API in its docs before coding.
2. **§2.2 Pair-wise discovery.** Ephemeral key-exchange handshake; public keys
   as addresses; rendezvous via the relay. Verify two SDK instances complete a
   handshake over a test relay. Wire in the shared-passphrase key model.
3. **§2.3 Document sync engine** in `packages/sdk`. `iroh-docs`-backed
   replicated document holding the allocation table (path → ordered block
   hashes + metadata). Decide and document the conflict-resolution semantics
   (LWW vs. a CRDT that preserves concurrent inserts) — this was flagged as an
   open question and matters for a backup system. Verify convergence regardless
   of arrival order.
4. **§2.4 Web app shell** in `apps/web`. Build the drag-drop ingest UI from
   Cascivo primitives; consume SDK signals (sync status, transfer progress,
   peer list) directly. Define the interaction states the design review flagged
   as missing (drag-over valid/invalid, chunking/progress, error, success,
   zero-peer, first-run key entry). All user strings through `@cascivo/i18n`.
5. **Add the hook/lint guard** (§2.4 verify): a check that rejects
   `useState/useEffect/useContext/useReducer` in UI and hardcoded user-facing
   strings.
6. **e2e** (Playwright, two browser contexts + a relay): asset dropped in tab A
   is chunked, encrypted, signaled via relay, pulled by tab B, reassembled with
   hash parity — no human config.

### Open questions to resolve during M2 (from the plan review)

- `iroh-docs` conflict-resolution algorithm (LWW vs. CRDT preserving concurrent
  inserts) — pick deliberately; a backup tool should not silently drop writes.
- Peer authorization / revocation: what stops a previously-paired (lost) device
  from continuing to push mutations? Define write-authorization on the synced
  document.
- Relay trust at rendezvous (MITM substituting a peer key) — needs out-of-band
  fingerprint/SAS verification in the pairing UX.
- First-run/onboarding and peer-trust UX (currently undefined).

---

## 7. Conventions

- Follow `CLAUDE.md` (root). Strict TypeScript everywhere; zero warnings/errors.
- `packages/sdk` and `packages/crypto` stay runtime-agnostic — **no Preact / app
  framework imports** in them (signals via `@preact/signals-core` only).
- Streaming only — never buffer a whole file in memory.
- Justify every new dependency in its PR against the "latest versions, only if
  truly needed" constraint.
- TDD for crypto/protocol work; the milestone exit criteria are the success
  tests.
