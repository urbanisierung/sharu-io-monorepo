# safu-node — headless zero-knowledge backup node (CLI)

An always-on backup node you configure entirely from the terminal. Pair it with
your devices and it holds a full **ciphertext** replica of everything they back
up — the project's answer to "permanent storage" without IPFS: durability comes
from a copy that is always reachable, and this node is that copy. It is the
equivalent of an IPFS pinning node, but **zero-knowledge** (it only ever stores
ciphertext, never keys or plaintext) and over **Iroh** (no DHT).

It is also the **public-share host**: the always-on node you select under "Host
shares here" in the web app. Devices pin the blocks of a published share to it,
so a share link keeps resolving while the device that made it is offline — the
node serves those blocks like any other, still only ever seeing ciphertext.

It is a single self-contained Rust binary with no runtime dependencies — drop it
on a NAS, VPS, or Raspberry Pi and run it. No browser, no Node, no Tauri.

## How it fits the existing architecture

This is the **native-binding** wiring the headless-peer README recommends
(`apps/peer/README.md`): it reuses the native Iroh core already built for the
desktop runtime (`crates/safu-transport` → `safu_transport::native`, direct UDP
hole-punching with relay fallback) and re-implements the SDK's small,
JSON-on-the-wire sync protocol in Rust. It is **wire-compatible** with the web
app and the TS peer — same protocol tags, the same signed CRDT, and the same
identity derivation:

| Concern | Shared with the web app / SDK |
| --- | --- |
| Identity | `Argon2id(passphrase, salt)` → Ed25519 seed; id = hex public key (`@safu/crypto.deriveKey` + `@safu/sdk` `signing.ts`). A cross-impl known-answer test pins byte-parity with `@noble/curves`. |
| Protocols | `safu/sync/1` (exchange JSON deltas, snapshot on connect) and `safu/blocks/1` (block-by-hash) — `doc-sync.ts`; plus `safu/pin/1` / `safu/unpin/1` for public-share hosting — `block-pin.ts`. |
| Document | The allocation-table CRDT + writer-set CRDT + HLC, signed-mode admission control — `allocation-table.ts` / `sync-doc.ts`. Snapshot JSON is the SDK's `DocSnapshot`. |
| Pairing code | URL-safe base64 of `{id, signId, relayUrl}` — `apps/web/src/pairing.ts`. |
| Safety number | 6-digit BLAKE3-derived code over the unordered id pair — `apps/web/src/sas.ts`; shown by `link`/`list`/`serve` to match against the device. |

The node never authors file entries; it is a pure sink that merges devices'
signed entries and auto-pulls every block the synced allocation table references
but it lacks. As a share host it also accepts blocks pinned to it explicitly
(public-share blocks live outside the allocation table, so they are uploaded
rather than auto-pulled) — admitting a pin only from a current writer whose
signature checks out and whose bytes hash to their claimed address, the same
policy the SDK applies.

## Install

Prebuilt binaries for Linux, macOS, and Windows are published to GitHub Releases
by the `Release safu-node` workflow. Install the latest with one line:

**Linux / macOS**

```sh
curl -fsSL https://new.sharu.io/install.sh | sh
```

**Windows (PowerShell)**

```powershell
irm https://new.sharu.io/install.ps1 | iex
```

The install scripts are served by the website (source: `apps/web/public/`); the
release binaries they fetch live on GitHub Releases. The scripts detect your
OS/arch, download the matching archive from the latest release, verify its
SHA-256, and install `safu-node` to `~/.local/bin`
(`%LOCALAPPDATA%\safu-node\bin` on Windows). Pin a version with
`SAFU_NODE_VERSION=0.1.0`, or change the location with `SAFU_NODE_INSTALL_DIR`.

While this repository is **private**, anonymous downloads from GitHub Releases
return `404` — pass a token with read access so the scripts fetch the asset
through the authenticated API instead (`SAFU_NODE_TOKEN`, or `GH_TOKEN` /
`GITHUB_TOKEN`):

```sh
curl -fsSL https://new.sharu.io/install.sh | SAFU_NODE_TOKEN="$(gh auth token)" sh
```

```powershell
$env:SAFU_NODE_TOKEN = (gh auth token); irm https://new.sharu.io/install.ps1 | iex
```

Supported targets: `x86_64`/`aarch64` Linux (gnu), `aarch64` macOS,
`x86_64` Windows (msvc).

### Cutting a release

Push a tag of the form `safu-node-v<version>` (matching the crate version in
`Cargo.toml`); the workflow builds every target and publishes the release:

```sh
git tag safu-node-v0.1.0 && git push origin safu-node-v0.1.0
```

It can also be run manually from the Actions tab (`workflow_dispatch`) with the
tag as input.

## Usage

```sh
cargo build --release -p safu-node      # or build from source: target/release/safu-node

export SAFU_NODE_PASSPHRASE="…"          # derives this node's signing identity
export SAFU_NODE_DATA_DIR="/srv/safu"    # the directory this node owns

safu-node init                            # one-time: create the identity
safu-node info                            # print this node's pairing code
safu-node link <device-connection-code>   # authorize + remember a device
safu-node serve                           # run the always-on backup node
```

To link a device, copy the **connection code** the web app shows ("link a
device") and run `safu-node link <code>`. The node authorizes that device's
signing id and remembers its address, then `serve` dials it, syncs the
allocation table, and replicates its ciphertext blocks. To let the web app show
this node back, paste the node's own `info` pairing code into the app.

### Matching safety numbers

`link`, `list`, and `serve` print a 6-digit **safety number** for each device —
the same code the web app shows next to that device on its Devices screen.
Compare them out of band (read it aloud, message it): if they match, the link is
genuine; if they differ, a relay swapped a key in transit, so run
`safu-node unlink <signing-id>` and pair again. This is the terminal equivalent
of the app's "Codes match" / "Codes differ" check.

### Hosting public shares

`serve` also runs the node as a **share host**. In the web app's Devices view,
pick this node under "Host shares here" (match its signing id, shown by `info`).
From then on, publishing a public share pins its blocks to this node, so the link
keeps resolving while your phone or laptop is offline; revoking the share unpins
them. The node only ever receives ciphertext.

### Commands

| Command | Purpose |
| --- | --- |
| `init` | Create the node's identity and data dir. |
| `info` | Print the signing id, transport address, and pairing code. |
| `link <code>` | Authorize a device (its connection code) and remember its address. |
| `unlink <signing-id>` | Permanently revoke a device's write access and stop backing it up. |
| `list` | List linked devices and their safety numbers. |
| `serve` (`run`) | Run the always-on backup node & share host (Ctrl-C to stop; flushes on exit). |

### Configuration

| Env var | Flag | Meaning |
| --- | --- | --- |
| `SAFU_NODE_PASSPHRASE` | `--passphrase` | Derives the node's signing identity (**required**). Prefer the env var to keep it out of shell history. |
| `SAFU_NODE_DATA_DIR` | `--data-dir` | Directory the node owns (default `./safu-node-data`). |

### Running multiple nodes

Give each node its own `--data-dir` (and its own passphrase). Each derives an
independent identity and keeps an independent ciphertext replica, so the same
device can fan its backups out to as many nodes as you like:

```sh
SAFU_NODE_DATA_DIR=/srv/safu-a SAFU_NODE_PASSPHRASE=… safu-node serve
SAFU_NODE_DATA_DIR=/srv/safu-b SAFU_NODE_PASSPHRASE=… safu-node serve
```

## Data layout (`--data-dir`)

```
<data-dir>/
├─ identity/signer.salt   # 16-byte salt; the secret key is never persisted
├─ doc.json               # the replicated document snapshot (DocSnapshot)
├─ devices.json           # linked devices: signing id + dial address
└─ blocks/                # content-addressed ciphertext blocks (one file per hash)
```

The salt layout matches the TS peer, so a node and a TS peer sharing a data dir
and passphrase derive the same identity.
