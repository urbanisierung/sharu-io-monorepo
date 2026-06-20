// The honest "are my files actually safe?" banner. A single device is not a
// backup — files only become redundant once another device holds a copy — so we
// say so plainly: a warning while there's no other device, switching to a calm
// confirmation once one is linked. Nothing to show before the first file.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import type { ReadonlySignal } from '@preact/signals';
import type { FileView } from '@safu/sdk';
import { messages } from './messages.js';
import type { PeerInfo } from './runtime.js';
import styles from './status-banner.module.css';

export interface StatusBannerProps {
  files: ReadonlySignal<readonly FileView[]>;
  peers: ReadonlySignal<readonly PeerInfo[]>;
}

export function StatusBanner({ files, peers }: StatusBannerProps) {
  const linked = peers.value.filter((peer) => peer.status !== 'rejected').length;

  if (linked > 0) {
    return (
      <div class={cn(styles.banner, styles.ok)} role="status">
        {t(messages.backupOk, { count: linked })}
      </div>
    );
  }
  if (files.value.length > 0) {
    return (
      <div class={cn(styles.banner, styles.risk)} role="status">
        {t(messages.backupWarn)}
      </div>
    );
  }
  return null;
}
