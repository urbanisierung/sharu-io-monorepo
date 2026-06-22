// Top-level view + session machine. Three bookmarkable routes (`/`, `/whitepaper`,
// `/app`) drive the high-level view; within `/app`, a small signal machine walks
// the user from picking/creating/restoring a wallet, through the unlock card, to
// the running app. The runtime (Iroh transport + crypto WASM + OPFS) is created
// per wallet at unlock — never on the landing page — so the marketing pages stay
// instant. No router library, no hooks; state is a handful of signals.
import { t } from '@cascivo/i18n';
import { signal } from '@preact/signals';
import { App } from './app.js';
import styles from './app.module.css';
import { Landing } from './landing.js';
import { messages } from './messages.js';
import { readPairingFromHash } from './pairing.js';
import { navigate, route } from './router.js';
import { createRuntime, type Runtime } from './runtime.js';
import { UnlockGate } from './unlock-gate.js';
import type { Wallet, WalletMeta } from './wallet.js';
import { createWallet, getWallet, importWallet, listWallets, removeWallet } from './wallet.js';
import { backupFilename, serializeWalletBackup, type WalletBackup } from './wallet-backup.js';
import { WalletPicker } from './wallet-picker.js';
import { Whitepaper } from './whitepaper.js';

// A pairing code carried in the URL hash (`/app#pair=…`). Read once at load,
// then cleared after we auto-link, so a refresh doesn't re-trigger it.
const pairCode = readPairingFromHash(globalThis.location?.hash ?? '');

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
  if (pairCode) return;
  // A single wallet opens straight away; the card's "use another wallet" link
  // still reaches the picker. More than one always asks.
  const only = wallets.value.length === 1 ? wallets.value[0] : undefined;
  if (only) void openWallet(only.id);
}

async function init(): Promise<void> {
  await refreshWallets();
  walletsLoaded.value = true;
  if (pairCode && route.value !== 'app') navigate('app');
  if (route.value === 'app') decideInitial();
}
void init();

/** From the landing/whitepaper CTAs: go to the app and choose a wallet. */
function launch(): void {
  navigate('app');
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
  if (pairCode) {
    // Best-effort: if the code is malformed the Devices panel still has it
    // prefilled for a manual retry, so never block entering the app.
    await rt.pairWithCode(pairCode).catch(() => {});
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
        syncStatus={ready.syncStatus}
        connectionCode={ready.connectionCode}
        walletName={ready.walletName}
        onBackup={downloadWalletBackup}
        onSwitchWallet={() => void switchWallet()}
        onRestore={(path) => download(path)}
        onDelete={(path) => ready.remove(path)}
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
        pairing={Boolean(pairCode)}
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
        pairing={Boolean(pairCode) && !target.returning}
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

export function Root() {
  const view = route.value;
  if (view === 'landing') {
    return <Landing onLaunch={launch} onWhitepaper={() => navigate('whitepaper')} />;
  }
  if (view === 'whitepaper') {
    return <Whitepaper onBack={() => navigate('landing')} onLaunch={launch} />;
  }
  return <AppScreen />;
}
