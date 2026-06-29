//! Update awareness: is a newer release of this binary available? The node never
//! replaces itself (an unsigned self-overwrite of an always-on server binary is a
//! footgun); it only *reports*, and points at the proven install script for the
//! actual swap. Upgrading is binary-only — the data dir, identity, linked devices
//! and stored blocks carry over untouched (see `meta.rs`), so no re-linking.
//!
//! The pure pieces (host target, version compare, tag parse) are unit-tested; the
//! single network call is a thin shell over them.

use std::time::Duration;

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

/// A downloadable release asset: its file name and the two URLs GitHub exposes —
/// the public CDN URL and the API URL (used with a token for a private repo).
pub struct Asset {
    pub name: String,
    pub download_url: String,
    pub api_url: String,
}

/// A published release: the version (tag without prefix) and its assets.
pub struct Release {
    pub version: String,
    pub assets: Vec<Asset>,
}

impl Release {
    /// The asset with exactly this file name, if the release carries it.
    pub fn asset(&self, name: &str) -> Option<&Asset> {
        self.assets.iter().find(|a| a.name == name)
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        // Generous enough for a binary download, short enough to never hang serve.
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("http client: {e}"))
}

/// GET the latest-release JSON. Honors a token so it works on a private repo.
async fn fetch_release_json() -> Result<String, String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        crate::brand::github_repo()
    );
    let mut request = http_client()?
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
    response
        .text()
        .await
        .map_err(|e| format!("read response: {e}"))
}

/// The latest released version per the GitHub Releases API, or an error string to
/// surface. Used for the lightweight "is a newer version out?" check.
pub async fn latest_version() -> Result<String, String> {
    let body = fetch_release_json().await?;
    let tag = tag_from_release_json(&body).ok_or("no tag_name in the release response")?;
    version_from_tag(&tag)
        .map(str::to_string)
        .ok_or_else(|| format!("unexpected release tag: {tag}"))
}

/// The latest release with its assets, for `update --apply`.
pub async fn latest_release() -> Result<Release, String> {
    parse_release(&fetch_release_json().await?)
}

/// Parse a GitHub release JSON object into a [`Release`].
fn parse_release(body: &str) -> Result<Release, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("parse release: {e}"))?;
    let tag = value
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .ok_or("no tag_name in the release response")?;
    let version = version_from_tag(tag)
        .ok_or_else(|| format!("unexpected release tag: {tag}"))?
        .to_string();
    let assets = value
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(|asset| {
                    Some(Asset {
                        name: asset.get("name")?.as_str()?.to_string(),
                        download_url: asset
                            .get("browser_download_url")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        api_url: asset
                            .get("url")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(Release { version, assets })
}

/// Download an asset's bytes. With a token it goes through the API asset URL
/// (which works for a private repo); otherwise the public CDN URL. Either way the
/// server returns the raw bytes (after following redirects).
pub async fn download_asset(asset: &Asset) -> Result<Vec<u8>, String> {
    let token = token();
    let url = if token.is_some() && !asset.api_url.is_empty() {
        &asset.api_url
    } else {
        &asset.download_url
    };
    if url.is_empty() {
        return Err(format!("no download url for asset {}", asset.name));
    }
    let mut request = http_client()?
        .get(url)
        .header(
            "User-Agent",
            concat!("safu-node/", env!("CARGO_PKG_VERSION")),
        )
        .header("Accept", "application/octet-stream");
    if let Some(token) = token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("download {}: {e}", asset.name))?;
    if !response.status().is_success() {
        return Err(format!(
            "download {} returned {}",
            asset.name,
            response.status()
        ));
    }
    Ok(response
        .bytes()
        .await
        .map_err(|e| format!("read {}: {e}", asset.name))?
        .to_vec())
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

    #[test]
    fn parses_a_release_with_its_assets() {
        let body = r#"{
            "tag_name": "safu-node-v0.2.0",
            "assets": [
                {
                    "name": "safu-node-x86_64-unknown-linux-gnu.tar.gz",
                    "browser_download_url": "https://cdn/safu-node.tar.gz",
                    "url": "https://api/assets/1"
                },
                {
                    "name": "safu-node-x86_64-unknown-linux-gnu.tar.gz.minisig",
                    "browser_download_url": "https://cdn/safu-node.tar.gz.minisig",
                    "url": "https://api/assets/2"
                }
            ]
        }"#;
        let release = parse_release(body).unwrap();
        assert_eq!(release.version, "0.2.0");
        let archive = release
            .asset("safu-node-x86_64-unknown-linux-gnu.tar.gz")
            .unwrap();
        assert_eq!(archive.download_url, "https://cdn/safu-node.tar.gz");
        assert_eq!(archive.api_url, "https://api/assets/1");
        assert!(release.asset("nope").is_none());
    }
}
