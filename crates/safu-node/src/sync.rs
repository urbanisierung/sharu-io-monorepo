//! The always-on replication loop, ported from the SDK's `DocSync` over the
//! native Iroh endpoint (`safu_transport::native`). The node never authors file
//! entries — it is a pure ciphertext sink — so this is the receive-and-replicate
//! half of `DocSync`:
//!
//!   * accept inbound `safu/sync/1` channels and merge their deltas;
//!   * accept inbound `safu/blocks/1` channels and answer block-by-hash requests
//!     from the local store (harmless for a sink, required by the protocol);
//!   * dial each linked device, exchange the catch-up snapshot, read its deltas,
//!     and — because a full replica must hold every referenced block — pull every
//!     block the synced allocation table references but the local store lacks.
//!
//! Only ciphertext crosses the wire (zero-knowledge invariant): blocks move as
//! the opaque bytes the store holds, addressed by hash.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use safu_transport::native::{NativeChannel, NativeEndpoint};
use tokio::time::sleep;

use crate::doc::{Delta, SyncDoc};
use crate::pairing::PairingInfo;
use crate::store::{save_doc, FsBlockStore};

/// ALPN-style protocol tags, identical to the SDK's `doc-sync.ts`.
pub const SYNC_PROTOCOL: &str = "safu/sync/1";
pub const BLOCK_PROTOCOL: &str = "safu/blocks/1";

/// How long to wait before re-dialing a device that is offline or dropped.
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// The assembled, running node: an Iroh endpoint, the replicated document, the
/// block store it fills, and the devices it dials.
pub struct Node {
    endpoint: Arc<NativeEndpoint>,
    doc: Arc<Mutex<SyncDoc>>,
    store: Arc<FsBlockStore>,
    doc_path: std::path::PathBuf,
    devices: Vec<PairingInfo>,
}

impl Node {
    pub fn new(
        endpoint: Arc<NativeEndpoint>,
        doc: SyncDoc,
        store: FsBlockStore,
        doc_path: std::path::PathBuf,
        devices: Vec<PairingInfo>,
    ) -> Arc<Self> {
        Arc::new(Self {
            endpoint,
            doc: Arc::new(Mutex::new(doc)),
            store: Arc::new(store),
            doc_path,
            devices,
        })
    }

    /// Begin accepting inbound channels and dialing every linked device. Returns
    /// immediately; the loops run as spawned tasks until the process exits.
    pub fn serve(self: &Arc<Self>) {
        let accept = self.clone();
        tokio::spawn(async move { accept.accept_loop().await });
        for device in &self.devices {
            let node = self.clone();
            let device = device.clone();
            tokio::spawn(async move { node.connect_loop(device).await });
        }
    }

    /// Flush the latest document snapshot to disk (called on shutdown).
    pub fn flush(&self) {
        self.persist();
    }

    async fn accept_loop(self: Arc<Self>) {
        loop {
            match self.endpoint.accept().await {
                Ok(Some(channel)) => self.clone().dispatch(channel),
                Ok(None) => break, // endpoint stopped
                Err(error) => eprintln!("accept failed: {error}"),
            }
        }
    }

    fn dispatch(self: Arc<Self>, channel: NativeChannel) {
        match channel.protocol() {
            BLOCK_PROTOCOL => {
                let store = self.store.clone();
                tokio::spawn(async move { serve_blocks(store, channel).await });
            }
            SYNC_PROTOCOL => {
                // If the dialing peer is a linked device, we can pull the blocks
                // it references back from it — regardless of who dialed.
                let target = self
                    .devices
                    .iter()
                    .find(|d| d.id == channel.peer())
                    .cloned();
                tokio::spawn(async move { self.handle_sync(channel, target).await });
            }
            other => eprintln!("ignoring channel with unknown protocol: {other}"),
        }
    }

    async fn connect_loop(self: Arc<Self>, device: PairingInfo) {
        let Some(relay) = device.relay_url.clone() else {
            eprintln!(
                "device {} has no relay url; cannot dial it",
                short(&device.sign_id)
            );
            return;
        };
        loop {
            match self
                .endpoint
                .connect(&device.id, &relay, SYNC_PROTOCOL)
                .await
            {
                Ok(channel) => {
                    println!("connected to device {}", short(&device.sign_id));
                    self.clone()
                        .handle_sync(channel, Some(device.clone()))
                        .await;
                    println!("disconnected from device {}", short(&device.sign_id));
                }
                Err(error) => eprintln!("dial {} failed: {error}", short(&device.sign_id)),
            }
            sleep(RECONNECT_DELAY).await;
        }
    }

    /// Send our catch-up snapshot, then merge inbound deltas until the channel
    /// closes. When entries land and the peer is a known device, pull the blocks
    /// it newly references.
    async fn handle_sync(
        self: Arc<Self>,
        mut channel: NativeChannel,
        pull_target: Option<PairingInfo>,
    ) {
        let snapshot = {
            let doc = self.doc.lock().expect("doc lock");
            serde_json::to_vec(&doc.snapshot_delta()).expect("serialize snapshot")
        };
        if let Err(error) = channel.send(&snapshot).await {
            eprintln!("send snapshot failed: {error}");
            return;
        }
        loop {
            match channel.recv().await {
                Ok(Some(frame)) => {
                    let delta: Delta = match serde_json::from_slice(&frame) {
                        Ok(delta) => delta,
                        Err(error) => {
                            eprintln!("malformed delta: {error}");
                            continue;
                        }
                    };
                    let applied = {
                        let mut doc = self.doc.lock().expect("doc lock");
                        doc.apply_remote(&delta)
                    };
                    if applied.changed() {
                        self.persist();
                    }
                    if applied.entries > 0 {
                        if let Some(target) = &pull_target {
                            self.clone().pull_missing(target).await;
                        }
                    }
                }
                Ok(None) => break,
                Err(error) => {
                    eprintln!("recv failed: {error}");
                    break;
                }
            }
        }
    }

    /// Fetch every block the document references but the local store lacks, from
    /// `device`, over a single pipelined block channel. Idempotent: a `has` guard
    /// skips blocks already held, so overlapping calls converge.
    async fn pull_missing(self: Arc<Self>, device: &PairingInfo) {
        let referenced = {
            let doc = self.doc.lock().expect("doc lock");
            doc.referenced_blocks()
        };
        let missing: Vec<String> = referenced
            .into_iter()
            .filter(|hash| !self.store.has(hash))
            .collect();
        if missing.is_empty() {
            return;
        }
        let Some(relay) = device.relay_url.clone() else {
            return;
        };
        let mut channel = match self
            .endpoint
            .connect(&device.id, &relay, BLOCK_PROTOCOL)
            .await
        {
            Ok(channel) => channel,
            Err(error) => {
                eprintln!("open block channel failed: {error}");
                return;
            }
        };
        for hash in missing {
            if self.store.has(&hash) {
                continue; // a concurrent pull may have fetched it
            }
            if channel.send(hash.as_bytes()).await.is_err() {
                break;
            }
            match channel.recv().await {
                Ok(Some(bytes)) if !bytes.is_empty() => match self.store.put(&hash, &bytes) {
                    Ok(()) => println!(
                        "replicated block {} ({} held)",
                        short(&hash),
                        self.store.count()
                    ),
                    Err(error) => eprintln!("store block {} failed: {error}", short(&hash)),
                },
                Ok(_) => {} // peer does not have it (yet)
                Err(error) => {
                    eprintln!("block recv failed: {error}");
                    break;
                }
            }
        }
        let _ = channel.close();
    }

    fn persist(&self) {
        let snapshot = {
            let doc = self.doc.lock().expect("doc lock");
            doc.serialize()
        };
        if let Err(error) = save_doc(&self.doc_path, &snapshot) {
            eprintln!("persist doc failed: {error}");
        }
    }
}

/// Answer block-by-hash requests from the local store until the channel ends.
async fn serve_blocks(store: Arc<FsBlockStore>, mut channel: NativeChannel) {
    loop {
        match channel.recv().await {
            Ok(Some(request)) => {
                let hash = String::from_utf8_lossy(&request);
                let block = store.get(&hash).unwrap_or_default();
                if channel.send(&block).await.is_err() {
                    break;
                }
            }
            Ok(None) => break,
            Err(_) => break,
        }
    }
}

/// A short, log-friendly prefix of a long id.
fn short(id: &str) -> String {
    id.chars().take(12).collect()
}
