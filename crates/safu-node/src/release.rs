//! Update awareness: is a newer release of this binary available? The node never
//! replaces itself (an unsigned self-overwrite of an always-on server binary is a
//! footgun); it only *reports*, and points at the proven install script for the
//! actual swap. Upgrading is binary-only — the data dir, identity, linked devices
//! and stored blocks carry over untouched (see `meta.rs`), so no re-linking.
//!
//! The pure pieces (host target, version compare, tag parse) are unit-tested; the
//! single network call is a thin shell over them.

use std::time::Duration;

/// The repository whose releases this binary checks (matches the install script).
const REPO: &str = "urbanisierung/sharu-io-monorepo";
/// Release tags are `safu-node-v<version>`, e.g. `safu-node-v0.1.0`.
const TAG_PREFIX: &str = "safu-node-v";

/// This build's version, baked in from Cargo at compile time.
pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// The host's release target triple — the same names the install script and the
/// release workflow use. `None` if this host is not a published target (so we
/// don't claim an upgrade we can't deliver).
pub fn target_triple() -> Option<&'static str> {
    Some(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        _ => return None,
    })
}

/// Pull the version out of a release tag like `safu-node-v0.1.0`.
pub fn version_from_tag(tag: &str) -> Option<&str> {
    tag.strip_prefix(TAG_PREFIX)
}

/// Whether `latest` is a newer semantic version than `current`. A version that
/// fails to parse is treated as "not newer", so a malformed tag never nags.
pub fn is_newer(latest: &str, current: &str) -> bool {
    match (
        semver::Version::parse(latest),
        semver::Version::parse(current),
    ) {
        (Ok(latest), Ok(current)) => latest > current,
        _ => false,
    }
}

/// Read `tag_name` out of a GitHub release JSON object.
fn tag_from_release_json(body: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    value.get("tag_name")?.as_str().map(str::to_string)
}

/// A read token from the environment, mirroring the install script — so the check
/// also works while the repository is private (where anonymous calls 404).
fn token() -> Option<String> {
    ["SAFU_NODE_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]
        .into_iter()
        .find_map(|var| std::env::var(var).ok().filter(|v| !v.is_empty()))
}

/// The latest released version per the GitHub Releases API, or an error string to
/// surface. Times out quickly so it never holds up `serve` or an interactive run.
pub async fn latest_version() -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let mut request = client
        .get(&url)
        // GitHub rejects API requests without a User-Agent.
        .header(
            "User-Agent",
            concat!("safu-node/", env!("CARGO_PKG_VERSION")),
        )
        .header("Accept", "application/vnd.github+json");
    if let Some(token) = token() {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("reach GitHub: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub releases API returned {}",
            response.status()
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("read response: {e}"))?;
    let tag = tag_from_release_json(&body).ok_or("no tag_name in the release response")?;
    version_from_tag(&tag)
        .map(str::to_string)
        .ok_or_else(|| format!("unexpected release tag: {tag}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_version_from_a_tag() {
        assert_eq!(version_from_tag("safu-node-v0.1.0"), Some("0.1.0"));
        assert_eq!(version_from_tag("v0.1.0"), None);
    }

    #[test]
    fn compares_semantic_versions() {
        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(is_newer("0.1.1", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("not-a-version", "0.1.0"));
    }

    #[test]
    fn reads_tag_name_out_of_release_json() {
        let body = r#"{"tag_name":"safu-node-v1.2.3","name":"whatever"}"#;
        assert_eq!(
            tag_from_release_json(body).as_deref(),
            Some("safu-node-v1.2.3")
        );
        assert_eq!(tag_from_release_json("not json"), None);
        assert_eq!(tag_from_release_json("{}"), None);
    }

    #[test]
    fn resolves_a_target_or_admits_it_cannot() {
        // On a published host this is Some; on an exotic one, None — either is a
        // valid answer, but it must never panic.
        let _ = target_triple();
    }
}
