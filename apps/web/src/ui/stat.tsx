// Cascivo `stat`, owned in-repo (plan §2.4) and adapted to Preact: one key
// figure with its caption. Class composition uses Cascivo's `cn`; styling is
// CSS Modules + `--cascivo-*` tokens only.
//
// Upstream stacks label → value → delta → help text. The landing hero's three
// panels put the figure first and the mono caption under it, so this copy adds
// `labelPlacement`; upstream's order stays the default. The delta/trend and
// sparkline slots are dropped — Sharu has no metric that moves.
import { cn } from '@cascivo/core';
import type { JSX } from 'preact';
import styles from './stat.module.css';

export interface StatProps extends Omit<JSX.IntrinsicElements['div'], 'label'> {
  /** The caption. Rendered in the mono label voice. */
  label: string;
  /** The figure. Rendered in the display voice. */
  value: string;
  /** Where the caption sits relative to the figure. */
  labelPlacement?: 'above' | 'below';
  /** Panel fill: the hero's three rows are highlight, cream and ink in turn. */
  tone?: 'plain' | 'mark' | 'chrome' | 'ink';
}

export function Stat({
  label,
  value,
  labelPlacement = 'above',
  tone = 'plain',
  class: cls,
  ...rest
}: StatProps) {
  const caption = (
    <span class={styles.label} key="label">
      {label}
    </span>
  );
  const figure = (
    <span class={styles.value} key="value">
      {value}
    </span>
  );
  return (
    <div data-tone={tone} class={cn(styles.stat, cls as string | undefined)} {...rest}>
      {labelPlacement === 'above' ? [caption, figure] : [figure, caption]}
    </div>
  );
}
