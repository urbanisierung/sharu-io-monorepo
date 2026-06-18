use wasm_bindgen::prelude::*;

/// Scaffold export proving the Rust→WASM pipeline is wired.
/// The real Iroh bindings (relay-only in browser) land in M2 (plan §2.1).
#[wasm_bindgen]
pub fn safu_transport_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
