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

> **Already shipped natively:** `crates/sharu` is a self-contained Rust CLI
> that realizes the "Native binding (recommended)" wiring below — an always-on,
> wire-compatible backup node over `safu_transport::native`, with no Node or
> browser. If you want a headless node today, use it.

## The headless transport (implemented)

`createPeerTransport()` in `src/transport.ts` is now wired via **B. WASM-in-Node**:
the relay-only Iroh WASM core, booted under Node by reading its `.wasm` from disk
(`@safu/transport/iroh` has a universal loader mirroring `@safu/crypto`'s). Node 22
supplies the only globals the binding needs — `fetch`, `WebSocket`, and
`crypto.getRandomValues` — so no shims are required. The transport advertises every
ALPN the node serves: `SYNC_PROTOCOL`, `BLOCK_PROTOCOL`, and the public-share
`PIN_PROTOCOL` / `UNPIN_PROTOCOL`. A Node boot test (`packages/transport/src/iroh.boot.test.ts`)
proves the WASM instantiates headless and creates an endpoint.

Tradeoff: relay-only routes all traffic through the n0 relay (which still sees only
ciphertext) rather than hole-punching directly. For best NAT traversal on a
NAS / VPS / Raspberry Pi, prefer:

- **A. Native binding (best NAT traversal).** Already realized by the self-contained
  Rust CLI `crates/sharu` over `safu_transport::native` (direct UDP
  hole-punching, no Node or browser). Use it where direct connectivity matters.

`main.ts` is now a runnable always-on node. (Running the CLI needs a TypeScript-aware
runner, e.g. `tsx`, because the repo uses `.js` import specifiers resolved by the
bundler.)
