// The wallet chooser: when a device holds more than one wallet (or the user
// wants to add or restore one), this card lets them pick which to open, create a
// new one, or restore from a backup file. Signal-driven, no React hooks; copy
// via @cascivo/i18n. It is pure UI — the parent owns wallet state and storage.
import { t } from '@cascivo/i18n';
import { signal } from '@preact/signals';
import styles from './auth.module.css';
import { messages } from './messages.js';
import { Button } from './ui/button.js';
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
      <div class={styles.card}>
        <div class={styles.brand}>
          <img class={styles.logo} src="/logo.png" alt={t(messages.logoAlt)} />
          <h1 class={styles.title}>{t(messages.walletsTitle)}</h1>
          <p class={styles.subtitle}>{t(messages.walletsSubtitle)}</p>
        </div>

        {wallets.length > 0 && (
          <div class={styles.walletList}>
            {wallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                class={styles.walletButton}
                onClick={() => onOpen(wallet.id)}
              >
                {wallet.name}
              </button>
            ))}
          </div>
        )}

        <div class={styles.actions}>
          <Button intent="primary" onClick={onCreate}>
            {t(messages.newWallet)}
          </Button>
          <label class={styles.link}>
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
    </section>
  );
}
