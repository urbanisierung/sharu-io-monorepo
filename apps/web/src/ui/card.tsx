// Cascivo `card`, owned in-repo (plan §2.4) and adapted to Preact: the panel
// every app screen and every ruled landing cell is built from. Class composition
// uses Cascivo's `cn`; styling is CSS Modules + `--cascivo-*` tokens only.
//
// Upstream ships `variant` and `padding` knobs; this copy keeps `padding`
// (screens need a flush card for the drop well) and drops `variant`, since the
// Sharu theme has exactly one card chrome — a 1px hairline, no elevation.
import { cn } from '@cascivo/core';
import type { JSX } from 'preact';
import styles from './card.module.css';

export interface CardProps extends Omit<JSX.IntrinsicElements['div'], 'tone'> {
  /**
   * The element the card renders as. A card that is a self-contained piece of
   * content — a settings block, a device panel — is an `article`; a plain
   * container stays a `div`.
   */
  as?: 'div' | 'article' | 'section';
  /**
   * Inner padding of the card box. `none` lets a flush child (the drop well, an
   * edge-to-edge table) reach the card's border; it deliberately does not strip
   * the padding from CardHeader / CardContent / CardFooter, which keep their own.
   */
  padding?: 'none' | 'sm' | 'md';
  /** Fill the card with the accent tint — for the one recommended next action. */
  tone?: 'default' | 'accent';
}

export function Card({
  as = 'div',
  padding = 'md',
  tone = 'default',
  class: cls,
  children,
  ...rest
}: CardProps) {
  // A union tag makes TSX resolve the props to the INTERSECTION of all three
  // elements' attributes, whose `ref` types are mutually incompatible. The three
  // share one attribute surface in practice, so the tag is narrowed for the type
  // checker and still renders whichever element the caller asked for.
  const Tag = as as 'div';
  return (
    <Tag
      data-padding={padding}
      data-tone={tone}
      class={cn(styles.card, cls as string | undefined)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface CardHeaderProps extends Omit<JSX.IntrinsicElements['div'], 'actions'> {
  /**
   * Trailing content pinned to the end of the header — a status, a control. The
   * default header is a column (title over description), so `justify-content`
   * alone would do nothing; passing actions switches it to a row.
   */
  actions?: JSX.Element | null;
}

export function CardHeader({ actions, class: cls, children, ...rest }: CardHeaderProps) {
  if (!actions) {
    return (
      <div class={cn(styles.header, cls as string | undefined)} {...rest}>
        {children}
      </div>
    );
  }
  return (
    <div class={cn(styles.header, styles.headerRow, cls as string | undefined)} {...rest}>
      <div class={styles.headerMain}>{children}</div>
      <div class={styles.headerActions}>{actions}</div>
    </div>
  );
}

export function CardTitle({ class: cls, children, ...rest }: JSX.IntrinsicElements['h3']) {
  return (
    <h3 class={cn(styles.title, cls as string | undefined)} {...rest}>
      {children}
    </h3>
  );
}

export function CardContent({ class: cls, children, ...rest }: JSX.IntrinsicElements['div']) {
  return (
    <div class={cn(styles.content, cls as string | undefined)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ class: cls, children, ...rest }: JSX.IntrinsicElements['div']) {
  return (
    <div class={cn(styles.footer, cls as string | undefined)} {...rest}>
      {children}
    </div>
  );
}
