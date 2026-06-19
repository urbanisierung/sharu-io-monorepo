// The web app shell (plan §2.4): a thin, signal-driven UI over the SDK. Domain
// state (the synced file list, peer list, sync status) arrives as signals and is
// read directly; user intents go back through the IngestController. No store, no
// bridge, no useState/useEffect. All copy via @cascivo/i18n.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import { type ReadonlySignal, signal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import styles from './app.module.css';
import type { IngestController } from './ingest-controller.js';
import { messages } from './messages.js';
import type { PeerInfo } from './runtime.js';
import { Button } from './ui/button.js';
import { DropZone } from './ui/drop-zone.js';

export interface AppProps {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
  /** This device's connection code, shared out-of-band to pair. */
  connectionCode?: string;
  onRestore?: (path: string) => void;
  onPair?: (code: string) => Promise<void>;
  onVerify?: (id: string) => void;
  onReject?: (id: string) => void;
}

const draftPassphrase = signal('');
const draftPeerCode = signal('');
const copied = signal(false);
const pairFailed = signal(false);

export function App({
  controller,
  files,
  peers,
  syncStatus,
  connectionCode,
  onRestore,
  onPair,
  onVerify,
  onReject,
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
        <section class={styles.gate}>
          <p>{t(messages.firstRunPrompt)}</p>
          <input
            class={styles.input}
            type="password"
            aria-label={t(messages.passphrasePlaceholder)}
            placeholder={t(messages.passphrasePlaceholder)}
            value={draftPassphrase.value}
            onInput={(event) => {
              draftPassphrase.value = (event.target as HTMLInputElement).value;
            }}
          />
          <Button intent="primary" onClick={() => controller.unlock(draftPassphrase.value)}>
            {t(messages.unlock)}
          </Button>
        </section>
      ) : (
        <>
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

      <section class={styles.files}>
        <h2>{t(messages.filesHeading)}</h2>
        {files.value.length === 0 ? (
          <p class={styles.muted}>{t(messages.empty)}</p>
        ) : (
          <ul class={styles.list}>
            {files.value.map((file) => (
              <li key={file.path} class={styles.row}>
                <span>{file.path}</span>
                {onRestore && (
                  <Button intent="neutral" onClick={() => onRestore(file.path)}>
                    {t(messages.download)}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {phase.kind !== 'first-run' && onPair && (
        <section class={styles.gate}>
          <h2>{t(messages.devicesHeading)}</h2>
          {connectionCode && (
            <div class={styles.codeRow}>
              <p class={styles.muted}>{t(messages.yourCode)}</p>
              <code class={styles.code}>{connectionCode}</code>
              <Button
                intent="neutral"
                onClick={() => {
                  void navigator.clipboard?.writeText(connectionCode);
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
    </main>
  );
}
