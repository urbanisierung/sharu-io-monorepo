# Shutdown-Resilient Transport — Research & Investigation

> Status: **research only** — no implementation. This document analyzes how
> Project Safu can be built on technology that "cannot be shut down easily,"
> studies the original sharu's failure modes, and evaluates replacing Iroh with
> IPFS (or similar) for reliability. It complements — and deliberately
> stress-tests — [`architecture-comparison-ipfs-vs-iroh.md`](./architecture-comparison-ipfs-vs-iroh.md),
> which argued the iroh choice on latency/privacy grounds. Here the lens is
> **survivability**. Facts below were researched against primary sources as of
> July 2026; see [Sources](#sources).

## TL;DR

- **The old sharu died from its coordination layer, not its storage layer.**
  Everything content-addressed and client-side-encrypted was fine; what killed
  it was a paid hosted-blockchain subscription, a single pinning/bootstrap
  droplet, and a now-deprecated IPFS implementation. The lesson is not
  "IPFS good" or "IPFS bad" — it is: **every piece of coordination
  infrastructure must be replaceable without a fork.**
- **Replacing iroh with IPFS wholesale would make Safu *less* reliable, not
  more.** There is no production Rust IPFS (breaking the one-core/two-runtimes
  architecture), Bitswap is categorically slower for large encrypted blobs,
  Kubo cannot exploit BLAKE3 verified streaming, and announcing private
  ciphertext on the public DHT is a metadata leak. Browsers still need at
  least one reachable relay peer either way.
- **What IPFS gets right is the *infrastructure governance model*:** every
  default service (bootstrap, delegated routing, AutoTLS broker, relays) is
  open-source, self-hostable, and permissionless, and the network has
  repeatedly outlived the companies around it. Iroh's *code* has the same
  property (MIT/Apache-2.0, `iroh-relay` and `iroh-dns-server` are open and
  self-hostable) — but Safu's *configuration* does not yet.
- **Recommended direction: keep iroh as the data plane; remove every
  hard-coded n0 dependency; add company-independent discovery (BitTorrent
  Mainline DHT via pkarr — a 20-year-old, ~10M-node commons that no company
  operates); and optionally mirror public-share ciphertext onto IPFS as a
  pin-anywhere escape hatch.** The SDK's transport-agnostic `Transport`
  interface means none of this touches product logic.

---

## 1. Threat model — what "shut down" actually means

"Cannot be shut down easily" decomposes into five distinct shutdown vectors.
They need different defenses, and conflating them leads to cargo-cult
decentralization (the old sharu marketed "unstoppable" while running on one
SaaS subscription):

| # | Vector | Example | Defense class |
| --- | --- | --- | --- |
| S1 | **Vendor infrastructure turned off** | n0's public relays / `dns.iroh.link` go dark; Kaleido subscription lapses (killed old sharu) | Self-hostable + *configurable* replacements; multiple independent operators |
| S2 | **Project abandonment** | js-ipfs deprecated (2023); webrtc-star signaling archived | Permissive license, forkable servers, wire-protocol stability, small dependency surface |
| S3 | **Our own single node dies** | Old sharu's one DigitalOcean pinning/bootstrap droplet | Any-peer-can-serve for public data; multiple pinning peers; no "blessed" node |
| S4 | **Network-level blocking / censorship** | Relay hostnames blocked on a national or corporate firewall | Direct connections, user-chosen relays, many rendezvous channels, (long-term) Tor-class fallbacks |
| S5 | **Platform gatekeepers** | Syncthing's official Android app discontinued over Google Play requirements (Dec 2024); web app depends on Cloudflare Pages + one domain | Installable outside stores; web app deployable by anyone (static SPA); origin-independent share links |

A crucial asymmetry: for **private device-to-device sync** (Safu's core), the
user's own devices are both endpoints — resilience means *those two devices can
always find and reach each other*. For **public shares**, resilience means
*ciphertext stays fetchable by strangers* — that is where IPFS-style
"anyone can pin and serve" genuinely shines and where the old sharu's design
had real merit.

---

## 2. What the original sharu teaches (github.com/sharu-io, 2019)

Verified against the still-public org (5 repos, dormant since May 2019 —
itself a data point for S2).

### 2.1 What it actually was

- **Stack:** Electron 4 + Angular 7 desktop app; **js-ipfs 0.35** bundled as a
  binary (`js-ipfs-dep` 0.1.6, spawned via `ipfsd-ctl`); `ethers` 4 +
  Truffle against a **"Shares" smart contract on Kaleido** (ConsenSys's paid
  hosted permissioned Ethereum); RSA-2048 (node-forge) + AES-256-GCM
  (WebCrypto). No OrbitDB — all replicated state lived in the contract.
- **Coordination:** clients subscribed to contract events (`NewInvite`,
  `Updated`) over Kaleido RPC. The RPC endpoint **and shared basic-auth
  credentials were committed to the repo** (`environment.prod.ts`).
- **Discovery/transport:** default js-ipfs bootstrap (Protocol Labs infra)
  plus **two hardcoded sharu-run nodes on one DigitalOcean IP**
  (`159.89.6.248`). Circuit relay and preload were *commented out*; no
  WebRTC-star, no STUN/TURN, no hole-punching. NATed peers effectively met
  *through the sharu master pinning node*, which pinned all shares ≤ 10 MB.
- **Crypto (the good part):** per-share random AES-256-GCM key,
  wallet-derived identity, RSA-OAEP key wrapping per receiver, only
  ciphertext + wrapped keys on IPFS, pointers on-chain. Zero-knowledge with
  respect to all infrastructure — but whole-file buffering, not streaming.

### 2.2 The autopsy

| Died / fatal dependency | Shutdown vector | Survived |
| --- | --- | --- |
| Kaleido hosted chain (paid SaaS; single shared RPC login) — when it lapsed, *all* share metadata, invites, and update signaling died | S1 | Content addressing: a share's state was one root hash with a verifiable update history |
| Single master pinning + bootstrap node on one droplet | S3 | Ciphertext-only on the wire — every node/gateway was zero-knowledge |
| js-ipfs (deprecated 2022-23; was slow, memory-hungry, DHT-incomplete — the *reason* they needed their own bootstrap/pinning node) | S2 | Open-source, Dockerized community pinning node (anyone *could* seed their own shares) |
| No NAT traversal at all (relay disabled) — direct P2P only for publicly dialable peers | S4 | Wallet-based self-sovereign identity — no accounts, no password DB |

**The pattern:** every byte of *data* was resilient; every bit of
*coordination* was a single point of failure. Safu's modern design already
fixed most of this (CRDT documents instead of a chain, hole-punching, streaming
crypto) — but it re-introduced one coordination SPOF in a new shape: n0's
discovery service (§3).

---

## 3. Project Safu today — dependency inventory

What the current code actually depends on (verified in-repo):

| Dependency | Where | Configurable today? | If it disappears |
| --- | --- | --- | --- |
| **iroh core** (`iroh = "1"`) | `crates/safu-transport/Cargo.toml` | — | Fork-safe: MIT/Apache-2.0; iroh 1.0 (June 2026) guarantees wire compatibility across 1.x; `iroh-relay` + `iroh-dns-server` live in the same open workspace. **Notably, Safu does *not* depend on `iroh-blobs`/`iroh-docs`** (which are still pre-production at head) — the CRDT doc sync and `BLOCK_PROTOCOL` are our own, over raw QUIC streams. Small, stable surface. |
| **n0 public relays** | default in `native.rs` / `wasm.rs` | ✅ Yes — `SHARU_RELAY_URL` / `VITE_SHARU_RELAY_URL` / `--relay` override the relay map (`RelayMode::custom`) | Native peers with direct connectivity keep working (per n0's Nov 2024 outage post-mortem, only hole-punching-dependent and relayed paths break). **Browser peers break entirely** — they are relay-only by platform constraint. Free public relays are explicitly best-effort: rate-limited, no SLA, "limits can change at any time". |
| **n0 discovery** (`dns.iroh.link` DNS + pkarr publishing) | **Hardcoded**: `Endpoint::builder(presets::N0)` in both `native.rs:40` and `wasm.rs:43` — the relay override deliberately keeps the N0 discovery preset (`deployment.md`) | ❌ **No — this is the single worst gap** | Dial-by-`EndpointId` fails everywhere. Pairing still works where the peer's relay URL is already known (our connection codes embed `{id, relayUrl}` — a real mitigation), but reconnecting after a relay/address change fails. |
| **Always-on pinning peer** (`crates/sharu`, `apps/peer`) for public shares | share link embeds exactly **one** `peer: {id, relayUrl}` (`public-share.md`) | Self-hosted by design (good) | That share link dies with the node or its relay — one-node availability, the old sharu's S3 in miniature (though user-run and zero-knowledge). |
| **Web app hosting** (Cloudflare Pages, `safu.app`) | `deployment.md` | Static SPA — anyone can rebuild/rehost | Share links carry the origin in the URL; a dead origin kills existing links even though `#fragment` keys and ciphertext are fine. (S5) |
| n0 company itself | — | — | Funding is opaque (no public raise found); business model is OSS + paid relay services. Health signals are good (1.0 shipped, ~200M endpoints created/30 days, Delta Chat et al. in production), but free public infra carries **no long-term commitment**. Plan as if it can vanish. |

**Bottom line:** the *code* is nearly n0-independent already; the *deployment
defaults* are not, and **discovery is not even configurable**. Browsers are the
structurally weak runtime (relay-only, and custom-relay + custom-discovery in
WASM is documented nowhere upstream — it should work, but must be verified).

---

## 4. Could IPFS replace iroh? (the direct answer)

State of the ecosystem, mid-2026 (all verified):

- **Institutionally healthier than its 2023 reputation.** Core maintenance
  moved from Protocol Labs to **Interplanetary Shipyard** (independent,
  April 2024) and *accelerated*: 7 Kubo releases in 2025, Kubo v0.42
  (June 2026), AutoTLS default-on, sub-second optimistic provides, a
  provide-sweep rewrite. js-ipfs is formally dead; **Helia** (its JS/TS
  successor) is actively maintained and production-grade for
  retrieval/light-node use.
- **The Amino DHT survived the Protocol Labs restructuring** (~66k unique
  peer IDs/week in ProbeLab crawls; bootstrap list fully replaceable). The
  Hydra-booster shutdown cost some lookup speed, but the network held. The
  recurring pattern: **centralized pinning/gateway *businesses* die regularly
  (Infura IPFS, Cloudflare gateways, web3.storage, nft.storage, Fleek); the
  protocol and self-hosted nodes survive.** That is exactly the property this
  product wants — for its *public* data.
- **Browser story:** WebRTC-Direct (browser→server, no cert, no signaling
  server), AutoTLS/`libp2p.direct` wss, circuit relay v2 + WebRTC for
  browser↔browser (relay carries only the SDP handshake, then drops out —
  cheaper than a data relay). Every centrally-run default (AutoTLS broker,
  `delegated-ipfs.dev` routing, bootstrap) is open-source and self-hostable.
  But: **two browsers still cannot sync with zero servers** — at least one
  publicly reachable (permissionless, possibly user-owned) peer is required.
  Same fundamental constraint as iroh's relay-only browsers, differently
  shaped.

Why wholesale replacement would *hurt*:

1. **No production Rust IPFS exists.** iroh itself started as "IPFS in Rust"
   and abandoned it (the compat codebase, beetle, is dead); `rust-ipfs` forks
   are WIP. Adopting IPFS means Helia (JS) in the browser + a Kubo (Go)
   sidecar on desktop — **two stacks, duplicated logic, the exact
   architecture the blueprint forbids** (§1.2 runtime parity).
2. **Bitswap is the wrong shape for large encrypted blobs.** n0 measured
   ~1,000 messages to move 256 KB; per-block request/response with a 1 MiB
   ceiling, vs. one BLAKE3-verified stream over one QUIC connection between
   known peers. Backup/restore of multi-GB payloads is Safu's hot path.
3. **BLAKE3 is a second-class citizen.** Kubo *accepts* `--hash=blake3` CIDs
   but treats it as a dumb hash under UnixFS DAG chunking — no incremental
   verified streaming. We would give up the property our crypto pipeline is
   built around.
4. **The public DHT leaks metadata.** Provider records and lookups are
   observable at scale (documented by academic monitoring). A zero-knowledge
   product would need unannounced, known-peer Bitswap or a private swarm —
   at which point IPFS degenerates into "libp2p as transport" and the
   "anyone can serve my blocks" benefit is gone anyway. (This was the
   original comparison doc's §4.1 argument; the 2026 evidence still supports
   it.)
5. **NAT traversal is no better.** libp2p DCUtR hole-punching measures ~70%
   success on the punch itself and roughly ~50% end-to-end before relay
   fallback (2026 large-scale study) — comparable class to iroh, with a
   thinner data-relay fallback.

**Verdict: no as a replacement; yes as a selectively-adopted *pattern* and an
optional escape hatch for public shares (§6.3).** The reliability the user is
asking for does not come from the IPFS protocol — it comes from the
*infrastructure properties* IPFS demonstrates (self-hostable everything,
permissionless relays, community governance). Those properties can be added to
the iroh deployment without giving up direct QUIC, BLAKE3 streaming, or the
single Rust core.

---

## 5. The survivability toolbox (alternatives studied)

| Technology | What it offers Safu | Shutdown-resilience | Fit |
| --- | --- | --- | --- |
| **BitTorrent Mainline DHT + pkarr** | Company-less discovery: signed DNS-style records under an Ed25519 key, published to a ~10M-node DHT that has run for **20 years with no operator**. iroh already speaks pkarr natively (`iroh-mainline-address-lookup` crate; `iroh-dns-server` *is* a pkarr relay). Browsers reach it via self-hostable HTTP pkarr relays. | **Best in class** — arguably the most shutdown-proof discovery layer in existence | ✅ Direct drop-in for the n0 discovery dependency (native now; browser via pkarr relay needs verification) |
| **Syncthing's relay-pool model** | Not code — governance: a community pool (~100 live relays, July 2026) anyone can join by running `strelaysrv`; a Swedish non-profit funds only the thin coordination layer via donations; a decade of proven durability. Also the cautionary tale: its official Android app died to a *platform gatekeeper*, and the MPL license is what saved users (community fork). | Proven durable for ~10 years | ✅ The template for evolving from "our relay" to "a relay commons" (iroh's `RelayMap` API already accepts arbitrary multi-operator lists) |
| **Nostr as rendezvous** | Hundreds of independent, permissionless WebSocket relays usable as redundant signaling (e.g. publishing encrypted peer-address records or WebRTC SDP between one's own devices). Trivial to self-host. | Excellent (no single operator; near-zero switching cost) | 🟡 Future secondary rendezvous channel for browsers; metadata (pubkeys/timing) visible to relays unless keys are rotated |
| **WebRTC data channels** (+ trystero-style multi-source signaling, `webrtc-rs` on native) | The only *browser↔browser direct* transport that exists today; STUN is a free commons; signaling can ride Nostr/trackers/own relay. TURN fallback is the residual cost (nobody runs free TURN at scale — but Safu's always-on peer can *be* the fallback). | Good (web-standard; browser vendors, not one company) | 🟡 The credible answer to "browsers are structurally relay-dependent" — as an *additional* iroh-independent path, not a replacement. n0 has WebRTC/WebTransport for iroh on its aspiration list; this hedge matters only if that never lands |
| **Hypercore / Pear (Holepunch)** | Excellent DHT + hole-punching, MIT | DHT is peer-run; company is Tether-funded | ❌ JS-only, no browser DHT without your own relay server, no production Rust — wrong runtimes |
| **Veilid** | Real Rust+WASM privacy network (cDc/foundation) | Good ideology, pre-1.0 | ❌ ~32 KB message limits, no bulk block store — not a data plane |
| **Willow / Earthstar** | Capability-scoped private sync (conceptually the best fit) | No production implementation; `iroh-willow` never shipped and is dormant | ❌ Research bet, revisit later |
| **Tor onion services (arti 2.x)** | Zero-infrastructure desktop reachability with **no NAT traversal at all**; arti 2.0 (Feb 2026) is production-recommended, onion services stable | Excellent (volunteer network, non-profit) | 🟡 Optional slow fallback for the always-on node / desktop↔desktop under hostile networks (S4). Not for browsers, not for bulk hot-path |
| **IPFS (Helia/Kubo)** | See §4 | Protocol layer: excellent; perf/runtime fit: poor | 🟡 Escape hatch for public shares only (§6.3) |

---

## 6. Recommended direction (for discussion — nothing implemented)

The findings compose into a layered plan. Each layer independently reduces
shutdown risk; none changes the SDK's public API (the `Transport` interface
already isolates all of this — the M2/M3 work proved the sync layer is
transport-agnostic).

### 6.1 Layer R1 — remove n0 from the liveness equation (highest value, lowest effort)

> **Status: R1 implemented** (R1.1–R1.4). Discovery is now configurable
> (`SHARU_DISCOVERY`: `n0`, `pkarr:<url>`, `dht`, `mdns`), native nodes can run
> fully company-less (Mainline DHT + mDNS), and a WASM endpoint was verified to
> honor a self-hosted relay with zero n0. See
> [`r1-discovery-hardening-plan.md`](./r1-discovery-hardening-plan.md) and
> [`r13-selfhost-spike-findings.md`](./r13-selfhost-spike-findings.md). One
> finding reshaped the sequel: Safu dials with an explicit `relayUrl`, so
> discovery is *latent* until a **dial-by-id + reconnect** path exists — now the
> lead item of R2 below.

1. **Make discovery configurable** the same way relays already are: allow a
   custom pkarr/DNS origin (self-hosted `iroh-dns-server`) instead of the
   hardcoded `presets::N0` in `native.rs` / `wasm.rs`. This closes the one
   dependency that today cannot be swapped without a rebuild.
2. **Add Mainline DHT discovery on native** (`iroh-mainline-address-lookup` +
   local mDNS) — n0's own docs recommend exactly this combination for
   "global and local address lookup without depending on centralized
   infrastructure." Zero infrastructure, zero operator, no browser support
   (UDP) — hence per-runtime layering.
3. **Verify the browser story empirically:** custom relay + custom discovery
   in the WASM build is documented nowhere upstream; it *should* work
   (relays are plain `RelayMode::custom` config; pkarr publish/resolve is
   HTTPS) but must be proven with a test before we rely on it.
4. **Ship self-hosted relay + DNS as the default deployment posture** (one
   VPS runs `iroh-relay` — ACME TLS built in — and `iroh-dns-server`), with
   n0's public infra demoted to a fallback entry in a **multi-operator relay
   list** rather than the default.

*Outcome: n0 could disappear tomorrow and nothing breaks except convenience.*
S1 ✅, S2 largely ✅ (fork-safe license + tiny `iroh` core surface + our own
protocols over raw streams).

### 6.2 Layer R2 — de-single-point the product's own coordination

1. **Share links with multiple hosts:** `ShareInfo.peer` becomes a list —
   every paired always-on node that pinned the blocks. Any one serving node
   keeps the link alive (fixes the miniature-S3 in `public-share.md`).
2. **Pairing codes already embed `{id, relayUrl}`** — extend to carry
   *several* relay/discovery hints so a known peer stays reachable across
   infra changes without any lookup.
3. **Origin-independent share links:** document (and test) that any rebuild
   of the static SPA on any origin can open a `#share=` fragment — the link
   format should survive the death of `safu.app` (S5). Longer term, consider
   packaging the keyless viewer for third-party hosting.
4. **Community relay pool (Syncthing model), when there is a community:**
   the `RelayMap` API already takes arbitrary lists; the missing piece is
   governance (a pool listing + donations), not code. Park until user scale
   justifies it.

### 6.3 Layer R3 — optional escape hatches (bigger bets, explicitly deferred)

1. **IPFS mirror for public shares:** public-share blocks are plain
   ciphertext addressed by BLAKE3 — they can be exported as CIDv1 `raw`
   blocks (`--hash=blake3`) and pinned by *any* IPFS node or pinning
   service, making a share fetchable via the entire IPFS network and its
   gateways even if every Safu node dies. Zero-knowledge is preserved
   (ciphertext + key-in-fragment). Cost: a bridge in the pinning node and a
   Helia fetch path in the keyless viewer. This selectively re-adopts the
   *one* old-sharu property worth missing — "anyone can pin my (encrypted)
   share" — without touching private sync.
2. **WebRTC browser↔browser path** with multi-source signaling (own relay
   first, Nostr as fallback) — the structural fix for browser relay
   dependence, if iroh's own WebRTC/WebTransport ambitions don't
   materialize. Hedge, not commitment: track iroh's roadmap first.
3. **arti (Tor) reachability for the always-on node** — an "always
   reachable, slowly, with zero infra" last resort for hostile networks
   (S4).

### 6.4 What we deliberately do *not* do

- **Do not replace iroh with IPFS/Helia/Kubo** (§4: two stacks, slower bulk
  transfer, BLAKE3 downgrade, DHT metadata leak).
- **Do not adopt `iroh-blobs`/`iroh-docs`** — staying on our own protocols
  over raw iroh streams keeps the dependency surface at "core iroh 1.0,
  wire-stable" and made this whole analysis simpler; that was retroactively
  the right call.
- **Do not chase Veilid/Willow/Hypercore** for the data plane (maturity or
  runtime mismatch, per §5).

---

## 7. Open questions to resolve before any implementation

1. Does the iroh **WASM build honor `RelayMode::custom` + a non-N0 discovery
   config** end-to-end? (Upstream docs are silent; needs a spike + e2e test
   against a self-hosted `iroh-relay`/`iroh-dns-server`.)
2. pkarr record TTLs are hours and need **republishing** — which component
   owns republish for mostly-offline devices (the always-on node?)?
3. For the IPFS share mirror: confirm current Kubo/Helia handling of
   **`blake3` CIDv1 raw blocks** end-to-end (add → provide → browser
   verified-fetch), and whether our CDC chunk sizes fit under Bitswap's
   1 MiB block ceiling (current default target range 512 KiB–4 MiB does
   not — blocks >1 MiB would need re-chunking or a size cap for shares).
4. Chunking side-channel: 2025 research demonstrated fingerprinting attacks
   against CDC-based encrypted backups via chunk-size patterns. Our chunk
   boundaries derive from plaintext (FastCDC). Assess whether padding/quantizing
   chunk sizes is warranted — orthogonal to transport but surfaced by this
   research.
5. Relay economics: what does one self-hosted relay cost at expected traffic
   (relay carries data only for hole-punch failures + all browser traffic)?
   Informs when the community-pool conversation matters.

## 8. Sources

Primary sources verified during this research (July 2026):

- **Old sharu:** github.com/sharu-io — `desktop` (`package.json`,
  `ipfsControl.ts`, `src/app/service/*.service.ts`, `environment.prod.ts`),
  `pinning-node`, `whitepaper/whitepaper.md`; npm `js-ipfs-dep`.
- **Iroh / n0:** iroh.computer/blog/v1 (1.0 announcement, support windows,
  wire-compat guarantee); docs.iroh.computer — concepts/relays,
  concepts/discovery, connecting/dns-discovery, connecting/dht-discovery,
  add-a-relay, deployment/wasm-browser-support; iroh.computer/pricing;
  iroh.computer/blog/relay-down-a-post-mortem (Nov 2024 outage);
  crates.io — `iroh-relay`, `iroh-dns-server`,
  `iroh-mainline-address-lookup`; github.com/n0-computer/{iroh,iroh-blobs,
  iroh-docs} (licenses, production-quality caveats); n0-computer/iroh
  discussion #3598 (redundant DNS servers).
- **IPFS 2026:** github.com/ipfs/kubo releases (v0.39–v0.42);
  blog.ipfs.tech/202305-js-ipfs-deprecation-for-helia; github.com/ipfs/helia;
  blog.ipfs.tech/shipyard-hello-world (maintainer spinout); probelab.io
  (Amino DHT crawls, Parsec latency); libp2p.io/blog/autotls;
  github.com/ipshipyard/p2p-forge; libp2p.io/docs/browser-connectivity;
  github.com/ipfs/someguy + delegated-ipfs.dev; docs.ipfs.tech
  (privacy-and-encryption, modify-bootstrap-list, experimental-features/pnet);
  arXiv 2104.09202 (DHT request monitoring); arXiv 2604.12484 (DCUtR
  hole-punching measurement); n0.computer/blog/a-new-direction-for-iroh
  (Bitswap overhead, beetle); ipshipyard.com/blog/2025-shipyard-ipfs-year-in-review;
  nft.storage / Fleek / Cloudflare gateway shutdown notices;
  arXiv 2504.02095 (chunking attacks on CDC encrypted backup).
- **Alternatives:** docs.syncthing.net (relaying, strelaysrv);
  syncthing.net/foundation + relays.syncthing.net (live pool, queried
  2026-07-05); forum.syncthing.net (Android app discontinuation);
  github.com/pubky/pkarr; en.wikipedia.org/wiki/Mainline_DHT;
  docs.pears.com + github.com/holepunchto/* (Hypercore, dht-relay);
  veilid.com + gitlab.com/veilid/veilid; codeberg.org/worm-blossom/willow_rs;
  github.com/n0-computer/iroh-willow (dormant); nostr-protocol/nips issue
  #771 + github.com/dmotz/trystero (WebRTC signaling over Nostr et al.);
  blog.torproject.org (arti 2.x); bloggeek.me + metered.ca (STUN/TURN
  landscape).
