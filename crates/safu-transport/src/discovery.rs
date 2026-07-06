//! Configurable peer **discovery** (Iroh 1.0 "address lookup"), shared by the
//! native and wasm bindings.
//!
//! Relays were already configurable (`SHARU_RELAY_URL`), but discovery — how a
//! peer's `EndpointId` is resolved to a dialable address — was hardcoded to
//! `presets::N0` (n0's `dns.iroh.link` + pkarr). That is the one liveness
//! dependency on n0 that could not be swapped without a rebuild (see
//! `docs/resilient-transport-research.md` §3 and `docs/r1-discovery-hardening-plan.md`).
//! This module makes discovery configurable the same way relays are, and adds
//! company-less providers on native.
//!
//! Providers compose (n0's own docs recommend running DNS + DHT + mDNS
//! together), so a config is a set of enabled providers parsed from a
//! `SHARU_DISCOVERY` token list:
//!
//! - `n0` — n0's DNS/pkarr (the default; needs n0 infrastructure).
//! - `pkarr:<url>` — a self-hosted pkarr relay (e.g. an operator's own
//!   `iroh-dns-server`), publish + resolve over HTTPS. Works in **both**
//!   runtimes (browsers resolve pkarr over HTTPS; DNS-based lookup is
//!   native-only), so it is the self-hosted grammar that also frees the browser.
//! - `dht` — the BitTorrent Mainline DHT (a ~10M-node, 20-year-old commons no
//!   company operates). **Native only** — Mainline is UDP.
//! - `mdns` — local-network mDNS. **Native only** — multicast.
//!
//! The seam keeps `presets::N0` as the base (relay untouched). With the default
//! config it changes nothing. Otherwise it keeps the preset's n0 lookups only if
//! `n0` is among the providers (else `clear_address_lookup()`s them) and adds the
//! requested pkarr/dht/mdns lookups on top. Relay and discovery stay independent.

use std::str::FromStr;

use iroh::address_lookup::{PkarrPublisher, PkarrResolver};
use iroh::endpoint::Builder;
use url::Url;

#[cfg(not(all(target_family = "wasm", target_os = "unknown")))]
use iroh_mainline_address_lookup::DhtAddressLookup;
#[cfg(not(all(target_family = "wasm", target_os = "unknown")))]
use iroh_mdns_address_lookup::MdnsAddressLookup;

/// The set of enabled discovery (address-lookup) providers for an endpoint.
#[derive(Default)]
pub struct Discovery {
    /// n0's DNS/pkarr (`dns.iroh.link`). The default when nothing else is set.
    n0: bool,
    /// Self-hosted pkarr relay URL(s) for publish + resolve. Repeatable for
    /// redundancy across independent operators.
    pkarr: Vec<Url>,
    /// BitTorrent Mainline DHT. Native-only; `parse` rejects it on wasm, so it
    /// is always false there (hence unread — the browser can't do UDP).
    #[cfg_attr(all(target_family = "wasm", target_os = "unknown"), allow(dead_code))]
    dht: bool,
    /// Local-network mDNS. Native-only; `parse` rejects it on wasm.
    #[cfg_attr(all(target_family = "wasm", target_os = "unknown"), allow(dead_code))]
    mdns: bool,
}

impl Discovery {
    /// The default config: n0's DNS/pkarr only (today's behavior). Used for the
    /// unset case and by the relay-only `bind`/`bind_with_relays` wrappers.
    pub fn n0() -> Self {
        Self {
            n0: true,
            ..Self::default()
        }
    }

    /// Parse a `SHARU_DISCOVERY`-style token list (already split on commas and
    /// trimmed by the caller, mirroring `parseRelays`/`split_relays`).
    ///
    /// Tokens: `n0`, `pkarr:<url>` (repeatable), `dht`, `mdns`. They compose.
    /// Empty / unset → the n0 default, so default behavior is unchanged. `dht`
    /// and `mdns` are native-only and are rejected on wasm (a browser can't do
    /// UDP or multicast) rather than silently ignored. An unknown token or a bad
    /// URL is a hard error.
    pub fn parse(tokens: &[String]) -> Result<Self, String> {
        let cleaned: Vec<&str> = tokens
            .iter()
            .map(|token| token.trim())
            .filter(|token| !token.is_empty())
            .collect();
        if cleaned.is_empty() {
            return Ok(Self::n0());
        }
        let mut config = Self::default();
        for token in cleaned {
            match token {
                "n0" => config.n0 = true,
                "dht" => config.set_native_only(token, |c| c.dht = true)?,
                "mdns" => config.set_native_only(token, |c| c.mdns = true)?,
                _ => {
                    let url = token.strip_prefix("pkarr:").ok_or_else(|| {
                        format!(
                            "discovery: unknown token {token:?} \
                             (expected `n0`, `pkarr:<url>`, `dht`, or `mdns`)"
                        )
                    })?;
                    let parsed = Url::from_str(url).map_err(|e| {
                        format!("discovery: invalid pkarr relay url {url:?}: {e}")
                    })?;
                    config.pkarr.push(parsed);
                }
            }
        }
        Ok(config)
    }

    /// Enable a native-only provider, or reject it on wasm where it cannot work.
    #[cfg(not(all(target_family = "wasm", target_os = "unknown")))]
    fn set_native_only(&mut self, _token: &str, set: impl FnOnce(&mut Self)) -> Result<(), String> {
        set(self);
        Ok(())
    }

    /// On wasm, `dht`/`mdns` cannot work (no UDP/multicast), so reject them with
    /// a clear message instead of clearing discovery and silently finding no one.
    #[cfg(all(target_family = "wasm", target_os = "unknown"))]
    fn set_native_only(&mut self, token: &str, _set: impl FnOnce(&mut Self)) -> Result<(), String> {
        Err(format!(
            "discovery: `{token}` is native-only (needs UDP/multicast the browser lacks); \
             run a self-hosted node for company-less discovery, or use `pkarr:<url>`"
        ))
    }

    /// True for the default (n0-only) config, where the seam is a no-op.
    fn is_default(&self) -> bool {
        self.n0 && self.pkarr.is_empty() && !self.dht && !self.mdns
    }

    /// Apply this config on top of a `presets::N0` builder. The default config
    /// leaves the preset untouched. Otherwise the preset's n0 lookups are kept
    /// only when `n0` is enabled (else cleared), and the requested pkarr/dht/mdns
    /// lookups are added. The relay map is never touched here.
    pub fn apply(self, builder: Builder) -> Builder {
        if self.is_default() {
            return builder;
        }
        let mut builder = if self.n0 {
            builder
        } else {
            builder.clear_address_lookup()
        };
        for url in self.pkarr {
            builder = builder
                .address_lookup(PkarrPublisher::builder(url.clone()))
                .address_lookup(PkarrResolver::builder(url));
        }
        #[cfg(not(all(target_family = "wasm", target_os = "unknown")))]
        {
            if self.dht {
                builder = builder.address_lookup(DhtAddressLookup::builder());
            }
            if self.mdns {
                builder = builder.address_lookup(MdnsAddressLookup::builder());
            }
        }
        builder
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn empty_or_blank_is_default_n0() {
        let d = Discovery::parse(&[]).unwrap();
        assert!(d.is_default());
        assert!(d.n0);
        assert!(Discovery::parse(&tokens(&["", "  "])).unwrap().is_default());
    }

    #[test]
    fn n0_token_alone_is_default() {
        assert!(Discovery::parse(&tokens(&["n0"])).unwrap().is_default());
    }

    #[test]
    fn single_pkarr_relay() {
        let d = Discovery::parse(&tokens(&["pkarr:https://dns.example.com"])).unwrap();
        assert!(!d.n0);
        assert_eq!(d.pkarr.len(), 1);
        assert_eq!(d.pkarr[0].as_str(), "https://dns.example.com/");
        assert!(!d.is_default());
    }

    #[test]
    fn multiple_pkarr_relays_for_redundancy() {
        let d = Discovery::parse(&tokens(&[
            "pkarr:https://a.example.com",
            "pkarr:https://b.example.com",
        ]))
        .unwrap();
        assert_eq!(d.pkarr.len(), 2);
    }

    #[test]
    fn providers_compose() {
        let d = Discovery::parse(&tokens(&["n0", "dht", "mdns"])).unwrap();
        assert!(d.n0 && d.dht && d.mdns);
        assert!(!d.is_default());
        let d = Discovery::parse(&tokens(&["pkarr:https://dns.example.com", "dht"])).unwrap();
        assert!(!d.n0 && d.dht && d.pkarr.len() == 1);
    }

    #[test]
    fn dht_and_mdns_alone_are_sovereign() {
        let d = Discovery::parse(&tokens(&["dht"])).unwrap();
        assert!(d.dht && !d.n0);
        let d = Discovery::parse(&tokens(&["mdns"])).unwrap();
        assert!(d.mdns && !d.n0);
    }

    #[test]
    fn unknown_token_is_rejected() {
        assert!(Discovery::parse(&tokens(&["bogus"])).is_err());
    }

    #[test]
    fn malformed_pkarr_url_is_rejected() {
        assert!(Discovery::parse(&tokens(&["pkarr:not a url"])).is_err());
    }
}
