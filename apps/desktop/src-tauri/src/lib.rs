//! Project Safu desktop core (plan §3.1–3.3).
//!
//! Tauri wraps the `apps/web` build and hosts the native services the browser
//! cannot provide: a filesystem-backed, content-addressed block store (§1.3
//! native impl), filesystem watchers that feed the ingest pipeline (§3.3), and
//! the native Iroh transport with direct UDP hole-punching (§3.2,
//! `safu_transport::native`). The frontend reaches these through Tauri commands;
//! the SDK's `Transport`/`BlockStore` interfaces are unchanged — only the
//! implementation behind them differs from the browser.
//!
//! NOTE: this crate requires the Tauri toolchain (system webview + CLI) to build
//! and is verified on a desktop host, not in the headless CI sandbox.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use safu_transport::native::{NativeChannel, NativeEndpoint};
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;

/// Shared desktop state: the block-store root, the native endpoint, and the live
/// channel registry that bridges async Iroh streams to synchronous commands.
struct Safu {
    blocks_dir: PathBuf,
    endpoint: Mutex<Option<NativeEndpoint>>,
    channels: Mutex<HashMap<u64, NativeChannel>>,
    next_channel: AtomicU64,
}

impl Safu {
    fn block_path(&self, hash: &str) -> PathBuf {
        self.blocks_dir.join(hash)
    }
}

// ---- Content-addressed block store (native BlockStore, plan §1.3) -----------

/// Persist a block, verifying it is addressed by the BLAKE3 of its bytes — the
/// zero-knowledge store only ever sees ciphertext.
#[tauri::command]
async fn block_put(state: State<'_, Safu>, hash: String, data: Vec<u8>) -> Result<(), String> {
    if blake3::hash(&data).to_hex().to_string() != hash {
        return Err("block hash does not match its contents".into());
    }
    tokio::fs::write(state.block_path(&hash), &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn block_get(state: State<'_, Safu>, hash: String) -> Result<Option<Vec<u8>>, String> {
    match tokio::fs::read(state.block_path(&hash)).await {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn block_has(state: State<'_, Safu>, hash: String) -> Result<bool, String> {
    Ok(tokio::fs::try_exists(state.block_path(&hash))
        .await
        .unwrap_or(false))
}

/// Remove a block (idempotent — a missing block is success), to reclaim a
/// revoked public share's pinned ciphertext.
#[tauri::command]
async fn block_delete(state: State<'_, Safu>, hash: String) -> Result<(), String> {
    match tokio::fs::remove_file(state.block_path(&hash)).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---- Native transport bridge (plan §3.2) ------------------------------------

#[tauri::command]
async fn transport_id(state: State<'_, Safu>) -> Result<String, String> {
    let ep = state.endpoint.lock().await;
    ep.as_ref().map(|e| e.id()).ok_or_else(|| "endpoint not started".into())
}

#[tauri::command]
async fn transport_relay(state: State<'_, Safu>) -> Result<Option<String>, String> {
    let ep = state.endpoint.lock().await;
    Ok(ep.as_ref().and_then(|e| e.relay_url()))
}

/// Dial a peer and register the channel, returning its id for later send/recv.
#[tauri::command]
async fn transport_connect(
    state: State<'_, Safu>,
    peer: String,
    relay: String,
    protocol: String,
) -> Result<u64, String> {
    let channel = {
        let ep = state.endpoint.lock().await;
        let ep = ep.as_ref().ok_or("endpoint not started")?;
        ep.connect(&peer, &relay, &protocol).await.map_err(|e| e.to_string())?
    };
    let id = state.next_channel.fetch_add(1, Ordering::Relaxed);
    state.channels.lock().await.insert(id, channel);
    Ok(id)
}

/// One inbound channel: the registered id plus the peer and protocol the
/// frontend routes on. Returns null once the endpoint stops accepting.
#[derive(serde::Serialize)]
struct AcceptedChannel {
    id: u64,
    peer: String,
    protocol: String,
}

#[tauri::command]
async fn transport_accept(state: State<'_, Safu>) -> Result<Option<AcceptedChannel>, String> {
    let channel = {
        let ep = state.endpoint.lock().await;
        let ep = ep.as_ref().ok_or("endpoint not started")?;
        ep.accept().await.map_err(|e| e.to_string())?
    };
    let Some(channel) = channel else {
        return Ok(None);
    };
    let id = state.next_channel.fetch_add(1, Ordering::Relaxed);
    let accepted = AcceptedChannel {
        id,
        peer: channel.peer().to_string(),
        protocol: channel.protocol().to_string(),
    };
    state.channels.lock().await.insert(id, channel);
    Ok(Some(accepted))
}

#[tauri::command]
async fn channel_send(state: State<'_, Safu>, channel: u64, data: Vec<u8>) -> Result<(), String> {
    let mut channels = state.channels.lock().await;
    let c = channels.get_mut(&channel).ok_or("unknown channel")?;
    c.send(&data).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn channel_recv(state: State<'_, Safu>, channel: u64) -> Result<Option<Vec<u8>>, String> {
    let mut channels = state.channels.lock().await;
    let c = channels.get_mut(&channel).ok_or("unknown channel")?;
    c.recv().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn channel_close(state: State<'_, Safu>, channel: u64) -> Result<(), String> {
    if let Some(mut c) = state.channels.lock().await.remove(&channel) {
        let _ = c.close();
    }
    Ok(())
}

// ---- Filesystem watcher (plan §3.3) -----------------------------------------

/// Read a watched file's bytes so the frontend can ingest it. Errors for a path
/// that no longer exists (e.g. a delete event), which the caller skips.
#[tauri::command]
async fn read_file(path: String) -> Result<Vec<u8>, String> {
    tokio::fs::read(&path).await.map_err(|e| e.to_string())
}

/// Watch a folder and emit a `file-changed` event with each changed path so the
/// frontend can auto-ingest it into the synced document.
#[tauri::command]
fn watch_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            for path in event.paths {
                let _ = app.emit("file-changed", path.to_string_lossy().to_string());
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(PathBuf::from(&path).as_path(), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    // The watcher must outlive this call; leak it for the lifetime of the app.
    std::mem::forget::<RecommendedWatcher>(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let blocks_dir = app.path().app_data_dir()?.join("blocks");
            std::fs::create_dir_all(&blocks_dir)?;

            // Bind the native endpoint advertising the SDK's protocols.
            let endpoint = tauri::async_runtime::block_on(async {
                NativeEndpoint::bind(&["safu/sync/1", "safu/blocks/1"]).await
            })
            .map_err(|e| std::io::Error::other(e.to_string()))?;

            app.manage(Safu {
                blocks_dir,
                endpoint: Mutex::new(Some(endpoint)),
                channels: Mutex::new(HashMap::new()),
                next_channel: AtomicU64::new(1),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            block_put,
            block_get,
            block_has,
            block_delete,
            transport_id,
            transport_relay,
            transport_connect,
            transport_accept,
            channel_send,
            channel_recv,
            channel_close,
            read_file,
            watch_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Safu desktop");
}
