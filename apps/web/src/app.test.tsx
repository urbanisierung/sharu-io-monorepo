import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { App } from './app.js';

// M0 smoke: the Cascivo-derived Button renders and is signal-driven — clicking
// it mutates a `@preact/signals` signal and the DOM reflects the new value
// without useState/useEffect (plan §1.1, §2.4).
describe('App', () => {
  it('renders a signal-driven Cascivo button', () => {
    render(<App />);
    const button = screen.getByRole('button');

    expect(button.textContent).toContain('Encrypted blocks: 0');
    fireEvent.click(button);
    expect(button.textContent).toContain('Encrypted blocks: 1');
  });
});
