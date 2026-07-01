//! The Short Authentication String (SAS) for out-of-band pairing verification —
//! the Rust analogue of `apps/web/src/sas.ts`. Both sides derive the SAME 6-digit
//! code from the unordered pair of signing ids, so an operator can read the
//! node's code here and confirm it matches the one the paired device shows on its
//! Devices screen. A mismatch means a relay swapped a key in transit (a MITM) and
//! the device should be unlinked rather than trusted.
//!
//! Deterministic and order-independent: the ids are sorted before hashing, and
//! the algorithm — BLAKE3 over `"<a> <b>"`, then the first 4 hash bytes (8 hex
//! chars) read big-endian and reduced mod 1e6 — is byte-identical to the
//! TypeScript `deriveSas`, so the two implementations always agree.

/// The 6-digit safety number for the unordered pair `(self_id, peer_id)`.
pub fn safety_number(self_id: &str, peer_id: &str) -> String {
    let mut ids = [self_id, peer_id];
    ids.sort_unstable();
    let pair = format!("{} {}", ids[0], ids[1]);
    let digest = hex::encode(blake3::hash(pair.as_bytes()).as_bytes());
    let prefix = u32::from_str_radix(&digest[..8], 16).expect("8 hex chars are a valid u32");
    format!("{:06}", prefix % 1_000_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors apps/web/src/sas.integration.test.ts so the two implementations are
    // held to the same contract.
    #[test]
    fn is_a_stable_six_digit_code() {
        let sas = safety_number("peerA", "peerB");
        assert_eq!(sas.len(), 6);
        assert!(sas.chars().all(|c| c.is_ascii_digit()));
        assert_eq!(safety_number("peerA", "peerB"), sas);
    }

    #[test]
    fn is_symmetric_regardless_of_order() {
        assert_eq!(
            safety_number("peerA", "peerB"),
            safety_number("peerB", "peerA")
        );
    }

    #[test]
    fn differs_for_a_different_peer() {
        assert_ne!(
            safety_number("peerA", "peerB"),
            safety_number("peerA", "peerC")
        );
    }
}
