// The web app shell (plan §2.4): a thin, signal-driven UI over the SDK. Domain
// state (the synced file list, peer list, sync status) arrives as signals and is
// read directly; user intents go back through the IngestController. No store, no
// bridge, no useState/useEffect. All copy via @cascivo/i18n.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import { type ReadonlySignal, signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import styles from './app.module.css';
import { FileTable } from './file-table.js';
import type { IngestController } from './ingest-controller.js';
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
  onRestore?: (path: string) => Promise<void>;
  onDelete?: (path: string) => void;
  onPair?: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Desktop only: start watching a folder for auto-backup. */
  onWatch?: (path: string) => Promise<void>;
}

const draftPeerCode = signal('');
const draftWatchPath = signal('');
const copied = signal(false);
const pairFailed = signal(false);

export function App({
  controller,
  files,
  peers,
  syncStatus,
  returning = false,
  connectionCode,
  onRestore,
  onDelete,
  onPair,
  onVerify,
  onReject,
  onWatch,
}: AppProps) {
  const phase = controller.phase.value;

  return (
    <main class={styles.main}>
      <header class={styles.header}>
        <h1>{t(messages.title)}</h1>
        <p>{t(messages.tagline)}</p>
        <p class={styles.muted}>{t(messages.syncStatus, { status: syncStatus.value })}</p>
      </header>

      {phase.kind === 'first-run' ? (
        <UnlockGate returning={returning} onUnlock={(password) => controller.unlock(password)} />
      ) : (
        <>
          <StatusBanner files={files} peers={peers} />
          <DropZone
            phase={phase}
            onDragValidity={(valid) => controller.dragOver(valid)}
            onLeave={() => controller.dragLeave()}
            onFiles={(dropped) => void controller.drop(dropped)}
          />
          {(phase.kind === 'success' || phase.kind === 'error') && (
            <Button intent="neutral" onClick={() => controller.reset()}>
              {t(messages.retry)}
            </Button>
          )}
          <p class={cn(styles.muted, peers.value.length === 0 && styles.warn)}>
            {peers.value.length === 0
              ? t(messages.noPeers)
              : t(messages.peersOnline, { count: peers.value.length })}
          </p>
        </>
      )}

      <FileTable files={files} onRestore={onRestore} onDelete={onDelete} />

      {phase.kind !== 'first-run' && onPair && (
        <section class={styles.gate}>
          <h2>{t(messages.devicesHeading)}</h2>
          {connectionCode?.value && (
            <div class={styles.codeRow}>
              <p class={styles.muted}>{t(messages.yourCode)}</p>
              <code class={styles.code}>{connectionCode.value}</code>
              <Button
                intent="neutral"
                onClick={() => {
                  void navigator.clipboard?.writeText(connectionCode.value);
                  copied.value = true;
                }}
              >
                {copied.value ? t(messages.copied) : t(messages.copy)}
              </Button>
            </div>
          )}
          <input
            class={styles.input}
            aria-label={t(messages.peerCodePlaceholder)}
            placeholder={t(messages.peerCodePlaceholder)}
            value={draftPeerCode.value}
            onInput={(event) => {
              draftPeerCode.value = (event.target as HTMLInputElement).value;
              pairFailed.value = false;
            }}
          />
          <Button
            intent="primary"
            onClick={() => {
              pairFailed.value = false;
              onPair(draftPeerCode.value).catch(() => {
                pairFailed.value = true;
              });
            }}
          >
            {t(messages.pair)}
          </Button>
          {pairFailed.value && <p class={styles.warn}>{t(messages.pairError)}</p>}

          {peers.value.length > 0 && (
            <ul class={styles.list}>
              {peers.value.map((peer) => (
                <li key={peer.id} class={styles.peerRow}>
                  <code class={styles.code}>{peer.id}</code>
                  <span class={styles.muted}>
                    {t(messages.sasPrompt)} <strong>{peer.sas}</strong>
                  </span>
                  <span class={styles.muted}>
                    {peer.status === 'verified'
                      ? t(messages.statusVerified)
                      : peer.status === 'rejected'
                        ? t(messages.statusRejected)
                        : t(messages.statusPending)}
                  </span>
                  {peer.status === 'pending' && onVerify && onReject && (
                    <span class={styles.peerActions}>
                      <Button intent="primary" onClick={() => onVerify(peer.id)}>
                        {t(messages.confirm)}
                      </Button>
                      <Button intent="neutral" onClick={() => onReject(peer.id)}>
                        {t(messages.reject)}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {phase.kind !== 'first-run' && onWatch && (
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
    </main>
  );
}
