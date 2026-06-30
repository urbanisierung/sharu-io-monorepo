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

The quickest start is **one command**. On a terminal, `serve` creates the
identity on first run, prints this node's pairing code, walks you through linking
each device, then runs:

```sh
cargo build --release -p safu-node      # or build from source: target/release/safu-node

export SAFU_NODE_PASSPHRASE="…"          # derives this node's signing identity
export SAFU_NODE_DATA_DIR="/srv/safu"    # the directory this node owns

safu-node serve                          # guided first run, then always-on
```

The guided run does the pairing handshake for you:

1. It prints this node's **pairing code** — paste it into the web app under
   **Devices › Link**.
2. Copy the code from the web app's **"This device"** card and paste it back at
   the prompt. The node shows the **safety number**; confirm it matches the one
   on the device, and the link is saved. Link as many devices as you like, then
   press Enter to start serving.

This works because pairing is mutual: the device authorizes the node (step 1) and
the node authorizes the device (step 2). Both directions are required — the node
only replicates entries and accepts share pins from devices it has authorized.

### Headless / scripted setup

Under a service manager (no terminal) `serve` skips the wizard and runs straight
away, so the individual steps stay available for scripting:

```sh
safu-node init                            # one-time: create the identity
safu-node info                            # print this node's pairing code
safu-node link <device-connection-code>   # authorize + remember a device
safu-node serve                           # run the always-on backup node
```

Copy the **connection code** the web app shows and run `safu-node link <code>`:
the node authorizes that device's signing id and remembers its address, then
`serve` dials it, syncs the allocation table, and replicates its ciphertext
blocks. (Link devices **before** `serve`, or restart it afterwards — `serve`
loads the linked-device set once at startup.) To let the web app show this node
back, paste the node's own `info` pairing code into the app.

### Inspecting a running node

`serve` is headless, but it persists its document snapshot to `doc.json` on every
applied change, so you can inspect a running node from a **second terminal**
without stopping it — point the read-only commands at the same `--data-dir`:

```sh
safu-node files    # the files this node has synced into its backup replica
safu-node status   # files, replication progress, public-share pins, linked devices
```

`status` is the quickest "is this node actually working?" check. Its
`referenced blocks: N (X present, Y still replicating)` line shows how much of the
ciphertext the synced allocation table references has been pulled locally; once a
device finishes backing up, `Y` reaches `0`. `share-pin blocks` counts the
public-share blocks devices have pinned here (the blocks that keep share links
resolving while a device is offline). Neither command needs the passphrase or the
network — they only read the data dir.

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
| `files` | List the files held in this node's backup replica (paths, sizes, block counts). |
| `status` | Print an offline snapshot: backed-up files, replication progress, public-share pins, and linked devices. |
| `serve` (`run`) | Run the always-on backup node & share host. First run on a terminal guides device pairing; headless (no TTY) it serves straight away. Ctrl-C to stop; flushes on exit. |
| `update` | Check for a newer release; `update --apply` downloads, verifies (minisign), and installs it. |

### Configuration

| Env var | Flag | Meaning |
| --- | --- | --- |
| `SAFU_NODE_PASSPHRASE` | `--passphrase` | Derives the node's signing identity (**required**). Prefer the env var to keep it out of shell history. |
| `SAFU_NODE_DATA_DIR` | `--data-dir` | Directory the node owns (default `./safu-node-data`). |
| `SAFU_NODE_NO_UPDATE_CHECK` | — | Set to disable the one-line "newer version available" notice at `serve` startup. |
| `SAFU_NODE_TOKEN` (`GH_TOKEN` / `GITHUB_TOKEN`) | — | GitHub read token for the update check while the repo is private. |

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
├─ meta.json              # on-disk format version (for safe upgrades/migrations)
├─ identity/signer.salt   # 16-byte salt; the secret key is never persisted
├─ doc.json               # the replicated document snapshot (DocSnapshot)
├─ devices.json           # linked devices: signing id + dial address
└─ blocks/                # content-addressed ciphertext blocks (one file per hash)
```

The salt layout matches the TS peer, so a node and a TS peer sharing a data dir
and passphrase derive the same identity. `doc.json` is written atomically (temp
file + rename), so an interrupted write — including an upgrade stopping the node
— never leaves a torn snapshot.

## Updating

An update is **binary-only**: nothing in the data dir changes. Identity,
authorized devices, and stored blocks all live under `--data-dir` and are keyed
to your passphrase, not to the binary — so after an update **you do not link
devices again**, and shares stay pinned.

Check whether a newer version exists:

```sh
safu-node update            # reports; --apply to install
```

`serve` also prints a one-line notice at startup when a newer version is out
(disable with `SAFU_NODE_NO_UPDATE_CHECK`).

**Self-apply (Linux/macOS).** `update --apply` downloads the release archive for
this host, **verifies its minisign signature against the public key embedded in
the binary** (and its SHA-256), unpacks it, and atomically replaces the running
executable. Any failure aborts without touching the installed binary. Then
restart:

```sh
safu-node update --apply
sudo systemctl restart safu-node   # or your supervisor, or re-run `safu-node serve`
```

Verification is mandatory — an unsigned or tampered release is refused, so a
compromised release host cannot push a malicious binary. Releases are signed in
CI; see [`RELEASING.md`](RELEASING.md) for the one-time key setup. (On Windows, or
to upgrade by hand, re-run the installer instead — `curl -fsSL
https://new.sharu.io/install.sh | sh` — then restart.)

While the process restarts, share links pointing at this node briefly stop
resolving and devices' syncs retry — typically sub-second. For no gap at all, run
more than one node (see "Running multiple nodes") and update them one at a time.

`meta.json` records the data-dir **format version**. A newer binary can migrate
an older dir in place; an older binary refuses a dir written by a newer one
(rather than misreading it), so a version skew fails loudly instead of corrupting
state. The wire protocols are independently versioned (`safu/sync/1`,
`safu/blocks/1`, `safu/pin/1`, `safu/unpin/1`) and the document JSON is additive,
so a node and a device on adjacent versions keep talking.

### Running as a service (systemd)

A sample unit lives at [`deploy/safu-node.service`](deploy/safu-node.service).
It runs `serve` under a dedicated user, restarts on failure, and stops cleanly
(SIGTERM → flush) so updates are a one-liner: install the new binary, then
`systemctl restart safu-node`.
