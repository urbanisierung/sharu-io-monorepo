// The one remaining production seam: a headless (no-browser, no-Tauri) Iroh
// transport satisfying the SDK's `Transport` interface. Everything else in this
// app is complete and tested over the in-process loopback transport; swapping in
// a real transport here is all that stands between this assembly and an
// always-on node on a NAS / VPS / Raspberry Pi.
//
// Two viable wirings, both reusing M3's native core
// (`crates/safu-transport` → `safu_transport::native`, direct UDP hole-punching)
// rather than the relay-only WASM build:
//
//   A. Native binding (recommended). Expose the existing `safu_transport::native`
//      endpoint to Node via napi-rs (a small cdylib), or run the native core as a
//      sidecar process the peer talks to over a local socket. This is the desktop
//      transport minus the Tauri command bridge — same QUIC hole-punching, no
//      browser globals, best NAT traversal for an always-on node.
//
//   B. WASM-in-Node. Add a Node boot path to the Iroh WASM binding (mirror
//      `packages/crypto/src/wasm.ts`, which already reads its `.wasm` from disk
//      under Node) and provide the globals it expects (`fetch`, a `ws`
//      WebSocket). Relay-only, simplest to stand up, but routes all traffic
//      through the n0 relay.
//
// Until one lands, fail fast with an actionable message rather than pretending
// to come online.
import type { Transport } from '@safu/transport';

export function createPeerTransport(): Promise<Transport> {
  return Promise.reject(
    new Error('headless Iroh transport not yet wired — see apps/peer/README.md (transport seam)'),
  );
}
