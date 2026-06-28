// The list of public shares this device has published (docs/public-share.md),
// for copying a link again or revoking one. Revoking unpins the share's blocks
// from the node so the link stops resolving (already-downloaded copies cannot be
// recalled). Signal-driven view state; the data is the runtime's publishedShares
// signal, persisted per wallet in shares-store.ts.

import { type ReadonlySignal, signal } from '@preact/signals';
import { formatDate } from './format.js';
import { messages } from './messages.js';
import styles from './published-shares.module.css';
import { tr as t } from './reading-mode.js';
import type { PublishedShare } from './shares-store.js';
import { Button } from './ui/button.js';
import { canWebShare, webShare } from './web-share.js';

/** How long a "Copied" confirmation stays up before reverting. */
const COPIED_RESET_MS = 2000;

const copiedRoot = signal<string | null>(null);
const unpublishing = signal<string | null>(null);

/** Reset the module-level view state — for deterministic tests. */
export function resetPublishedShares(): void {
  copiedRoot.value = null;
  unpublishing.value = null;
}

export interface PublishedSharesProps {
  shares: ReadonlySignal<readonly PublishedShare[]>;
  onUnpublish: (root: string) => Promise<void>;
}

async function revoke(root: string, onUnpublish: (root: string) => Promise<void>): Promise<void> {
  if (unpublishing.value) return;
  unpublishing.value = root;
  try {
    await onUnpublish(root);
  } finally {
    if (unpublishing.value === root) unpublishing.value = null;
  }
}

export function PublishedShares({ shares, onUnpublish }: PublishedSharesProps) {
  const list = shares.value;
  if (list.length === 0) return null;
  return (
    <section class={styles.panel}>
      <h2 class={styles.heading}>{t(messages.publishedHeading)}</h2>
      <ul class={styles.list}>
        {list.map((share) => (
          <li key={share.root} class={styles.item}>
            <div class={styles.meta}>
              <span class={styles.name}>{share.path}</span>
              <span class={styles.date}>{formatDate(share.created)}</span>
            </div>
            <div class={styles.row}>
              <input
                class={styles.input}
                type="text"
                readonly
                value={share.link}
                aria-label={share.path}
              />
              <Button
                intent="neutral"
                onClick={() => {
                  void globalThis.navigator?.clipboard?.writeText(share.link);
                  copiedRoot.value = share.root;
                  globalThis.setTimeout(() => {
                    if (copiedRoot.value === share.root) copiedRoot.value = null;
                  }, COPIED_RESET_MS);
                }}
              >
                {copiedRoot.value === share.root ? t(messages.shareCopied) : t(messages.shareCopy)}
              </Button>
              {canWebShare() && (
                <Button
                  intent="primary"
                  onClick={() => void webShare(share.link, t(messages.shareInvite))}
                >
                  {t(messages.shareSend)}
                </Button>
              )}
              <Button intent="neutral" onClick={() => void revoke(share.root, onUnpublish)}>
                {unpublishing.value === share.root ? t(messages.unsharing) : t(messages.unshare)}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
