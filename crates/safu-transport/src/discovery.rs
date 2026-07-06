//! Configurable peer **discovery** (Iroh 1.0 "address lookup"), shared by the
//! native and wasm bindings.
//!
//! Relays were already configurable (`SHARU_RELAY_URL`), but discovery — how a
//! peer's `EndpointId` is resolved to a dialable address — was hardcoded to
//! `presets::N0` (n0's `dns.iroh.link` + pkarr). That is the one liveness
//! dependency on n0 that could not be swapped without a rebuild (see
//! `docs/resilient-transport-research.md` §3 and `docs/r1-discovery-hardening-plan.md`).
//! This module makes discovery configurable the same way relays are.
//!
//! The N0 preset already composes a relay **and** address lookups; relay and
//! discovery are independent on the `Builder`. So the seam keeps `presets::N0`
//! as the base (relay untouched) and, when a custom discovery is requested,
//! `clear_address_lookup()`s the preset's lookups and installs pkarr
//! publisher + resolver against the given relay(s) instead — which works in
//! both runtimes (browsers resolve pkarr over HTTPS; DNS-based resolution is
//! native-only and deliberately not used here, keeping one grammar for both).

use std::str::FromStr;

use iroh::address_lookup::{PkarrPublisher, PkarrResolver};
use iroh::endpoint::Builder;
use url::Url;

/// How an endpoint resolves peer `EndpointId`s to addresses.
pub enum Discovery {
    /// n0 defaults: publish + resolve via `dns.iroh.link` / n0's pkarr relay,
    /// exactly as `presets::N0` configures. The current (and default) behavior.
    N0,
    /// Self-hosted: publish and resolve signed pkarr address records via the
    /// given HTTP(S) pkarr relay URL(s) — e.g. an operator's own
    /// `iroh-dns-server` — dropping the dependency on n0's discovery. Repeatable
    /// for redundancy across independent operators.
    Pkarr(Vec<Url>),
}

impl Discovery {
    /// Parse a `SHARU_DISCOVERY`-style token list (already split on commas and
    /// trimmed by the caller, mirroring `parseRelays`/`split_relays`).
    ///
    /// Tokens: `n0` (the default) or `pkarr:<url>` (self-hosted, repeatable).
    /// Empty / unset → [`Discovery::N0`], so default behavior is unchanged.
    /// `n0` does not combine with custom providers (kept explicit rather than
    /// silently ignored); an unknown token or a bad URL is a hard error.
    pub fn parse(tokens: &[String]) -> Result<Self, String> {
        let cleaned: Vec<&str> = tokens
            .iter()
            .map(|token| token.trim())
            .filter(|token| !token.is_empty())
            .collect();
        if cleaned.is_empty() {
            return Ok(Self::N0);
        }
        if cleaned.contains(&"n0") {
            if cleaned.len() == 1 {
                return Ok(Self::N0);
            }
            return Err("discovery: `n0` cannot be combined with other providers".into());
        }
        let mut relays = Vec::with_capacity(cleaned.len());
        for token in cleaned {
            let url = token.strip_prefix("pkarr:").ok_or_else(|| {
                format!("discovery: unknown token {token:?} (expected `n0` or `pkarr:<url>`)")
            })?;
            let parsed = Url::from_str(url)
                .map_err(|e| format!("discovery: invalid pkarr relay url {url:?}: {e}"))?;
            relays.push(parsed);
        }
        Ok(Self::Pkarr(relays))
    }

    /// Apply this config on top of a `presets::N0` builder. [`Discovery::N0`]
    /// leaves the preset's lookups intact; [`Discovery::Pkarr`] clears them and
    /// installs the custom pkarr publisher + resolver for each relay. The relay
    /// map is never touched here — it stays whatever the caller configured.
    pub fn apply(self, builder: Builder) -> Builder {
        match self {
            Self::N0 => builder,
            Self::Pkarr(relays) => {
                let mut builder = builder.clear_address_lookup();
                for url in relays {
                    builder = builder
                        .address_lookup(PkarrPublisher::builder(url.clone()))
                        .address_lookup(PkarrResolver::builder(url));
                }
                builder
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn empty_or_blank_is_n0() {
        assert!(matches!(Discovery::parse(&[]).unwrap(), Discovery::N0));
        assert!(matches!(
            Discovery::parse(&tokens(&["", "  "])).unwrap(),
            Discovery::N0
        ));
    }

    #[test]
    fn n0_token_alone_is_n0() {
        assert!(matches!(
            Discovery::parse(&tokens(&["n0"])).unwrap(),
            Discovery::N0
        ));
    }

    #[test]
    fn single_pkarr_relay() {
        let parsed = Discovery::parse(&tokens(&["pkarr:https://dns.example.com"])).unwrap();
        let Discovery::Pkarr(relays) = parsed else {
            panic!("expected Pkarr");
        };
        assert_eq!(relays.len(), 1);
        assert_eq!(relays[0].as_str(), "https://dns.example.com/");
    }

    #[test]
    fn multiple_pkarr_relays_for_redundancy() {
        let parsed = Discovery::parse(&tokens(&[
            "pkarr:https://a.example.com",
            "pkarr:https://b.example.com",
        ]))
        .unwrap();
        let Discovery::Pkarr(relays) = parsed else {
            panic!("expected Pkarr");
        };
        assert_eq!(relays.len(), 2);
    }

    #[test]
    fn unknown_token_is_rejected() {
        assert!(Discovery::parse(&tokens(&["dht"])).is_err());
        assert!(Discovery::parse(&tokens(&["bogus"])).is_err());
    }

    #[test]
    fn malformed_pkarr_url_is_rejected() {
        assert!(Discovery::parse(&tokens(&["pkarr:not a url"])).is_err());
    }

    #[test]
    fn n0_does_not_combine() {
        assert!(Discovery::parse(&tokens(&["n0", "pkarr:https://a.example.com"])).is_err());
    }
}
