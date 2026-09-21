// Cascivo `input`, owned in-repo (plan §2.4) and adapted to Preact: a text field
// with an optional visible label and an error message. Class composition uses
// Cascivo's `cn`; styling is CSS Modules + `--cascivo-*` tokens only.
//
// Upstream tracks focus through a Cascivo micro-FSM; here the focus ring is
// pure CSS (`:focus`), so the machine would be state with nothing reading it.
// `label` is the VISIBLE caption — pass `aria-label` for an invisible name.
import { cn } from '@cascivo/core';
import type { JSX, Ref } from 'preact';
import styles from './input.module.css';

export interface InputProps extends Omit<JSX.IntrinsicElements['input'], 'size'> {
  /** Visible caption rendered above the field. */
  label?: string;
  /** Validation message. Replaces the resting border with the danger tone. */
  error?: string;
  /**
   * A ref onto the `<input>` itself. Preact hands a function component's `ref`
   * the component, not its DOM node, so a caller that needs the element (to
   * focus it on mount) asks for it by name.
   */
  inputRef?: Ref<HTMLInputElement>;
}

export function Input({ label, error, inputRef, class: cls, id, ...rest }: InputProps) {
  // Derived from the label rather than generated, as upstream does: the app
  // prerenders its marketing routes and hydrates them, and a per-render id would
  // not match between the two passes.
  const inputId =
    id ?? (label ? `safu-input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const errorId = `${inputId}-error`;

  return (
    <div
      class={cn(styles.wrapper, cls as string | undefined)}
      data-state={error ? 'error' : 'idle'}
    >
      {label ? (
        <label class={styles.label} for={inputId}>
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        class={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error ? (
        <span id={errorId} class={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
