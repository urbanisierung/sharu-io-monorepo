//! The two values that change on a repo transfer or rebrand — the canonical
//! domain and the GitHub `owner/repo` slug. They live in one place shared across
//! runtimes: `project.config.json` at the repo root, which the TypeScript apps
//! import (`@safu/config`) and this binary embeds at compile time. Edit that file
//! and every consumer follows.

use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Deserialize)]
struct ProjectConfig {
    domain: String,
    #[serde(rename = "githubRepo")]
    github_repo: String,
}

fn config() -> &'static ProjectConfig {
    static CONFIG: OnceLock<ProjectConfig> = OnceLock::new();
    CONFIG.get_or_init(|| {
        // Baked in at compile time; the path is relative to this source file.
        serde_json::from_str(include_str!("../../../project.config.json"))
            .expect("project.config.json is valid JSON with domain and githubRepo")
    })
}

/// The canonical domain the install scripts and site are served from.
pub fn domain() -> &'static str {
    &config().domain
}

/// The GitHub repository, as an `owner/repo` slug, whose releases this binary
/// checks and downloads from.
pub fn github_repo() -> &'static str {
    &config().github_repo
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_project_config_parses() {
        // Both values are non-empty, and the repo is a single `owner/repo` slug —
        // the shape the GitHub Releases API URL is built from.
        assert!(!domain().is_empty());
        assert_eq!(github_repo().split('/').count(), 2);
    }
}
