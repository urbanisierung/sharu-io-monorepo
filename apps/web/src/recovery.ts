// Saves a plain-text "recovery sheet" the user can print or store safely. This
// is the only honest answer to "what if I forget my password" under
// zero-knowledge: there is no reset, so we help the user keep the one key there
// is. The password is written only to a file the user explicitly chooses to
// save — never persisted by the app.
import { t } from '@cascivo/i18n';
import { messages } from './messages.js';

export function saveRecoverySheet(password: string): void {
  const text = t(messages.recoverySheet, { password });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = t(messages.recoveryFilename);
  anchor.click();
  URL.revokeObjectURL(url);
}
