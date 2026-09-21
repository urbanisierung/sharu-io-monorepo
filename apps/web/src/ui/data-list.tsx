// Cascivo `data-list`, owned in-repo (plan §2.4) and adapted to Preact: label/
// value pairs as a description list. Class composition uses Cascivo's `cn`;
// styling is CSS Modules + `--cascivo-*` tokens only.
//
// The Devices screen stacks its technical values label-over-value, so
// `orientation="vertical"` is what that surface uses; `horizontal` stays the
// default, as upstream.
import { cn } from '@cascivo/core';
import type { ComponentChildren, JSX } from 'preact';
import styles from './data-list.module.css';

export interface DataListProps extends Omit<JSX.IntrinsicElements['dl'], 'dividers'> {
  /**
   * Where each value sits relative to its own label — not the axis of the list.
   * Rows stack vertically either way.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Draw a rule above every row, so the list reads as a ruled table. */
  dividers?: boolean;
}

export function DataList({
  orientation = 'horizontal',
  dividers = false,
  class: cls,
  children,
  ...rest
}: DataListProps) {
  return (
    <dl
      data-orientation={orientation}
      data-dividers={dividers ? '' : undefined}
      class={cn(styles.list, cls as string | undefined)}
      {...rest}
    >
      {children}
    </dl>
  );
}

export interface DataListItemProps {
  /** The term. Rendered as the row's `<dt>`. */
  label: ComponentChildren;
  /** The value. Rendered as the row's `<dd>`. */
  children: ComponentChildren;
  /** Trailing control pinned to the end of the row — typically a copy button. */
  action?: ComponentChildren;
}

/**
 * One row of a `DataList`. Must be a direct child of it — it renders the
 * `<dt>`/`<dd>` pair a `<dl>` expects and inherits the list's layout tokens.
 */
export function DataListItem({ label, children, action }: DataListItemProps) {
  return (
    <div class={cn(styles.row, action ? styles.rowWithAction : undefined)}>
      <div class={styles.pair}>
        <dt class={styles.term}>{label}</dt>
        <dd class={styles.detail}>{children}</dd>
      </div>
      {action ? <div class={styles.action}>{action}</div> : null}
    </div>
  );
}
