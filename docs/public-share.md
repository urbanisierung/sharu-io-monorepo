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
(`safu-node`, the zero-knowledge ciphertext replica).

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

## Transport: nothing new

`DocSync.requestBlock` (`packages/sdk/src/doc-sync.ts`) already does exactly
"dial peer over `BLOCK_PROTOCOL`, send a hash, receive ciphertext, persist." The
serving side (`#serveBlocks`) answers any block in its store by hash with no
authentication — which is precisely what a public share wants. We extract the
fetch core into a free function so the keyless viewer can use it without a
`SyncDoc`/wallet. **The `Transport` contract does not change.**

## Availability and revocation (operational reality)

- **Who serves the blocks?** The publishing browser is neither always-on nor
  dial-in-able. So `publish()` must **pin `root` + every `ref.addr` to an
  always-on Iroh node** — the `safu-node` ciphertext replica. The `peer` in the
  link is that node, not the laptop.
- **Revocation = unpin.** Removing a share deletes its blocks from the pinning
  node, so future fetches fail. Copies already downloaded cannot be recalled —
  the UI must say so when a link is generated.

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

**Exit criteria:** manifest serialize/parse round-trips and rejects malformed
input; `fetchBlock` pulls a block over a loopback transport; `DocSync` behavior
unchanged (existing sync tests green).

### Phase 3 — share code + publisher (web)

- `apps/web/src/share-code.ts`: `encodeShareCode` / `decodeShareCode` /
  `shareLink` / `readShareFromHash`, mirroring `pairing.ts`. **(done)**
- `packages/crypto`: `sealBytes` / `openBytes` — authenticated single-blob
  seal/open, used to seal the manifest under the share key as one
  content-addressed block. **(done)**
- `apps/web/src/share-publisher.ts`: re-ingest a file under a random key
  (`createIngestStreamWithKey`), seal its manifest (`sealBytes`), persist blocks
  + manifest to the `BlockStore`, pin to the node, return a link.
- A "Publish" / "Unpublish" affordance in the wallet UI, with a published-shares
  list for revocation.

**Exit criteria:** publish → decode produces a manifest that egresses to the
original bytes; revoke removes the pinned blocks; codec round-trip tests pass.

### Phase 4 — keyless viewer route (web)

- Add `'share'` to the `Route` union (`apps/web/src/router.ts`), path `/s`.
- A viewer that needs no wallet/unlock: read the fragment, fetch the manifest +
  blocks over Iroh, decrypt with the fragment key, render by `contentType`.

**Exit criteria:** opening a generated link in a fresh context (no wallet)
renders the file; integrity failures surface as errors, not silent corruption.

### Phase 5 — navigable websites (service worker)

Single files work after Phase 4. A multi-file site (relative URLs → subresources
like CSS/JS/images) needs a **service worker** at `/s/…` that intercepts `fetch`
and resolves each path to a manifest entry — same crypto, just a router in front
of it. The manifest grows a path→`ShareBlockRef[]` map for this.

**Exit criteria:** a static site with relative subresources loads and navigates
entirely from decrypted blocks, with the host serving only ciphertext.

## Invariants preserved

- **Zero-knowledge:** only ciphertext crosses the boundary; `K_share` lives in
  the URL fragment, never on a server. Hosts pin and serve blocks they cannot
  read.
- **Streaming only:** publishing and viewing reuse the streaming ingest/egress
  pipeline; no whole-file buffering.
- **Content addressing:** blocks remain addressed by BLAKE3; the viewer verifies
  every block against its address before use.
