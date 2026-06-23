import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowPage } from './flow.js';

afterEach(cleanup);

describe('FlowPage', () => {
  it('walks through the interaction between participants', () => {
    render(<FlowPage onBack={() => {}} onLaunch={() => {}} />);
    expect(screen.getByText('Watch your devices talk.')).toBeTruthy();
    expect(screen.getByText('The interaction')).toBeTruthy();
    // Every participant in the conversation is named.
    expect(screen.getByText('Laptop')).toBeTruthy();
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('Iroh relay')).toBeTruthy();
    expect(screen.getByText('Backup node')).toBeTruthy();
  });

  it('lists the tech stack that powers each step', () => {
    render(<FlowPage onBack={() => {}} onLaunch={() => {}} />);
    expect(screen.getByText('Tech stack')).toBeTruthy();
    expect(screen.getByText('BLAKE3')).toBeTruthy();
    expect(screen.getByText('AES-256-GCM')).toBeTruthy();
  });

  it('links each technology to its canonical home', () => {
    render(<FlowPage onBack={() => {}} onLaunch={() => {}} />);
    const iroh = screen.getByRole('link', { name: 'Iroh (QUIC)' });
    expect(iroh.getAttribute('href')).toBe('https://www.iroh.computer');
    const cascivo = screen.getByRole('link', { name: 'Cascivo Flow' });
    expect(cascivo.getAttribute('href')).toBe('https://docs.cascivo.com/flow');
  });

  it('returns to the landing page from the back control', () => {
    const onBack = vi.fn();
    render(<FlowPage onBack={onBack} onLaunch={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('launches the app from the call to action', () => {
    const onLaunch = vi.fn();
    render(<FlowPage onBack={() => {}} onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launch the app' }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });
});
