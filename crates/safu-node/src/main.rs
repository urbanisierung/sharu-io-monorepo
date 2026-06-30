//! `safu-node` — a headless, always-on, zero-knowledge backup node for the
//! command line.
//!
//! It is the project's answer to "permanent storage" on a server with no
//! browser: pair it with your devices and it holds a full *ciphertext* replica
//! of everything they back up — the equivalent of an IPFS pinning node, but
//! zero-knowledge (only ciphertext is ever stored) and over Iroh (no DHT).
//!
//! It is also the **public-share host**: the always-on node a device selects
//! under "Host shares here" and pins its public shares to, so a share link keeps
//! resolving while the device is offline (`safu/pin/1` + `safu/unpin/1`). Pairing
//! shows a 6-digit **safety number** to match against the device's screen, so a
//! relay that swapped a key in transit is caught before the device is trusted.
//!
//! It reuses the native Iroh core already built for the desktop runtime
//! (`safu_transport::native`, direct UDP hole-punching with relay fallback) and
//! speaks the exact same wire protocol, signed CRDT, and identity derivation as
//! the web app and the headless TS peer — so a device backs up to it with no
//! protocol change, and you can run as many independent nodes as you like.
//!
//! Configure entirely from the terminal:
//!
//! ```text
//!   export SAFU_NODE_PASSPHRASE=…            # derives this node's identity
//!   safu-node init                            # one-time: create the identity
//!   safu-node info                            # print this node's pairing code
//!   safu-node link <device-connection-code>   # authorize + remember a device
//!   safu-node serve                           # run the always-on backup node
//! ```

mod brand;
mod config;
mod doc;
mod identity;
mod meta;
mod pairing;
mod release;
mod sas;
mod store;
mod sync;
mod update;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use safu_transport::native::NativeEndpoint;

use crate::config::Devices;
use crate::doc::{StampedEntry, SyncDoc};
use crate::identity::{load_or_create_signer, Signer};
use crate::pairing::PairingInfo;
use crate::sas::safety_number;
use crate::store::{load_doc, save_doc, FsBlockStore};
use crate::sync::{Node, BLOCK_PROTOCOL, PIN_PROTOCOL, SYNC_PROTOCOL, UNPIN_PROTOCOL};

const DEFAULT_DATA_DIR: &str = "./safu-node-data";
const ONLINE_TIMEOUT: Duration = Duration::from_secs(15);

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("error: {message}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), String> {
    let args = Args::parse(std::env::args().skip(1).collect())?;
    let command = args.command.as_str();
    // Every command that opens the data dir must first see a compatible on-disk
    // format — checked here, before dispatch, so no command's early returns can
    // skip it. `update`/`version`/`help` don't touch the data dir.
    if matches!(
        command,
        "init" | "info" | "link" | "unlink" | "list" | "files" | "status" | "serve" | "run"
    ) {
        meta::ensure(&args.data_dir)?;
    }
    match command {
        "init" => cmd_init(&args),
        "info" => cmd_info(&args).await,
        "link" => cmd_link(&args),
        "unlink" => cmd_unlink(&args),
        "list" => cmd_list(&args),
        "files" => cmd_files(&args),
        "status" => cmd_status(&args),
        "serve" | "run" => cmd_serve(&args).await,
        "update" => cmd_update(&args).await,
        "version" | "--version" | "-V" => {
            println!("safu-node {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        "help" | "--help" | "-h" => {
            print_usage();
            Ok(())
        }
        other => {
            print_usage();
            Err(format!("unknown command: {other}"))
        }
    }
}

// --- commands ---------------------------------------------------------------

fn cmd_init(args: &Args) -> Result<(), String> {
    let signer = signer(args)?;
    println!("safu node initialized");
    println!("  data dir:   {}", args.data_dir.display());
    println!("  signing id: {}", signer.id());
    println!();
    println!("Next: run `safu-node info` to print this node's pairing code, then");
    println!("`safu-node link <device-connection-code>` for each device to back up.");
    Ok(())
}

async fn cmd_info(args: &Args) -> Result<(), String> {
    let signer = signer(args)?;
    let endpoint = bind_endpoint().await?;
    let relay = online(&endpoint).await;
    let info = PairingInfo {
        id: endpoint.id(),
        relay_url: relay.clone(),
        sign_id: signer.id().to_string(),
    };
    println!("signing id:    {}", signer.id());
    println!("transport id:  {}", endpoint.id());
    match &relay {
        Some(url) => println!("home relay:    {url}"),
        None => println!("home relay:    (offline — could not reach a relay)"),
    }
    println!();
    println!("pairing code (paste into the web app to link this node back):");
    println!("{}", info.encode());
    Ok(())
}

fn cmd_link(args: &Args) -> Result<(), String> {
    let code = args.positional(0, "a device connection code")?;
    let info = PairingInfo::decode(code)?;
    let signer = signer(args)?;
    if info.sign_id == signer.id() {
        return Err("that code is this node's own — link a *device*, not yourself".into());
    }
    let node_id = signer.id().to_string();

    // Authorize the device's signing id in the document (so its signed entries
    // are accepted), and remember its transport address so `serve` can dial it.
    let mut document = open_doc(args, signer)?;
    document.add_writer(&info.sign_id);
    save_doc(&doc_path(args), &document.serialize())?;

    let mut devices = Devices::load(&args.data_dir)?;
    let sign_id = info.sign_id.clone();
    devices.add(info)?;

    println!("linked device {sign_id}");
    println!(
        "  safety number: {} — confirm it matches the one shown on the device",
        safety_number(&node_id, &sign_id)
    );
    println!("run `safu-node serve` to start backing it up.");
    Ok(())
}

fn cmd_unlink(args: &Args) -> Result<(), String> {
    let sign_id = args.positional(0, "a device signing id")?.to_string();
    let signer = signer(args)?;

    let mut document = open_doc(args, signer)?;
    document.revoke_writer(&sign_id);
    save_doc(&doc_path(args), &document.serialize())?;

    let mut devices = Devices::load(&args.data_dir)?;
    let removed = devices.remove(&sign_id)?;

    if removed {
        println!("unlinked and revoked device {sign_id}");
    } else {
        println!("revoked {sign_id} (it was not in the linked-device list)");
    }
    Ok(())
}

fn cmd_list(args: &Args) -> Result<(), String> {
    let devices = Devices::load(&args.data_dir)?;
    if devices.list().is_empty() {
        println!("no linked devices — run `safu-node link <code>` to add one");
        return Ok(());
    }
    // The safety number binds this node's identity to each device's, so showing
    // it needs the node's signing id — hence the passphrase, as for `serve`.
    let signer = signer(args)?;
    println!("linked devices:");
    for device in devices.list() {
        println!("  signing id:    {}", device.sign_id);
        println!(
            "  safety number: {}",
            safety_number(signer.id(), &device.sign_id)
        );
        println!("  transport id:  {}", device.id);
        println!(
            "  relay:         {}",
            device.relay_url.as_deref().unwrap_or("(none)")
        );
        println!();
    }
    Ok(())
}

/// List the files this node holds in its backup replica — the live (non-deleted)
/// entries of the synced allocation table. Read-only and network-free: it reads
/// the on-disk `doc.json` (kept fresh by `serve`, which persists on every applied
/// delta), so it can be run in a second terminal to confirm what a running node
/// has actually synced. No passphrase needed — the table holds only plaintext
/// metadata (paths, sizes), never block contents.
fn cmd_files(args: &Args) -> Result<(), String> {
    let snapshot = load_doc(&doc_path(args))?.unwrap_or_default();
    let mut live: Vec<&StampedEntry> = snapshot
        .entries
        .iter()
        .filter(|e| !e.entry.deleted)
        .collect();
    live.sort_by(|a, b| a.path.cmp(&b.path));
    let tombstones = snapshot.entries.len() - live.len();

    if live.is_empty() {
        println!("no files backed up yet — pair a device, back something up, then re-run.");
        if tombstones > 0 {
            println!("({tombstones} deleted file(s) tracked as tombstones)");
        }
        return Ok(());
    }

    let total: i64 = live.iter().map(|e| e.entry.size).sum();
    println!("backed-up files ({}, {}):", live.len(), human_size(total));
    for entry in &live {
        println!(
            "  {:>10}  {:>3} block(s)  {}",
            human_size(entry.entry.size),
            entry.entry.blocks.len(),
            entry.path,
        );
    }
    if tombstones > 0 {
        println!();
        println!("{tombstones} deleted file(s) tracked as tombstones (not shown).");
    }
    Ok(())
}

/// Print an offline snapshot of what this node holds: backed-up files, how much
/// of the referenced ciphertext has been replicated locally, how many extra
/// blocks are hosted as public-share pins, and the linked devices. Like `files`
/// it reads the data dir without binding the network, so it answers "is this node
/// actually syncing?" at a glance while `serve` runs elsewhere.
fn cmd_status(args: &Args) -> Result<(), String> {
    let snapshot = load_doc(&doc_path(args))?.unwrap_or_default();
    let store = FsBlockStore::new(args.data_dir.join("blocks"));
    let devices = Devices::load(&args.data_dir)?;

    let live: Vec<&StampedEntry> = snapshot
        .entries
        .iter()
        .filter(|e| !e.entry.deleted)
        .collect();
    let total_size: i64 = live.iter().map(|e| e.entry.size).sum();

    // Distinct blocks the live allocation table references — what a full replica
    // must hold. `serve` auto-pulls these from the authoring devices.
    let mut referenced = std::collections::HashSet::new();
    for entry in &live {
        for hash in &entry.entry.blocks {
            referenced.insert(hash.as_str());
        }
    }
    let mut present_referenced = 0usize;
    for hash in &referenced {
        if store.has(hash) {
            present_referenced += 1;
        }
    }
    let missing = referenced.len() - present_referenced;
    let held = store.count();
    // Blocks held that the table does not reference are public-share pins (they
    // live outside the allocation table — see `block-pin.ts` / sync.rs).
    let pins = held.saturating_sub(present_referenced);

    println!(
        "safu node status — offline snapshot of {}",
        args.data_dir.display()
    );
    println!(
        "  backed-up files:    {} ({})",
        live.len(),
        human_size(total_size)
    );
    println!(
        "  referenced blocks:  {} ({present_referenced} present, {missing} still replicating)",
        referenced.len(),
    );
    println!("  share-pin blocks:   {pins} (public-share blocks hosted for offline links)");
    println!("  total blocks held:  {held}");
    println!("  linked devices:     {}", devices.list().len());
    for device in devices.list() {
        println!(
            "    {} — relay {}",
            short(&device.sign_id),
            device.relay_url.as_deref().unwrap_or("(none)"),
        );
    }
    if devices.list().is_empty() {
        println!("    none — run `safu-node link <code>` to add one");
    }
    println!();
    println!("Run `safu-node files` for the file list, `list` for device safety numbers, or");
    println!(
        "`info` for this node's pairing code (paste it into the web app's \"Host shares here\")."
    );
    Ok(())
}

async fn cmd_serve(args: &Args) -> Result<(), String> {
    let signer = signer(args)?;
    let sign_id = signer.id().to_string();
    let document = open_doc(args, signer)?;
    let store = FsBlockStore::new(args.data_dir.join("blocks"));
    let devices = Devices::load(&args.data_dir)?.list().to_vec();

    let endpoint = Arc::new(bind_endpoint().await?);
    let relay = online(&endpoint).await;

    println!("safu node online — backup replica + public-share host");
    println!("  signing id:    {sign_id}");
    println!("  transport id:  {}", endpoint.id());
    match &relay {
        Some(url) => println!("  home relay:    {url}"),
        None => println!("  home relay:    (offline — waiting for a relay)"),
    }
    println!("  blocks held:    {}", store.count());
    println!("  linked devices: {}", devices.len());
    for device in &devices {
        // Match each safety number against the one the device shows, the same
        // out-of-band check as the web app's Devices screen.
        println!(
            "    {} — safety number {}",
            short(&device.sign_id),
            safety_number(&sign_id, &device.sign_id)
        );
    }
    println!();
    println!(
        "  pairing code:  {}",
        PairingInfo {
            id: endpoint.id(),
            relay_url: relay,
            sign_id,
        }
        .encode()
    );
    println!();
    println!("Select this node under \"Host shares here\" on a device to publish its");
    println!("public shares through it; they stay reachable while the device is offline.");
    if devices.is_empty() {
        println!("no linked devices yet — `safu-node link <code>` then restart to back them up.");
    }
    spawn_update_check();

    let node = Node::new(endpoint, document, store, doc_path(args), devices);
    node.serve();

    wait_for_shutdown().await;
    println!("\nshutting down — flushing document snapshot");
    node.flush();
    Ok(())
}

async fn cmd_update(args: &Args) -> Result<(), String> {
    let current = release::current_version();
    println!("safu-node {current}");

    let release = match release::latest_release().await {
        Ok(release) => release,
        Err(error) => {
            eprintln!("could not check for updates: {error}");
            println!();
            print_upgrade_instructions();
            return Ok(());
        }
    };

    if !release::is_newer(&release.version, current) {
        if release.version == current {
            println!("you are on the latest release (v{current}).");
        } else {
            // Current is newer than the latest published tag — a dev build.
            println!(
                "you are on v{current}; the latest published release is v{}.",
                release.version
            );
        }
        return Ok(());
    }

    println!("a newer release is available: v{}", release.version);
    if !args.has_flag("--apply") {
        println!();
        println!("Run `safu-node update --apply` to download, verify, and install it,");
        println!("or upgrade manually:");
        println!();
        print_upgrade_instructions();
        return Ok(());
    }

    println!("downloading and verifying v{}…", release.version);
    update::apply(&release).await?;
    println!();
    println!(
        "installed v{}. Restart the node to run it:",
        release.version
    );
    println!(
        "  sudo systemctl restart safu-node   # or your supervisor, or re-run `safu-node serve`"
    );
    Ok(())
}

/// Best-effort, non-blocking "a newer version exists" notice at `serve` startup.
/// Opt out with `SAFU_NODE_NO_UPDATE_CHECK`. Never fatal and never delays the
/// node: a failed or slow check (offline, private repo without a token) is simply
/// silent.
fn spawn_update_check() {
    if std::env::var_os("SAFU_NODE_NO_UPDATE_CHECK").is_some() {
        return;
    }
    tokio::spawn(async {
        if let Ok(latest) = release::latest_version().await {
            if release::is_newer(&latest, release::current_version()) {
                println!("update available: v{latest} — run `safu-node update` for how to upgrade");
            }
        }
    });
}

/// How to upgrade: re-run the installer (which the node does not do itself — it
/// won't overwrite its own running binary), then restart. The reassurance about
/// the data dir is the important part: an upgrade is binary-only.
fn print_upgrade_instructions() {
    if release::target_triple().is_some() {
        let domain = brand::domain();
        println!("To upgrade, re-run the installer, then restart the node:");
        println!("  curl -fsSL https://{domain}/install.sh | sh   # macOS / Linux");
        println!("  irm https://{domain}/install.ps1 | iex        # Windows (PowerShell)");
    } else {
        // No prebuilt asset is published for this host's os/arch.
        println!("No prebuilt binary is published for this host; build from source, then restart:");
        println!("  cargo build --release -p safu-node");
    }
    println!();
    println!("The upgrade is binary-only: your data dir — identity, linked devices,");
    println!("and stored blocks — carries over untouched, so there is no need to link");
    println!("devices again. Under a service manager, `systemctl restart safu-node`");
    println!("(or your supervisor's restart) applies it with a momentary blip only.");
}

// --- helpers ----------------------------------------------------------------

fn signer(args: &Args) -> Result<Signer, String> {
    let passphrase = args.passphrase()?;
    load_or_create_signer(&args.data_dir, &passphrase)
}

fn doc_path(args: &Args) -> PathBuf {
    args.data_dir.join("doc.json")
}

fn open_doc(args: &Args, signer: Signer) -> Result<SyncDoc, String> {
    let snapshot = load_doc(&doc_path(args))?;
    Ok(SyncDoc::open(signer, snapshot))
}

async fn bind_endpoint() -> Result<NativeEndpoint, String> {
    // Serve replication (sync + blocks) and public-share hosting (pin + unpin):
    // the node is both an always-on backup replica and the "Host shares here"
    // target a device pins its public shares to.
    NativeEndpoint::bind(&[SYNC_PROTOCOL, BLOCK_PROTOCOL, PIN_PROTOCOL, UNPIN_PROTOCOL])
        .await
        .map_err(|e| format!("bind transport: {e}"))
}

/// A short, log-friendly prefix of a long hex id (ids are ASCII, so byte-slicing
/// never splits a character).
fn short(id: &str) -> &str {
    &id[..id.len().min(12)]
}

/// A compact, human-readable byte size (e.g. `3.4 MB`) for status/file listings.
/// Exact bytes below 1 KiB; one decimal place above.
fn human_size(bytes: i64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit = 0;
    while size >= 1024.0 && unit < UNITS.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[0])
    } else {
        format!("{size:.1} {}", UNITS[unit])
    }
}

/// Wait (briefly) for the endpoint to select a home relay so its address is
/// dialable; returns `None` if no relay is reachable in time. Local features
/// keep working without it — only dialing peers needs the relay.
async fn online(endpoint: &NativeEndpoint) -> Option<String> {
    tokio::time::timeout(ONLINE_TIMEOUT, endpoint.online())
        .await
        .ok()
        .flatten()
}

#[cfg(unix)]
async fn wait_for_shutdown() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut term = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = term.recv() => {}
    }
}

#[cfg(not(unix))]
async fn wait_for_shutdown() {
    let _ = tokio::signal::ctrl_c().await;
}

fn print_usage() {
    println!(
        "safu-node — headless zero-knowledge backup node & public-share host\n\
\n\
USAGE:\n\
  safu-node <command> [options]\n\
\n\
COMMANDS:\n\
  init                 Create this node's identity and data dir\n\
  info                 Print this node's signing id, address, and pairing code\n\
  link <code>          Authorize a device (its connection code) and remember it\n\
  unlink <signing-id>  Revoke a device's write access and stop backing it up\n\
  list                 List linked devices and their safety numbers\n\
  files                List the files held in this node's backup replica\n\
  status               Print a snapshot: files, blocks held, share pins, devices\n\
  serve                Run the always-on backup node & share host (Ctrl-C to stop)\n\
  update               Check for a newer release (use --apply to install it)\n\
  version              Print the version\n\
\n\
OPTIONS / ENVIRONMENT:\n\
  --data-dir <path>    Directory this node owns        [env SAFU_NODE_DATA_DIR]\n\
                       (default: {DEFAULT_DATA_DIR})\n\
  --passphrase <pass>  Derives this node's identity     [env SAFU_NODE_PASSPHRASE]\n\
                       (required; prefer the env var to keep it out of shell history)\n\
\n\
Run multiple nodes by giving each its own --data-dir."
    );
}

// --- argument parsing -------------------------------------------------------

struct Args {
    command: String,
    positionals: Vec<String>,
    data_dir: PathBuf,
    passphrase: Option<String>,
}

impl Args {
    fn parse(argv: Vec<String>) -> Result<Self, String> {
        let mut command = None;
        let mut positionals = Vec::new();
        let mut data_dir =
            std::env::var("SAFU_NODE_DATA_DIR").unwrap_or_else(|_| DEFAULT_DATA_DIR.into());
        let mut passphrase = std::env::var("SAFU_NODE_PASSPHRASE").ok();

        let mut it = argv.into_iter();
        while let Some(arg) = it.next() {
            match arg.as_str() {
                "--data-dir" => {
                    data_dir = it.next().ok_or("--data-dir needs a value")?;
                }
                "--passphrase" => {
                    passphrase = Some(it.next().ok_or("--passphrase needs a value")?);
                }
                _ if command.is_none() => command = Some(arg),
                _ => positionals.push(arg),
            }
        }

        Ok(Self {
            command: command.unwrap_or_else(|| "help".into()),
            positionals,
            data_dir: PathBuf::from(data_dir),
            passphrase,
        })
    }

    /// Whether a bare flag like `--apply` was passed after the command. (Flags
    /// the parser does not recognize land in `positionals`.)
    fn has_flag(&self, flag: &str) -> bool {
        self.positionals.iter().any(|arg| arg == flag)
    }

    fn positional(&self, index: usize, what: &str) -> Result<&str, String> {
        self.positionals
            .get(index)
            .map(String::as_str)
            .ok_or_else(|| format!("expected {what}"))
    }

    fn passphrase(&self) -> Result<String, String> {
        self.passphrase
            .clone()
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "SAFU_NODE_PASSPHRASE (or --passphrase) is required".into())
    }
}

#[cfg(test)]
mod tests {
    use super::human_size;

    #[test]
    fn human_size_is_exact_bytes_below_a_kib_and_scales_above() {
        assert_eq!(human_size(0), "0 B");
        assert_eq!(human_size(512), "512 B");
        assert_eq!(human_size(1024), "1.0 KB");
        assert_eq!(human_size(2048), "2.0 KB");
        assert_eq!(human_size(5 * 1024 * 1024), "5.0 MB");
        assert_eq!(human_size(1024 * 1024 * 1024), "1.0 GB");
    }
}
