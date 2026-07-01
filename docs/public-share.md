# Public share — opening a file from a link (the Iroh answer to IPFS gateways)

> Status: design. Phase 1 (crypto core) is in progress; later phases are
> sequenced below with explicit exit criteria.

## Why

One thing IPFS gives you is a *public URL*: anyone can open `ipfs.io/ipfs/<CID>`
in a browser and read content that was put on the network — no account, no
client. A natural question for Safu is whether the Iroh-based architecture can
do the same: let a user mark a file as "public" and hand someone a link.

It can — but only if we are careful, because IPFS-gateway hosting and Safu's
**zero-knowledge invariant** pull in opposite directions. This document
describes a design that delivers link-openable content **without** weakening the
invariant: hosts and relays still only ever move ciphertext, and keys still
never reach a server.

## The core idea

Every block today is `AES-256-GCM` under a key derived from the wallet
passphrase (`derive_key(passphrase, salt)` in `packages/crypto`). We therefore
**cannot** make a file public by sharing the passphrase — that would expose the
whole wallet, not one file.

Instead, publishing **re-ingests the file under a fresh random 32-byte key
`K_share`** (a random key directly — no passphrase, no Argon2id). That produces
a new set of ciphertext blocks plus a small manifest. Then:

- The ciphertext blocks stay opaque to any host or relay → **the zero-knowledge
  invariant is untouched**. An untrusted node can pin and serve them without
  ever being able to read them.
- `K_share` travels **in the URL fragment** (`#…`), exactly like the existing
  `#pair=` codes in `apps/web/src/pairing.ts`. Browsers never send the fragment
  to a server, so decryption happens entirely client-side.

This is the well-trodden Mega / Firefox-Send pattern ("the key is in the link"),
adapted to Safu's content-addressed, Iroh-transported blocks. The visitor's own
browser is the "gateway": it fetches ciphertext by hash over Iroh and decrypts
locally.

### What this is *not*

It is **not** a second app, and it does **not** reuse the wallet key. Publishing
and revoking are features *of* the existing wallet. The only genuinely new
surface is a keyless viewer route; the only new infrastructure is an always-on
node to keep shared blocks reachable — which the blueprint already anticipates
(`sharu`, the zero-knowledge ciphertext replica).

## Data shapes

A share is one self-describing object — the public analog of an allocation-table
`FileEntry`. It carries **both** hashes per block because the system fetches by
ciphertext address but verifies by plaintext hash (matching `EncryptedBlock` in
`packages/crypto/src/index.ts`):

```ts
interface ShareBlockRef {
  addr: string;    // BLAKE3 of ciphertext — the BLOCK_PROTOCOL fetch key
  hash: string;    // BLAKE3 of plaintext — egress integrity check
  nonce: string;   // base64url AES-GCM nonce
}

interface ShareManifest {
  v: 1;
  name: string;          // "index.html"
  contentType: string;   // "text/html" — drives rendering in the viewer
  size: number;
  blocks: ShareBlockRef[];
}
```

The manifest is itself **encrypted under `K_share` and stored as a block**,
addressed by the BLAKE3 of its ciphertext → that hash is the share's *root*.
Bootstrapping a share therefore needs only `{ root, rootNonce, K_share, peer }`.

### The share code and link

Mirror `pairing.ts` exactly — base64url of a small JSON, carried in the URL
fragment so the key never reaches a server:

```ts
interface ShareInfo {
  root: string;        // ciphertext addr of the manifest block
  rootNonce: string;   // base64url
  key: string;         // base64url K_share  ← the secret, fragment-only
  peer: PeerAddr;      // who serves the blocks (id + relayUrl)
}

// https://safu.app/s#share=<base64url(JSON)>
function shareLink(info: ShareInfo, origin: string): string;
```

The viewer route is `/s`; everything after `#` is invisible to servers.

## Transport: fetch is free, pinning is one small protocol

**Reading** needs nothing new: `DocSync.requestBlock` already does "dial peer
over `BLOCK_PROTOCOL`, send a hash, receive ciphertext, persist," and the serving
side answers any block in its store by hash. That fetch core is extracted into
the free `fetchBlock` (`packages/sdk/src/block-fetch.ts`) so the keyless viewer
can use it without a `SyncDoc`/wallet. **The `Transport` contract does not change.**

**Writing** does need one addition. A share's blocks are re-ingested under a
random key, so they are *not* in the wallet's allocation table and DocSync's
auto-pull never carries them to the node. So `safu/pin/1`
(`packages/sdk/src/block-pin.ts`) is an explicit upload path: `pushBlock` sends a
signed request (`{hash, signId, sig}`) + the bytes; the node's `servePins`
accepts it only if the signer is an authorized writer and the bytes hash to the
claimed address, then stores it — after which the node serves it via the same
`BLOCK_PROTOCOL`. Authorization reuses the document's by-author model, not the
transport carrier (`sync-doc.ts`). Its mirror `safu/unpin/1` (`unpinBlock` /
`serveUnpins`) deletes a block under the same authorization, for revocation.

## Availability and revocation (operational reality)

- **Who serves the blocks?** The publishing browser is neither always-on nor
  dial-in-able. So publishing **pins `root` + every block to an always-on Iroh
  node** — the `sharu` ciphertext replica — via `safu/pin/1`. The `peer` in
  the link is that node, not the laptop.
- **Which node? (MVP)** The runtime pins to, and embeds, the first paired peer
  (`peer-addrs.ts` remembers paired addresses across reloads). A device/node
  distinction and an explicit "share host" choice are a follow-up.
- **Revocation = unpin.** `unpublishShare` sends a signed `safu/unpin/1` for
  every block (`unpinBlock` → the node's `serveUnpins` deletes it via
  `BlockStore.delete`), drops the local copy, and forgets the listing — so the
  link stops resolving. Best-effort if the node is unreachable (the listing is
  still removed). Copies already downloaded can never be recalled — the UI says
  so. The `published-shares.tsx` panel lists shares with a Revoke button.
- **Production transport seam (done).** `apps/peer/src/transport.ts`
  (`createPeerTransport`) now boots the relay-only Iroh WASM core headless under
  Node and advertises `SYNC_PROTOCOL`, `BLOCK_PROTOCOL`, `PIN_PROTOCOL`, and
  `UNPIN_PROTOCOL` — so the always-on TS peer can pin/serve/unpin public shares
  over real Iroh, not just loopback. For direct hole-punching prefer the native
  Rust node `crates/sharu`.

## Phases

Each phase is independently shippable and testable. Do not start a phase before
the previous one's exit criteria are met (per the milestone discipline in the
implementation plan).

### Phase 1 — crypto core (raw-key ingest/egress)

Add key-supplied variants alongside the passphrase APIs in
`packages/crypto/src/index.ts`, factoring the existing functions through them so
behavior is unchanged:

- `createIngestStreamWithKey(input, key, options?) → AsyncIterable<EncryptedBlock>`
- `createEgressStreamWithKey(blocks, key) → ReadableStream<Uint8Array>`
- `createIngestStream` becomes `…WithKey(input, deriveKey(passphrase, salt))`;
  `createEgressStream` likewise.

**Exit criteria:** round-trip, tamper-rejection, wrong-key-rejection, and
empty-payload tests pass for the raw-key path; existing passphrase tests still
pass; typecheck + Biome clean.

### Phase 2 — share manifest + block-fetch (SDK)

The SDK stays **crypto-free** — it handles opaque, content-addressed bytes and
never touches keys (the same boundary that keeps `@safu/crypto` a mere dev
dependency). So sealing the manifest under `K_share` lives with the publisher
(Phase 3, app layer), not here. Phase 2 ships the crypto-free halves:

- `ShareBlockRef` / `ShareManifest` types plus `serializeManifest` /
  `parseManifest` (encode to / validate from the bytes that get sealed) in
  `packages/sdk/src/share.ts`.
- `fetchBlock` free function + the `BLOCK_PROTOCOL` tag extracted into
  `packages/sdk/src/block-fetch.ts`; `DocSync.requestBlock` delegates to it, so
  the keyless viewer can fetch blocks without a `SyncDoc`.
- `safu/pin/1` (`packages/sdk/src/block-pin.ts`): `pushBlock` + `servePins` —
  the authenticated upload path for off-table share blocks (see *Transport*
  above). The node (`apps/peer`) wires `servePins` against its writer set.

**Exit criteria:** manifest serialize/parse round-trips and rejects malformed
input; `fetchBlock` pulls a block over a loopback transport; pins are accepted
only when authorized + hash-valid, and the node serves a pinned off-table block
back over `BLOCK_PROTOCOL`; `DocSync` behavior unchanged (existing tests green).
**(done)**

### Phase 3 — share code + publisher (web)

- `apps/web/src/share-code.ts`: `encodeShareCode` / `decodeShareCode` /
  `shareLink` / `readShareFromHash`, mirroring `pairing.ts`. **(done)**
- `packages/crypto`: `sealBytes` / `openBytes` — authenticated single-blob
  seal/open, used to seal the manifest under the share key as one
  content-addressed block. **(done)**
- `apps/web/src/share-publisher.ts`: re-ingest a file under a random key
  (`createIngestStreamWithKey`), seal its manifest (`sealBytes`), persist blocks
  + manifest to the `BlockStore`, return the link + the addresses to pin. **(done)**
- Runtime (`runtime.ts`): `publishShare(path)` restores the plaintext, calls the
  publisher, `pushBlock`s every block to the paired node, and records the share;
  `unpublishShare(root)` + a `publishedShares` signal. Paired node addresses are
  remembered in `peer-addrs.ts`. **(done)**
- Wallet UI: a per-file **Share** button in `file-table.tsx` that publishes and
  reveals a copyable link (and prompts to pair a node when none exists). **(done)**

**Exit criteria:** publish → decode produces a manifest that egresses to the
original bytes (`share-roundtrip.integration.test.ts`); the Share button calls
through and surfaces the link; codec + shares-store tests pass; revoke unpins
the blocks from the node (see *Availability and revocation*). **(done)**

### Phase 4 — keyless viewer route (web)

- `'share'` route at `/s` (`apps/web/src/router.ts`); `Root()` renders it with no
  wallet/runtime, so opening a link stays instant and anonymous. **(done)**
- `share-viewer.ts` `openShareOverIroh(info)`: dial the node over a relay-only
  Iroh endpoint (`BLOCK_PROTOCOL` only), `fetchManifest` → `fetchContent` →
  drain, into a throwaway `MemoryBlockStore`. **(done)**
- `share-page.tsx` `ShareViewer`: reads the fragment, opens the share, and renders
  by `contentType` (image/pdf/text inline, anything else download-only) with a
  download link; loading / no-share / failed states. The network+codec seam is
  injectable so the page is tested without a transport. **(done)**

**Exit criteria:** opening a generated link in a fresh context (no wallet)
renders the file (`share-roundtrip.integration.test.ts` proves the open path
byte-for-byte; `share-page.test.tsx` proves the render); integrity failures
surface as the failed state, not silent corruption — `createEgressStreamWithKey`
rejects on any hash/GCM mismatch and the page catches it. **(done)**

*Note:* the viewer dials relay-only Iroh (browser-first). Under Tauri the same
relay path works; using the native direct-connect core for the viewer is a later
optimization, not a correctness gap.

### Phase 5 — navigable websites (service worker)

A multi-file site (relative URLs → subresources like CSS/JS/images) needs real
origin paths so the browser resolves and loads them. Built as:

- `sdk/share.ts`: a v:2 `SiteManifest` (`index` + path→`ShareFileEntry`) beside
  the v:1 file manifest; `parseAnyManifest` dispatches on `v`. **(done)**
- `web/share-publisher.ts` `publishSite`: every file ingested under one random
  key into a v:2 manifest; `web/runtime.ts` `publishSiteShare` pins it all to the
  node and records it. `web/site-share.tsx` is the folder-picker UI
  (`webkitdirectory`); `web/mime.ts` types each file by extension. **(done)**
- `web/share-viewer.ts` `openShare`: returns a tagged file-or-site result. A
  site is **lazy** — only its manifest is decrypted up front; `getFile(path)`
  decrypts one file on demand, keeping the Iroh transport open until `close`. **(done)**
- `web/site-mount.ts` + `public/sw.js`: the keyless service worker (scope `/s/`)
  serves `/s/<id>/<path>` from the Cache API; on a miss it asks the viewer page —
  over a `MessageChannel` handed to it at mount — to decrypt that one file, then
  caches and serves it. `web/share-page.tsx` mounts the site and renders it in a
  **sandboxed** iframe (opaque origin) so untrusted site script can render and
  navigate but cannot reach this origin's storage. **(done)**

**Exit criteria:** a static site with relative subresources loads and navigates
entirely from decrypted blocks, with the host serving only ciphertext — proven
by the site round-trip (publish → open + `getFile` each file byte-for-byte under
one key) and the `resolveSitePath` test; the SW + MessageChannel wiring is
browser-verified. **(done)**

*Tradeoffs / notes:* **lazy** per-request fetch — only the files the viewer
actually visits are fetched + decrypted, so a large site is cheap. The page holds
the key + transport and answers the SW's requests, so it stays open (the site is
an iframe within it) and tears the transport down on close. The site id is the
manifest root, so a deep `/s/<id>/…` URL only resolves while the SW + page are
present (the canonical link is always `/s#share=…`). If the SW is evicted
mid-session its in-memory port map is lost — cached files still serve, but a fresh
file needs the page to re-mount. `SITE_CACHE` is duplicated between
`site-mount.ts` and `public/sw.js` — keep the two in sync.

## Invariants preserved

- **Zero-knowledge:** only ciphertext crosses the boundary; `K_share` lives in
  the URL fragment, never on a server. Hosts pin and serve blocks they cannot
  read.
- **Streaming only:** publishing and viewing reuse the streaming ingest/egress
  pipeline; no whole-file buffering.
- **Content addressing:** blocks remain addressed by BLAKE3; the viewer verifies
  every block against its address before use.
