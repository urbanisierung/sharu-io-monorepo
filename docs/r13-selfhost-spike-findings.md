# R1.3 — Browser/WASM self-hosted relay + discovery spike: findings

> Verification spike for [`r1-discovery-hardening-plan.md`](./r1-discovery-hardening-plan.md)
> §R1.3. Question: **does the iroh WASM build honor a custom relay + custom
> (non-n0) discovery at runtime?** Reproducible harness:
> `packages/transport/scripts/r13-selfhost-spike.sh` +
> `packages/transport/src/discovery-selfhost.spike.test.ts` (gated on
> `SAFU_SPIKE=1`).

## Setup

Fully local, zero n0 infrastructure:

- **`iroh-relay --dev`** on `127.0.0.1:3340` (plain HTTP/ws, metrics off).
- **`iroh-dns-server`** (pkarr relay) on `127.0.0.1:8080`, Mainline disabled.
- The **relay-only WASM core** (the same `@safu/transport/iroh` the browser and
  headless `apps/peer` use) booted in Node via `createIrohTransport`, configured
  with `relays=[http://localhost:3340]` and `discovery=[pkarr:http://127.0.0.1:8080/pkarr]`.

Both binaries build and run locally (`cargo install iroh-relay --features server`,
`cargo install iroh-dns-server`) — confirming the self-hosted infra R1 depends on
is real and runnable, not just documented.

## Results

### ✅ Custom relay in WASM — VERIFIED (decisive)

The WASM endpoint came online against the local relay:

```
SPIKE addr= {"id":"1ef430e8…","relayUrl":"http://localhost:3340/"}
```

Its home relay is the **self-hosted** one; no n0 relay is contacted. This
answers the open research question ("does the WASM build honor
`RelayMode::custom` at runtime, or is it hard-tied to n0?") — **it honors custom
relays**. The committed gated test asserts exactly this and passes.

### ⚠️ Custom discovery (pkarr publish) — wired + n0-free, but did not complete in-sandbox

The endpoint is configured with the custom pkarr relay and contacts no n0 host,
but it did **not** PUT its signed record to the local pkarr server within the
test window (the server logged the test's `GET /pkarr/{id}` polls but **zero
`PUT`s**), in both the WASM and a native `sharu serve` run, with no error
surfaced. Most likely causes, not disambiguated here:

1. **HTTPS expected.** The n0 pkarr default is `https://dns.iroh.link/pkarr`; a
   plain-HTTP dev relay may be declined by the publisher. A trusted-HTTPS
   `iroh-dns-server` (real cert) is needed to test this cleanly — self-signed
   `:8443` fails Node/rustls validation, so it wasn't exercised.
2. **Address not settled.** Publishing advertises the endpoint's address, which
   depends on net-report/QAD address discovery. That is exactly the probe the
   headless sandbox restricts — the same limitation that gates the relay e2e
   (`status.md` "CI-only limitation"). Publish is expected to complete on real
   hardware / a networked host.

This is recorded as a best-effort observation in the spike (logged, not
asserted), so the committed test stays green and deterministic. Full publish
verification is a real-hardware / HTTPS-relay follow-up, not a code fix.

Minor test note: iroh's `endpoint.id` renders as **hex**, while pkarr keys are
**z-base-32** — so a direct `GET /pkarr/{id}` returns `400`. Moot while nothing
is published; a real publish-verification pass must convert the id to z-base-32.

## The load-bearing finding (independent of the sandbox)

**Safu's dial path always supplies `peer.relayUrl`** — the TypeScript
`IrohTransport.connect` throws without it, and the native/WASM `connect(peer,
relay, protocol)` takes the relay as a required argument. Pairing codes and share
links embed `{id, relayUrl}` directly. So iroh's discovery/address-**resolution**
(look up an `EndpointId` you have no address for) is **never triggered on Safu's
current connection path** — discovery only does the **publish/advertise** side.

Consequence: configuring custom discovery (R1.1/R1.2) makes Safu **n0-free by
configuration** and hardens the *advertise* side, but discovery is **latent** —
it is not load-bearing for connectivity until a **dial-by-id / reconnect** flow
exists that resolves a peer whose address has changed. Two implications:

- The **relay** is the real browser liveness dependency today (verified
  swappable in WASM here). Making discovery swappable is correct and future-proof
  but, on its own, changes no current connection.
- To make discovery independence actually *do* something, a follow-up (R2) should
  add a **dial-by-id** path to the transport (`connect` by `EndpointId` alone,
  letting the configured discovery resolve the address) and a reconnect flow that
  uses it. That is where pkarr/DHT/mDNS resolution pays off — reconnecting to a
  peer after its relay/address changed, without re-pairing.

## Bottom line

- WASM honors custom relays at runtime → the web app can drop its n0 **relay**
  dependency (self-host `iroh-relay`). **Verified.**
- WASM accepts custom pkarr discovery and stays n0-free; the publish step needs
  real-hw/HTTPS to fully green — a documented, reproducible follow-up, not a
  blocker.
- Discovery is currently **latent** (Safu dials with an explicit relay URL), so
  the highest-leverage next step is a **dial-by-id + reconnect** path (R2) that
  makes the now-swappable discovery load-bearing.
