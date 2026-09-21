// Cascivo `empty-state`, owned in-repo (plan §2.4) and adapted to Preact: the
// placeholder a view shows when it has no data. Class composition uses Cascivo's
// `cn`; styling is CSS Modules + `--cascivo-*` tokens only.
//
// The Files screen nests it inside a dashed well, so the `well` flag carries the
// dashed inset rather than a second wrapper element around it.
import { cn } from '@cascivo/core';
import type { ComponentChildren, JSX } from 'preact';
import styles from './empty-state.module.css';
import { Icon, type IconName } from './icon.js';

export interface EmptyStateProps extends Omit<JSX.IntrinsicElements['div'], 'title' | 'icon'> {
  icon?: IconName;
  title: string;
  description?: string;
  /** The primary way out of the empty state — usually one button. */
  action?: ComponentChildren;
  /** Draw the dashed drop well the Files screen uses. */
  well?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  well = false,
  class: cls,
  ...rest
}: EmptyStateProps) {
  return (
    <div class={cn(styles.empty, well && styles.well, cls as string | undefined)} {...rest}>
      {icon ? (
        <span class={styles.icon} aria-hidden="true">
          <Icon name={icon} />
        </span>
      ) : null}
      <h2 class={styles.title}>{title}</h2>
      {description ? <p class={styles.description}>{description}</p> : null}
      {action ? <div class={styles.action}>{action}</div> : null}
    </div>
  );
}
