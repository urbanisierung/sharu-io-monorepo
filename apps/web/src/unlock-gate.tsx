// The password screen — the highest-stakes moment in the app — as a centered,
// professional card. Three shades of one component: create a new wallet (name +
// password + confirm, with the no-reset warning and a recovery download), unlock
// a known wallet ("welcome back"), and the pairing variant ("link this device",
// shown when the user arrived via a device-link URL). Signal-driven, no React
// hooks; all copy via @cascivo/i18n. It only collects + validates input and
// hands the password (and, when creating, the name) to `onSubmit`.

import { signal } from '@preact/signals';
import styles from './auth.module.css';
import { messages } from './messages.js';
import { tr as t } from './reading-mode.js';
import { saveRecoverySheet } from './recovery.js';
import { Button } from './ui/button.js';

const MIN_LENGTH = 8;

const name = signal('');
const password = signal('');
const confirm = signal('');
const reveal = signal(false);
const error = signal<string | null>(null);
const busy = signal(false);

/** Reset the module-level field state — for deterministic tests and to drop the
 *  password from memory once the gate is done. */
export function resetUnlockGate(): void {
  name.value = '';
  password.value = '';
  confirm.value = '';
  reveal.value = false;
  error.value = null;
  busy.value = false;
}

/** Focus the field on mount so the user can type straight away. A stable
 *  reference, so Preact invokes it only when the input mounts/unmounts — never
 *  on a re-render, which would steal focus mid-typing. */
function focusOnMount(input: HTMLInputElement | null): void {
  input?.focus();
}

/** Drop the password (and the rest of the field state) from memory the moment
 *  the gate leaves the screen — on Back, a route change, or the app revealing —
 *  not only on a successful submit. Preact calls a stable ref with the element
 *  on mount and `null` on unmount; we reset on the latter. */
function clearOnUnmount(section: HTMLElement | null): void {
  if (section === null) resetUnlockGate();
}

export interface UnlockGateProps {
  /** 'create' shows the name + confirm fields and the no-reset warning; 'unlock'
   *  greets a returning user with just a password. */
  mode: 'create' | 'unlock';
  /** The wallet's name, shown as a chip when unlocking a known wallet. */
  walletName?: string;
  /** Create variant tuned for linking a device reached via a pairing URL. */
  pairing?: boolean;
  /** Collects the password (and, when creating, the wallet name). Rejects (with
   *  message 'wrong-password') when a returning user mistypes their password. */
  onSubmit: (password: string, walletName: string) => void | Promise<void>;
  /** Return to the wallet picker, when there is one to go back to. */
  onBack?: () => void;
}

export function UnlockGate({ mode, walletName, pairing, onSubmit, onBack }: UnlockGateProps) {
  const creating = mode === 'create';
  const ready =
    password.value.length >= MIN_LENGTH && (!creating || password.value === confirm.value);

  const title = creating
    ? pairing
      ? messages.pairTitle
      : messages.createTitle
    : messages.unlockTitle;
  const subtitle = creating
    ? pairing
      ? messages.pairSubtitle
      : messages.createSubtitle
    : messages.unlockSubtitle;

  const submit = async (): Promise<void> => {
    if (busy.value) return;
    if (password.value.length < MIN_LENGTH) {
      error.value = t(messages.passwordTooShort);
      return;
    }
    if (creating && password.value !== confirm.value) {
      error.value = t(messages.passwordMismatch);
      return;
    }
    const entered = password.value;
    const walletName = name.value;
    busy.value = true;
    error.value = null;
    try {
      await onSubmit(entered, walletName);
      resetUnlockGate(); // success: the app reveals; drop the password from memory
    } catch (cause) {
      const wrong = cause instanceof Error && cause.message === 'wrong-password';
      error.value = wrong ? t(messages.wrongPassword) : t(messages.unlockFailed);
      busy.value = false;
    }
  };

  return (
    <section class={styles.screen} ref={clearOnUnmount}>
      <div class={styles.card}>
        <div class={styles.brand}>
          <img class={styles.logo} src="/logo.png" alt={t(messages.logoAlt)} />
          <h1 class={styles.title}>{t(title)}</h1>
          {!creating && walletName && <span class={styles.walletChip}>{walletName}</span>}
          <p class={styles.subtitle}>{t(subtitle)}</p>
        </div>

        <div class={styles.form}>
          {creating && (
            <label class={styles.field}>
              <span class={styles.label}>{t(messages.walletNameLabel)}</span>
              <input
                class={styles.input}
                ref={creating ? focusOnMount : undefined}
                aria-label={t(messages.walletNameLabel)}
                placeholder={t(messages.walletNamePlaceholder)}
                value={name.value}
                onInput={(event) => {
                  name.value = (event.target as HTMLInputElement).value;
                }}
              />
            </label>
          )}

          <label class={styles.field}>
            <span class={styles.label}>{t(messages.passwordLabel)}</span>
            <input
              class={styles.input}
              ref={creating ? undefined : focusOnMount}
              type={reveal.value ? 'text' : 'password'}
              aria-label={t(messages.passwordLabel)}
              placeholder={t(messages.passwordLabel)}
              value={password.value}
              onInput={(event) => {
                password.value = (event.target as HTMLInputElement).value;
                error.value = null;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !creating) void submit();
              }}
            />
          </label>

          {creating && (
            <label class={styles.field}>
              <span class={styles.label}>{t(messages.passwordConfirmLabel)}</span>
              <input
                class={styles.input}
                type={reveal.value ? 'text' : 'password'}
                aria-label={t(messages.passwordConfirmLabel)}
                placeholder={t(messages.passwordConfirmLabel)}
                value={confirm.value}
                onInput={(event) => {
                  confirm.value = (event.target as HTMLInputElement).value;
                  error.value = null;
                }}
              />
            </label>
          )}

          <label class={styles.revealRow}>
            <input
              type="checkbox"
              checked={reveal.value}
              onChange={(event) => {
                reveal.value = (event.target as HTMLInputElement).checked;
              }}
            />
            {reveal.value ? t(messages.hidePassword) : t(messages.showPassword)}
          </label>
        </div>

        {error.value && <p class={styles.error}>{error.value}</p>}

        {creating && <p class={styles.notice}>{t(messages.passwordWarning)}</p>}

        <div class={styles.actions}>
          <Button intent="primary" onClick={() => void submit()}>
            {busy.value
              ? t(messages.unlocking)
              : creating
                ? t(messages.create)
                : t(messages.unlock)}
          </Button>

          {creating && ready && (
            <Button intent="neutral" onClick={() => saveRecoverySheet(password.value)}>
              {t(messages.saveRecovery)}
            </Button>
          )}
        </div>

        {onBack && (
          <button type="button" class={styles.link} onClick={onBack}>
            {t(messages.useAnotherWallet)}
          </button>
        )}
      </div>
    </section>
  );
}
