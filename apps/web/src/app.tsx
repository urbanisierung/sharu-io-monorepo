// The web app shell (plan §2.4): a thin, signal-driven UI over the SDK. Domain
// state (the synced file list, peer list, sync status) arrives as signals and is
// read directly; user intents go back through the IngestController. No store, no
// bridge, no useState/useEffect. All copy via @cascivo/i18n.
//
// The shell is split into focused views — Files (the main use case: browsing and
// adding backed-up files), Devices (pairing), and Settings (wallet + watched
// folders) — selected from the navbar's tabs. Each is one 860px column: a screen
// title, then a stack of Cards, built from the in-repo Cascivo components.
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
import { Alert } from './ui/alert.js';
import { Button } from './ui/button.js';
import { Card, CardTitle } from './ui/card.js';
import { DropZone } from './ui/drop-zone.js';
import { Icon } from './ui/icon.js';
import { Input } from './ui/input.js';
import { Separator } from './ui/separator.js';
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
  /** Permanently unlink a paired device. */
  onRemove?: (id: string) => void;
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
  onRemove,
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
          <section class={styles.screen}>
            <h1 class={styles.screenTitle}>{t(messages.filesHeading)}</h1>

            {/* The file list leads — it is the whole point of the app. A drag
                anywhere over this surface reveals the drop overlay; the rest of
                the time the space belongs to the files, with "Add files" always
                at hand in the table toolbar / empty state. */}
            <Card as="article" padding="sm" class={styles.fileCard}>
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
            </Card>

            {(onPublishSite || (publishedShares && onUnpublish)) && (
              <Card as="article">
                <CardTitle>{t(messages.sharingTitle)}</CardTitle>
                <p class={styles.cardText}>{t(messages.sharingHint)}</p>
                <Separator class={styles.cardDivider} />
                {onPublishSite && <SiteShare onPublish={onPublishSite} />}
                {publishedShares && onUnpublish && (
                  <PublishedShares shares={publishedShares} onUnpublish={onUnpublish} />
                )}
              </Card>
            )}

            <StatusBanner files={files} peers={peers} />

            {/* A device on its own is not a backup, so the prompt to link a second
                one is a standing caution rather than a line of muted text. */}
            {peers.value.length === 0 ? (
              <Alert tone="warning" icon="info">
                {t(messages.noPeers)}
              </Alert>
            ) : (
              <p class={styles.muted}>{t(messages.peersOnline, { count: peers.value.length })}</p>
            )}
          </section>
        )}

        {view === 'devices' && onPair && (
          <Devices
            connectionCode={connectionCode}
            peers={peers}
            onPair={onPair}
            onVerify={onVerify}
            onReject={onReject}
            onRemove={onRemove}
            onRename={onRename}
            shareHostId={shareHostId}
            onSetShareHost={onSetShareHost}
          />
        )}

        {view === 'settings' && (
          <section class={styles.screen}>
            <header class={styles.screenHead}>
              <h1 class={styles.screenTitle}>{t(messages.settingsHeading)}</h1>
              <p class={styles.screenIntro}>{t(messages.settingsIntro)}</p>
            </header>

            {onWatch && (
              <Card as="article">
                <div class={styles.tileHead}>
                  <span class={styles.tile} aria-hidden="true">
                    <Icon name="files" />
                  </span>
                  <CardTitle>{t(messages.watchHeading)}</CardTitle>
                </div>
                <p class={styles.cardText}>{t(messages.watchHint)}</p>
                <div class={styles.cardRow}>
                  <Input
                    class={styles.cardField}
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
              </Card>
            )}

            {onBackup && (
              <Card as="article">
                <div class={styles.tileHead}>
                  <span class={styles.tile} aria-hidden="true">
                    <Icon name="download" />
                  </span>
                  <CardTitle>{t(messages.backupTitle)}</CardTitle>
                </div>
                <p class={styles.cardText}>{t(messages.backupHint)}</p>
                <div class={styles.cardRow}>
                  <Button intent="primary" onClick={onBackup}>
                    {t(messages.backupWallet)}
                  </Button>
                </div>
              </Card>
            )}

            {onSwitchWallet && (
              <Card as="article">
                <div class={styles.tileHead}>
                  <span class={cn(styles.tile, styles.tileNeutral)} aria-hidden="true">
                    <Icon name="swap" />
                  </span>
                  <CardTitle>{t(messages.switchWalletTitle)}</CardTitle>
                </div>
                <p class={styles.cardText}>{t(messages.switchWalletHint)}</p>
                <div class={styles.cardRow}>
                  <Button intent="neutral" onClick={onSwitchWallet}>
                    {t(messages.switchWallet)}
                  </Button>
                </div>
              </Card>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
