//! Filesystem persistence: the content-addressed block store and the JSON
//! document snapshot — the Rust analogues of the headless peer's `FsBlockStore`
//! and `FsDocStore`. Only opaque ciphertext is ever written (zero-knowledge
//! invariant); blocks are files named by their lowercase-hex BLAKE3 hash.

use std::fs;
use std::path::{Path, PathBuf};

use crate::doc::DocSnapshot;

/// A content-addressed block store rooted at `dir`. Blocks are keyed by their
/// lowercase-hex hash; any non-hex key is rejected so a hash decoded off the
/// wire can never escape `dir` via a crafted filename (path traversal).
pub struct FsBlockStore {
    dir: PathBuf,
}

impl FsBlockStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn has(&self, hash: &str) -> bool {
        match self.path(hash) {
            Some(path) => path.exists(),
            None => false,
        }
    }

    pub fn get(&self, hash: &str) -> Option<Vec<u8>> {
        fs::read(self.path(hash)?).ok()
    }

    pub fn put(&self, hash: &str, block: &[u8]) -> Result<(), String> {
        let Some(path) = self.path(hash) else {
            return Err(format!("invalid block hash: {hash}"));
        };
        fs::create_dir_all(&self.dir).map_err(|e| format!("create {}: {e}", self.dir.display()))?;
        fs::write(&path, block).map_err(|e| format!("write block {hash}: {e}"))
    }

    /// Drop a block — the unpin path, used when a device revokes a public share.
    /// An already-absent block is success: unpinning is idempotent, so a repeated
    /// revoke (or one racing replication) is not an error.
    pub fn delete(&self, hash: &str) -> Result<(), String> {
        let Some(path) = self.path(hash) else {
            return Err(format!("invalid block hash: {hash}"));
        };
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("delete block {hash}: {e}")),
        }
    }

    /// The count of blocks currently held, for status output.
    pub fn count(&self) -> usize {
        fs::read_dir(&self.dir)
            .map(|entries| entries.flatten().count())
            .unwrap_or(0)
    }

    fn path(&self, hash: &str) -> Option<PathBuf> {
        if hash.is_empty()
            || !hash
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return None;
        }
        Some(self.dir.join(hash))
    }
}

/// Load the document snapshot from `path`, or `None` if absent.
pub fn load_doc(path: &Path) -> Result<Option<DocSnapshot>, String> {
    match fs::read_to_string(path) {
        Ok(text) if text.is_empty() => Ok(None),
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| format!("parse {}: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

/// Persist the document snapshot to `path` (creating parent dirs).
///
/// Written atomically — to a sibling temp file, then renamed into place — so a
/// crash or kill mid-write (e.g. an updater stopping the node) can never leave a
/// torn `doc.json`. A reader always sees either the whole old snapshot or the
/// whole new one, never a half-written file.
pub fn save_doc(path: &Path, snapshot: &DocSnapshot) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let text = serde_json::to_string(snapshot).map_err(|e| format!("serialize doc: {e}"))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("doc.json");
    let tmp = path.with_file_name(format!("{name}.tmp"));
    fs::write(&tmp, text).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("replace {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    /// A fresh, empty temp directory unique to this test run.
    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("safu-store-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn rejects_non_hex_hashes() {
        let store = FsBlockStore::new(PathBuf::from("/tmp/safu-test-blocks"));
        assert!(store.path("../escape").is_none());
        assert!(store.path("ABCDEF").is_none()); // uppercase rejected
        assert!(store.path("deadbeef").is_some());
        assert!(!store.has("../escape"));
    }

    #[test]
    fn put_then_get_and_delete_round_trip() {
        let store = FsBlockStore::new(temp_dir().join("blocks"));
        store.put("deadbeef", b"ciphertext").unwrap();
        assert!(store.has("deadbeef"));
        assert_eq!(store.get("deadbeef").as_deref(), Some(&b"ciphertext"[..]));
        store.delete("deadbeef").unwrap();
        assert!(!store.has("deadbeef"));
        // Unpinning is idempotent: dropping an absent block is not an error.
        store.delete("deadbeef").unwrap();
    }

    #[test]
    fn save_doc_is_atomic_and_round_trips() {
        let dir = temp_dir();
        let path = dir.join("doc.json");
        save_doc(&path, &DocSnapshot::default()).unwrap();
        assert!(path.exists());
        // The temp file is renamed into place, never left behind.
        assert!(!dir.join("doc.json.tmp").exists());
        assert!(load_doc(&path).unwrap().is_some());
    }
}
