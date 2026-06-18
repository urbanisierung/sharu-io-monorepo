//! `safu-crypto`: streaming content-defined chunking plus blueprint-faithful
//! BLAKE3 / Argon2id / AES-256-GCM primitives, exposed to TypeScript via
//! wasm-bindgen. The streaming ingest/egress pipeline is orchestrated in TS
//! (`packages/crypto`); this crate provides the deterministic building blocks.

mod chunker;
mod crypto;

use wasm_bindgen::prelude::*;

fn to_err(msg: String) -> JsError {
    JsError::new(&msg)
}

/// BLAKE3 fingerprint of `data` (32 bytes).
#[wasm_bindgen]
pub fn blake3_hash(data: &[u8]) -> Vec<u8> {
    crypto::blake3_hash(data).to_vec()
}

/// Derive a 32-byte AES key from `passphrase` + `salt` via Argon2id.
#[wasm_bindgen]
pub fn derive_key(passphrase: &[u8], salt: &[u8]) -> Result<Vec<u8>, JsError> {
    crypto::derive_key(passphrase, salt).map(|k| k.to_vec()).map_err(to_err)
}

/// AES-256-GCM seal. Ciphertext has the 16-byte tag appended.
#[wasm_bindgen]
pub fn seal(key: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, JsError> {
    crypto::seal(key, nonce, plaintext).map_err(to_err)
}

/// AES-256-GCM open. Errors if authentication fails.
#[wasm_bindgen]
pub fn open(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, JsError> {
    crypto::open(key, nonce, ciphertext).map_err(to_err)
}

/// Streaming content-defined chunker. Feed bytes via `push`; read the boundary
/// lengths of the returned concatenated bytes from `lengths` after each call.
#[wasm_bindgen]
pub struct Chunker {
    inner: chunker::Chunker,
    lengths: Vec<u32>,
}

#[wasm_bindgen]
impl Chunker {
    #[wasm_bindgen(constructor)]
    pub fn new(min: usize, avg: usize, max: usize) -> Chunker {
        Chunker { inner: chunker::Chunker::new(min, avg, max), lengths: Vec::new() }
    }

    /// Append `data`; return the concatenated bytes of all now-final chunks.
    /// Split them using `lengths`.
    pub fn push(&mut self, data: &[u8]) -> Vec<u8> {
        let chunks = self.inner.push(data);
        self.emit(chunks)
    }

    /// Flush remaining buffered bytes as final chunks.
    pub fn finish(&mut self) -> Vec<u8> {
        let chunks = self.inner.finish();
        self.emit(chunks)
    }

    /// Boundary lengths corresponding to the most recent `push`/`finish` result.
    #[wasm_bindgen(getter)]
    pub fn lengths(&self) -> Vec<u32> {
        self.lengths.clone()
    }

    fn emit(&mut self, chunks: Vec<Vec<u8>>) -> Vec<u8> {
        self.lengths = chunks.iter().map(|c| c.len() as u32).collect();
        chunks.concat()
    }
}
