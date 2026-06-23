// Cascivo-derived FlowStory, owned in-repo (plan §2.4, like ./button.tsx). A
// scripted, looping animation that walks a node/edge graph step by step with
// fade-in captions — mirroring Cascivo's Flow API (`nodes`, `edges`, `script`).
// Signal-driven: the active step lives in a signal; a class component owns only
// the interval lifecycle (no React state hooks). Styling is CSS Modules +
// `--cascivo-*` tokens; nodes are positioned HTML over an SVG edge layer. All
// copy is passed in already-translated, so this stays i18n-agnostic.
import { signal } from '@preact/signals';
import { Component } from 'preact';
import styles from './flow-story.module.css';

export type FlowRole = 'device' | 'relay' | 'store';

export interface FlowNode {
  id: string;
  /** Centre point in viewBox units (see `width`/`height`). */
  position: { x: number; y: number };
  data: { label: string; role: FlowRole; sublabel?: string };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

/** One scripted exchange: animate a beam from `from` to `to` with a caption. */
export interface StoryStep {
  from: string;
  to: string;
  label: string;
}

export interface FlowStoryProps {
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  script: readonly StoryStep[];
  /** viewBox size; nodes are placed in these units. */
  width: number;
  height: number;
  /** Accessible description of the whole diagram. */
  title: string;
  /** Aria labels for the single play/pause control. */
  playLabel: string;
  pauseLabel: string;
  /** Milliseconds the beam spends on each step. */
  stepDuration?: number;
  /** Start playing on mount. Defaults to true. */
  autoPlay?: boolean;
}

const DEFAULT_STEP_DURATION = 2600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export class FlowStory extends Component<FlowStoryProps> {
  private readonly step = signal(0);
  private readonly playing = signal(true);
  private timer: ReturnType<typeof setInterval> | undefined;

  componentDidMount(): void {
    if (this.props.autoPlay === false) this.playing.value = false;
    this.sync();
  }

  componentWillUnmount(): void {
    this.stop();
  }

  private start(): void {
    this.stop();
    const ms = this.props.stepDuration ?? DEFAULT_STEP_DURATION;
    this.timer = setInterval(() => {
      this.step.value = (this.step.value + 1) % this.props.script.length;
    }, ms);
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Reconcile the interval with `playing` (and motion preference / length). */
  private sync(): void {
    const canPlay = this.playing.value && this.props.script.length > 1 && !prefersReducedMotion();
    if (canPlay) this.start();
    else this.stop();
  }

  private readonly toggle = (): void => {
    this.playing.value = !this.playing.value;
    this.sync();
  };

  render(): preact.JSX.Element | null {
    const { nodes, edges, script, width, height, title, playLabel, pauseLabel } = this.props;
    const reduce = prefersReducedMotion();
    const active = script[this.step.value] ?? script[0];
    if (!active) return null;
    const playing = this.playing.value;

    const center = new Map(nodes.map((n) => [n.id, n.position]));
    const from = center.get(active.from);
    const to = center.get(active.to);

    return (
      <div class={styles.flow}>
        <div
          class={styles.stage}
          style={{ aspectRatio: `${width} / ${height}` }}
          role="img"
          aria-label={title}
        >
          <svg
            class={styles.wires}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <title>{title}</title>
            {edges.map((edge) => {
              const a = center.get(edge.source);
              const b = center.get(edge.target);
              if (!a || !b) return null;
              return <line key={edge.id} class={styles.wire} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
            {from && to && (
              <line
                key={`active-${this.step.value}`}
                class={styles.wireActive}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              />
            )}
            {from && to && !reduce && (
              <circle
                key={`beam-${this.step.value}`}
                class={playing ? styles.beam : styles.beamPaused}
                cx={from.x}
                cy={from.y}
                r={7}
                style={{
                  '--dx': `${to.x - from.x}px`,
                  '--dy': `${to.y - from.y}px`,
                  '--beam-dur': `${(this.props.stepDuration ?? DEFAULT_STEP_DURATION) * 0.85}ms`,
                }}
              />
            )}
          </svg>

          <div class={styles.nodes}>
            {nodes.map((node) => {
              const isActive = node.id === active.from || node.id === active.to;
              return (
                <div
                  key={node.id}
                  class={`${styles.node} ${styles[node.data.role]} ${isActive ? styles.nodeActive : ''}`}
                  style={{
                    left: `${(node.position.x / width) * 100}%`,
                    top: `${(node.position.y / height) * 100}%`,
                  }}
                >
                  <span class={styles.nodeLabel}>{node.data.label}</span>
                  {node.data.sublabel && <span class={styles.nodeRole}>{node.data.sublabel}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {reduce ? (
          <ol class={styles.steps}>
            {script.map((stepItem, i) => (
              <li class={styles.staticStep} key={stepItem.label}>
                <span class={styles.staticNum}>{pad(i + 1)}</span>
                <span>{stepItem.label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div class={styles.caption}>
            <div class={styles.captionHead}>
              <button
                type="button"
                class={styles.control}
                onClick={this.toggle}
                aria-label={playing ? pauseLabel : playLabel}
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
                    <rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
                    <rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
                    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <span class={styles.counter}>
                {pad(this.step.value + 1)} <span class={styles.counterSlash}>/</span>{' '}
                {pad(script.length)}
              </span>
              <div class={styles.dots} aria-hidden="true">
                {script.map((stepItem, i) => (
                  <span
                    class={`${styles.dot} ${i === this.step.value ? styles.dotActive : ''}`}
                    key={stepItem.label}
                  />
                ))}
              </div>
            </div>
            <p class={styles.captionText} key={this.step.value}>
              {active.label}
            </p>
          </div>
        )}
      </div>
    );
  }
}
