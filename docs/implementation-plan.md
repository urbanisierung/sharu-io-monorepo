# Execution & Implementation Plan — Project Safu (Sharu Modernization)

This plan turns [`sharu_modernization_blueprint.md`](./sharu_modernization_blueprint.md)
into a concrete, verifiable engineering roadmap, constrained by the stack
mandated in [`vision.md`](./vision.md): a **pnpm monorepo, TypeScript, Vite,
Preact**, latest versions only, external dependencies only when truly warranted.
(`vision.md` also lists Zustand; per the project owner, state is **signals
everywhere** instead — see §0.)

## 0. Decisions Driving This Plan

The blueprint and the vision doc are not fully reconcilable on their own. The
following decisions resolve the tensions and are assumed throughout:

| Area | Decision | Rationale |
| --- | --- | --- |
| **P2P transport** | **Iroh (Rust)** compiled to **WASM** for web, run **natively** inside Tauri. | Blueprint-faithful direct-QUIC transport. A hand-rolled WebRTC stack would diverge from the spec and reinvent NAT traversal / relay logic Iroh already solves. |
| **Crypto primitives** | **Blueprint-faithful**: BLAKE3 (hashing), Argon2id (KDF), AES-256-GCM (block cipher). | Web Crypto natively provides AES-GCM and PBKDF2 only. BLAKE3 + Argon2id require small, audited WASM libraries — accepted as justified dependencies. |
| **Runtime parity** | Business logic lives in `packages/sdk` + `packages/crypto` and is **runtime-agnostic**. Web and desktop are thin shells. | Blueprint §1.2 — no duplicated business logic across runtimes. |
| **State sync** | `iroh-docs`-style replicated documents own the file allocation tables; conflict resolution is deterministic and decoupled from transport. | Blueprint §4 — state machine consistency. |
| **Streaming** | All ingestion/egress is stream-based. Raw files are never fully buffered in memory. | Blueprint §4 — memory budgets. |
| **UI library** | **Cascivo** ([cascivo.com](https://cascivo.com), [docs](https://docs.cascivo.com)) is the mandated frontend component library. | Required. CSS-native, signal-driven, shadcn-style copy-paste components owned in-repo; aligns with the Preact + signals direction. |
| **UI state model** | **Signals everywhere.** `@preact/signals-core` (framework-agnostic) for SDK/domain state; `@preact/signals` for Cascivo view state. **No Zustand.** | One reactive model end-to-end matches Cascivo's signal-driven mandate, removes a dependency, and eliminates a bridge layer. `signals-core` has no Preact dependency, so the SDK stays runtime-agnostic. **Supersedes `vision.md`'s Zustand listing** — deliberate, per project owner. |

### Justified external dependencies

Per "only if really needed", the dependency budget is deliberately small:

- **Rust crates** (compiled to WASM / native): `iroh`, `iroh-blobs`,
  `iroh-docs`, `blake3`, `argon2`, an AES-GCM crate (e.g. `aes-gcm`). (`age`
  is deliberately excluded — no phase has a consumer for it.)
- **JS/TS**: `preact` (with `@preact/preset-vite` aliasing `react`/`react-dom`
  → `preact/compat`, since Cascivo components are typed as React),
  `@preact/signals` (app/view) + `@preact/signals-core` (SDK/domain,
  framework-agnostic), `vite`, `typescript`, `vitest`, `@biomejs/biome`
  (lint+format), `wasm-pack` / `wasm-bindgen` tooling. Tauri 2.0 for the
  desktop shell.
- **UI (Cascivo)**: runtime packages `@cascivo/core` and `@cascivo/i18n`
  ([docs](https://docs.cascivo.com)); components are added via the
  copy-paste/MCP workflow (`npx @cascivo/mcp`, `registry.json`) and live in-repo
  under `apps/web` (we own the code). Theme is driven by `--cascivo-*` CSS
  custom properties; styling is CSS Modules only.

Everything else must be justified in review against the vision constraint.

---

## 1. Repository Topology

```
sharu-io-monorepo/
├─ apps/
│  ├─ web/                # Preact SPA (Vite). Thin UI shell over the SDK.
│  │  └─ src/ui/          # Cascivo components copied in-repo (.tsx + .module.css).
│  └─ desktop/            # Tauri 2.0 wrapper. Injects apps/web build; native core.
├─ packages/
│  ├─ crypto/             # Stream chunking, BLAKE3, Argon2id KDF, AES-256-GCM.
│  │                      #   TS API over a Rust→WASM core (+ native binding).
│  ├─ sdk/                # State machine, ingestion pipeline, P2P sync primitives,
│  │                      #   storage abstraction. Runtime-agnostic.
│  └─ transport/          # Iroh bindings: WASM build for web, native for Tauri.
├─ crates/                # Rust sources compiled to the above packages.
│  ├─ safu-crypto/
│  └─ safu-transport/
├─ docs/
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ biome.json
└─ Cargo.toml             # Rust workspace for crates/.
```

`packages/transport` is added beyond the blueprint's four packages to keep the
Iroh/WASM build pipeline isolated from the pure-TS `sdk`, so the SDK depends on
a stable TS interface rather than on WASM build details.

---

## Phase 1 — Cryptographic Pipeline & Local Storage

**Goal:** ingest → chunk → hash → encrypt → persist → decrypt → reassemble a
multi-gigabyte payload entirely locally, with verified hash parity.

### 1.1 Monorepo scaffold
- pnpm workspace, zero-hoisting (`shamefully-hoist=false`), strict
  `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- Cargo workspace under `crates/`; `wasm-pack`/`wasm-bindgen` build wired into
  the `packages/crypto` and `packages/transport` build scripts.
- Biome for lint+format; Vitest configured at the root.
- `apps/web` Vite app configured with `@preact/preset-vite` (aliases
  `react`/`react-dom` → `preact/compat` so Cascivo's React-typed components run
  under Preact). Add `@cascivo/core` + `@cascivo/i18n`; wire the `@cascivo/mcp`
  registry workflow; import the `--cascivo-*` token theme stylesheet at the app
  root. CSS Modules enabled (Vite default).
- **Verify:** `pnpm install && pnpm -r build && pnpm -r typecheck` succeed on an
  empty skeleton in CI; a single Cascivo component (e.g. Button) copied into
  `apps/web/src/ui/` renders and is signal-driven (smoke test).

### 1.2 Cryptographic block engine (`packages/crypto`)
- Rust core `safu-crypto` exposing (via wasm-bindgen): chunker, BLAKE3 hash,
  Argon2id KDF, AES-256-GCM seal/open.
- TS API: `createIngestStream(input, key)` → `AsyncIterable<EncryptedBlock>`;
  `createEgressStream(blocks, key)` → reconstructed byte stream.
- **Content-defined chunking (CDC)** via a rolling hash (Gear or Rabin
  fingerprinting, target chunk size 512 KiB–4 MiB); implementation in
  `safu-crypto`. Per-block BLAKE3 fingerprint.
- Per-block AES-256-GCM with a **12-byte random nonce** per block (generated
  by the CSPRNG; collision probability negligible at expected block counts).
- **Key API:** `createIngestStream(input: ReadableStream, passphrase: string)`.
  Argon2id is invoked *inside* `packages/crypto` to derive the block-encryption
  key from `passphrase` + a freshly generated salt stored alongside the block
  manifest. The passphrase never leaves the caller; the derived key never
  persists. Argon2id parameters: OWASP interactive profile minimum (m=64 MiB,
  t=3, p=4); benchmarked and potentially reduced under WASM constraints in M1.
- **Verify (unit):** known-answer tests for BLAKE3, Argon2id, AES-GCM against
  published vectors; chunk boundaries deterministic; tampered block fails auth.

### 1.3 Local storage abstraction (`packages/sdk`)
- `BlockStore` interface: `put(hash, block)`, `get(hash)`, `has(hash)`.
  (`delete` and `list` are deferred to Phase 2 — no Phase 1 consumer.)
- Implementations: **OPFS** (web, via File System Access API) and **native FS**
  (desktop, via Tauri command bridge). Content-addressed by BLAKE3 hash.
- **Verify (unit):** round-trip put/get/has against an in-memory fake; OPFS impl
  tested in a browser test env (Vitest browser mode / Playwright).

### 1.4 Round-trip validation
- Integration test: stream a large synthetic payload (size-parameterized;
  multi-GB run gated behind an opt-in flag to keep CI fast) through ingest →
  BlockStore → egress; assert BLAKE3 of output equals input.
- Assert peak memory stays bounded (streaming, not buffered). **Memory ceiling:** peak RSS during a 1 GB payload ingestion must not exceed 2× the configured maximum chunk size; integration tests must assert against this bound parametrically.
- **Verify:** integration test green on web (OPFS) and node targets; memory
  ceiling assertion passes.

**Phase 1 exit criteria:** lossless, memory-bounded, authenticated local
round-trip with green unit + integration suites and clean Biome/typecheck.

---

## Phase 2 — Web App & P2P Synchronization

**Goal:** a browser client that discovers a peer, syncs allocation tables, and
transfers an encrypted asset browser-to-browser with no manual config.

### 2.1 WASM transport bindings (`packages/transport`)
- Compile Iroh (`iroh`, `iroh-blobs`, `iroh-docs`) to `wasm32-unknown-unknown`;
  load inside a Web Worker to keep the main thread free.
- **Browser transport is relay-only via WebSocket** through Iroh's public relay
  network (n0.computer). Browsers cannot send raw UDP; direct QUIC/WebTransport
  peer-to-peer is not available in-browser. End-to-end encryption is preserved;
  the relay only sees ciphertext. Direct hole-punching is desktop (Phase 3)
  only.
- **Verify:** WASM module loads in a worker; a loopback transport test moves a
  block between two in-process endpoints over the relay.

### 2.2 Pair-wise discovery
- Ephemeral key-exchange handshake; public keys as addresses (blueprint §1.1).
- Devices register with the **Iroh n0.computer relay network** for rendezvous.
  No self-hosted relay needed for M2; n0.computer is the default DERP backend.
- **Shared-passphrase key model:** both devices share the same passphrase
  out-of-band (e.g. displayed as a QR code or short code). Each device
  independently runs Argon2id with the same passphrase + block salt to derive
  the same block-encryption key. No key is transmitted over the wire.
- **Verify:** two SDK instances complete a handshake and establish an
  authenticated channel via the n0.computer relay.

### 2.3 Document sync engine (`packages/sdk`)
- `iroh-docs`-backed replicated document holds the file allocation table
  (path → ordered block hashes + metadata). Deterministic conflict resolution.
- Local mutations broadcast to paired peers over sync channels; transport state
  is decoupled from document state (blueprint §4).
- **Verify:** mutation on peer A converges on peer B; concurrent edits resolve
  identically regardless of arrival order.

### 2.4 Web app shell (`apps/web`)
- Built entirely from **Cascivo** components (layout primitives, form controls,
  feedback). No bespoke UI where a Cascivo component exists; copy components into
  `src/ui/` via the MCP/registry workflow and own the code.
- **State:** signals end-to-end. The SDK exposes domain state as
  `@preact/signals-core` signals (sync status, transfer progress, peer list);
  the web app consumes them directly with `@preact/signals` and dispatches user
  intents back to the SDK. No separate store, no bridge layer.
- Styling via `--cascivo-*` tokens + CSS Modules only — no Tailwind/CSS-in-JS.
  All user-facing strings go through `@cascivo/i18n` (no hardcoded English).
- Drag-drop ingest UI; minimal, no speculative features.
- **Verify (e2e):** asset dropped in tab A is chunked, encrypted, signaled via
  relay, pulled by tab B, and reassembled with hash parity — no human config.
- **Verify (lint):** a check rejects forbidden React hooks
  (`useState/useEffect/useContext/useReducer`) in Cascivo-derived components and
  hardcoded user-facing strings.

**Phase 2 exit criteria:** unattended browser-to-browser encrypted transfer
passing e2e. `packages/sdk` may gain new exports between Phase 1 and Phase 2
(document sync, peer signals) but must introduce **no breaking changes** to the
Phase 1 public API (proving the storage/crypto layer is transport-agnostic).

---

## Phase 3 — Tauri Desktop Wrapper & Persistence Services

**Goal:** continuous background sync, native filesystem indexing, and direct
UDP hole-punching outside browser constraints.

### 3.1 Desktop shell (`apps/desktop`)
- Tauri 2.0 wrapping the `apps/web` build; Rust core hosts the background
  service.
- **Verify:** desktop app launches and renders the web UI; SDK runs against the
  native `BlockStore`.

### 3.2 Native transport core
- Run Iroh **natively** (not WASM) in the Tauri core: direct UDP hole-punching,
  STUN/TURN, DERP/relay fallback only under symmetric NAT.
- Same `packages/transport` TS interface; native impl swapped in behind it.
- **Verify:** native↔native direct connection established; relay used only when
  direct puncture fails (simulated NAT test).

### 3.3 OS integration
- System tray, launch-on-boot, and filesystem watchers on targeted sync folders
  that emit mutation events into the ingest pipeline.
- **Verify:** a file written to a watched folder is auto-ingested and appears in
  the synced document.

### 3.4 Cross-runtime replication benchmark
- Full loop: file dropped in the **web** app on a constrained network →
  encrypted → relayed over TLS → **desktop** client on a home LAN pulls it via
  direct UDP hole-punching → persisted as a zero-knowledge backup block.
- **Verify:** end-to-end multi-device test (web→relay→desktop) reassembles with
  hash parity, automatically.

**Phase 3 exit criteria:** the benchmark loop passes unattended across web and
desktop runtimes.

---

## 5. Cross-Cutting Engineering Standards

- **CI gates (every PR):** `pnpm -r typecheck`, `biome ci`, `pnpm -r test`,
  WASM build, and the Phase-appropriate integration/e2e suite. Zero warnings.
- **Testing:** unit (Vitest) for crypto/storage/sdk; browser-mode tests for
  OPFS/WASM; Playwright e2e for transfer flows. Deterministic only — no timing
  flakiness; large-payload runs behind opt-in flags.
- **Security:** zero-knowledge invariant enforced by tests asserting only
  ciphertext leaves the crypto boundary; keys never persisted in plaintext;
  Argon2id params reviewed; no secrets in the repo.
- **Memory:** streaming-only assertions in integration tests guard the
  no-raw-buffer rule.
- **Dependencies:** each new dependency justified in its PR against the vision
  constraint; latest versions pinned.

## 6. Milestones & Sequencing

1. **M0 — Scaffold:** §1.1 green in CI. *(unblocks everything)*
2. **M1 — Local pipeline:** §1.2–1.4. *(Phase 1 exit)*
3. **M2 — Web P2P:** §2.1–2.4. *(Phase 2 exit; depends on M1)*
4. **M3 — Desktop:** §3.1–3.4. *(Phase 3 exit; depends on M2)*

Each milestone is independently shippable and gated by its exit criteria. Work
proceeds milestone by milestone; later phases must not introduce **breaking
changes** to the `packages/sdk` public API (additions are permitted; removals
and signature changes are not — a breaking change signals runtime-agnosticism
regression). API surface is validated via TypeScript snapshot tests at each
milestone exit.

## 7. Key Risks

- **Iroh browser transport is relay-only (confirmed):** as of Iroh 0.32+,
  browser builds run relay-only via WebSocket through n0.computer. Direct
  UDP/QUIC is unavailable in-browser; all browser traffic is relayed
  (end-to-end encrypted). This is not a risk — it is a known constraint that
  the plan accounts for. Desktop (Phase 3) gains direct hole-punching via native
  Iroh.
- **OPFS quotas/throughput** across browsers. *Mitigation:* abstract behind
  `BlockStore`; benchmark in M1.
- **WASM crypto performance** for multi-GB streams. *Mitigation:* chunk-level
  parallelism in workers; measured in M1's round-trip benchmark.
- **Tauri/Rust toolchain in CI** adds build complexity. *Mitigation:* cache
  Cargo + wasm artifacts; isolate Rust builds to the two `crates/` packages.
- **Cascivo under Preact:** components are typed as React; `preact/compat`
  aliasing usually suffices, but edge cases (refs, portals, event types) can
  surface. *Mitigation:* validate the compat path in M0 with a simple component
  (e.g. Button) before building UI broadly. Portal/overlay edge cases surface
  naturally during §2.4.
- **SDK signal exposure** must stay on `@preact/signals-core` (no `@preact/
  signals` / Preact import in `packages/sdk`). *Mitigation:* lint against
  framework imports in the SDK to preserve runtime-agnosticism.
