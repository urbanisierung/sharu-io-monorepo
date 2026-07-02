// The headless (no-browser, no-Tauri) Iroh transport for the always-on peer.
// This realizes wiring "B. WASM-in-Node": the relay-only Iroh WASM core, booted
// under Node by reading its `.wasm` from disk (see `@safu/transport/iroh`'s
// universal loader, which mirrors `@safu/crypto`'s). Node 22 supplies the only
// globals the binding needs — `fetch`, `WebSocket`, and `crypto.getRandomValues`
// — so no shims are required. It advertises every ALPN the node serves: doc-sync
// and block transfer, plus the public-share pin/unpin protocols.
//
// Tradeoff: relay-only routes all traffic through the n0 relay (which still sees
// only ciphertext) rather than hole-punching directly. For best NAT traversal on
// a NAS / VPS / Raspberry Pi, use the native Rust node `crates/sharu`, which
// realizes wiring "A" over `safu_transport::native`.
import { BLOCK_PROTOCOL, PIN_PROTOCOL, SYNC_PROTOCOL, UNPIN_PROTOCOL } from '@safu/sdk';
import type { Transport } from '@safu/transport';
import { createIrohTransport, parseRelays } from '@safu/transport/iroh';

export function createPeerTransport(): Promise<Transport> {
  // `SHARU_RELAY_URL` (comma-separated) points the peer at self-hosted relay(s)
  // instead of the n0 defaults; unset keeps the defaults.
  return createIrohTransport(
    [SYNC_PROTOCOL, BLOCK_PROTOCOL, PIN_PROTOCOL, UNPIN_PROTOCOL],
    15_000,
    parseRelays(process.env.SHARU_RELAY_URL),
  );
}
