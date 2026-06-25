import { cn } from '@cascivo/core';
import type { JSX } from 'preact';
import styles from './button.module.css';

export interface ButtonProps extends Omit<JSX.IntrinsicElements['button'], 'intent'> {
  intent?: 'primary' | 'neutral';
}

/**
 * Cascivo-derived Button, owned in-repo (plan §2.4). Class composition uses
 * Cascivo's `cn` primitive; styling is CSS Modules + `--cascivo-*` tokens only.
 */
export function Button({ intent = 'primary', class: cls, children, ...rest }: ButtonProps) {
  return (
    <button class={cn(styles.button, styles[intent], cls as string | undefined)} {...rest}>
      {children}
    </button>
  );
}
