// The "what's being backed up right now" list — clear per-file feedback during a
// drop so the user watches each file move from waiting → adding → safe (or
// failed), instead of guessing at a single counter. Signal-driven, no hooks; all
// copy via @cascivo/i18n.
import { t } from '@cascivo/i18n';
import type { ReadonlySignal } from '@preact/signals';
import { fileKind, formatBytes } from './format.js';
import type { FileProgress } from './ingest-controller.js';
import styles from './ingest-progress.module.css';
import { messages } from './messages.js';
import { Icon } from './ui/icon.js';

const STATUS_LABEL = {
  queued: messages.fileQueued,
  adding: messages.fileAdding,
  done: messages.fileDone,
  error: messages.fileError,
} as const;

const STATUS_MARK = { queued: '•', adding: '⋯', done: '✓', error: '✕' } as const;

export interface IngestProgressProps {
  progress: ReadonlySignal<readonly FileProgress[]>;
}

export function IngestProgress({ progress }: IngestProgressProps) {
  const items = progress.value;
  if (items.length === 0) return null;

  return (
    <section class={styles.panel} aria-label={t(messages.backingUp)}>
      <h2 class={styles.heading}>{t(messages.backingUp)}</h2>
      <ul class={styles.list}>
        {items.map((item) => (
          <li key={item.name} class={styles.row}>
            <span class={styles.icon} aria-hidden="true">
              <Icon name={fileKind(item.name)} />
            </span>
            <span class={styles.name}>{item.name}</span>
            <span class={styles.size}>{formatBytes(item.size)}</span>
            <span class={styles[item.status]}>
              <span aria-hidden="true">{STATUS_MARK[item.status]}</span>{' '}
              {t(STATUS_LABEL[item.status])}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
