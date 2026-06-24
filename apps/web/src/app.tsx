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
import { t } from '@cascivo/i18n';
import { type ReadonlySignal, signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import styles from './app.module.css';
import { Devices } from './devices.js';
import { FileTable } from './file-table.js';
import type { IngestController } from './ingest-controller.js';
import { IngestProgress } from './ingest-progress.js';
import { messages } from './messages.js';
import type { PeerInfo } from './runtime.js';
import { SiteShare } from './site-share.js';
import { StatusBanner } from './status-banner.js';
import { Button } from './ui/button.js';
import { DropZone } from './ui/drop-zone.js';
import { Icon, type IconName } from './ui/icon.js';

type AppView = 'files' | 'devices' | 'settings';

export interface AppProps {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
  /** This device's connection code (a signal — empty until unlock derives it). */
  connectionCode?: ReadonlySignal<string>;
  /** The active wallet's name, shown in the header. */
  walletName?: string;
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
  onPair?: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Give a paired device a friendly local name. */
  onRename?: (id: string, name: string) => void;
  /** Desktop only: start watching a folder for auto-backup. */
  onWatch?: (path: string) => Promise<void>;
}

const draftWatchPath = signal('');
const activeView = signal<AppView>('files');

/** Reset the module-level view state — for deterministic tests. */
export function resetAppView(): void {
  activeView.value = 'files';
  draftWatchPath.value = '';
}

export function App({
  controller,
  files,
  peers,
  syncStatus,
  connectionCode,
  walletName,
  onBackup,
  onSwitchWallet,
  onRestore,
  onDelete,
  onShare,
  onPublishSite,
  onPair,
  onVerify,
  onReject,
  onRename,
  onWatch,
}: AppProps) {
  const phase = controller.phase.value;
  const sync = syncStatus.value;
  const syncLabel =
    sync === 'syncing'
      ? t(messages.syncingNow)
      : sync === 'error'
        ? t(messages.syncProblem)
        : t(messages.syncUpToDate);
  const dotClass =
    sync === 'syncing' ? styles.dotSyncing : sync === 'error' ? styles.dotError : styles.dotIdle;

  // Which views are reachable depends on the handlers this runtime supplies, so
  // the Devices and Settings tabs only appear when there is something behind
  // them (e.g. the web build has no folder watching). Files is always present.
  const hasSettings = Boolean(onWatch || onBackup || onSwitchWallet);
  const tabs: readonly { id: AppView; icon: IconName; label: string }[] = [
    { id: 'files', icon: 'files', label: t(messages.navFiles) },
    ...(onPair
      ? [{ id: 'devices' as const, icon: 'devices' as const, label: t(messages.navDevices) }]
      : []),
    ...(hasSettings
      ? [{ id: 'settings' as const, icon: 'settings' as const, label: t(messages.navSettings) }]
      : []),
  ];
  const view: AppView = tabs.some((tab) => tab.id === activeView.value)
    ? activeView.value
    : 'files';

  return (
    <div class={styles.app}>
      <header class={styles.topbar}>
        <div class={styles.brand}>
          <img class={styles.brandLogo} src="/logo.png" alt={t(messages.logoAlt)} />
          <h1 class={styles.brandName}>{t(messages.title)}</h1>
          {walletName ? (
            <span class={styles.brandTag}>{walletName}</span>
          ) : (
            <span class={styles.brandTag}>{t(messages.tagline)}</span>
          )}
        </div>
        <span class={styles.sync}>
          <span class={cn(styles.dot, dotClass)} aria-hidden="true" />
          {syncLabel}
        </span>
      </header>

      {tabs.length > 1 && (
        <nav class={styles.nav} aria-label={t(messages.primaryNav)}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              class={cn(styles.navItem, view === tab.id && styles.navItemActive)}
              aria-current={view === tab.id ? 'page' : undefined}
              onClick={() => {
                activeView.value = tab.id;
              }}
            >
              <Icon name={tab.icon} class={styles.navIcon} />
              <span class={styles.navLabel}>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

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
          />
        )}

        {view === 'settings' && (
          <>
            {onWatch && (
              <section class={styles.gate}>
                <h2>{t(messages.watchHeading)}</h2>
                <input
                  class={styles.input}
                  aria-label={t(messages.watchPlaceholder)}
                  placeholder={t(messages.watchPlaceholder)}
                  value={draftWatchPath.value}
                  onInput={(event) => {
                    draftWatchPath.value = (event.target as HTMLInputElement).value;
                  }}
                />
                <Button intent="neutral" onClick={() => void onWatch(draftWatchPath.value)}>
                  {t(messages.watch)}
                </Button>
              </section>
            )}

            {(onBackup || onSwitchWallet) && (
              <section class={styles.gate}>
                <h2>{t(messages.walletHeading)}</h2>
                {onBackup && (
                  <>
                    <p class={styles.muted}>{t(messages.backupHint)}</p>
                    <Button intent="neutral" onClick={onBackup}>
                      {t(messages.backupWallet)}
                    </Button>
                  </>
                )}
                {onSwitchWallet && (
                  <Button intent="neutral" onClick={onSwitchWallet}>
                    {t(messages.switchWallet)}
                  </Button>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
