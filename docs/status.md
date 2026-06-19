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
| M3 — Tauri desktop (§3.1–3.4) | 🟡 crate compiles & links on a host; window/tray/FS-watch/benchmark need an attached display |

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
  over the transport; only ciphertext crosses (zero-knowledge). A peer
  **auto-pulls** every block the synced table references but lacks, from the
  dialed peer — the allocation entry is self-describing (`[manifest, …blocks]`).
- **Signed authorship** (`packages/sdk`): every op is Ed25519-signed by its
  author and verified on receipt, so a still-trusted device cannot forge another
  peer's author id. The author id is a **stable per-device signing identity**
  derived from `passphrase + salt` (Argon2id; secret stays in memory, only the
  salt is persisted) — decoupled from the transport's ephemeral endpoint key.
- **Web app** (`apps/web`): signal-driven Cascivo UI (no React state hooks; all
  copy via `@cascivo/i18n`), drag-drop ingest with all interaction states, file
  list, **restore/download**, and **device pairing** (copy-paste connection code
  + 6-digit SAS verify/reject; peer list auto-populated from live channels). A
  lint-guard test enforces the no-hooks / no-hardcoded-strings rules.
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
3. ~~**Pairing UX.**~~ ✅ Done — copy-paste **connection code** (`encodePeerAddr`/
   `decodePeerAddr`, no new dep, QR-ready) replaces the raw id+relay inputs; a
   6-digit **SAS** (`deriveSas`, BLAKE3 of the sorted peer pair) is shown for
   out-of-band comparison with confirm/reject (reject revokes the writer);
   `peers` is auto-populated from `DocSync.peers` (live channels, both
   directions). Deferred: QR/camera, verify-gating-sync, persisted verification.
4. ~~**Auto-pull on sync.**~~ ✅ Done — `DocSync` auto-pulls any block the synced
   table references but the local store lacks, from the dialed peer (on catch-up
   and on later deltas). The allocation-table entry is now self-describing
   (`[manifest, …dataAddresses]`), so the puller needs no manifest parsing; the
   manual prefetch loop in `pair()` is gone.
5. **Desktop (M3).** 🟡 Partially done on a host: the `safu-desktop` crate now
   **compiles and links** against the system webview (webkit2gtk-4.1 2.52.4;
   icons generated). Still needs an attached display to exercise the window,
   tray/autostart, the FS-watch→ingest loop, and the §3.4 web→relay→desktop
   benchmark — run `pnpm tauri dev` in a graphical session. The frontend now
   selects the native `TauriBlockStore` under Tauri and wires FS-watch→ingest
   (`watch_folder` + `read_file` + a `file-changed` listener, with a
   "Watched folders" UI). See `apps/desktop/README.md`.
6. **Dedup decision.** Convergent encryption (dedup with a content-equality
   leak) remains a deliberate future option — decide explicitly.
7. ~~**Crypto hardening.**~~ ✅ Done — every op is now **Ed25519-signed** by its
   author and verified on receipt (`signing.ts`, `@noble/curves`), so a
   still-trusted device cannot forge another's author id. Authorship moved off
   the transport's *ephemeral* endpoint key onto a **stable per-device signing
   identity** derived from `passphrase + per-device salt` (Argon2id; only the
   non-secret salt is persisted). The pairing code now carries the signing
   pubkey, the SAS binds it, and the device list is the document's authorized
   writers (so it survives reloads). Deferred: persisted SAS verdict.
