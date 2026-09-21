// Cascivo `separator`, owned in-repo (plan §2.4) and adapted to Preact: the rule
// that divides a card's sections. Class composition uses Cascivo's `cn`; styling
// is CSS Modules + `--cascivo-*` tokens only.
//
// Upstream carries a `decorative` flag that swaps the element for a div with an
// explicit `role`. Every divider in this app is a real thematic break between a
// card's two halves, so this copy is always the semantic element — `<hr>` across,
// and a `role="separator"` div for the vertical case a flex row needs.
import { cn } from '@cascivo/core';
import type { JSX } from 'preact';
import styles from './separator.module.css';

export interface SeparatorProps extends Omit<JSX.IntrinsicElements['hr'], 'orientation'> {
  orientation?: 'horizontal' | 'vertical';
}

export function Separator({ orientation = 'horizontal', class: cls, ...rest }: SeparatorProps) {
  if (orientation === 'vertical') {
    return (
      <hr
        aria-orientation="vertical"
        data-orientation="vertical"
        class={cn(styles.separator, cls as string | undefined)}
        {...rest}
      />
    );
  }
  return (
    <hr
      data-orientation="horizontal"
      class={cn(styles.separator, cls as string | undefined)}
      {...rest}
    />
  );
}
