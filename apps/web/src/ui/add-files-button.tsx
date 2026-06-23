// The touch-friendly "add a file" control. A native file input is hard to style
// and easy to make inaccessible, so we wrap it in a <label> dressed as the
// Cascivo Button (same in-repo styles + `--cascivo-*` tokens via `cn`) and keep
// the real input visually hidden — clicking the label opens the picker, and the
// input stays focusable for keyboard and assistive tech. Copy via @cascivo/i18n.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import { messages } from '../messages.js';
import styles from './add-files-button.module.css';
import buttonStyles from './button.module.css';
import { Icon } from './icon.js';

export interface AddFilesButtonProps {
  onFiles: (files: readonly File[]) => void;
  intent?: 'primary' | 'neutral';
}

export function AddFilesButton({ onFiles, intent = 'primary' }: AddFilesButtonProps) {
  return (
    <label class={cn(buttonStyles.button, buttonStyles[intent])}>
      <Icon name="plus" />
      {t(messages.addFiles)}
      <input
        type="file"
        multiple
        aria-label={t(messages.addFiles)}
        class={styles.input}
        onChange={(event) => {
          const input = event.target as HTMLInputElement;
          const picked = Array.from(input.files ?? []);
          input.value = '';
          if (picked.length > 0) onFiles(picked);
        }}
      />
    </label>
  );
}
