# Architecture Comparison: Original (IPFS) vs. Project Safu (Iroh / Direct-QUIC)

This document compares the **original Sharu architecture** ([github.com/sharu-io](https://github.com/sharu-io)) — built around 2019-era `js-ipfs`, a global DHT, and an Electron runtime — with the **modern rewrite** specified in
[`sharu_modernization_blueprint.md`](./sharu_modernization_blueprint.md) and resolved in
[`implementation-plan.md`](./implementation-plan.md), which is built around **Iroh**, **direct-QUIC P2P transport**, and a **Tauri** runtime.

The goal is to make the design decision explicit: what each approach buys, what it costs, and **why the new system is built the way it is**.

> **TL;DR** — The original used IPFS to get content addressing and "store it anywhere" decentralization for free, at the cost of DHT latency, connection fragility behind NAT, heavy runtimes, and a security model bolted onto storage. The rewrite keeps the one IPFS idea that earns its place — **content addressing by hash** — and discards the rest in favor of **direct node-to-node QUIC transport, public-key addressing, streaming zero-knowledge crypto, and a thin multi-runtime shell**.

---

## 1. The Two Approaches at a Glance

| Dimension | Original (IPFS) | Project Safu (Iroh / Direct-QUIC) |
| --- | --- | --- |
| **Content discovery** | Global Distributed Hash Table (DHT) content routing | Direct node-to-node transport; public keys *are* the address |
| **Transport** | libp2p multiplexed streams over the DHT-resolved path | Native **QUIC** streams (`iroh-blobs` for blocks, `iroh-docs` for state) |
| **NAT traversal** | DHT + relay, fragile behind symmetric NAT | UDP hole-punching with STUN/TURN + DERP/relay fallback |
| **Content addressing** | CIDs (multihash, typically SHA-256) | **BLAKE3** content hashes |
| **Runtime** | Electron (bundled Chromium + Node) | **Tauri 2.0** (system webview + small Rust core) |
| **Web parity** | None / separate `js-ipfs` browser path | One Rust core compiled to **WASM** for web, **native** in desktop |
| **Encryption** | Layered on top of IPFS storage | **Zero-knowledge, streaming**, encrypt-before-transmit at the block boundary |
| **State / conflict resolution** | Application-level, coupled to network state | Deterministic replicated documents (`iroh-docs`), decoupled from transport |
| **Memory model** | Buffer-oriented | **Streaming only** — never buffer a whole file |
| **Crypto KDF / cipher** | (varies) | Argon2id KDF, AES-256-GCM, BLAKE3 integrity |

---

## 2. The Original Approach — IPFS

### How it worked
Files were chunked and stored as content-addressed blocks identified by **CIDs**. To fetch a block, a node queried the **global DHT** to discover which peers held the content and how to route to them. Transport ran over **libp2p**. The app shipped as an **Electron** desktop binary (bundled Chromium + Node.js), and encryption was applied as a layer on top of the IPFS storage primitives.

### Advantages
- **Content addressing for free.** Immutable, hash-addressed, deduplicated blocks — integrity is intrinsic, and identical content is stored once. *(This is the idea worth keeping.)*
- **"Store it anywhere" decentralization.** Any participating node — or public gateway — can serve a block. No need to know *who* has the data, only *what* you want.
- **Large, established ecosystem.** Mature tooling, public gateways, pinning services, and a recognizable mental model for decentralized storage.
- **Censorship resistance.** Content can be replicated and served by arbitrarily many independent nodes.

### Disadvantages
- **DHT latency and overhead.** Resolving a content address means walking a global hash table — many round trips before a single byte transfers. High CPU cost; slow first-byte times.
- **Connection fragility behind NAT.** Symmetric NATs frequently defeat DHT-mediated connectivity, so transfers stall or silently fail.
- **Heavy runtime.** Electron bundles a full Chromium + Node per app — hundreds of MB of RAM and disk, a large attack surface, and slow startup.
- **2019-era `js-ipfs` patterns.** Browser support was a separate, heavier code path; the JS implementation lagged the Go one and carried significant maintenance weight.
- **Security bolted onto storage.** Encryption sits *on top of* a system designed for public, replicated content. Metadata leakage and an awkward zero-knowledge story are the result — the storage layer was never zero-knowledge by construction.
- **No clean runtime parity.** Business logic and the IPFS path were entangled with the desktop environment; a true browser client meant duplicating logic.

---

## 3. The New Approach — Project Safu (Iroh / Direct-QUIC)

### How it works
The master key is derived **client-side** (Argon2id). Files are streamed through a chunking pipeline, hashed with **BLAKE3**, and **encrypted (AES-256-GCM) before any byte leaves the crypto boundary** — only ciphertext is ever transmitted. Blocks move over **direct QUIC streams** (`iroh-blobs`); a peer's **public key is its address**, so there is no DHT lookup — connection establishment is a key-based handshake plus UDP hole-punching, with DERP/relay only as a fallback for hostile NATs. File allocation tables live in **deterministic replicated documents** (`iroh-docs`), decoupled from transport. The same Rust core compiles to **WASM** for the web app and runs **natively** inside a small **Tauri 2.0** desktop shell.

### Advantages
- **Instant, line-speed connections.** Public-key addressing + direct QUIC removes the DHT round-trips entirely. Connection setup goes from an administrative bottleneck to a key-based handshake.
- **Robust NAT traversal.** Iroh's hole-punching + relay fallback handles symmetric NAT that defeated the DHT approach — without the app reinventing it.
- **Zero-knowledge by construction.** Crypto is decoupled from storage: only opaque ciphertext crosses the boundary; keys are never persisted in plaintext. Privacy is a property of the design, not a layer on top.
- **Streaming, bounded memory.** Multi-gigabyte files flow through stream pipelines and never inflate a memory buffer — works the same in a sandboxed browser tab and on a desktop.
- **True multi-runtime parity.** One runtime-agnostic core (`packages/sdk` + `packages/crypto`) → WASM in the browser, native in Tauri. No duplicated business logic; the SDK's public API does not bend to a runtime.
- **Lightweight runtime.** Tauri uses the OS's existing webview plus a small Rust core — a fraction of Electron's RAM, disk, startup time, and attack surface.
- **Deterministic conflict resolution.** Replicated documents own sync state and resolve conflicts deterministically, independent of transport health.
- **Stronger, faster primitives.** BLAKE3 (fast, parallel, secure integrity), Argon2id (memory-hard KDF), AES-256-GCM (authenticated encryption).

### Disadvantages
- **Direct-connectivity assumption.** The model favors peers that can reach each other (directly or via relay). It is a sync/backup fabric between *your* devices and trusted peers — not a public "anyone can serve this CID" content network.
- **Smaller / newer ecosystem.** Iroh is younger than IPFS; fewer third-party gateways, tools, and community resources.
- **Relay dependency in hostile networks.** When hole-punching fails, transfers fall back to relay infrastructure — a reachability dependency the pure-DHT model framed differently. It only forwards ciphertext (never plaintext), and it is a *liveness* dependency, not a trust one. It defaults to n0's public relays but is self-hostable via configuration (`SHARU_RELAY_URL` / `--relay` / `VITE_SHARU_RELAY_URL`; see [`deployment.md`](deployment.md)), and a node with a directly reachable address needs no relay on the data path at all.
- **Rust → WASM build complexity.** Cross-compiling the core to WASM and native adds toolchain and CI burden (a cost paid once at the build layer, not by users).
- **Less "infinite replication."** Without a global content network, broad public censorship-resistance is not a goal — by design (see below).

---

## 4. Why the New System Is Built This Way

The rewrite is not "IPFS but newer." It is a deliberate re-scoping around what this product actually is: **a decentralized, zero-knowledge, local-first backup & sync platform for a user's own devices and trusted peers** — not a public content-distribution network. Every major decision follows from that.

1. **The product is private sync, not public publishing.** IPFS optimizes for "anyone can discover and serve this content." Sharu's data is *private and encrypted*; nobody else should discover or serve it. The DHT's central feature is therefore pure overhead here — so it is removed. **Public-key addressing fits the actual access pattern**: you sync with peers you already know.

2. **Latency and reliability are the product.** Local-first means sync must feel instant and survive bad networks. DHT resolution and NAT fragility directly undermine that. **Direct QUIC + hole-punching** turns connection setup into line-speed transit and handles the NAT cases that broke the old design.

3. **Zero-knowledge must be structural, not layered.** Encrypting on top of a system built for public, replicated blocks leaks metadata and makes the privacy story fragile. The rewrite **encrypts before the transport boundary** so the network only ever sees ciphertext — privacy becomes an invariant enforced by tests, not a convention.

4. **One core, two runtimes — no duplication.** The original couldn't offer a real browser experience without a second code path. Compiling **one Rust core to WASM and native** gives genuine web/desktop parity, keeps the SDK runtime-agnostic, and means crypto and sync logic exist exactly once.

5. **Respect the user's machine.** Electron's bundled Chromium is heavy and wide. **Tauri 2.0** reuses the OS webview with a small Rust background service — lighter footprint, smaller attack surface, faster startup — appropriate for an always-on background backup agent.

6. **Determinism over coupling.** Conflict resolution belongs in **replicated documents**, decoupled from transport, so sync correctness does not depend on network state. This is what makes the local-first guarantees hold.

7. **Keep only what earns its place.** The one IPFS concept retained is **content addressing by hash** — now via **BLAKE3** — because immutability, deduplication, and intrinsic integrity are genuinely valuable. Everything else (DHT, libp2p routing, Electron, storage-coupled crypto) was a cost without a matching benefit for *this* product, and was replaced.

**In short:** IPFS was the right toolbox for *public, replicated, censorship-resistant content*. Sharu needs *private, instant, zero-knowledge sync between a user's own devices*. The new architecture keeps content addressing, drops the global DHT and heavy runtime, and rebuilds transport, runtime, and crypto around that actual goal.
