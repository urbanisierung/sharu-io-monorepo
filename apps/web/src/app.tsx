// The web app shell (plan §2.4): a thin, signal-driven UI over the SDK. Domain
// state (the synced file list, peer list, sync status) arrives as signals and is
// read directly; user intents go back through the IngestController. No store, no
// bridge, no useState/useEffect. All copy via @cascivo/i18n.
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
import { StatusBanner } from './status-banner.js';
import { Button } from './ui/button.js';
import { DropZone } from './ui/drop-zone.js';
import { UnlockGate } from './unlock-gate.js';

export interface AppProps {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
  /** True once this device already has a stored identity (returning user). */
  returning?: boolean;
  /** This device's connection code (a signal — empty until unlock derives it). */
  connectionCode?: ReadonlySignal<string>;
  /** Derive + verify the identity and bring the app online; rejects on a wrong
   *  password. When absent (tests), the gate just flips the controller. */
  onUnlock?: (password: string) => Promise<void>;
  onRestore?: (path: string) => Promise<void>;
  onDelete?: (path: string) => void;
  onPair?: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Give a paired device a friendly local name. */
  onRename?: (id: string, name: string) => void;
  /** Desktop only: start watching a folder for auto-backup. */
  onWatch?: (path: string) => Promise<void>;
}

const draftWatchPath = signal('');

export function App({
  controller,
  files,
  peers,
  syncStatus,
  returning = false,
  connectionCode,
  onUnlock,
  onRestore,
  onDelete,
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

  return (
    <div class={styles.app}>
      <header class={styles.topbar}>
        <div class={styles.brand}>
          <h1 class={styles.brandName}>{t(messages.title)}</h1>
          <span class={styles.brandTag}>{t(messages.tagline)}</span>
        </div>
        <span class={styles.sync}>
          <span class={cn(styles.dot, dotClass)} aria-hidden="true" />
          {syncLabel}
        </span>
      </header>

      <main class={styles.content}>
        {phase.kind === 'first-run' ? (
          <UnlockGate
            returning={returning}
            onUnlock={onUnlock ?? ((password) => controller.unlock(password))}
          />
        ) : (
          <>
            <StatusBanner files={files} peers={peers} />
            <DropZone
              phase={phase}
              onDragValidity={(valid) => controller.dragOver(valid)}
              onLeave={() => controller.dragLeave()}
              onFiles={(dropped) => void controller.drop(dropped)}
            />
            <label class={styles.addButton}>
              <span aria-hidden="true">{t(messages.addFiles)}</span>
              <input
                type="file"
                multiple
                aria-label={t(messages.addFiles)}
                class={styles.hiddenInput}
                onChange={(event) => {
                  const input = event.target as HTMLInputElement;
                  const picked = Array.from(input.files ?? []);
                  input.value = '';
                  if (picked.length > 0) void controller.drop(picked);
                }}
              />
            </label>
            <IngestProgress progress={controller.progress} />
            {(phase.kind === 'success' || phase.kind === 'error') && (
              <Button intent="neutral" onClick={() => controller.reset()}>
                {phase.kind === 'success' ? t(messages.addMore) : t(messages.retry)}
              </Button>
            )}
            <p class={cn(styles.muted, peers.value.length === 0 && styles.warn)}>
              {peers.value.length === 0
                ? t(messages.noPeers)
                : t(messages.peersOnline, { count: peers.value.length })}
            </p>

            <FileTable files={files} onRestore={onRestore} onDelete={onDelete} />

            {onPair && (
              <Devices
                connectionCode={connectionCode}
                peers={peers}
                onPair={onPair}
                onVerify={onVerify}
                onReject={onReject}
                onRename={onRename}
              />
            )}

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
          </>
        )}
      </main>
    </div>
  );
}
