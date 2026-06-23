//! This node's stable signing identity — the Rust analogue of the web app's
//! `identity.ts` and the headless peer's `identity.ts`.
//!
//! The Ed25519 secret is derived from a passphrase and a per-node random salt
//! via Argon2id; only the non-secret salt is persisted to disk, so the secret
//! never lives in plaintext (zero-knowledge invariant). The same passphrase +
//! data dir therefore yields the same identity across restarts, keeping the
//! node's authored writer-set ops valid.
//!
//! The public key IS the author id (lowercase hex), so a still-trusted device
//! cannot forge another peer's authorship: it would have to produce a signature
//! it cannot make (SDK `signing.ts`).

use std::fs;
use std::path::Path;

use argon2::{Algorithm, Argon2, Params, Version};
use ed25519_dalek::{Signature, Signer as _, SigningKey, Verifier as _, VerifyingKey};

/// OWASP interactive profile minimum (plan §1.2), identical to `safu-crypto`:
/// 64 MiB, 3 passes, 4 lanes, 32-byte output. Kept in lockstep so a passphrase
/// derives the same key here as it does in the browser/WASM pipeline.
const ARGON2_MEM_KIB: u32 = 64 * 1024;
const ARGON2_TIME: u32 = 3;
const ARGON2_LANES: u32 = 4;
const KEY_LEN: usize = 32;
const SALT_BYTES: usize = 16;

/// Argon2id-derive a 32-byte key from `passphrase` + `salt`. Mirrors
/// `safu_crypto::crypto::derive_key` / `@safu/crypto.deriveKey` exactly.
pub fn derive_key(passphrase: &[u8], salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let params = Params::new(ARGON2_MEM_KIB, ARGON2_TIME, ARGON2_LANES, Some(KEY_LEN))
        .map_err(|e| format!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; KEY_LEN];
    argon2
        .hash_password_into(passphrase, salt, &mut out)
        .map_err(|e| format!("argon2 derive: {e}"))?;
    Ok(out)
}

/// A signing identity. `id` is the lowercase-hex Ed25519 public key; signatures
/// are lowercase hex so they travel as plain JSON over the wire (SDK `Signer`).
pub struct Signer {
    id: String,
    key: SigningKey,
}

impl Signer {
    /// Build a signing identity from a 32-byte seed (the Ed25519 secret key),
    /// the same way `createSigner` does in the SDK.
    pub fn from_seed(seed: [u8; KEY_LEN]) -> Self {
        let key = SigningKey::from_bytes(&seed);
        let id = hex::encode(key.verifying_key().to_bytes());
        Self { id, key }
    }

    /// This identity's id: the lowercase-hex public key.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Sign `data`, returning a lowercase-hex 64-byte signature.
    pub fn sign(&self, data: &[u8]) -> String {
        hex::encode(self.key.sign(data).to_bytes())
    }
}

/// Verify hex `sig` over `data` was produced by the author whose id is
/// `author_id` (its hex public key). Returns false on any malformed input
/// rather than erroring (mirrors `verifySignature`).
pub fn verify_signature(author_id: &str, data: &[u8], sig: &str) -> bool {
    let Ok(pk_bytes) = hex::decode(author_id) else {
        return false;
    };
    let Ok(sig_bytes) = hex::decode(sig) else {
        return false;
    };
    let (Ok(pk_arr), Ok(sig_arr)): (Result<[u8; 32], _>, Result<[u8; 64], _>) =
        (pk_bytes.try_into(), sig_bytes.try_into())
    else {
        return false;
    };
    let Ok(vk) = VerifyingKey::from_bytes(&pk_arr) else {
        return false;
    };
    vk.verify(data, &Signature::from_bytes(&sig_arr)).is_ok()
}

/// Load, or first-time create, this node's persistent signing identity under
/// `data_dir`. The salt lives at `<data_dir>/identity/signer.salt` — the same
/// layout as the headless peer, so a node and a TS peer sharing a data dir and
/// passphrase derive the same identity.
pub fn load_or_create_signer(data_dir: &Path, passphrase: &str) -> Result<Signer, String> {
    let salt = load_or_create_salt(data_dir)?;
    let seed = derive_key(passphrase.as_bytes(), &salt)?;
    Ok(Signer::from_seed(seed))
}

fn load_or_create_salt(data_dir: &Path) -> Result<[u8; SALT_BYTES], String> {
    let path = data_dir.join("identity").join("signer.salt");
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(salt) = <[u8; SALT_BYTES]>::try_from(bytes.as_slice()) {
            return Ok(salt);
        }
    }
    let mut salt = [0u8; SALT_BYTES];
    getrandom::fill(&mut salt).map_err(|e| format!("rng: {e}"))?;
    let dir = path.parent().expect("salt path has a parent");
    fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    fs::write(&path, salt).map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(salt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_is_deterministic_in_salt() {
        let salt_a = [1u8; SALT_BYTES];
        let salt_b = [2u8; SALT_BYTES];
        let k1 = derive_key(b"correct horse", &salt_a).unwrap();
        let k2 = derive_key(b"correct horse", &salt_a).unwrap();
        let k3 = derive_key(b"correct horse", &salt_b).unwrap();
        assert_eq!(k1, k2);
        assert_ne!(k1, k3);
    }

    #[test]
    fn sign_then_verify_round_trips() {
        let signer = Signer::from_seed([7u8; KEY_LEN]);
        let sig = signer.sign(b"replicated op");
        assert!(verify_signature(signer.id(), b"replicated op", &sig));
        assert!(!verify_signature(signer.id(), b"tampered op", &sig));
    }

    #[test]
    fn matches_noble_curves_vector() {
        // Cross-implementation known-answer test against @noble/curves v2.2.0 —
        // the web app's Ed25519 (apps/web → @safu/sdk `signing.ts`). For the seed
        // [7u8; 32] over b"replicated op", @noble produces exactly this public key
        // and signature. Ed25519 is deterministic (RFC 8032), so byte-identical
        // output here proves a node verifies the browser's signatures and vice
        // versa — the linchpin of cross-runtime write authorization.
        const PUB: &str = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
        const SIG: &str = "42390788fed65307e57be35d39852a20240443dddb16e80454d3477012c937963969771f7b2d4983eb2fdbd65a03e30f2d957b2e3a0275989c30eda972ff9a02";
        let signer = Signer::from_seed([7u8; 32]);
        assert_eq!(signer.id(), PUB);
        assert_eq!(signer.sign(b"replicated op"), SIG);
        assert!(verify_signature(PUB, b"replicated op", SIG));
    }

    #[test]
    fn verify_rejects_malformed_inputs() {
        assert!(!verify_signature("not-hex", b"x", "also-not-hex"));
        assert!(!verify_signature("ab", b"x", "cd"));
    }
}
