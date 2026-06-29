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
use serde::Deserialize;
use tokio::time::sleep;

use crate::doc::{Delta, SyncDoc};
use crate::identity::verify_signature;
use crate::pairing::PairingInfo;
use crate::store::{save_doc, FsBlockStore};

/// ALPN-style protocol tags, identical to the SDK's `doc-sync.ts`.
pub const SYNC_PROTOCOL: &str = "safu/sync/1";
pub const BLOCK_PROTOCOL: &str = "safu/blocks/1";

/// ALPN-style protocol tags for public-share hosting, identical to the SDK's
/// `block-pin.ts`. A device pins each block of a published share to the node so
/// the link keeps resolving while the device is offline, and unpins them when it
/// revokes the share. These blocks live outside the allocation table, so the
/// replication loop never auto-pulls them — this is the explicit upload path.
pub const PIN_PROTOCOL: &str = "safu/pin/1";
pub const UNPIN_PROTOCOL: &str = "safu/unpin/1";

/// The device's ACK byte for an accepted pin/unpin, matching the SDK's `ACK_OK`.
const ACK_OK: u8 = 1;
/// The device's ACK byte for a rejected pin/unpin, matching the SDK's `ACK_REJECT`.
const ACK_REJECT: u8 = 0;

/// A signed pin/unpin request: the block's content address, the authoring
/// device's signing id, and its signature over the hash. The JSON shape is
/// byte-identical to the SDK's `PinRequest` (note the `signId` field name).
#[derive(Deserialize)]
struct PinRequest {
    hash: String,
    #[serde(rename = "signId")]
    sign_id: String,
    sig: String,
}

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
            PIN_PROTOCOL => {
                let node = self.clone();
                tokio::spawn(async move { node.accept_pin(channel).await });
            }
            UNPIN_PROTOCOL => {
                let node = self.clone();
                tokio::spawn(async move { node.accept_unpin(channel).await });
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

    /// Accept a pin (a device hosting a public-share block here), then ACK the
    /// device with the outcome it awaits.
    async fn accept_pin(self: Arc<Self>, mut channel: NativeChannel) {
        let stored = self.store_pin(&mut channel).await;
        let _ = channel.send(&[ack(stored)]).await;
        let _ = channel.close();
    }

    /// Read a signed pin request followed by the block bytes, and store the block
    /// iff the request is from a current writer, correctly signed, and the bytes
    /// actually hash to the claimed address. Returns whether it was stored — the
    /// ACK the device awaits. Mirrors `acceptPin` in the SDK's `block-pin.ts`.
    async fn store_pin(&self, channel: &mut NativeChannel) -> bool {
        let Ok(Some(head)) = channel.recv().await else {
            return false;
        };
        let Ok(Some(body)) = channel.recv().await else {
            return false;
        };
        let Some(request) = self.authorize_request(&head) else {
            return false;
        };
        // Zero-knowledge: the node only ever sees ciphertext, so the one integrity
        // check it *can* make is that the bytes hash to their claimed address.
        if hex::encode(blake3::hash(&body).as_bytes()) != request.hash {
            return false;
        }
        match self.store.put(&request.hash, &body) {
            Ok(()) => {
                println!(
                    "pinned share block {} ({} held)",
                    short(&request.hash),
                    self.store.count()
                );
                true
            }
            Err(error) => {
                eprintln!(
                    "store pinned block {} failed: {error}",
                    short(&request.hash)
                );
                false
            }
        }
    }

    /// Accept an unpin (a device revoking a public share), then ACK the outcome.
    async fn accept_unpin(self: Arc<Self>, mut channel: NativeChannel) {
        let dropped = self.drop_pin(&mut channel).await;
        let _ = channel.send(&[ack(dropped)]).await;
        let _ = channel.close();
    }

    /// Read a signed unpin request and drop the named block iff the request is
    /// from a current writer. Mirrors `acceptUnpin` in the SDK's `block-pin.ts`.
    async fn drop_pin(&self, channel: &mut NativeChannel) -> bool {
        let Ok(Some(head)) = channel.recv().await else {
            return false;
        };
        let Some(request) = self.authorize_request(&head) else {
            return false;
        };
        match self.store.delete(&request.hash) {
            Ok(()) => {
                println!("unpinned share block {}", short(&request.hash));
                true
            }
            Err(error) => {
                eprintln!("drop pinned block {} failed: {error}", short(&request.hash));
                false
            }
        }
    }

    /// Parse a `{hash, signId, sig}` frame under the node's current writer set.
    fn authorize_request(&self, head: &[u8]) -> Option<PinRequest> {
        let doc = self.doc.lock().expect("doc lock");
        authorize_request(&doc, head)
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

/// The single-byte ACK a device awaits after a pin/unpin.
fn ack(ok: bool) -> u8 {
    if ok {
        ACK_OK
    } else {
        ACK_REJECT
    }
}

/// Parse a `{hash, signId, sig}` frame and return it only if it is well-formed,
/// from a current writer of `doc`, and signed by that writer over the hash.
/// Admission is by *author*, not by the transport carrier — identical to the
/// document's model and the SDK's `authorize` in `block-pin.ts`.
fn authorize_request(doc: &SyncDoc, head: &[u8]) -> Option<PinRequest> {
    let request: PinRequest = serde_json::from_slice(head).ok()?;
    if request.hash.is_empty() || request.sign_id.is_empty() || request.sig.is_empty() {
        return None;
    }
    if !doc.authorized(&request.sign_id) {
        return None;
    }
    if !verify_signature(&request.sign_id, request.hash.as_bytes(), &request.sig) {
        return None;
    }
    Some(request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Signer;

    /// A `{hash, signId, sig}` frame as a device would send it, signed over the
    /// hash by `signer` — the same bytes the SDK's `pushBlock` puts on the wire.
    fn signed_request(signer: &Signer, hash: &str) -> Vec<u8> {
        let sig = signer.sign(hash.as_bytes());
        format!(
            r#"{{"hash":"{hash}","signId":"{}","sig":"{sig}"}}"#,
            signer.id()
        )
        .into_bytes()
    }

    /// A fresh document whose genesis owner (the returned signer's id) is the only
    /// authorized writer.
    fn owned_doc(seed: u8) -> (SyncDoc, Signer) {
        let signer = Signer::from_seed([seed; 32]);
        // `from_seed` is deterministic, so a second signer with the same seed is
        // the same identity and can still sign once the first is moved into open.
        let owner = Signer::from_seed([seed; 32]);
        (SyncDoc::open(signer, None), owner)
    }

    #[test]
    fn accepts_a_signed_pin_from_an_authorized_writer() {
        let (doc, owner) = owned_doc(3);
        let head = signed_request(&owner, "deadbeef");
        let request = authorize_request(&doc, &head).expect("authorized");
        assert_eq!(request.sign_id, owner.id());
        assert_eq!(request.hash, "deadbeef");
    }

    #[test]
    fn rejects_a_pin_from_an_unauthorized_signer() {
        let (doc, _owner) = owned_doc(3);
        // A different seed is a different identity, not in the writer set.
        let stranger = Signer::from_seed([9u8; 32]);
        let head = signed_request(&stranger, "deadbeef");
        assert!(authorize_request(&doc, &head).is_none());
    }

    #[test]
    fn rejects_a_pin_whose_signature_does_not_cover_the_hash() {
        let (doc, owner) = owned_doc(3);
        // Signed over a different hash than the one claimed in the frame.
        let sig = owner.sign(b"some-other-hash");
        let head = format!(
            r#"{{"hash":"deadbeef","signId":"{}","sig":"{sig}"}}"#,
            owner.id()
        )
        .into_bytes();
        assert!(authorize_request(&doc, &head).is_none());
    }

    #[test]
    fn rejects_a_malformed_frame() {
        let (doc, _owner) = owned_doc(3);
        assert!(authorize_request(&doc, b"not json").is_none());
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
