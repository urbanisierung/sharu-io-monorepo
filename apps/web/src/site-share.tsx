// Publish a folder of files as one navigable public site (docs/public-share.md,
// phase 5). A directory picker (webkitdirectory) collects the files; the runtime
// re-ingests them under a single random key, pins them to the node, and returns
// an openable link — shown here for copying. Self-contained signal-driven view
// state, all copy via @cascivo/i18n.
import { t } from '@cascivo/i18n';
import { signal } from '@preact/signals';
import { messages } from './messages.js';
import styles from './site-share.module.css';
import { Button } from './ui/button.js';

const publishing = signal(false);
const link = signal<string | null>(null);
const error = signal<string | null>(null);
const copied = signal(false);

/** Reset the module-level view state — for deterministic tests. */
export function resetSiteShare(): void {
  publishing.value = false;
  link.value = null;
  error.value = null;
  copied.value = false;
}

export interface SiteShareProps {
  /** Publish the picked files as a site, resolving to the openable link. Rejects
   *  with a 'no-share-host' error when no always-on node is paired. */
  onPublish: (files: readonly File[]) => Promise<string>;
}

async function publish(files: readonly File[], onPublish: SiteShareProps['onPublish']) {
  if (files.length === 0 || publishing.value) return;
  publishing.value = true;
  error.value = null;
  copied.value = false;
  try {
    link.value = await onPublish(files);
  } catch (cause) {
    error.value =
      cause instanceof Error && cause.message === 'no-share-host' ? 'shareNoHost' : 'shareFailed';
  } finally {
    publishing.value = false;
  }
}

export function SiteShare({ onPublish }: SiteShareProps) {
  return (
    <section class={styles.bar}>
      <p class={styles.hint}>{t(messages.publishSiteHint)}</p>

      <label>
        <Button intent="neutral" onClick={(event) => pickFolder(event)}>
          {publishing.value ? t(messages.publishSitePublishing) : t(messages.publishSite)}
        </Button>
        <input
          type="file"
          multiple
          hidden
          ref={enableDirectory}
          aria-label={t(messages.publishSite)}
          onChange={(event) => {
            const input = event.currentTarget as HTMLInputElement;
            void publish([...(input.files ?? [])], onPublish);
            input.value = '';
          }}
        />
      </label>

      {error.value && (
        <p class={styles.warn}>{t(messages[error.value as 'shareNoHost' | 'shareFailed'])}</p>
      )}

      {link.value && (
        <div class={styles.link}>
          <input
            class={styles.input}
            type="text"
            readonly
            value={link.value}
            aria-label={t(messages.publishSite)}
          />
          <Button
            intent="neutral"
            onClick={() => {
              void globalThis.navigator?.clipboard?.writeText(link.value as string);
              copied.value = true;
            }}
          >
            {copied.value ? t(messages.shareCopied) : t(messages.shareCopy)}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Open the directory picker bound to the sibling input. */
function pickFolder(event: Event): void {
  const label = (event.currentTarget as HTMLElement).closest('label');
  label?.querySelector('input')?.click();
}

/** Mark the file input as a directory picker (not a typed JSX attribute). */
function enableDirectory(input: HTMLInputElement | null): void {
  if (input) input.setAttribute('webkitdirectory', '');
}
