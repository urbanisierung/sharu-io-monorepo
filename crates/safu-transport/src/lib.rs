//! Iroh bindings for Project Safu (plan §2.1).
//!
//! The same crate serves both runtimes. Compiled to `wasm32-unknown-unknown`
//! via `wasm-pack` it exposes the `wasm` module to the browser, where Iroh runs
//! relay-only over WebSocket through the n0.computer relay network (browsers
//! cannot do direct UDP/QUIC — handoff §4). Built natively it is the basis for
//! the desktop transport core (plan §3.2), which additionally gets direct UDP
//! hole-punching. Both sit behind the one TypeScript `Transport` interface in
//! `packages/transport`.

/// Crate version, exported on every target as a liveness/version probe.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(all(target_family = "wasm", target_os = "unknown"))]
mod wasm;

#[cfg(not(all(target_family = "wasm", target_os = "unknown")))]
pub mod native;
