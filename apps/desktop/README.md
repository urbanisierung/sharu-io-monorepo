# Safu Desktop (Tauri 2.0)

The desktop runtime (plan §3). Tauri wraps the `apps/web` build and hosts the
native services the browser cannot provide:

- **Native block store** (`block_put`/`block_get`/`block_has`) — a
  content-addressed, filesystem-backed `BlockStore` (plan §1.3 native impl),
  verifying every block against its BLAKE3 (zero-knowledge: only ciphertext is
  stored).
- **Native Iroh transport** (`transport_*` / `channel_*` commands) — built on
  `safu_transport::native`, which runs Iroh natively for **direct UDP
  hole-punching** with relay fallback (plan §3.2), behind the same
  `Transport` interface as the browser. The frontend selects it automatically
  via `@safu/transport/tauri` when running under Tauri (see
  `apps/web/src/runtime.ts`).
- **Filesystem watcher** (`watch_folder`) — emits `file-changed` events for
  auto-ingest of watched sync folders (plan §3.3).
- **System tray + launch-on-boot** — tray icon configured in `tauri.conf.json`;
  autostart via `tauri-plugin-autostart`.

## Build prerequisites (desktop host, not CI)

This crate is **excluded from the pnpm workspace and the root Cargo workspace on
purpose**: building it requires the Tauri toolchain, which is not available in
the headless CI sandbox. On a desktop host:

- Rust toolchain (native target).
- System webview: **webkit2gtk-4.1** + libsoup3 (Linux), WebView2 (Windows),
  WKWebView (macOS, built in). See <https://tauri.app/start/prerequisites/>.
- `@tauri-apps/cli` (declared in `package.json`).
- App icons under `src-tauri/icons/` — generate with `pnpm tauri icon <png>`.

```sh
cd apps/desktop
pnpm install
pnpm tauri dev     # runs apps/web dev server + the native shell
pnpm tauri build   # builds apps/web, then bundles the desktop app
```

## Verified vs. pending

- ✅ **Native transport core** compiles (`safu_transport::native`).
- ✅ **`safu-desktop` crate compiles and links** on a desktop host (Fedora,
  457 crates, ~95 s), producing `target/debug/safu-desktop` dynamically linked
  against the system webview (webkit2gtk-4.1 **2.52.4**, gtk-3, libsoup-3.0,
  javascriptcoregtk-4.1). Icons are generated under `src-tauri/icons/`. That
  WebKitGTK is recent enough for OPFS, which the frontend's storage uses.
- ⏳ **Needs an attached display** (not exercisable from a headless/agent shell
  with no Wayland/X compositor): launching the window, tray / autostart, the
  FS-watch → ingest loop, and the §3.4 cross-runtime benchmark
  (web → relay → desktop via direct hole-punching). Run `pnpm tauri dev` in a
  graphical session to exercise them.
- ✅ **Native services wired into the frontend** (compiles + type-checks; needs a
  host launch to exercise): under Tauri `runtime.ts` now selects the native
  `TauriBlockStore` (`block_*` commands) instead of OPFS, and a watched folder
  auto-ingests — `watchFolder` → `watch_folder`, and a `file-changed` listener
  reads each path via the new `read_file` command and ingests it. The web UI
  shows a "Watched folders" input only under the desktop shell.
