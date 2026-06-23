//! `safu-node` — a headless, always-on, zero-knowledge backup node for the
//! command line.
//!
//! It is the project's answer to "permanent storage" on a server with no
//! browser: pair it with your devices and it holds a full *ciphertext* replica
//! of everything they back up — the equivalent of an IPFS pinning node, but
//! zero-knowledge (only ciphertext is ever stored) and over Iroh (no DHT).
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

mod config;
mod doc;
mod identity;
mod pairing;
mod store;
mod sync;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use safu_transport::native::NativeEndpoint;

use crate::config::Devices;
use crate::doc::SyncDoc;
use crate::identity::{load_or_create_signer, Signer};
use crate::pairing::PairingInfo;
use crate::store::{load_doc, save_doc, FsBlockStore};
use crate::sync::{Node, BLOCK_PROTOCOL, SYNC_PROTOCOL};

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
    match args.command.as_str() {
        "init" => cmd_init(&args),
        "info" => cmd_info(&args).await,
        "link" => cmd_link(&args),
        "unlink" => cmd_unlink(&args),
        "list" => cmd_list(&args),
        "serve" | "run" => cmd_serve(&args).await,
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

    // Authorize the device's signing id in the document (so its signed entries
    // are accepted), and remember its transport address so `serve` can dial it.
    let mut document = open_doc(args, signer)?;
    document.add_writer(&info.sign_id);
    save_doc(&doc_path(args), &document.serialize())?;

    let mut devices = Devices::load(&args.data_dir)?;
    let sign_id = info.sign_id.clone();
    devices.add(info)?;

    println!("linked device {sign_id}");
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
    println!("linked devices:");
    for device in devices.list() {
        println!("  signing id:   {}", device.sign_id);
        println!("  transport id: {}", device.id);
        println!(
            "  relay:        {}",
            device.relay_url.as_deref().unwrap_or("(none)")
        );
        println!();
    }
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

    println!("safu node online");
    println!("  signing id:    {sign_id}");
    println!("  transport id:  {}", endpoint.id());
    match &relay {
        Some(url) => println!("  home relay:    {url}"),
        None => println!("  home relay:    (offline — waiting for a relay)"),
    }
    println!("  linked devices: {}", devices.len());
    println!("  blocks held:    {}", store.count());
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
    if devices.is_empty() {
        println!("no linked devices yet — `safu-node link <code>` then restart to back them up.");
    }

    let node = Node::new(endpoint, document, store, doc_path(args), devices);
    node.serve();

    wait_for_shutdown().await;
    println!("\nshutting down — flushing document snapshot");
    node.flush();
    Ok(())
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
    NativeEndpoint::bind(&[SYNC_PROTOCOL, BLOCK_PROTOCOL])
        .await
        .map_err(|e| format!("bind transport: {e}"))
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
        "safu-node — headless zero-knowledge backup node\n\
\n\
USAGE:\n\
  safu-node <command> [options]\n\
\n\
COMMANDS:\n\
  init                 Create this node's identity and data dir\n\
  info                 Print this node's signing id, address, and pairing code\n\
  link <code>          Authorize a device (its connection code) and remember it\n\
  unlink <signing-id>  Revoke a device's write access and stop backing it up\n\
  list                 List linked devices\n\
  serve                Run the always-on backup node (Ctrl-C to stop)\n\
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
