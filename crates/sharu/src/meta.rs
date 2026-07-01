//! The on-disk format version of a node's data dir, recorded at
//! `<data_dir>/meta.json`. It is the hook that keeps *updates* safe: a newer
//! binary can detect an older dir and migrate it, and — crucially — an older
//! binary refuses a dir written by a newer one rather than silently misreading
//! state it does not understand. The identity, document, and blocks are
//! unchanged by this; it only versions their *layout*.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// The data-dir layout version this binary writes and understands. Bump it only
/// alongside a migration step in [`ensure`] that upgrades older dirs in place.
pub const CURRENT_FORMAT: u32 = 1;

#[derive(Serialize, Deserialize)]
struct Meta {
    format: u32,
}

/// Ensure `data_dir`'s format is one this binary can use, creating the marker for
/// a new (or pre-marker) dir. Errors only when the dir was written by a *newer*
/// sharu, so a too-old binary refuses to run rather than corrupt newer state.
///
/// A missing marker is treated as the current format and written: a data dir
/// from before this marker existed is layout-identical to format 1, so adopting
/// it is safe and needs no migration.
pub fn ensure(data_dir: &Path) -> Result<(), String> {
    let path = data_dir.join("meta.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return write(data_dir),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    let meta: Meta =
        serde_json::from_str(&text).map_err(|e| format!("parse {}: {e}", path.display()))?;
    if meta.format > CURRENT_FORMAT {
        return Err(format!(
            "data dir {} was written by a newer sharu (format {}); this binary supports up to format {} — upgrade sharu",
            data_dir.display(),
            meta.format,
            CURRENT_FORMAT,
        ));
    }
    // Future: migrate a `meta.format < CURRENT_FORMAT` dir here, then rewrite.
    Ok(())
}

fn write(data_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| format!("create {}: {e}", data_dir.display()))?;
    let path = data_dir.join("meta.json");
    let text = serde_json::to_string(&Meta {
        format: CURRENT_FORMAT,
    })
    .map_err(|e| format!("serialize meta: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("safu-meta-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn creates_the_marker_for_a_new_dir_and_is_idempotent() {
        let dir = temp_dir();
        ensure(&dir).unwrap();
        assert!(dir.join("meta.json").exists());
        ensure(&dir).unwrap(); // a second run accepts the dir it just wrote
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn adopts_a_pre_marker_dir() {
        // A dir that exists but has no meta.json (a pre-marker install) is adopted
        // at the current format rather than rejected.
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("doc.json"), "{}").unwrap();
        ensure(&dir).unwrap();
        assert!(dir.join("meta.json").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_newer_format() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("meta.json"), r#"{"format":999}"#).unwrap();
        assert!(ensure(&dir).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
