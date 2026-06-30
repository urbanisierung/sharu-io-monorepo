// Top-level view + session machine. Three bookmarkable routes (`/`, `/whitepaper`,
// `/app`) drive the high-level view; within `/app`, a small signal machine walks
// the user from picking/creating/restoring a wallet, through the unlock card, to
// the running app. The runtime (Iroh transport + crypto WASM + OPFS) is created
// per wallet at unlock — never on the landing page — so the marketing pages stay
// instant. No router library, no hooks; state is a handful of signals.
import { signal } from '@preact/signals';
import { App } from './app.js';
import styles from './app.module.css';
import { CliDocs } from './cli-docs.js';
import { Comparison } from './comparison.js';
import { FlowPage } from './flow.js';
import { Landing } from './landing.js';
import { messages } from './messages.js';
import { Navbar } from './navbar.js';
import { NodeOnboarding } from './node-onboarding.js';
import { readPairingFromHash } from './pairing.js';
import { tr as t } from './reading-mode.js';
import { navigate, route } from './router.js';
import { createRuntime, type Runtime } from './runtime.js';
import { ShareViewer } from './share-page.js';
import { UnlockGate } from './unlock-gate.js';
import { activeView } from './view-state.js';
import type { Wallet, WalletMeta } from './wallet.js';
import { createWallet, getWallet, importWallet, listWallets, removeWallet } from './wallet.js';
import { backupFilename, serializeWalletBackup, type WalletBackup } from './wallet-backup.js';
import { WalletPicker } from './wallet-picker.js';
import { Whitepaper } from './whitepaper.js';

// A pairing code waiting to be auto-linked on unlock. Seeded from the URL hash
// (`/app#pair=…`) at load, and also set in-session when the `/link` onboarding
// view hands a node code over without a reload (`linkNode`). Cleared after we
// auto-link, so a refresh doesn't re-trigger it.
const pairCode = signal(readPairingFromHash(globalThis.location?.hash ?? ''));

const runtime = signal<Runtime | null>(null);
const booting = signal(false);
const wallets = signal<readonly WalletMeta[]>([]);
const walletsLoaded = signal(false);
const creating = signal(false);
const pending = signal<{ wallet: Wallet; returning: boolean } | null>(null);

async function refreshWallets(): Promise<void> {
  wallets.value = await listWallets();
}

/** Decide the initial in-app screen the first time the user reaches `/app`. */
function decideInitial(): void {
  if (runtime.value || pending.value || creating.value) return;
  if (wallets.value.length === 0) {
    creating.value = true;
    return;
  }
  // A pairing link: let the user open (or create) a wallet, then auto-link.
  if (pairCode.value) return;
  // A single wallet opens straight away; the card's "use another wallet" link
  // still reaches the picker. More than one always asks.
  const only = wallets.value.length === 1 ? wallets.value[0] : undefined;
  if (only) void openWallet(only.id);
}

/** Bootstrap the session: load the wallet list, then resolve the first in-app
 *  screen. Called once from the client entry (`main.tsx`) — never at import time,
 *  so `Root` can be imported for server-side prerendering without side effects. */
export async function init(): Promise<void> {
  await refreshWallets();
  walletsLoaded.value = true;
  if (pairCode.value && route.value !== 'app') navigate('app');
  if (route.value === 'app') decideInitial();
}

/** From the landing/whitepaper CTAs: go to the app and choose a wallet. */
function launch(): void {
  navigate('app');
  if (walletsLoaded.value) decideInitial();
}

/** Continue from the `/link` onboarding view into the app and link the node —
 *  a soft SPA transition, no reload. If a wallet is already unlocked, link the
 *  node right away and surface it under Devices; otherwise stash the code so the
 *  next unlock auto-links it (the same path a `#pair=` deep link takes). The hash
 *  is dropped because the code now lives in the signal, not the URL. */
function linkNode(code: string): void {
  const rt = runtime.value;
  if (rt) {
    void rt.pairWithCode(code).catch(() => {});
    activeView.value = 'devices';
  } else {
    pairCode.value = code;
  }
  navigate('app', { dropHash: true });
  if (walletsLoaded.value) decideInitial();
}

function clearPairHash(): void {
  if (typeof history !== 'undefined') history.replaceState(null, '', '/app');
}

/** Create the runtime for `wallet`, unlock it with `password`, and reveal the
 *  app. Rejects (propagating to the unlock card) on a wrong password. Auto-links
 *  a device when arriving from a pairing URL. */
async function unlockInto(wallet: Wallet, password: string): Promise<void> {
  const rt = await createRuntime(wallet);
  try {
    await rt.unlock(password);
  } catch (cause) {
    await rt.close();
    throw cause;
  }
  runtime.value = rt;
  pending.value = null;
  creating.value = false;
  const code = pairCode.value;
  if (code) {
    // Best-effort: if the code is malformed the Devices panel still has it
    // prefilled for a manual retry, so never block entering the app.
    await rt.pairWithCode(code).catch(() => {});
    pairCode.value = undefined;
    clearPairHash();
  }
  await refreshWallets();
}

async function openWallet(id: string): Promise<void> {
  const wallet = await getWallet(id);
  if (!wallet) return;
  creating.value = false;
  pending.value = { wallet, returning: wallet.signerId !== undefined };
}

function startCreate(): void {
  pending.value = null;
  creating.value = true;
}

function backToPicker(): void {
  pending.value = null;
  creating.value = false;
}

async function submitCreate(password: string, name: string): Promise<void> {
  const wallet = await createWallet(name);
  try {
    await unlockInto(wallet, password);
  } catch (cause) {
    // Roll back the half-created wallet so a failed first unlock leaves no trace.
    await removeWallet(wallet.id);
    await refreshWallets();
    throw cause;
  }
}

async function submitUnlock(password: string): Promise<void> {
  const target = pending.value;
  if (!target) return;
  await unlockInto(target.wallet, password);
}

async function restore(backup: WalletBackup): Promise<void> {
  booting.value = true;
  try {
    const wallet = await importWallet(backup.name, backup.salt);
    await refreshWallets();
    await unlockInto(wallet, backup.password);
  } finally {
    booting.value = false;
  }
}

/** Lock the active wallet and return to the picker so another can be opened. */
async function switchWallet(): Promise<void> {
  const rt = runtime.value;
  runtime.value = null;
  pending.value = null;
  creating.value = false;
  if (rt) await rt.close();
  await refreshWallets();
}

function downloadWalletBackup(): void {
  const rt = runtime.value;
  if (!rt) return;
  const text = serializeWalletBackup(rt.backup());
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = backupFilename(rt.walletName);
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Restore a file and hand it to the browser as a download. Rejects if the file
 *  cannot be decrypted (e.g. a different passphrase) so the UI can surface it. */
async function download(path: string): Promise<void> {
  const ready = runtime.value;
  if (!ready) return;
  const bytes = await ready.restore(path);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = path;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AppScreen() {
  const ready = runtime.value;
  if (ready) {
    return (
      <App
        controller={ready.controller}
        files={ready.files}
        peers={ready.peers}
        connectionCode={ready.connectionCode}
        onBackup={downloadWalletBackup}
        onSwitchWallet={() => void switchWallet()}
        onRestore={(path) => download(path)}
        onDelete={(path) => ready.remove(path)}
        onShare={(path) => ready.publishShare(path)}
        onPublishSite={(files) => ready.publishSiteShare(files)}
        publishedShares={ready.publishedShares}
        onUnpublish={(root) => ready.unpublishShare(root)}
        shareHostId={ready.shareHostId}
        onSetShareHost={(id) => ready.setShareHost(id)}
        onPair={(code) => ready.pairWithCode(code)}
        onVerify={(id) => ready.verifyPeer(id)}
        onReject={(id) => ready.rejectPeer(id)}
        onRename={(id, name) => ready.renameDevice(id, name)}
        onWatch={ready.watchFolder}
      />
    );
  }

  if (booting.value || !walletsLoaded.value) {
    return <main class={styles.booting}>{t(messages.booting)}</main>;
  }

  if (creating.value) {
    return (
      <UnlockGate
        mode="create"
        pairing={Boolean(pairCode.value)}
        onSubmit={submitCreate}
        onBack={wallets.value.length > 0 ? backToPicker : undefined}
      />
    );
  }

  const target = pending.value;
  if (target) {
    return (
      <UnlockGate
        mode={target.returning ? 'unlock' : 'create'}
        walletName={target.wallet.name}
        pairing={Boolean(pairCode.value) && !target.returning}
        onSubmit={(password) => submitUnlock(password)}
        onBack={backToPicker}
      />
    );
  }

  return (
    <WalletPicker
      wallets={wallets.value}
      onOpen={(id) => void openWallet(id)}
      onCreate={startCreate}
      onRestore={(backup) => void restore(backup)}
    />
  );
}

/** The route's content, beneath the global navbar. */
function RouteContent() {
  const view = route.value;
  if (view === 'landing') {
    return (
      <Landing
        onLaunch={launch}
        onWhitepaper={() => navigate('whitepaper')}
        onComparison={() => navigate('comparison')}
        onFlow={() => navigate('how-it-works')}
        onCliDocs={() => navigate('cli-docs')}
      />
    );
  }
  if (view === 'whitepaper') {
    return <Whitepaper onLaunch={launch} />;
  }
  if (view === 'comparison') {
    return <Comparison onLaunch={launch} />;
  }
  if (view === 'how-it-works') {
    return <FlowPage onLaunch={launch} />;
  }
  if (view === 'cli-docs') {
    return <CliDocs onLaunch={launch} />;
  }
  // The backup-node onboarding companion: opened from the deep link
  // `safu-node serve` prints. Continuing hands the node code to the app's
  // auto-link-on-unlock path as a soft SPA transition (see `linkNode`).
  if (view === 'link') {
    return <NodeOnboarding onContinue={linkNode} onCliDocs={() => navigate('cli-docs')} />;
  }
  // The keyless share viewer renders with no wallet/unlock — the runtime is
  // never created here, so opening a public link stays instant and anonymous.
  if (view === 'share') {
    return <ShareViewer />;
  }
  return <AppScreen />;
}

export function Root() {
  return (
    <>
      <Navbar route={route.value} runtime={runtime.value} onLaunch={launch} />
      <RouteContent />
    </>
  );
}
