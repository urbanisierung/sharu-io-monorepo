//! The set of linked devices this node backs up, persisted at
//! `<data_dir>/devices.json`. A linked device is exactly a [`PairingInfo`]: its
//! signing id (authorized in the document) plus its transport address (so the
//! always-on node can dial it to sync and pull blocks). The authoritative writer
//! set lives in the document snapshot; this file adds the dial addresses, which
//! the document does not carry.

use std::fs;
use std::path::{Path, PathBuf};

use crate::pairing::PairingInfo;

pub struct Devices {
    path: PathBuf,
    devices: Vec<PairingInfo>,
}

impl Devices {
    pub fn load(data_dir: &Path) -> Result<Self, String> {
        let path = data_dir.join("devices.json");
        let devices = match fs::read_to_string(&path) {
            Ok(text) if text.is_empty() => Vec::new(),
            Ok(text) => {
                serde_json::from_str(&text).map_err(|e| format!("parse {}: {e}", path.display()))?
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(format!("read {}: {e}", path.display())),
        };
        Ok(Self { path, devices })
    }

    pub fn list(&self) -> &[PairingInfo] {
        &self.devices
    }

    /// Add (or replace, keyed by signing id) a linked device and persist.
    pub fn add(&mut self, device: PairingInfo) -> Result<(), String> {
        self.devices.retain(|d| d.sign_id != device.sign_id);
        self.devices.push(device);
        self.save()
    }

    /// Remove a linked device by signing id; returns whether one was removed.
    pub fn remove(&mut self, sign_id: &str) -> Result<bool, String> {
        let before = self.devices.len();
        self.devices.retain(|d| d.sign_id != sign_id);
        let removed = self.devices.len() != before;
        if removed {
            self.save()?;
        }
        Ok(removed)
    }

    fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        let text =
            serde_json::to_string_pretty(&self.devices).map_err(|e| format!("serialize: {e}"))?;
        fs::write(&self.path, text).map_err(|e| format!("write {}: {e}", self.path.display()))
    }
}
