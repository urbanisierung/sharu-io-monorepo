// The web app shell (plan §2.4): a thin, signal-driven UI over the SDK. Domain
// state (the synced file list, peer list, sync status) arrives as signals and is
// read directly; user intents go back through the IngestController. No store, no
// bridge, no useState/useEffect. All copy via @cascivo/i18n.
//
// The shell is split into focused views — Files (the main use case: browsing and
// adding backed-up files), Devices (pairing), and Settings (wallet + watched
// folders) — selected from one navigation bar. That bar is a row of tabs on the
// desktop and a fixed bottom bar on a phone, so every view is one tap away while
// the file list stays the centre of attention.
import { cn } from '@cascivo/core';
import { type ReadonlySignal, signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import styles from './app.module.css';
import { Devices } from './devices.js';
import { FileTable } from './file-table.js';
import type { IngestController } from './ingest-controller.js';
import { IngestProgress } from './ingest-progress.js';
import { messages } from './messages.js';
import { PublishedShares } from './published-shares.js';
import { tr as t } from './reading-mode.js';
import type { PeerInfo } from './runtime.js';
import type { PublishedShare } from './shares-store.js';
import { SiteShare } from './site-share.js';
import { StatusBanner } from './status-banner.js';
import { Button } from './ui/button.js';
import { DropZone } from './ui/drop-zone.js';
import { type AppView, activeView } from './view-state.js';

export interface AppProps {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  /** This device's connection code (a signal — empty until unlock derives it). */
  connectionCode?: ReadonlySignal<string>;
  /** Download a portable backup of the active wallet. */
  onBackup?: () => void;
  /** Lock the active wallet and return to the wallet picker. */
  onSwitchWallet?: () => void;
  onRestore?: (path: string) => Promise<void>;
  onDelete?: (path: string) => void;
  /** Publish a file as a public share, resolving to the openable link. */
  onShare?: (path: string) => Promise<string>;
  /** Publish a folder of files as a navigable public site. */
  onPublishSite?: (files: readonly File[]) => Promise<string>;
  /** The public shares this device has published, for re-copy + revoke. */
  publishedShares?: ReadonlySignal<readonly PublishedShare[]>;
  /** Revoke a published share (unpin from the node + drop the listing). */
  onUnpublish?: (root: string) => Promise<void>;
  /** The signing id of the peer chosen to host public shares. */
  shareHostId?: ReadonlySignal<string | undefined>;
  /** Choose which paired peer hosts public shares. */
  onSetShareHost?: (id: string) => void;
  onPair?: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Give a paired device a friendly local name. */
  onRename?: (id: string, name: string) => void;
  /** Desktop only: start watching a folder for auto-backup. */
  onWatch?: (path: string) => Promise<void>;
}

const draftWatchPath = signal('');

/** Reset the module-level view state — for deterministic tests. */
export function resetAppView(): void {
  activeView.value = 'files';
  draftWatchPath.value = '';
}

export function App({
  controller,
  files,
  peers,
  connectionCode,
  onBackup,
  onSwitchWallet,
  onRestore,
  onDelete,
  onShare,
  onPublishSite,
  publishedShares,
  onUnpublish,
  shareHostId,
  onSetShareHost,
  onPair,
  onVerify,
  onReject,
  onRename,
  onWatch,
}: AppProps) {
  const phase = controller.phase.value;
  // The section (Files / Devices / Settings) is chosen from the global navbar's
  // tabs; this shell renders the active section's content. A section with no
  // backing handlers simply renders nothing.
  const view: AppView = activeView.value;

  return (
    <div class={styles.app}>
      <main class={styles.content}>
        {view === 'files' && (
          <>
            {/* The file list leads — it is the whole point of the app. A drag
                anywhere over this surface reveals the drop overlay; the rest of
                the time the space belongs to the files, with "Add files" always
                at hand in the table toolbar / empty state. */}
            <section
              class={styles.fileSurface}
              aria-label={t(messages.filesHeading)}
              onDragOver={(event) => {
                // dragover fires continuously (including on entry), so this alone
                // both reveals and tracks the overlay — no separate dragenter.
                event.preventDefault();
                controller.dragOver((event.dataTransfer?.types ?? []).includes('Files'));
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
                  controller.dragLeave();
                }
              }}
            >
              <FileTable
                files={files}
                onRestore={onRestore}
                onDelete={onDelete}
                onShare={onShare}
                onAddFiles={(picked) => void controller.drop(picked)}
              />
              {phase.kind === 'drag' && (
                <DropZone
                  phase={phase}
                  overlay
                  onDragValidity={(valid) => controller.dragOver(valid)}
                  onLeave={() => controller.dragLeave()}
                  onFiles={(dropped) => void controller.drop(dropped)}
                />
              )}
            </section>

            <IngestProgress progress={controller.progress} />
            {(phase.kind === 'success' || phase.kind === 'error') && (
              <Button intent="neutral" onClick={() => controller.reset()}>
                {phase.kind === 'success' ? t(messages.addMore) : t(messages.retry)}
              </Button>
            )}

            {onPublishSite && <SiteShare onPublish={onPublishSite} />}
            {publishedShares && onUnpublish && (
              <PublishedShares shares={publishedShares} onUnpublish={onUnpublish} />
            )}

            <StatusBanner files={files} peers={peers} />
            <p class={cn(styles.muted, peers.value.length === 0 && styles.warn)}>
              {peers.value.length === 0
                ? t(messages.noPeers)
                : t(messages.peersOnline, { count: peers.value.length })}
            </p>
          </>
        )}

        {view === 'devices' && onPair && (
          <Devices
            connectionCode={connectionCode}
            peers={peers}
            onPair={onPair}
            onVerify={onVerify}
            onReject={onReject}
            onRename={onRename}
            shareHostId={shareHostId}
            onSetShareHost={onSetShareHost}
          />
        )}

        {view === 'settings' && (
          <section class={styles.settings}>
            <header class={styles.settingsHead}>
              <h2 class={styles.settingsTitle}>{t(messages.settingsHeading)}</h2>
              <p class={styles.settingsIntro}>{t(messages.settingsIntro)}</p>
            </header>

            {onWatch && (
              <article class={styles.setting}>
                <h3 class={styles.settingTitle}>{t(messages.watchHeading)}</h3>
                <p class={styles.settingDesc}>{t(messages.watchHint)}</p>
                <div class={styles.settingRow}>
                  <input
                    class={styles.input}
                    aria-label={t(messages.watchPlaceholder)}
                    placeholder={t(messages.watchPlaceholder)}
                    value={draftWatchPath.value}
                    onInput={(event) => {
                      draftWatchPath.value = (event.target as HTMLInputElement).value;
                    }}
                  />
                  <Button
                    intent="neutral"
                    disabled={draftWatchPath.value.trim() === ''}
                    onClick={() => void onWatch(draftWatchPath.value)}
                  >
                    {t(messages.watch)}
                  </Button>
                </div>
              </article>
            )}

            {onBackup && (
              <article class={styles.setting}>
                <h3 class={styles.settingTitle}>{t(messages.backupTitle)}</h3>
                <p class={styles.settingDesc}>{t(messages.backupHint)}</p>
                <div class={styles.settingRow}>
                  <Button intent="neutral" onClick={onBackup}>
                    {t(messages.backupWallet)}
                  </Button>
                </div>
              </article>
            )}

            {onSwitchWallet && (
              <article class={styles.setting}>
                <h3 class={styles.settingTitle}>{t(messages.switchWalletTitle)}</h3>
                <p class={styles.settingDesc}>{t(messages.switchWalletHint)}</p>
                <div class={styles.settingRow}>
                  <Button intent="neutral" onClick={onSwitchWallet}>
                    {t(messages.switchWallet)}
                  </Button>
                </div>
              </article>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
