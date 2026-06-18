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
use iroh::{Endpoint, EndpointAddr, EndpointId, RelayUrl};

type Error = Box<dyn std::error::Error + Send + Sync>;
type Result<T> = std::result::Result<T, Error>;

/// A native Iroh endpoint advertising one or more protocols (ALPNs).
pub struct NativeEndpoint {
    endpoint: Endpoint,
}

impl NativeEndpoint {
    /// Bind an endpoint advertising `protocols`, using the n0 defaults (direct
    /// connectivity with relay fallback).
    pub async fn bind(protocols: &[&str]) -> Result<Self> {
        let alpns: Vec<Vec<u8>> = protocols.iter().map(|p| p.as_bytes().to_vec()).collect();
        let endpoint = Endpoint::builder(presets::N0).alpns(alpns).bind().await?;
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

    /// Dial `peer` and open a bi-stream tagged `protocol`.
    pub async fn connect(&self, peer: &str, relay: &str, protocol: &str) -> Result<NativeChannel> {
        let id = EndpointId::from_str(peer)?;
        let relay_url = RelayUrl::from_str(relay)?;
        let addr = EndpointAddr::new(id).with_relay_url(relay_url);
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
