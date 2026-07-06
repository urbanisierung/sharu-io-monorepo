# R2 — Coordination Resilience: Implementation Plan

> Status: **plan** (R2.1 implemented next). Turns Layer R2 of
> [`resilient-transport-research.md`](./resilient-transport-research.md) §6.2 —
> "de-single-point the product's own coordination" — plus the **dial-by-id**
> finding from [`r13-selfhost-spike-findings.md`](./r13-selfhost-spike-findings.md)
> into a verifiable roadmap. Same discipline as the R1 plan: additive only, no
> breaking change to the SDK `Transport` public API (new optional behavior, not
> changed signatures); each step states a **verify**; each phase has **exit
> criteria**.

## The problem R2 solves

R1 made discovery **configurable and n0-free**, but R1.3 found it is **latent**:
Safu always dials with an explicit `{id, relayUrl}` (pairing codes / share links
carry it; `IrohTransport.connect` *throws* without a relay URL), so iroh's
discovery **resolution** is never triggered. Two single points of failure follow:

1. **Stale relay = dead peer.** If a peer's relay changes (n0 outage, operator
   switch, the peer roams), the stored `relayUrl` is wrong and reconnect fails —
   there is no recovery path, even though discovery *could* resolve the peer's
   current address by id.
2. **One host per share.** A share link embeds exactly one serving `peer`; that
   node (or its relay) dying kills the link (`public-share.md`).

R2 closes both: make discovery **load-bearing** (dial-by-id fallback), carry
**redundant** hints, and spread shares across **multiple** hosts.

---

## Phase R2.1 — Dial-by-id fallback (make discovery load-bearing) *(lead)*

Confirmed feasible: `Endpoint::connect` takes `impl Into<EndpointAddr>`, and an
address-less `EndpointAddr::new(id)` triggers iroh's address lookup (discovery)
to resolve the current address (verified in the iroh 1.0 source —
`resolve_remote`; `socket.rs` dials `EndpointAddr::new(dest_id)`).

- **Binding (`native.rs`, `wasm.rs`):** let `connect` accept an **optional**
  relay. With a relay → today's behavior (`EndpointAddr::new(id).with_relay_url`).
  Without → dial `EndpointAddr::new(id)` and let the configured discovery
  (pkarr/dht/mdns) resolve the address. Keep the existing 3-arg form working
  (empty relay string = id-only) so no caller breaks.
- **TS (`iroh.ts`):** `connect(peer, protocol)` **no longer throws** when
  `peer.relayUrl` is absent — it dials by id (the `PeerAddr.relayUrl` field is
  *already* optional in the interface, so this is purely additive behavior).
- **Reconnect fallback (SDK/runtime):** where a dial to a stored `PeerAddr`
  fails, retry **by id-only** so discovery can recover a roamed/changed address.

**Verify:**
- Unit: a fake transport proves the fallback control flow — dial-with-relay
  fails → dial-by-id is attempted.
- `connect` with an address-less `PeerAddr` compiles and dials on the loopback
  and native-direct paths; existing relay-dial tests unchanged.
- The discovery-resolution payoff shares R1.3's gating (needs a live
  discovery record) — exercised by the `SAFU_SPIKE` harness on real hardware,
  not the headless sandbox. Documented, not silently skipped.

**Exit criteria:** the transport can dial a peer by id alone (discovery
resolves), `IrohTransport.connect` tolerates a missing relay URL, and a stale
stored relay no longer means an unrecoverable peer; no `Transport` signature
change (relay becomes optional behavior, not a removed argument).

**Status: done.** The native + wasm bindings dial by id alone when `relay` is
empty (`EndpointAddr::new(id)` → discovery resolves); `IrohTransport.connect`
drops the "relay URL required" throw and, via the pure `dialPlan(peer)` helper,
tries the known relay first then an id-only attempt — so a stale/unreachable
relay auto-recovers through discovery. The fallback is centralized in the
transport, so **every** caller (DocSync, block-fetch, pin/unpin) gets reconnect
resilience with no SDK change. Verified: `dialPlan` unit tests, native + wasm
builds, typecheck/biome/clippy, full node suite green. The live
discovery-resolution payoff shares R1.3's real-hardware gating (needs a
published record), exercised via the `SAFU_SPIKE` harness — documented, not
silently skipped.

---

## Phase R2.2 — Multi-hint peer addresses

Static redundancy to complement R2.1's dynamic resolution: carry **several**
relay hints so one stale hint isn't fatal even before discovery kicks in.

- Extend `PeerAddr` with an optional `relayUrls?: string[]` (keep `relayUrl` for
  back-compat; treat it as the head of the list). Additive to the interface.
- `encodePairingCode`/`decodePairingCode` (and the share `PeerAddr`) carry the
  list; codes stay base64url JSON, QR-friendly.
- `connect` tries each hint, then falls back to id-only (R2.1).

**Verify:** codec round-trips multiple relays and back-compat single-relay codes;
`connect` tries hints in order then id-only (fake transport); existing pairing
tests still pass.

**Exit criteria:** a pairing code / share link carries multiple relay hints and
survives any one going stale; old single-relay codes still decode.

---

## Phase R2.3 — Multi-host share links

- `ShareInfo.peer` → `peers: PeerAddr[]` (the nodes that pinned the blocks). The
  keyless viewer tries each until one serves; any single serving node keeps the
  link alive (fixes the one-host SPOF in `public-share.md`).
- Publishing pins to, and records, **every** paired always-on node, not just the
  first.

**Verify:** a share with two hosts opens when either is up and the other is down
(injectable network seam in `share-viewer.ts`); single-host links still open.

**Exit criteria:** a share survives the loss of any one of its hosts.

---

## Phase R2.4 — Origin-independent share links

- Document + test that a `#share=…` fragment opens on **any** origin rebuild of
  the static SPA (the fragment carries key + hosts; nothing origin-bound). So the
  death of `safu.app` does not kill existing links (S5 in the research doc).
- Optional: a tiny "open this share on your own instance" affordance.

**Verify:** the share round-trip opens against a build served from a different
origin; link format documented as origin-portable.

**Exit criteria:** an existing share link is openable from any deployment of the
web app, not just the one that minted it.

---

## Phase R2.5 — Community relay pool *(deferred — governance, not code)*

The Syncthing model (permissionless pool + non-profit-funded listing). iroh's
`RelayMap` already accepts multi-operator lists (R1.4 documents the config); the
missing piece is *governance* (a pool listing + funding), which only matters at
user scale. Parked with a pointer, per the research doc §6.2.

---

## Sequencing & risk

1. **R2.1** first — the keystone; makes all of R1 load-bearing. Additive, small
   surface (binding + one TS guard + reconnect retry). The discovery payoff is
   real-hardware-verified (R1.3 gating), so land the code + fallback unit tests
   now and lean on the `SAFU_SPIKE` harness for the live proof.
2. **R2.2** builds directly on R2.1's optional-relay `connect`.
3. **R2.3 / R2.4** are share-layer, independent of R2.1/R2.2 and independently
   shippable.
4. **R2.5** deferred.

**No SDK API break:** every change is an *addition* (optional field, tolerated
missing relay, new fallback) — validated against the milestone invariant that
`packages/sdk`'s public surface only grows.
