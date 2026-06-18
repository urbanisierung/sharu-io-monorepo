use wasm_bindgen::prelude::*;

/// Scaffold export proving the Rust→WASM pipeline is wired.
/// The real chunk/hash/encrypt engine lands in M1 (plan §1.2).
#[wasm_bindgen]
pub fn safu_crypto_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
