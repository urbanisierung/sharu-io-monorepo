// Top-level view switch: the landing page first, then the app once the user
// launches it. The runtime (Iroh transport + crypto WASM + OPFS) is created
// lazily on launch — the landing page stays instant and dependency-free. State
// is two signals; no router, no hooks.
import { t } from '@cascivo/i18n';
import { signal } from '@preact/signals';
import { App } from './app.js';
import styles from './app.module.css';
import { Landing } from './landing.js';
import { messages } from './messages.js';
import { createRuntime, type Runtime } from './runtime.js';
import { Whitepaper } from './whitepaper.js';

const view = signal<'landing' | 'whitepaper' | 'app'>('landing');
const runtime = signal<Runtime | null>(null);
let started = false;

function launch(): void {
  view.value = 'app';
  if (started) return;
  started = true;
  void createRuntime().then((ready) => {
    runtime.value = ready;
  });
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

export function Root() {
  if (view.value === 'landing') {
    return <Landing onLaunch={launch} onWhitepaper={() => (view.value = 'whitepaper')} />;
  }

  if (view.value === 'whitepaper') {
    return <Whitepaper onBack={() => (view.value = 'landing')} onLaunch={launch} />;
  }

  const ready = runtime.value;
  if (!ready) return <main class={styles.booting}>{t(messages.booting)}</main>;

  return (
    <App
      controller={ready.controller}
      files={ready.files}
      peers={ready.peers}
      syncStatus={ready.syncStatus}
      returning={ready.returning}
      connectionCode={ready.connectionCode}
      onUnlock={(password) => ready.unlock(password)}
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
