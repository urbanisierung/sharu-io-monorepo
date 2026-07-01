//! The replicated document, ported faithfully from the TypeScript SDK
//! (`allocation-table.ts` + `sync-doc.ts`) so a Rust node converges identically
//! with browser and Node peers.
//!
//! The allocation table is a *map of last-writer-wins registers* keyed by path,
//! the winner chosen by a Hybrid Logical Clock stamp with a deterministic
//! peer-id tiebreak — a join-semilattice, so merges are commutative, associative
//! and idempotent and every replica converges regardless of arrival order. The
//! writer set is itself a CRDT: a grow-only "added" set minus a grow-only,
//! permanent "revoked" set.
//!
//! Wire/persistence JSON is byte-identical to the SDK's; the signable bytes for
//! each op are the SDK's fixed-order `JSON.stringify([...])` arrays, reproduced
//! here via `serde_json` so cross-runtime signatures verify.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::identity::{verify_signature, Signer};

/// A Hybrid Logical Clock timestamp: wall-clock millis, a monotonic counter to
/// order events within the same milli, and the originating peer for tiebreaks.
#[derive(Clone, Serialize, Deserialize)]
pub struct Stamp {
    pub wall: i64,
    pub counter: i64,
    pub peer: String,
}

/// Metadata + ordered block hashes for one path. `deleted` marks a tombstone.
#[derive(Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub blocks: Vec<String>,
    pub size: i64,
    pub modified: i64,
    pub deleted: bool,
}

/// A stamped entry as it lives in the table and travels on the wire. The
/// optional `sig` is the author's signature over the entry.
#[derive(Clone, Serialize, Deserialize)]
pub struct StampedEntry {
    pub path: String,
    pub entry: FileEntry,
    pub stamp: Stamp,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sig: Option<String>,
}

/// A grant or revocation of write access, authored by `stamp.peer`.
#[derive(Clone, Serialize, Deserialize)]
pub struct WriterOp {
    pub kind: String, // "add" | "revoke"
    pub peer: String,
    pub stamp: Stamp,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sig: Option<String>,
}

/// The unit of replication: stamped entries and writer-set ops to merge.
#[derive(Default, Serialize, Deserialize)]
pub struct Delta {
    #[serde(default)]
    pub entries: Vec<StampedEntry>,
    #[serde(default)]
    pub writers: Vec<WriterOp>,
}

/// A fully serializable image of the document, for persistence — the SDK's
/// `DocSnapshot` shape, so a snapshot round-trips between runtimes.
#[derive(Default, Serialize, Deserialize)]
pub struct DocSnapshot {
    pub entries: Vec<StampedEntry>,
    pub added: Vec<String>,
    pub revoked: Vec<String>,
    pub hlc: HlcState,
}

#[derive(Default, Clone, Copy, Serialize, Deserialize)]
pub struct HlcState {
    pub wall: i64,
    pub counter: i64,
}

/// Total order over stamps: wall, then counter, then peer id. Deterministic on
/// every replica, so the same two stamps always resolve the same way.
fn compare_stamp(a: &Stamp, b: &Stamp) -> std::cmp::Ordering {
    a.wall
        .cmp(&b.wall)
        .then(a.counter.cmp(&b.counter))
        .then(a.peer.cmp(&b.peer))
}

/// Deterministic signable bytes for an entry — the SDK's fixed-order tuple,
/// excluding the signature, so signer and verifier hash the same input.
fn entry_bytes(e: &StampedEntry) -> Vec<u8> {
    serde_json::to_vec(&json!([
        e.path,
        e.entry.blocks,
        e.entry.size,
        e.entry.modified,
        e.entry.deleted,
        e.stamp.wall,
        e.stamp.counter,
        e.stamp.peer,
    ]))
    .expect("serialize entry bytes")
}

/// Deterministic signable bytes for a writer op.
fn writer_bytes(op: &WriterOp) -> Vec<u8> {
    serde_json::to_vec(&json!([
        op.kind,
        op.peer,
        op.stamp.wall,
        op.stamp.counter,
        op.stamp.peer,
    ]))
    .expect("serialize writer bytes")
}

/// A Hybrid Logical Clock (ported from `allocation-table.ts`). `tick` returns a
/// stamp strictly greater than any it has produced or observed.
struct Hlc {
    peer: String,
    wall: i64,
    counter: i64,
}

impl Hlc {
    fn new(peer: String) -> Self {
        Self {
            peer,
            wall: 0,
            counter: 0,
        }
    }

    fn tick(&mut self, now: i64) -> Stamp {
        if now > self.wall {
            self.wall = now;
            self.counter = 0;
        } else {
            self.counter += 1;
        }
        Stamp {
            wall: self.wall,
            counter: self.counter,
            peer: self.peer.clone(),
        }
    }

    fn observe(&mut self, stamp: &Stamp, now: i64) {
        let wall = self.wall.max(stamp.wall).max(now);
        if wall == self.wall && wall == stamp.wall {
            self.counter = self.counter.max(stamp.counter) + 1;
        } else if wall == stamp.wall {
            self.counter = stamp.counter + 1;
        } else if wall != self.wall {
            self.counter = 0;
        }
        self.wall = wall;
    }
}

fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The signed replicated document: the allocation table, the writer-set CRDT,
/// and the HLC. The node always runs in *signed mode* — remote ops must carry a
/// valid signature by their claimed author or they are rejected.
pub struct SyncDoc {
    table: HashMap<String, StampedEntry>,
    hlc: Hlc,
    added: HashSet<String>,
    revoked: HashSet<String>,
    signer: Signer,
}

impl SyncDoc {
    /// Open a document for `signer`, restoring `snapshot` if present. `self` (the
    /// signer's id) is the genesis owner, authorized from creation.
    pub fn open(signer: Signer, snapshot: Option<DocSnapshot>) -> Self {
        let self_id = signer.id().to_string();
        let mut doc = Self {
            table: HashMap::new(),
            hlc: Hlc::new(self_id.clone()),
            added: HashSet::new(),
            revoked: HashSet::new(),
            signer,
        };
        doc.added.insert(self_id);
        if let Some(snapshot) = snapshot {
            doc.load(snapshot);
        }
        doc
    }

    fn load(&mut self, snapshot: DocSnapshot) {
        for entry in snapshot.entries {
            self.apply_entry(entry);
        }
        for peer in snapshot.added {
            self.added.insert(peer);
        }
        for peer in snapshot.revoked {
            self.revoked.insert(peer);
        }
        self.hlc.wall = snapshot.hlc.wall;
        self.hlc.counter = snapshot.hlc.counter;
    }

    /// Is `peer` currently allowed to author mutations?
    pub fn authorized(&self, peer: &str) -> bool {
        self.added.contains(peer) && !self.revoked.contains(peer)
    }

    /// Grant write access to `peer`, signing the op. Returns the op to persist.
    pub fn add_writer(&mut self, peer: &str) -> WriterOp {
        let mut op = WriterOp {
            kind: "add".into(),
            peer: peer.to_string(),
            stamp: self.hlc.tick(now_millis()),
            sig: None,
        };
        op.sig = Some(self.signer.sign(&writer_bytes(&op)));
        self.apply_writer_op(&op);
        op
    }

    /// Permanently revoke `peer`'s write access (e.g. a lost device).
    pub fn revoke_writer(&mut self, peer: &str) -> WriterOp {
        let mut op = WriterOp {
            kind: "revoke".into(),
            peer: peer.to_string(),
            stamp: self.hlc.tick(now_millis()),
            sig: None,
        };
        op.sig = Some(self.signer.sign(&writer_bytes(&op)));
        self.apply_writer_op(&op);
        op
    }

    /// Merge a delta received from a peer. Writer ops first (so authorization
    /// reflects the latest grants/revocations), then entries authored by an
    /// authorized peer. Returns the number of entries that changed local state.
    pub fn apply_remote(&mut self, delta: &Delta) -> AppliedDelta {
        let now = now_millis();
        let mut applied = AppliedDelta::default();
        for op in &delta.writers {
            if !self.sig_valid(&op.stamp.peer, &writer_bytes(op), op.sig.as_deref()) {
                continue;
            }
            self.hlc.observe(&op.stamp, now);
            if !self.authorized(&op.stamp.peer) {
                continue;
            }
            if self.apply_writer_op(op) {
                applied.writers += 1;
            }
        }
        for stamped in &delta.entries {
            if !self.sig_valid(
                &stamped.stamp.peer,
                &entry_bytes(stamped),
                stamped.sig.as_deref(),
            ) {
                continue;
            }
            self.hlc.observe(&stamped.stamp, now);
            if !self.authorized(&stamped.stamp.peer) {
                continue;
            }
            if self.apply_entry(stamped.clone()) {
                applied.entries += 1;
            }
        }
        applied
    }

    /// The full current entry state as a catch-up delta (writers excluded, as in
    /// the SDK's `snapshot()`).
    pub fn snapshot_delta(&self) -> Delta {
        Delta {
            entries: self.table.values().cloned().collect(),
            writers: Vec::new(),
        }
    }

    /// A serializable image for persistence.
    pub fn serialize(&self) -> DocSnapshot {
        DocSnapshot {
            entries: self.table.values().cloned().collect(),
            added: self.added.iter().cloned().collect(),
            revoked: self.revoked.iter().cloned().collect(),
            hlc: HlcState {
                wall: self.hlc.wall,
                counter: self.hlc.counter,
            },
        }
    }

    /// Every distinct block hash referenced by a live (non-tombstone) entry —
    /// what a full replica must hold. Used to drive block auto-pull.
    pub fn referenced_blocks(&self) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for stamped in self.table.values() {
            if stamped.entry.deleted {
                continue;
            }
            for hash in &stamped.entry.blocks {
                if seen.insert(hash.clone()) {
                    out.push(hash.clone());
                }
            }
        }
        out
    }

    fn sig_valid(&self, author: &str, bytes: &[u8], sig: Option<&str>) -> bool {
        match sig {
            Some(sig) => verify_signature(author, bytes, sig),
            None => false,
        }
    }

    fn apply_entry(&mut self, incoming: StampedEntry) -> bool {
        if let Some(current) = self.table.get(&incoming.path) {
            if compare_stamp(&incoming.stamp, &current.stamp) != std::cmp::Ordering::Greater {
                return false;
            }
        }
        self.table.insert(incoming.path.clone(), incoming);
        true
    }

    fn apply_writer_op(&mut self, op: &WriterOp) -> bool {
        if op.kind == "add" {
            return self.added.insert(op.peer.clone());
        }
        self.revoked.insert(op.peer.clone())
    }
}

/// What `apply_remote` actually changed locally.
#[derive(Default)]
pub struct AppliedDelta {
    pub entries: usize,
    pub writers: usize,
}

impl AppliedDelta {
    pub fn changed(&self) -> bool {
        self.entries > 0 || self.writers > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stamp(wall: i64, counter: i64, peer: &str) -> Stamp {
        Stamp {
            wall,
            counter,
            peer: peer.into(),
        }
    }

    #[test]
    fn entry_bytes_match_json_stringify() {
        // Exactly what `JSON.stringify([path, blocks, size, modified, deleted,
        // wall, counter, peer])` produces in the SDK — no spaces, integer
        // numbers, ordered array.
        let e = StampedEntry {
            path: "a/b.txt".into(),
            entry: FileEntry {
                blocks: vec!["h1".into(), "h2".into()],
                size: 42,
                modified: 1700,
                deleted: false,
            },
            stamp: stamp(5, 1, "peerid"),
            sig: None,
        };
        assert_eq!(
            String::from_utf8(entry_bytes(&e)).unwrap(),
            r#"["a/b.txt",["h1","h2"],42,1700,false,5,1,"peerid"]"#
        );
    }

    #[test]
    fn writer_bytes_match_json_stringify() {
        let op = WriterOp {
            kind: "revoke".into(),
            peer: "target".into(),
            stamp: stamp(9, 0, "author"),
            sig: None,
        };
        assert_eq!(
            String::from_utf8(writer_bytes(&op)).unwrap(),
            r#"["revoke","target",9,0,"author"]"#
        );
    }

    #[test]
    fn higher_stamp_wins_idempotently() {
        let signer = Signer::from_seed([1u8; 32]);
        let mut doc = SyncDoc::open(signer, None);
        let old = StampedEntry {
            path: "f".into(),
            entry: FileEntry {
                blocks: vec!["a".into()],
                size: 1,
                modified: 1,
                deleted: false,
            },
            stamp: stamp(1, 0, "x"),
            sig: None,
        };
        let new = StampedEntry {
            stamp: stamp(2, 0, "x"),
            ..old.clone()
        };
        assert!(doc.apply_entry(new.clone()));
        assert!(!doc.apply_entry(old)); // older loses
        assert!(!doc.apply_entry(new)); // idempotent
    }

    #[test]
    fn unsigned_remote_ops_are_rejected() {
        let signer = Signer::from_seed([2u8; 32]);
        let author = Signer::from_seed([3u8; 32]);
        let mut doc = SyncDoc::open(signer, None);
        doc.add_writer(author.id());

        // An entry authored by an authorized writer but missing its signature is
        // rejected in signed mode.
        let entry = StampedEntry {
            path: "f".into(),
            entry: FileEntry {
                blocks: vec!["a".into()],
                size: 1,
                modified: 1,
                deleted: false,
            },
            stamp: stamp(10, 0, author.id()),
            sig: None,
        };
        let applied = doc.apply_remote(&Delta {
            entries: vec![entry],
            writers: vec![],
        });
        assert_eq!(applied.entries, 0);
    }

    #[test]
    fn signed_entry_from_authorized_writer_is_accepted_and_referenced() {
        let signer = Signer::from_seed([4u8; 32]);
        let author = Signer::from_seed([5u8; 32]);
        let mut doc = SyncDoc::open(signer, None);
        doc.add_writer(author.id());

        let mut entry = StampedEntry {
            path: "f".into(),
            entry: FileEntry {
                blocks: vec!["manifest".into(), "block".into()],
                size: 3,
                modified: 7,
                deleted: false,
            },
            stamp: stamp(10, 0, author.id()),
            sig: None,
        };
        entry.sig = Some(author.sign(&entry_bytes(&entry)));

        let applied = doc.apply_remote(&Delta {
            entries: vec![entry],
            writers: vec![],
        });
        assert_eq!(applied.entries, 1);
        assert_eq!(
            doc.referenced_blocks(),
            vec!["manifest".to_string(), "block".to_string()]
        );
    }

    #[test]
    fn revoked_writer_entries_are_rejected() {
        let signer = Signer::from_seed([6u8; 32]);
        let author = Signer::from_seed([7u8; 32]);
        let mut doc = SyncDoc::open(signer, None);
        doc.add_writer(author.id());
        doc.revoke_writer(author.id());

        let mut entry = StampedEntry {
            path: "f".into(),
            entry: FileEntry {
                blocks: vec!["a".into()],
                size: 1,
                modified: 1,
                deleted: false,
            },
            stamp: stamp(10, 0, author.id()),
            sig: None,
        };
        entry.sig = Some(author.sign(&entry_bytes(&entry)));
        let applied = doc.apply_remote(&Delta {
            entries: vec![entry],
            writers: vec![],
        });
        assert_eq!(applied.entries, 0);
    }
}
