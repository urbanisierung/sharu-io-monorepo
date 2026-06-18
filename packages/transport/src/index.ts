// The runtime-agnostic P2P transport contract (plan §2.1). Both runtimes
// implement this single interface: the browser via Iroh compiled to WASM
// (relay-only over WebSocket through the n0.computer relay network), the
// desktop via native Iroh with direct UDP hole-punching (plan §3.2).
//
// The SDK depends only on this interface, never on Iroh or WASM build details,
// so the storage/crypto/sync layers stay transport-agnostic (blueprint §4).

export { LoopbackNetwork } from './loopback.js';
export type { Channel, PeerAddr, PeerId, Transport } from './transport.js';
