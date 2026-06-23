# @safu/peer — headless always-on backup peer

An always-on node that pairs with your devices and holds a **full ciphertext
replica** of everything they back up. It is the project's answer to "permanent
storage" without IPFS: durability comes from a copy that is always reachable,
and this node is that copy — the equivalent of an IPFS pinning node, but
zero-knowledge (it only ever stores ciphertext) and over Iroh (no DHT).

## Why this keeps the existing architecture

The runtime-agnostic SDK was built exactly so a new runtime adds *adapters*, not
*architecture*. This package reuses unchanged:

- **`packages/sdk`** — `SyncDoc` (the CRDT), `DocSync` (which already auto-pulls
  every block the synced allocation table references but the local store lacks),
  signed authorship, and writer authorization/revocation.
- **`packages/crypto`** — identity derivation (`deriveKey`, Argon2id) and the
  WASM pipeline (it already has a Node path).

What this package adds are host adapters implementing interfaces that already
exist — no SDK public-API change:

| Adapter | Interface | Browser counterpart |
| --- | --- | --- |
| `FsBlockStore` | `BlockStore` | `OpfsBlockStore` |
| `FsDocStore` | `DocStore` | `OpfsDocStore` |
| `loadOrCreateSigner` | builds a `Signer` | `apps/web/src/identity.ts` |
| `createPeer` | assembles the above + `DocSync` | `apps/web/src/runtime.ts` |

`createPeer` takes the `Transport` by injection, so the assembly is identical in
tests (in-process loopback) and in production (Iroh). The loopback integration
test proves a device's file converges onto a real fs-backed peer and survives a
restart.

## Configuration (CLI)

`src/main.ts` reads:

| Env var | Meaning |
| --- | --- |
| `SAFU_PEER_DATA_DIR` | directory the node owns (default `./safu-peer-data`) |
| `SAFU_PEER_PASSPHRASE` | derives the node's signing identity (**required**) |
| `SAFU_PEER_AUTHORIZE` | comma-separated device signing ids to back up |

On start it logs its own signing id and transport address; pair a device against
those (and authorize the device's id here) and the node begins replicating.

> **Already shipped natively:** `crates/safu-node` is a self-contained Rust CLI
> that realizes the "Native binding (recommended)" wiring below — an always-on,
> wire-compatible backup node over `safu_transport::native`, with no Node or
> browser. If you want a headless node today, use it.

## The one remaining seam: a headless transport

Everything above is complete and tested. The only unimplemented piece is a
headless (no-browser, no-Tauri) Iroh transport — `createPeerTransport()` in
`src/transport.ts`, which currently fails fast. Two viable wirings, both reusing
the **native** Iroh core already built for desktop (M3)
(`crates/safu-transport` → `safu_transport::native`, direct UDP hole-punching),
rather than the relay-only WASM build:

- **A. Native binding (recommended).** Expose `safu_transport::native` to Node
  via napi-rs (a small cdylib), or run the native core as a sidecar the peer
  talks to over a local socket. This is the desktop transport minus the Tauri
  command bridge — same QUIC hole-punching, best NAT traversal for an always-on
  node, no browser globals.
- **B. WASM-in-Node.** Add a Node boot path to the Iroh WASM binding (mirror
  `packages/crypto/src/wasm.ts`, which reads its `.wasm` from disk under Node)
  and supply the globals it expects (`fetch`, a `ws` WebSocket). Relay-only and
  simplest to stand up, but routes all traffic through the n0 relay.

Implementing either makes `main.ts` a runnable always-on node with no other
changes. (Running the CLI also needs a TypeScript-aware runner, e.g. `tsx`,
because the repo uses `.js` import specifiers resolved by the bundler.)
