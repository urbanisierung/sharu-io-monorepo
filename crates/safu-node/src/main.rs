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
//! Configure entirely from the terminal. The quickest start is a single command:
//! on a terminal, `serve` creates the identity if needed, prints this node's
//! pairing code, walks you through linking each device, then runs.
//!
//! ```text
//!   export SAFU_NODE_PASSPHRASE=…   # derives this node's identity
//!   safu-node serve                 # guided first run, then always-on
//! ```
//!
//! The individual steps remain available for scripting or headless setups:
//! `init`, `info`, `link <device-connection-code>`, `list`, `files`, `status`.

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
mod tui;
mod update;

use std::fs;
use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};
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
        "init" | "info" | "link" | "unlink" | "list" | "files" | "status" | "tui" | "serve" | "run"
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
        "tui" => cmd_tui(&args),
        "reset" => cmd_reset(&args),
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
    let code = info.encode();
    println!();
    println!("Open this link in a browser to pair step by step:");
    println!("  {}", web_link(&code));
    println!();
    println!("…or paste this node's code into the web app's Devices › Link field:");
    println!("  {code}");
    Ok(())
}

/// The browser onboarding deep link for a node pairing code: it opens the web
/// app's guided `/link` view (see `apps/web/src/node-onboarding.tsx`) with the
/// code in the URL hash. The code is URL-safe base64, so it needs no escaping;
/// the hash never leaves the browser. Mirrors `pairing.ts` `nodeLink`.
fn web_link(code: &str) -> String {
    format!("https://{}/link#node={code}", brand::domain())
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

/// Run the live full-screen dashboard (see `tui.rs`): the refreshing,
/// terminal-native counterpart of `status`/`files`. It needs this node's signing
/// id to show each device's safety number, hence the passphrase, as for `serve`.
fn cmd_tui(args: &Args) -> Result<(), String> {
    let signer = signer(args)?;
    tui::run(&args.data_dir, signer.id())
}

/// Wipe this node's state so the operator can start from scratch: delete the
/// identity, replicated document, linked-device list, format marker, and every
/// stored ciphertext block. Irreversible and not gated on the on-disk format
/// (so it can recover a dir a newer binary wrote), it requires confirmation —
/// an interactive "type reset" prompt, or `--force` for non-interactive use.
fn cmd_reset(args: &Args) -> Result<(), String> {
    let dir = &args.data_dir;
    if !dir.exists() {
        println!("nothing to reset — {} does not exist", dir.display());
        return Ok(());
    }

    if !args.has_flag("--force") {
        if !io::stdin().is_terminal() {
            return Err(
                "reset is irreversible; re-run with --force to confirm (no terminal to prompt)"
                    .into(),
            );
        }
        println!("This permanently deletes this node's identity, linked devices, and every");
        println!("stored ciphertext block under:");
        println!("  {}", dir.display());
        println!();
        println!("Every device will have to be paired again. This cannot be undone.");
        let confirmed =
            prompt("Type \"reset\" to confirm: ")?.is_some_and(|answer| answer == "reset");
        if !confirmed {
            println!("aborted — nothing was deleted.");
            return Ok(());
        }
    }

    let removed = reset_data_dir(dir)?;
    if removed == 0 {
        println!("nothing to reset — no node data found in {}", dir.display());
    } else {
        println!("reset complete — removed node data from {}", dir.display());
        println!("run `safu-node serve` to set the node up again from scratch.");
    }
    Ok(())
}

/// Delete every artifact this node writes under `dir` (identity, document,
/// linked devices, format marker, and the block store), leaving the directory
/// itself and any unrelated contents in place. Returns how many existed, so the
/// caller can tell a real reset from a no-op. Absent artifacts are not an error.
fn reset_data_dir(dir: &Path) -> Result<usize, String> {
    let mut removed = 0;
    for name in ["doc.json", "doc.json.tmp", "devices.json", "meta.json"] {
        let path = dir.join(name);
        match fs::remove_file(&path) {
            Ok(()) => removed += 1,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("remove {}: {e}", path.display())),
        }
    }
    for name in ["identity", "blocks"] {
        let path = dir.join(name);
        match fs::remove_dir_all(&path) {
            Ok(()) => removed += 1,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("remove {}: {e}", path.display())),
        }
    }
    Ok(removed)
}

async fn cmd_serve(args: &Args) -> Result<(), String> {
    let signer = signer(args)?;
    let sign_id = signer.id().to_string();
    let mut document = open_doc(args, signer)?;
    let store = FsBlockStore::new(args.data_dir.join("blocks"));
    let mut devices = Devices::load(&args.data_dir)?;

    let endpoint = Arc::new(bind_endpoint().await?);
    let relay = online(&endpoint).await;
    let pairing_code = PairingInfo {
        id: endpoint.id(),
        relay_url: relay.clone(),
        sign_id: sign_id.clone(),
    }
    .encode();

    // First-run onboarding: when attached to a terminal and nothing is linked
    // yet, walk the operator through pairing before serving — print the node's
    // code to paste into the web app, then prompt for each device's code and
    // confirm its safety number. Under a service manager (no TTY) this is skipped
    // entirely, so a headless `serve` behaves exactly as before.
    if io::stdin().is_terminal() && devices.list().is_empty() {
        onboard(
            &mut document,
            &mut devices,
            &doc_path(args),
            &sign_id,
            &pairing_code,
        )?;
    }
    let devices = devices.list().to_vec();

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
    println!("  pairing code:  {pairing_code}");
    println!("  browser link:  {}", web_link(&pairing_code));
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

/// Interactive first-run pairing, run by `serve` on a terminal when no device is
/// linked yet. Prints the node's pairing code to paste into the web app, then
/// reads device connection codes from stdin and links each one the operator
/// confirms by safety number — mutating `document`/`devices` and persisting as it
/// goes, so the node then serves already paired. An empty line (or Ctrl-D) ends
/// the loop and starts serving.
fn onboard(
    document: &mut SyncDoc,
    devices: &mut Devices,
    doc_path: &Path,
    node_id: &str,
    pairing_code: &str,
) -> Result<(), String> {
    println!("Welcome — let's pair this node with your devices before it starts serving.\n");
    println!("1. Open this link in a browser to pair step by step:\n");
    println!("     {}\n", web_link(pairing_code));
    println!("   (or paste this node's code into the web app's Devices › Link field:)\n");
    println!("     {pairing_code}\n");
    println!("2. Then use \"Copy code\" in the web app's Devices view and paste it");
    println!("   here. Link as many devices as you like; press Enter when you're done.\n");

    loop {
        let Some(code) = prompt("Device code (Enter to start serving): ")? else {
            break; // Ctrl-D
        };
        if code.is_empty() {
            break;
        }
        match prepare_link(node_id, &code) {
            Err(reason) => println!("  {reason}\n"),
            Ok((info, sas)) => {
                println!("  safety number: {sas}");
                let confirmed =
                    prompt("  Does this match the number shown on the device? [y/N]: ")?
                        .is_some_and(|answer| {
                            matches!(answer.to_ascii_lowercase().as_str(), "y" | "yes")
                        });
                if confirmed {
                    let label = short(&info.sign_id).to_string();
                    document.add_writer(&info.sign_id);
                    devices.add(info)?;
                    save_doc(doc_path, &document.serialize())?;
                    println!("  linked device {label}\n");
                } else {
                    println!("  skipped — codes must match to link safely\n");
                }
            }
        }
    }
    if devices.list().is_empty() {
        println!("No devices linked — you can add one anytime with `safu-node link <code>`.\n");
    }
    Ok(())
}

/// Print `label` without a trailing newline, flush it, and read one trimmed line
/// from stdin. `Ok(None)` signals end-of-input (Ctrl-D); `Ok(Some(_))` is the
/// trimmed line (possibly empty if the user just pressed Enter).
fn prompt(label: &str) -> Result<Option<String>, String> {
    print!("{label}");
    io::stdout()
        .flush()
        .map_err(|e| format!("flush stdout: {e}"))?;
    let mut line = String::new();
    let read = io::stdin()
        .read_line(&mut line)
        .map_err(|e| format!("read stdin: {e}"))?;
    if read == 0 {
        return Ok(None);
    }
    Ok(Some(line.trim().to_string()))
}

/// Validate a pasted device connection code for linking: decode it, reject this
/// node's own code, and return it alongside the safety number to confirm out of
/// band. Pure (no IO), so the onboarding flow's core decision is unit-testable.
fn prepare_link(node_id: &str, code: &str) -> Result<(PairingInfo, String), String> {
    let info = PairingInfo::decode(code)?;
    if info.sign_id == node_id {
        return Err("that's this node's own code — paste a *device's* code instead".into());
    }
    let sas = safety_number(node_id, &info.sign_id).to_string();
    Ok((info, sas))
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
  tui                  Live full-screen dashboard of the node (refreshes; q to quit)\n\
  reset                Delete all node data (identity, devices, blocks) and start over\n\
  serve                Run the node; first run on a terminal guides pairing (Ctrl-C to stop)\n\
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
    use super::{human_size, prepare_link, safety_number, PairingInfo};

    fn code(sign_id: &str) -> String {
        PairingInfo {
            id: "transport-endpoint-id".into(),
            relay_url: Some("https://relay.example/".into()),
            sign_id: sign_id.into(),
        }
        .encode()
    }

    #[test]
    fn prepare_link_accepts_a_foreign_code_and_returns_its_safety_number() {
        let (info, sas) = prepare_link("node-sign-id", &code("device-sign-id")).expect("linkable");
        assert_eq!(info.sign_id, "device-sign-id");
        assert_eq!(
            sas,
            safety_number("node-sign-id", "device-sign-id").to_string()
        );
    }

    #[test]
    fn prepare_link_rejects_this_nodes_own_code() {
        assert!(prepare_link("node-sign-id", &code("node-sign-id")).is_err());
    }

    #[test]
    fn prepare_link_rejects_a_malformed_code() {
        assert!(prepare_link("node-sign-id", "not-a-pairing-code!!").is_err());
    }

    #[test]
    fn web_link_wraps_a_code_in_the_browser_onboarding_deep_link() {
        let url = super::web_link("ABC-123_code");
        assert!(url.starts_with("https://"));
        assert!(url.contains(super::brand::domain()));
        // The code is URL-safe base64, so it rides the hash verbatim — no escaping.
        assert!(url.ends_with("/link#node=ABC-123_code"));
    }

    #[test]
    fn human_size_is_exact_bytes_below_a_kib_and_scales_above() {
        assert_eq!(human_size(0), "0 B");
        assert_eq!(human_size(512), "512 B");
        assert_eq!(human_size(1024), "1.0 KB");
        assert_eq!(human_size(2048), "2.0 KB");
        assert_eq!(human_size(5 * 1024 * 1024), "5.0 MB");
        assert_eq!(human_size(1024 * 1024 * 1024), "1.0 GB");
    }

    #[test]
    fn reset_removes_node_artifacts_keeps_unrelated_and_is_idempotent() {
        use std::fs;
        let dir = std::env::temp_dir().join(format!("safu-reset-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("identity")).unwrap();
        fs::create_dir_all(dir.join("blocks")).unwrap();
        fs::write(dir.join("identity/signer.salt"), b"salt").unwrap();
        fs::write(dir.join("blocks/deadbeef"), b"ciphertext").unwrap();
        fs::write(dir.join("doc.json"), "{}").unwrap();
        fs::write(dir.join("devices.json"), "[]").unwrap();
        fs::write(dir.join("meta.json"), r#"{"format":1}"#).unwrap();
        fs::write(dir.join("unrelated.txt"), b"keep me").unwrap();

        // doc.json, devices.json, meta.json, identity/, blocks/ = 5 artifacts.
        assert_eq!(super::reset_data_dir(&dir).unwrap(), 5);
        assert!(!dir.join("doc.json").exists());
        assert!(!dir.join("identity").exists());
        assert!(!dir.join("blocks").exists());
        // Unrelated content (and the dir itself) is left untouched.
        assert!(dir.join("unrelated.txt").exists());
        // A second reset finds nothing to remove.
        assert_eq!(super::reset_data_dir(&dir).unwrap(), 0);

        let _ = fs::remove_dir_all(&dir);
    }
}
