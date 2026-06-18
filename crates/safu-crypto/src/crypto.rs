//! Blueprint-faithful primitives: BLAKE3 (hashing), Argon2id (KDF),
//! AES-256-GCM (block cipher). Nonces and salts are supplied by the caller so
//! this core stays deterministic and needs no RNG in WASM (plan §1.2).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};

/// OWASP interactive profile minimum (plan §1.2): 64 MiB, 3 passes, 4 lanes.
const ARGON2_MEM_KIB: u32 = 64 * 1024;
const ARGON2_TIME: u32 = 3;
const ARGON2_LANES: u32 = 4;
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;

/// BLAKE3 fingerprint of `data` (32 bytes).
pub fn blake3_hash(data: &[u8]) -> [u8; 32] {
    *blake3::hash(data).as_bytes()
}

/// Derive a 32-byte AES key from `passphrase` + `salt` via Argon2id.
/// `salt` must be at least 8 bytes.
pub fn derive_key(passphrase: &[u8], salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(ARGON2_MEM_KIB, ARGON2_TIME, ARGON2_LANES, Some(KEY_LEN))
        .map_err(|e| format!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; KEY_LEN];
    argon2
        .hash_password_into(passphrase, salt, &mut out)
        .map_err(|e| format!("argon2 derive: {e}"))?;
    Ok(out)
}

/// AES-256-GCM seal. Returns ciphertext with the 16-byte tag appended.
pub fn seal(key: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    check_lengths(key, nonce)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .encrypt(Nonce::from_slice(nonce), plaintext)
        .map_err(|_| "aes-gcm seal failed".to_string())
}

/// AES-256-GCM open. Fails if the tag does not authenticate (tamper or wrong key).
pub fn open(key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    check_lengths(key, nonce)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| "aes-gcm open failed: authentication error".to_string())
}

fn check_lengths(key: &[u8], nonce: &[u8]) -> Result<(), String> {
    if key.len() != KEY_LEN {
        return Err(format!("key must be {KEY_LEN} bytes, got {}", key.len()));
    }
    if nonce.len() != NONCE_LEN {
        return Err(format!("nonce must be {NONCE_LEN} bytes, got {}", nonce.len()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blake3_is_deterministic_and_sensitive() {
        let a = blake3_hash(b"safu");
        let b = blake3_hash(b"safu");
        let c = blake3_hash(b"safv");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 32);
    }

    #[test]
    fn aes_256_gcm_nist_zero_vector() {
        // NIST gcmEncryptExtIV256 Count 0: 256-bit zero key, 96-bit zero IV,
        // empty plaintext -> empty ciphertext + tag 530f8afbc74536b9a963b4f1c4cb738b.
        let key = [0u8; 32];
        let nonce = [0u8; 12];
        let ct = seal(&key, &nonce, b"").unwrap();
        assert_eq!(hex::encode(&ct), "530f8afbc74536b9a963b4f1c4cb738b");
    }

    #[test]
    fn aes_round_trip_and_tamper_detection() {
        let key = [7u8; 32];
        let nonce = [9u8; 12];
        let pt = b"encrypted block payload";

        let mut ct = seal(&key, &nonce, pt).unwrap();
        assert_eq!(open(&key, &nonce, &ct).unwrap(), pt);

        ct[0] ^= 0x01; // flip a bit
        assert!(open(&key, &nonce, &ct).is_err(), "tampered block must fail auth");
    }

    #[test]
    fn argon2id_deterministic_with_salt_separation() {
        let salt_a = [1u8; 16];
        let salt_b = [2u8; 16];
        let k1 = derive_key(b"correct horse", &salt_a).unwrap();
        let k2 = derive_key(b"correct horse", &salt_a).unwrap();
        let k3 = derive_key(b"correct horse", &salt_b).unwrap();
        assert_eq!(k1, k2, "same passphrase + salt -> same key");
        assert_ne!(k1, k3, "different salt -> different key");
        assert_eq!(k1.len(), 32);
    }

    #[test]
    fn rejects_wrong_key_and_nonce_lengths() {
        assert!(seal(&[0u8; 16], &[0u8; 12], b"x").is_err());
        assert!(seal(&[0u8; 32], &[0u8; 8], b"x").is_err());
    }
}
