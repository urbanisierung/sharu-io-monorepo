# Project Safu — Current State & Next Steps

_Snapshot as of this session. For deep build context see
[`handoff.md`](./handoff.md); for the milestone plan see
[`implementation-plan.md`](./implementation-plan.md)._

## TL;DR

A decentralized, zero-knowledge, local-first backup & sync platform. M0–M1 are
complete; **M2 (web app + P2P sync) is complete and proven end-to-end,
including the live n0 relay hop** (the relay e2e passes on a real machine; it
only fails inside the headless CI sandbox's network policy, not in the code).
**M3 (desktop)**: the native
transport core compiles and is verified; the Tauri shell is scaffolded and needs
a desktop host to build/run.

## Milestone status

| Milestone | Status |
| --- | --- |
| M0 — Scaffold | ✅ done |
| M1 — Crypto pipeline & local storage | ✅ done (lossless, memory-bounded, authenticated round-trip) |
| M2 — Web app & P2P sync (§2.1–2.4) | ✅ done — proven over loopback **and** the live n0 relay |
| M3 — Tauri desktop (§3.1–3.4) | 🟡 native transport verified; shell scaffolded, unbuilt here |

## What works and is verified

- **Crypto pipeline** (`packages/crypto`, Rust→WASM): BLAKE3, Argon2id,
  AES-256-GCM, FastCDC chunking. Streaming, memory-bounded round-trip with hash
  parity. 10 native Rust tests + vitest suite.
- **Storage** (`packages/sdk`): `BlockStore` interface, `MemoryBlockStore`,
  `OpfsBlockStore` (tested in real Chromium).
- **Replicated allocation table** (`packages/sdk`): a per-path LWW-register
  **CRDT** over a Hybrid Logical Clock — converges regardless of arrival order,
  preserves concurrent inserts, never silently drops a write. Write
  authorization with **permanent revocation** of a lost device.
- **Transport** (`packages/transport`): one runtime-agnostic `Transport`
  interface; an in-process `LoopbackNetwork`; a real **Iroh→WASM** binding
  (`@safu/transport/iroh`, relay-only) and a **native** Iroh transport
  (`safu_transport::native`, direct hole-punching) behind the same interface.
- **Doc sync + block transfer** (`DocSync`): deltas + content-addressed blocks
  over the transport; only ciphertext crosses (zero-knowledge).
- **Web app** (`apps/web`): signal-driven Cascivo UI (no React state hooks; all
  copy via `@cascivo/i18n`), drag-drop ingest with all interaction states, file
  list, **restore/download**, and a device-pairing affordance. A lint-guard test
  enforces the no-hooks / no-hardcoded-strings rules.
- **Persisted document** (`packages/sdk`): a `DocStore` snapshot interface
  (`MemoryDocStore`, browser `OpfsDocStore`). `SyncDoc.open()` restores the last
  snapshot — entries (incl. tombstones), writer set, and HLC state — and every
  mutation (local, writer ops, accepted remote deltas) coalesces into a write,
  so the backup list survives reloads. The web runtime opens the doc from OPFS.
- **End-to-end pipeline proof** (`apps/web/src/sync.integration.test.ts`): A
  ingests a 3 MiB file → allocation table syncs to B over the loopback transport
  → B pulls the blocks → **B restores with BLAKE3 parity**. Plus single-device
  round-trip and wrong-passphrase rejection.

Full gate is green: `pnpm -r typecheck`, Biome, `cargo test`, and the node + web
+ OPFS/Chromium vitest suites, plus both WASM builds and the web production build.

## CI-only limitation (environment, not code)

The gated relay e2e (`SAFU_E2E=1`) **passes on a real machine** — two Iroh
endpoints come online against the public n0 relay, the doc converges, and a
block transfers with BLAKE3 parity (`packages/sdk/src/transfer.e2e.browser.test.ts`).
It only fails inside the **headless CI sandbox**, where Iroh's net-report HTTPS
probes fail at the browser `fetch`/CORS layer (`TypeError: Failed to fetch`)
even though the relay hosts answer plain HTTPS, so the endpoint never goes
"online". That is a sandbox network policy, not a code defect. Keep the e2e
gated so CI stays deterministic/offline-safe; run it locally to exercise the
relay. `createIrohTransport` waits for `online()` (with a 15 s startup timeout)
so a dialable relay address is set before pairing.

## Next steps

1. ~~**Close the relay hop (M2 exit).**~~ ✅ Done — the gated e2e passes against
   the live n0 relay on a real machine. Remaining nicety: a two-origin tab
   pairing (vs. two in-process endpoints) as a stricter manual staging.
2. ~~**Persist the document.**~~ ✅ Done — `SyncDoc.open()` restores a persisted
   CRDT snapshot from OPFS (`OpfsDocStore`); mutations auto-persist, so the file
   list survives restarts.
3. **Pairing UX.** Replace the raw id+relay inputs with a QR / short-code
   exchange and an out-of-band fingerprint (SAS) check to prevent relay MITM
   (flagged open question). Auto-populate `peers` from active sync channels.
4. **Auto-pull on sync.** When the table references blocks a peer lacks, fetch
   them automatically (currently `pair()` pre-fetches; generalize into DocSync).
5. **Desktop (M3).** Build `apps/desktop` on a host with the webview toolchain;
   verify tray/autostart, the FS-watch→ingest loop, and the §3.4
   web→relay→desktop benchmark (direct hole-punching). See
   `apps/desktop/README.md`.
6. **Dedup decision.** Convergent encryption (dedup with a content-equality
   leak) remains a deliberate future option — decide explicitly.
7. **Crypto hardening.** Per-op signatures so a still-trusted device cannot forge
   another's author id (M2 leans on transport-authenticated identity).
