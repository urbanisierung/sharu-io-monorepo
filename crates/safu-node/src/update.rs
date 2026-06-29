//! Self-applying update: download the release archive for this host, verify it
//! against the embedded minisign public key (and its SHA-256), unpack the binary,
//! and atomically replace the running executable. Nothing in the data dir is
//! touched — an upgrade is binary-only (see `meta.rs` / the README).
//!
//! Verification is mandatory: an archive whose signature does not check out (or a
//! build whose key is the un-configured placeholder) is refused before anything
//! is installed, so a hostile or corrupt download can never replace the binary.

use minisign_verify::{PublicKey, Signature};
use sha2::{Digest, Sha256};

use crate::release::{self, Release};

/// The release-signing public key, pinned at build time. Replace
/// `keys/safu-node.pub` and configure the matching secret to sign releases
/// (see RELEASING.md); until then this is a placeholder and `apply` refuses.
const PUBLIC_KEY: &str = include_str!("../keys/safu-node.pub");

/// Download, verify, and install the newer `release`, replacing this binary. On
/// success the caller tells the user to restart. Any failure leaves the installed
/// binary untouched.
pub async fn apply(release: &Release) -> Result<(), String> {
    let target = release::target_triple()
        .ok_or("no prebuilt binary is published for this host (os/arch); build from source")?;

    // Windows ships a `.zip` and replacing a running `.exe` needs the unpacking
    // we don't carry yet — fall back to the installer there.
    if !cfg!(unix) {
        return Err(
            "self-apply is not yet supported on this platform — re-run the installer".into(),
        );
    }
    let archive_name = format!("safu-node-{target}.tar.gz");

    let archive_asset = release
        .asset(&archive_name)
        .ok_or_else(|| format!("release has no asset {archive_name}"))?;
    let sig_asset = release
        .asset(&format!("{archive_name}.minisig"))
        .ok_or_else(|| format!("release is unsigned (no {archive_name}.minisig) — refusing"))?;

    let archive = release::download_asset(archive_asset).await?;
    let minisig = String::from_utf8(release::download_asset(sig_asset).await?)
        .map_err(|_| "signature file is not valid UTF-8".to_string())?;

    // Authenticity: the signature must verify against the pinned key. Mandatory.
    verify_signature(&embedded_public_key()?, &archive, &minisig)?;

    // Integrity, defense in depth: also match the SHA-256 sidecar when present.
    if let Some(sha_asset) = release.asset(&format!("{archive_name}.sha256")) {
        let sidecar = String::from_utf8(release::download_asset(sha_asset).await?)
            .map_err(|_| "checksum file is not valid UTF-8".to_string())?;
        verify_sha256(&archive, &sidecar)?;
    }

    let binary = extract_binary(&archive)?;
    install_binary(&binary)
}

/// Load the pinned public key from its embedded `.pub` file (the base64 key line).
fn embedded_public_key() -> Result<PublicKey, String> {
    let key_line = PUBLIC_KEY
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty() && !line.starts_with("untrusted comment:"))
        .ok_or("embedded public key is malformed")?;
    PublicKey::from_base64(key_line).map_err(|e| format!("load signing key: {e}"))
}

/// Verify `data` against a minisign `.minisig` signature with `public_key`.
fn verify_signature(public_key: &PublicKey, data: &[u8], minisig: &str) -> Result<(), String> {
    let signature = Signature::decode(minisig).map_err(|e| format!("decode signature: {e}"))?;
    public_key
        .verify(data, &signature, false)
        .map_err(|e| format!("signature verification failed: {e}"))
}

/// Verify `data` against a `sha256sum`-style sidecar (`<hex>  <name>`).
fn verify_sha256(data: &[u8], sidecar: &str) -> Result<(), String> {
    let expected = sidecar
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_lowercase();
    if expected.is_empty() {
        return Err("empty checksum sidecar".into());
    }
    let actual = hex::encode(Sha256::digest(data));
    if expected != actual {
        return Err(format!(
            "checksum mismatch (expected {expected}, got {actual})"
        ));
    }
    Ok(())
}

/// Pull the `safu-node` binary out of a `.tar.gz` archive.
#[cfg(unix)]
fn extract_binary(archive: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;

    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(archive));
    for entry in tar.entries().map_err(|e| format!("read archive: {e}"))? {
        let mut entry = entry.map_err(|e| format!("read archive entry: {e}"))?;
        let is_binary = entry
            .path()
            .map_err(|e| format!("entry path: {e}"))?
            .file_name()
            .and_then(|n| n.to_str())
            == Some("safu-node");
        if is_binary {
            let mut bytes = Vec::new();
            entry
                .read_to_end(&mut bytes)
                .map_err(|e| format!("extract binary: {e}"))?;
            return Ok(bytes);
        }
    }
    Err("archive did not contain the safu-node binary".into())
}

#[cfg(not(unix))]
fn extract_binary(_archive: &[u8]) -> Result<Vec<u8>, String> {
    Err("self-apply is not yet supported on this platform".into())
}

/// Write `binary` next to the current executable and atomically swap it in.
/// `self_replace` handles replacing the *running* binary correctly.
#[cfg(unix)]
fn install_binary(binary: &[u8]) -> Result<(), String> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    let exe = std::env::current_exe().map_err(|e| format!("locate current binary: {e}"))?;
    let dir = exe.parent().unwrap_or_else(|| std::path::Path::new("."));
    let staged = dir.join(format!(".safu-node-update-{}", std::process::id()));
    fs::write(&staged, binary).map_err(|e| format!("stage new binary: {e}"))?;
    let result = fs::set_permissions(&staged, fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("chmod new binary: {e}"))
        .and_then(|()| {
            self_replace::self_replace(&staged).map_err(|e| format!("replace running binary: {e}"))
        });
    let _ = fs::remove_file(&staged);
    result
}

#[cfg(not(unix))]
fn install_binary(_binary: &[u8]) -> Result<(), String> {
    Err("self-apply is not yet supported on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real minisign signature must verify, and any tampering must be rejected.
    /// Uses an ephemeral keypair (the `minisign` dev-dependency signs; the
    /// production key never enters the repo), proving the verify path end to end.
    #[test]
    fn verifies_a_real_signature_and_rejects_tampering() {
        let keypair = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let data = b"safu-node release archive bytes";
        let signature = minisign::sign(
            Some(&keypair.pk),
            &keypair.sk,
            std::io::Cursor::new(&data[..]),
            None,
            None,
        )
        .unwrap()
        .to_string();

        let pub_box = keypair.pk.to_box().unwrap().to_string();
        let key_line = pub_box.lines().next_back().unwrap();
        let public_key = PublicKey::from_base64(key_line).unwrap();

        assert!(verify_signature(&public_key, data, &signature).is_ok());
        assert!(verify_signature(&public_key, b"tampered bytes", &signature).is_err());
    }

    #[test]
    fn checks_the_sha256_sidecar() {
        let data = b"some bytes";
        let digest = hex::encode(Sha256::digest(data));
        // `sha256sum` format is "<hex>  <filename>".
        assert!(verify_sha256(data, &format!("{digest}  safu-node.tar.gz")).is_ok());
        assert!(verify_sha256(data, "deadbeef  safu-node.tar.gz").is_err());
        assert!(verify_sha256(data, "").is_err());
    }

    #[test]
    fn extracts_the_binary_from_a_tar_gz() {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        // Build a .tar.gz containing a `safu-node` file with known contents.
        let mut tar_builder = tar::Builder::new(Vec::new());
        let payload = b"#!/bin/true\n";
        let mut header = tar::Header::new_gnu();
        header.set_path("safu-node").unwrap();
        header.set_size(payload.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        tar_builder.append(&header, &payload[..]).unwrap();
        let tar_bytes = tar_builder.into_inner().unwrap();
        let mut gz = GzEncoder::new(Vec::new(), Compression::default());
        gz.write_all(&tar_bytes).unwrap();
        let archive = gz.finish().unwrap();

        assert_eq!(extract_binary(&archive).unwrap(), payload);
    }

    #[test]
    fn the_embedded_key_parses() {
        // The committed key (placeholder or real) must always be loadable, so a
        // verification failure is a *signature* problem, never a key-format one.
        assert!(embedded_public_key().is_ok());
    }
}
