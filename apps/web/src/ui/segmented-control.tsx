import { cn } from '@cascivo/core';
import styles from './segmented-control.module.css';

export interface SegmentedOption<V extends string> {
  id: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Required: names the group for assistive tech (it is a `toolbar`). */
  label: string;
  class?: string;
}

/**
 * Cascivo-derived segmented control, owned in-repo (plan §2.4): a small row of
 * mutually exclusive options. Class composition uses Cascivo's `cn`; styling is
 * CSS Modules + `--cascivo-*` tokens only. Stateless — the caller owns `value`
 * (a signal read in render) and updates it from `onChange`.
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
  class: cls,
}: SegmentedControlProps<V>) {
  return (
    <div class={cn(styles.group, cls)} role="toolbar" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          class={cn(styles.option, value === option.id && styles.optionActive)}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
