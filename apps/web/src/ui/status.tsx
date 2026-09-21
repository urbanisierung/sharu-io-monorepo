// Cascivo `status`, owned in-repo (plan §2.4) and adapted to Preact: a coloured
// dot with a label, communicating the state of a system. Class composition uses
// Cascivo's `cn`; styling is CSS Modules + `--cascivo-*` tokens only.
//
// The design carries it in two shapes: `inline` (dot + text, as upstream) and
// `pill`, the accent-soft "Up to date" chip in the app header. The dot is a 7px
// square, because the theme sets every radius to zero — the status dot included.
import { cn } from '@cascivo/core';
import type { JSX } from 'preact';
import styles from './status.module.css';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface StatusProps extends Omit<JSX.IntrinsicElements['span'], 'tone'> {
  tone?: StatusTone;
  variant?: 'inline' | 'pill';
}

export function Status({
  tone = 'neutral',
  variant = 'inline',
  class: cls,
  children,
  ...rest
}: StatusProps) {
  return (
    <span
      data-tone={tone}
      data-variant={variant}
      class={cn(styles.status, cls as string | undefined)}
      {...rest}
    >
      <span aria-hidden="true" class={styles.dot} />
      {children}
    </span>
  );
}
