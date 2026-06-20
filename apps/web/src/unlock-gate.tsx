// The password screen — the highest-stakes moment in the app. Two modes from
// one component: "create your password" on a device's first run (with a confirm
// field, a show/hide toggle, the no-reset warning, and a recovery-sheet
// download) and "welcome back" on later runs. Signal-driven, no React hooks; all
// copy via @cascivo/i18n. It only collects + validates the password and hands it
// to `onUnlock`; key derivation lives in the runtime.
import { t } from '@cascivo/i18n';
import { signal } from '@preact/signals';
import styles from './app.module.css';
import { messages } from './messages.js';
import { saveRecoverySheet } from './recovery.js';
import { Button } from './ui/button.js';

const MIN_LENGTH = 8;

const password = signal('');
const confirm = signal('');
const reveal = signal(false);
const error = signal<string | null>(null);

/** Reset the module-level field state — for deterministic tests and to drop the
 *  password from memory once the gate is done. */
export function resetUnlockGate(): void {
  password.value = '';
  confirm.value = '';
  reveal.value = false;
  error.value = null;
}

export interface UnlockGateProps {
  /** True once this device already has a stored identity (a returning user). */
  returning: boolean;
  onUnlock: (password: string) => void;
}

export function UnlockGate({ returning, onUnlock }: UnlockGateProps) {
  const ready =
    password.value.length >= MIN_LENGTH && (returning || password.value === confirm.value);

  const submit = (): void => {
    if (password.value.length < MIN_LENGTH) {
      error.value = t(messages.passwordTooShort);
      return;
    }
    if (!returning && password.value !== confirm.value) {
      error.value = t(messages.passwordMismatch);
      return;
    }
    const entered = password.value;
    resetUnlockGate();
    onUnlock(entered);
  };

  return (
    <section class={styles.gate}>
      <h2>{returning ? t(messages.unlockTitle) : t(messages.createTitle)}</h2>
      <p class={styles.muted}>
        {returning ? t(messages.unlockSubtitle) : t(messages.createSubtitle)}
      </p>

      <input
        class={styles.input}
        type={reveal.value ? 'text' : 'password'}
        aria-label={t(messages.passwordLabel)}
        placeholder={t(messages.passwordLabel)}
        value={password.value}
        onInput={(event) => {
          password.value = (event.target as HTMLInputElement).value;
          error.value = null;
        }}
      />

      {!returning && (
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

      {error.value && <p class={styles.warn}>{error.value}</p>}

      {!returning && <p class={styles.notice}>{t(messages.passwordWarning)}</p>}

      <Button intent="primary" onClick={submit}>
        {returning ? t(messages.unlock) : t(messages.create)}
      </Button>

      {!returning && ready && (
        <Button intent="neutral" onClick={() => saveRecoverySheet(password.value)}>
          {t(messages.saveRecovery)}
        </Button>
      )}
    </section>
  );
}
