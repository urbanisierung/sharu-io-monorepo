// Cascivo `alert`, owned in-repo (plan §2.4) and adapted to Preact: a short,
// important message shown inline. Class composition uses Cascivo's `cn`; styling
// is CSS Modules + `--cascivo-*` tokens only.
//
// Upstream's dismiss control and action button are dropped — the design uses one
// standing notice ("no other devices yet") that the user resolves by linking a
// device, not by closing it. `warning` and `danger` announce assertively.
import { cn } from '@cascivo/core';
import type { ComponentChildren, JSX } from 'preact';
import styles from './alert.module.css';
import { Icon, type IconName } from './icon.js';

export interface AlertProps extends Omit<JSX.IntrinsicElements['div'], 'icon'> {
  tone?: 'neutral' | 'warning' | 'danger';
  icon?: IconName;
  children: ComponentChildren;
}

export function Alert({ tone = 'neutral', icon, class: cls, children, ...rest }: AlertProps) {
  return (
    <div
      role={tone === 'neutral' ? 'status' : 'alert'}
      data-tone={tone}
      class={cn(styles.alert, cls as string | undefined)}
      {...rest}
    >
      {icon ? (
        <span class={styles.icon} aria-hidden="true">
          <Icon name={icon} />
        </span>
      ) : null}
      <p class={styles.body}>{children}</p>
    </div>
  );
}
