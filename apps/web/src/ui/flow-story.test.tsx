import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { type FlowEdge, type FlowNode, FlowStory, type StoryStep } from './flow-story.js';

afterEach(cleanup);

const nodes: FlowNode[] = [
  { id: 'a', position: { x: 0, y: 50 }, data: { label: 'Client', role: 'device' } },
  { id: 'b', position: { x: 100, y: 50 }, data: { label: 'Server', role: 'relay' } },
];
const edges: FlowEdge[] = [{ id: 'ab', source: 'a', target: 'b' }];
const script: StoryStep[] = [
  { from: 'a', to: 'b', label: 'Request sent' },
  { from: 'b', to: 'a', label: 'Acknowledged' },
];

function renderStory() {
  return render(
    <FlowStory
      nodes={nodes}
      edges={edges}
      script={script}
      width={100}
      height={100}
      title="Client talks to server"
      playLabel="Play"
      pauseLabel="Pause"
      autoPlay={false}
    />,
  );
}

describe('FlowStory', () => {
  it('renders the participants and the first step caption', () => {
    renderStory();
    expect(screen.getByText('Client')).toBeTruthy();
    expect(screen.getByText('Server')).toBeTruthy();
    expect(screen.getByText('Request sent')).toBeTruthy();
  });

  it('exposes the diagram with an accessible label', () => {
    renderStory();
    expect(screen.getByRole('img', { name: 'Client talks to server' })).toBeTruthy();
  });

  it('toggles the play/pause control between its two labels', () => {
    renderStory();
    // Paused on mount (autoPlay=false): the control offers Play.
    const play = screen.getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    // Now playing: the control offers Pause.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });
});
