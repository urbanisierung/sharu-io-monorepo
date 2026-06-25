import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control.js';

afterEach(cleanup);

const options = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl', () => {
  it('marks the selected option as pressed', () => {
    render(<SegmentedControl options={options} value="a" onChange={() => {}} label="Pick" />);
    expect(screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the chosen option id on click', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="a" onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('exposes the group label to assistive tech', () => {
    render(<SegmentedControl options={options} value="a" onChange={() => {}} label="Pick" />);
    expect(screen.getByRole('toolbar', { name: 'Pick' })).toBeTruthy();
  });
});
