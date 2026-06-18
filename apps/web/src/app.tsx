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
import { Button } from './ui/button.js';
import { DropZone } from './ui/drop-zone.js';

export interface AppProps {
  controller: IngestController;
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly string[]>;
  syncStatus: ReadonlySignal<'idle' | 'syncing' | 'error'>;
}

const draftPassphrase = signal('');

export function App({ controller, files, peers, syncStatus }: AppProps) {
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
          <ul>
            {files.value.map((file) => (
              <li key={file.path}>{file.path}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
