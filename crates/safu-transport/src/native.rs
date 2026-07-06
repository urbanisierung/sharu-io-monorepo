//! Native transport core for the desktop runtime (plan §3.2).
//!
//! The same Iroh API as the browser binding, but built natively: this gains
//! direct UDP hole-punching (with relay fallback under symmetric NAT) instead of
//! the browser's relay-only path. The Tauri core (`apps/desktop`) drives this
//! and bridges it to the SDK's `Transport` interface via Tauri commands, so the
//! desktop swaps a native implementation behind the one TypeScript contract.
//!
//! Unlike the wasm binding, native async methods may borrow `self`, so channels
//! own their streams directly.

use std::str::FromStr;

use iroh::endpoint::{presets, RecvStream, SendStream};
use iroh::{Endpoint, EndpointAddr, EndpointId, RelayMode, RelayUrl};

use crate::Discovery;

type Error = Box<dyn std::error::Error + Send + Sync>;
type Result<T> = std::result::Result<T, Error>;

/// A native Iroh endpoint advertising one or more protocols (ALPNs).
pub struct NativeEndpoint {
    endpoint: Endpoint,
}

impl NativeEndpoint {
    /// Bind an endpoint advertising `protocols`, using the n0 defaults (direct
    /// connectivity with relay fallback through iroh.computer's relays, and n0
    /// DNS/pkarr discovery).
    pub async fn bind(protocols: &[&str]) -> Result<Self> {
        Self::bind_with(protocols, &[], Discovery::n0()).await
    }

    /// Bind advertising `protocols`, overriding only the relay map (discovery
    /// stays on the n0 default). Retained for callers that configure relays but
    /// not discovery; delegates to [`Self::bind_with`].
    pub async fn bind_with_relays(protocols: &[&str], relays: &[String]) -> Result<Self> {
        Self::bind_with(protocols, relays, Discovery::n0()).await
    }

    /// Bind advertising `protocols` with explicit relay and discovery config.
    ///
    /// When `relays` is non-empty, replace the n0 default relay servers with
    /// exactly those, so a deployment can point the node at its own self-hosted
    /// relay(s) instead of iroh.computer's — removing that liveness dependency.
    /// Each entry must be a full relay URL, e.g. `https://relay.example.com`.
    ///
    /// `discovery` overrides how peer `EndpointId`s are resolved to addresses:
    /// [`Discovery::n0`] keeps n0's DNS/pkarr, while a parsed config can point at
    /// a self-hosted pkarr relay and/or the company-less Mainline DHT + mDNS,
    /// removing the hardcoded n0 dependency. Relay and discovery are independent
    /// — either can be overridden alone.
    pub async fn bind_with(
        protocols: &[&str],
        relays: &[String],
        discovery: Discovery,
    ) -> Result<Self> {
        let alpns: Vec<Vec<u8>> = protocols.iter().map(|p| p.as_bytes().to_vec()).collect();
        let mut builder = Endpoint::builder(presets::N0).alpns(alpns);
        if !relays.is_empty() {
            let urls = relays
                .iter()
                .map(|url| RelayUrl::from_str(url))
                .collect::<std::result::Result<Vec<RelayUrl>, _>>()?;
            builder = builder.relay_mode(RelayMode::custom(urls));
        }
        builder = discovery.apply(builder);
        let endpoint = builder.bind().await?;
        Ok(Self { endpoint })
    }

    /// This endpoint's id (public key) as a string.
    pub fn id(&self) -> String {
        self.endpoint.id().to_string()
    }

    /// The home relay URL, once assigned.
    pub fn relay_url(&self) -> Option<String> {
        self.endpoint.addr().relay_urls().next().map(|u| u.to_string())
    }

    /// Resolve once the endpoint has selected a home relay (is "online"),
    /// returning its URL. `relay_url` only reports the relay after this.
    pub async fn online(&self) -> Option<String> {
        self.endpoint.online().await;
        self.relay_url()
    }

    /// Dial `peer` and open a bi-stream tagged `protocol`. When `relay` is empty,
    /// dial by id alone (`EndpointAddr::new(id)`) and let the configured
    /// discovery resolve the peer's current address — the recovery path for a
    /// stale/changed relay (plan R2.1). Otherwise dial the given relay directly.
    pub async fn connect(&self, peer: &str, relay: &str, protocol: &str) -> Result<NativeChannel> {
        let id = EndpointId::from_str(peer)?;
        let addr = if relay.is_empty() {
            EndpointAddr::new(id)
        } else {
            EndpointAddr::new(id).with_relay_url(RelayUrl::from_str(relay)?)
        };
        let conn = self.endpoint.connect(addr, protocol.as_bytes()).await?;
        let remote = conn.remote_id().to_string();
        let (send, recv) = conn.open_bi().await?;
        Ok(NativeChannel::new(remote, protocol.to_string(), send, recv))
    }

    /// Accept the next inbound channel, or `None` once the endpoint stops.
    pub async fn accept(&self) -> Result<Option<NativeChannel>> {
        let Some(incoming) = self.endpoint.accept().await else {
            return Ok(None);
        };
        let conn = incoming.await?;
        let protocol = String::from_utf8_lossy(conn.alpn()).into_owned();
        let remote = conn.remote_id().to_string();
        let (send, recv) = conn.accept_bi().await?;
        Ok(Some(NativeChannel::new(remote, protocol, send, recv)))
    }
}

/// One bidirectional channel: length-prefixed frames over an Iroh bi-stream.
pub struct NativeChannel {
    peer: String,
    protocol: String,
    send: SendStream,
    recv: RecvStream,
}

impl NativeChannel {
    fn new(peer: String, protocol: String, send: SendStream, recv: RecvStream) -> Self {
        Self {
            peer,
            protocol,
            send,
            recv,
        }
    }

    pub fn peer(&self) -> &str {
        &self.peer
    }

    pub fn protocol(&self) -> &str {
        &self.protocol
    }

    /// Send one frame: a big-endian u32 length prefix followed by `data`.
    pub async fn send(&mut self, data: &[u8]) -> Result<()> {
        let len = (data.len() as u32).to_be_bytes();
        self.send.write_all(&len).await?;
        self.send.write_all(data).await?;
        Ok(())
    }

    /// Receive the next frame, or `None` once the channel ends.
    pub async fn recv(&mut self) -> Result<Option<Vec<u8>>> {
        let mut len = [0u8; 4];
        if self.recv.read_exact(&mut len).await.is_err() {
            return Ok(None);
        }
        let mut buf = vec![0u8; u32::from_be_bytes(len) as usize];
        self.recv.read_exact(&mut buf).await?;
        Ok(Some(buf))
    }

    /// Finish the send side.
    pub fn close(&mut self) -> Result<()> {
        self.send.finish()?;
        Ok(())
    }
}
