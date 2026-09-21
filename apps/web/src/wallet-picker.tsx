// The wallet chooser — the "Open a wallet" screen: a centred column on a soft
// radial ground with the wallets on this device as tall rows, then the actions
// for adding or restoring one. Signal-driven, no React hooks; copy via
// @cascivo/i18n. It is pure UI — the parent owns wallet state and storage.

import { cn } from '@cascivo/core';
import { signal } from '@preact/signals';
import styles from './auth.module.css';
import { landing, messages } from './messages.js';
import { tr as t } from './reading-mode.js';
import { Button } from './ui/button.js';
import buttonStyles from './ui/button.module.css';
import { Icon } from './ui/icon.js';
import { Separator } from './ui/separator.js';
import type { WalletMeta } from './wallet.js';
import { parseWalletBackup, type WalletBackup } from './wallet-backup.js';

const restoreError = signal(false);

/** Reset module-level view state — for deterministic tests. */
export function resetWalletPicker(): void {
  restoreError.value = false;
}

export interface WalletPickerProps {
  wallets: readonly WalletMeta[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRestore: (backup: WalletBackup) => void;
}

export function WalletPicker({ wallets, onOpen, onCreate, onRestore }: WalletPickerProps) {
  const readFile = async (file: File): Promise<void> => {
    try {
      onRestore(parseWalletBackup(await file.text()));
      restoreError.value = false;
    } catch {
      restoreError.value = true;
    }
  };

  return (
    <section class={styles.screen}>
      <div class={styles.column}>
        <div class={styles.brand}>
          <img class={styles.logo} src="/logo.png" alt={t(messages.logoAlt)} />
          <span class={styles.wordmark}>{t(landing.brand)}</span>
        </div>

        <h1 class={styles.title}>{t(messages.walletsTitle)}</h1>
        <p class={styles.subtitle}>{t(messages.walletsSubtitle)}</p>

        <div class={styles.card}>
          {wallets.length > 0 && (
            <>
              <div class={styles.listLabel}>{t(messages.walletsOnDevice)}</div>
              <div class={styles.walletList}>
                {wallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    type="button"
                    class={styles.walletButton}
                    onClick={() => onOpen(wallet.id)}
                  >
                    <span class={styles.walletIcon} aria-hidden="true">
                      <Icon name="wallet" />
                    </span>
                    <span class={styles.walletName}>{wallet.name}</span>
                    <span class={styles.walletGo} aria-hidden="true">
                      <Icon name="chevronRight" />
                    </span>
                  </button>
                ))}
              </div>
              <Separator class={styles.divider} />
            </>
          )}

          <div class={styles.actions}>
            <Button intent="primary" onClick={onCreate}>
              {t(messages.newWallet)}
            </Button>
            {/* A native file input is hard to style and easy to make
                inaccessible, so the label wears the secondary button's chrome
                and the real input stays focusable behind it. */}
            <label class={cn(buttonStyles.button, buttonStyles.neutral)}>
              {t(messages.restoreWallet)}
              <input
                type="file"
                accept="application/json,.json"
                class={styles.hiddenFile}
                aria-label={t(messages.restoreWallet)}
                onChange={(event) => {
                  const input = event.target as HTMLInputElement;
                  const file = input.files?.[0];
                  input.value = '';
                  if (file) void readFile(file);
                }}
              />
            </label>
          </div>

          {restoreError.value && <p class={styles.error}>{t(messages.restoreError)}</p>}
        </div>
      </div>
    </section>
  );
}
