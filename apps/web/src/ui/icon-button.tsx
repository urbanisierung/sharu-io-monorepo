import { cn } from '@cascivo/core';
import type { JSX } from 'preact';
import { Icon, type IconName } from './icon.js';
import styles from './icon-button.module.css';

export interface IconButtonProps extends Omit<JSX.IntrinsicElements['button'], 'icon'> {
  icon: IconName;
  /** Accessible name — the control shows only an icon. Doubles as the tooltip. */
  label: string;
  intent?: 'neutral' | 'primary' | 'danger';
}

/**
 * Cascivo-derived compact icon button, owned in-repo (plan §2.4): a square,
 * icon-only action that keeps dense rows short. Class composition uses Cascivo's
 * `cn`; styling is CSS Modules + `--cascivo-*` tokens only. The `label` becomes
 * the accessible name, so it stays usable and testable like a text button.
 */
export function IconButton({
  icon,
  label,
  intent = 'neutral',
  class: cls,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      class={cn(styles.button, styles[intent], cls as string | undefined)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
