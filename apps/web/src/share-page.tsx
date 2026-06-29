// The keyless public-share viewer (docs/public-share.md, phase 4) at `/s`. It
// needs no wallet, no unlock, no runtime: it reads the share from the URL
// fragment, opens it (fetch ciphertext over Iroh, decrypt in-browser with the
// fragment key, verify each block against its hash), and renders by contentType.
// All network + crypto is the injectable `open`; the component is pure view +
// a one-shot load, so tests drive it without a transport.

import { signal } from '@preact/signals';
import { formatBytes } from './format.js';
import { shareView } from './messages.js';
import { tr as t } from './reading-mode.js';
import { decodeShareCode, readShareFromHash } from './share-code.js';
import styles from './share-page.module.css';
import { type OpenedFile, type OpenedSite, openShareOverIroh } from './share-viewer.js';
import { mountSite } from './site-mount.js';
import { Button } from './ui/button.js';

/** Open a share from its raw fragment code. The default decodes the code and
 *  opens it over Iroh; tests inject a fake to bypass the network + the codec. */
type Opener = (code: string) => Promise<OpenedFile | OpenedSite>;
const defaultOpen: Opener = (code) => openShareOverIroh(decodeShareCode(code));
/** Mount a site share (register the SW + wire lazy fetch), returning the URL to
 *  load it at. Injectable so tests can assert mounting without a service worker. */
type Mounter = (site: OpenedSite) => Promise<string>;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; opened: OpenedFile; url: string }
  | { kind: 'site'; url?: string }
  | { kind: 'missing' }
  | { kind: 'failed' };

const state = signal<State>({ kind: 'loading' });
let started = false;
// The live site (its transport serves lazy fetches); released on reset.
let activeSite: OpenedSite | undefined;
// How to (re)open this share, so the failed state can offer a one-tap retry —
// the most common failure is a transient relay dial, which simply succeeds next try.
let lastLoad: { code: string | undefined; open: Opener; mount: Mounter } | undefined;

/** Reset the module-level view state — for deterministic tests. */
export function resetShareViewer(): void {
  if (state.value.kind === 'ready') URL.revokeObjectURL(state.value.url);
  void activeSite?.close().catch(() => {});
  activeSite = undefined;
  state.value = { kind: 'loading' };
  started = false;
  lastLoad = undefined;
}

/** Re-run the last open attempt from the failed state (transient network/relay). */
function retry(): void {
  if (!lastLoad) return;
  state.value = { kind: 'loading' };
  void load(lastLoad.code, lastLoad.open, lastLoad.mount);
}

async function load(code: string | undefined, open: Opener, mount: Mounter): Promise<void> {
  lastLoad = { code, open, mount };
  if (!code) {
    state.value = { kind: 'missing' };
    return;
  }
  try {
    const opened = await open(code);
    if (opened.kind === 'site') {
      // Hand off to the service worker, which serves the site lazily; render it
      // in a sandboxed iframe while this page stays alive to decrypt on demand.
      state.value = { kind: 'site' };
      activeSite = opened;
      state.value = { kind: 'site', url: await mount(opened) };
      return;
    }
    const type = opened.manifest.contentType || 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([opened.bytes as BlobPart], { type }));
    state.value = { kind: 'ready', opened, url };
  } catch {
    void activeSite?.close().catch(() => {});
    activeSite = undefined;
    state.value = { kind: 'failed' };
  }
}

export interface ShareViewerProps {
  /** The raw share code; defaults to the URL fragment. Injectable for tests. */
  code?: string;
  /** Opens the share; defaults to the Iroh-backed loader. Injectable for tests. */
  open?: Opener;
  /** Mounts a site share; defaults to the real cache + service-worker mount. */
  mount?: Mounter;
}

export function ShareViewer({ code, open = defaultOpen, mount = mountSite }: ShareViewerProps) {
  if (!started) {
    started = true;
    void load(code ?? readShareFromHash(globalThis.location?.hash ?? ''), open, mount);
  }
  const s = state.value;

  return (
    <main class={styles.page}>
      {s.kind === 'loading' && (
        <div class={styles.center}>
          <h1 class={styles.title}>{t(shareView.loading)}</h1>
          <p class={styles.hint}>{t(shareView.loadingHint)}</p>
        </div>
      )}

      {s.kind === 'site' &&
        (s.url ? (
          // Untrusted site content: sandbox to an opaque origin (allow-scripts
          // but not allow-same-origin) so it can render and navigate but cannot
          // reach this origin's storage. The service worker still serves it.
          <iframe
            class={styles.site}
            src={s.url}
            title={t(shareView.siteFrame)}
            sandbox="allow-scripts allow-forms allow-popups"
          />
        ) : (
          <div class={styles.center}>
            <h1 class={styles.title}>{t(shareView.siteTitle)}</h1>
            <p class={styles.hint}>{t(shareView.siteBody)}</p>
          </div>
        ))}

      {s.kind === 'missing' && (
        <div class={styles.center}>
          <h1 class={styles.title}>{t(shareView.missingTitle)}</h1>
          <p class={styles.hint}>{t(shareView.missingBody)}</p>
        </div>
      )}

      {s.kind === 'failed' && (
        <div class={styles.center}>
          <h1 class={styles.title}>{t(shareView.failedTitle)}</h1>
          <p class={styles.hint}>{t(shareView.failedBody)}</p>
          <Button intent="primary" class={styles.retry} onClick={retry}>
            {t(shareView.retry)}
          </Button>
        </div>
      )}

      {s.kind === 'ready' && (
        <article class={styles.file}>
          <p class={styles.eyebrow}>{t(shareView.sharedWithYou)}</p>
          <header class={styles.head}>
            <h1 class={styles.name}>{s.opened.manifest.name}</h1>
            <span class={styles.meta}>{formatBytes(s.opened.manifest.size)}</span>
            <a class={styles.download} href={s.url} download={s.opened.manifest.name}>
              {t(shareView.download)}
            </a>
          </header>
          <Preview opened={s.opened} url={s.url} />
          <p class={styles.note}>{t(shareView.zeroKnowledge)}</p>
        </article>
      )}
    </main>
  );
}

/** Inline preview for the common renderable types; other types are
 *  download-only (the header always offers the download). */
function Preview({ opened, url }: { opened: OpenedFile; url: string }) {
  const type = opened.manifest.contentType;
  if (type.startsWith('image/')) {
    return <img class={styles.media} src={url} alt={opened.manifest.name} />;
  }
  if (type === 'application/pdf') {
    return <iframe class={styles.frame} src={url} title={opened.manifest.name} />;
  }
  if (type.startsWith('text/')) {
    return <pre class={styles.text}>{new TextDecoder().decode(opened.bytes)}</pre>;
  }
  return null;
}
