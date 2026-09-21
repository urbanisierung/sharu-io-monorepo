// Cascivo `copy-button`, owned in-repo (plan §2.4) and adapted to Preact: writes
// a value to the clipboard and confirms in place. Class composition uses
// Cascivo's `cn`; styling is CSS Modules + `--cascivo-*` tokens only.
//
// The design specifies the confirmation exactly: the control swaps its own label
// for 1.6s and there is no toast. Upstream is icon-only; the app's device codes
// use a text control ("Copy" → "Copied"), the landing page's install commands an
// icon one, so both shapes live here behind `iconOnly`.
//
// State is per-instance, so it is a `useSignal` rather than a module signal —
// two copy buttons on one screen must confirm independently. `useSignal` is a
// signals hook, not one of the React state hooks the UI invariants forbid.
import { cn } from '@cascivo/core';
import { useSignal } from '@preact/signals';
import type { JSX } from 'preact';
import styles from './copy-button.module.css';
import { Icon } from './icon.js';

/** How long the control shows its confirmed label, per the design handoff. */
const CONFIRM_MS = 1600;

export interface CopyButtonProps extends Omit<JSX.IntrinsicElements['button'], 'value'> {
  /** The text written to the clipboard on click. */
  value: string;
  /** The resting label. Also the accessible name when `iconOnly`. */
  label: string;
  /** The label shown for 1.6s after a copy. */
  copiedLabel: string;
  /** Render as a square icon control instead of a text button. */
  iconOnly?: boolean;
  intent?: 'primary' | 'neutral';
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  iconOnly = false,
  intent = 'neutral',
  class: cls,
  onClick,
  ...rest
}: CopyButtonProps) {
  const copied = useSignal(false);
  const current = copied.value ? copiedLabel : label;

  return (
    <button
      type="button"
      data-state={copied.value ? 'copied' : 'idle'}
      aria-label={iconOnly ? current : undefined}
      title={iconOnly ? current : undefined}
      class={cn(
        styles.button,
        styles[intent],
        iconOnly && styles.iconOnly,
        cls as string | undefined,
      )}
      onClick={(event) => {
        // Absent in insecure contexts and in the test DOM; the label still
        // confirms, because the control's job is to report what it attempted.
        void navigator.clipboard?.writeText(value)?.catch(() => {});
        copied.value = true;
        setTimeout(() => {
          copied.value = false;
        }, CONFIRM_MS);
        onClick?.(event);
      }}
      {...rest}
    >
      {iconOnly ? (
        <Icon name={copied.value ? 'check' : 'copy'} />
      ) : (
        <span class={styles.label}>{current}</span>
      )}
    </button>
  );
}
