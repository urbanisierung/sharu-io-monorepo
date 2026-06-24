// The "How it works" page (route: /how-it-works): a Cascivo Flow (cascivo.com/flow)
// that walks, step by step, through how the participants in a backup actually
// talk — your devices, an untrusted Iroh relay, and an optional always-on node —
// how it all ties back to a wallet, and the tech stack behind each step. A
// reading-mode toggle swaps the prose between three depths (regular / ELI5 /
// machine) over one shared structure. Reachable from the landing page; all copy
// via @cascivo/i18n, no React hooks — the active mode is a signal. `onBack`
// returns to the landing page, `onLaunch` opens the app.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import { signal } from '@preact/signals';
import styles from './flow.module.css';
import { flow, flowEli5, flowMachine } from './messages.js';
import { Button } from './ui/button.js';
import { type FlowEdge, type FlowNode, FlowStory, type StoryStep } from './ui/flow-story.js';

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 400;

type Mode = 'regular' | 'eli5' | 'machine';

// The prose swaps with the mode; chrome (nav, node names, stack terms, the
// play/pause control) always reads from `flow`. All three sets share the same
// content keys, so `copy.x` resolves whichever mode is active.
const COPY = { regular: flow, eli5: flowEli5, machine: flowMachine } as const;
type Copy = (typeof COPY)[Mode];

const MODES = [
  { id: 'regular' as const, label: flow.modeRegular },
  { id: 'eli5' as const, label: flow.modeEli5 },
  { id: 'machine' as const, label: flow.modeMachine },
];

// View state: which explanation depth is showing. A signal, read in render.
const mode = signal<Mode>('regular');

function buildNodes(copy: Copy): FlowNode[] {
  return [
    {
      id: 'laptop',
      position: { x: 120, y: 200 },
      data: { label: t(flow.nodeLaptop), role: 'device', sublabel: t(copy.nodeLaptopRole) },
    },
    {
      id: 'phone',
      position: { x: 600, y: 200 },
      data: { label: t(flow.nodePhone), role: 'device', sublabel: t(copy.nodePhoneRole) },
    },
    {
      id: 'relay',
      position: { x: 360, y: 70 },
      data: { label: t(flow.nodeRelay), role: 'relay', sublabel: t(copy.nodeRelayRole) },
    },
    {
      id: 'backup',
      position: { x: 360, y: 330 },
      data: { label: t(flow.nodeBackup), role: 'store', sublabel: t(copy.nodeBackupRole) },
    },
  ];
}

const EDGES: FlowEdge[] = [
  { id: 'laptop-relay', source: 'laptop', target: 'relay' },
  { id: 'relay-phone', source: 'relay', target: 'phone' },
  { id: 'relay-backup', source: 'relay', target: 'backup' },
  { id: 'laptop-phone', source: 'laptop', target: 'phone' },
];

function buildScript(copy: Copy): StoryStep[] {
  return [
    { from: 'laptop', to: 'relay', label: t(copy.step1) },
    { from: 'relay', to: 'phone', label: t(copy.step2) },
    { from: 'phone', to: 'relay', label: t(copy.step3) },
    { from: 'relay', to: 'phone', label: t(copy.step4) },
    { from: 'laptop', to: 'phone', label: t(copy.step5) },
    { from: 'relay', to: 'backup', label: t(copy.step6) },
  ];
}

// How the pieces above add up to the wallet you actually use.
function buildWallet(copy: Copy) {
  return [
    { title: copy.wallet1Title, body: copy.wallet1Body },
    { title: copy.wallet2Title, body: copy.wallet2Body },
    { title: copy.wallet3Title, body: copy.wallet3Body },
    { title: copy.wallet4Title, body: copy.wallet4Body },
  ];
}

// Each technology links to its canonical home so readers can dig deeper. The
// term is mode-invariant; only its definition changes with the reading mode.
function buildStack(copy: Copy) {
  return [
    { term: flow.stackIrohTerm, def: copy.stackIrohDef, href: 'https://www.iroh.computer' },
    {
      term: flow.stackBlake3Term,
      def: copy.stackBlake3Def,
      href: 'https://github.com/BLAKE3-team/BLAKE3',
    },
    {
      term: flow.stackArgon2Term,
      def: copy.stackArgon2Def,
      href: 'https://github.com/P-H-C/phc-winner-argon2',
    },
    {
      term: flow.stackAesTerm,
      def: copy.stackAesDef,
      href: 'https://csrc.nist.gov/pubs/sp/800/38/d/final',
    },
    { term: flow.stackCrdtTerm, def: copy.stackCrdtDef, href: 'https://crdt.tech' },
    {
      term: flow.stackCascivoTerm,
      def: copy.stackCascivoDef,
      href: 'https://docs.cascivo.com/flow',
    },
    {
      term: flow.stackPreactTerm,
      def: copy.stackPreactDef,
      href: 'https://preactjs.com/guide/v10/signals/',
    },
    { term: flow.stackTauriTerm, def: copy.stackTauriDef, href: 'https://tauri.app' },
  ];
}

export interface FlowPageProps {
  onBack: () => void;
  onLaunch: () => void;
}

export function FlowPage({ onBack, onLaunch }: FlowPageProps) {
  const active = mode.value;
  const copy = COPY[active];
  const wallet = buildWallet(copy);
  const stack = buildStack(copy);

  return (
    <div class={styles.page}>
      <nav class={styles.nav}>
        <Button intent="neutral" onClick={onBack}>
          {t(flow.back)}
        </Button>
        <span class={styles.meta}>{t(flow.meta)}</span>
      </nav>

      <header class={styles.head}>
        <h1 class={styles.title}>{t(copy.title)}</h1>
        <p class={styles.subtitle}>{t(copy.subtitle)}</p>
        <div class={styles.modes} role="toolbar" aria-label={t(flow.modeLabel)}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              class={cn(styles.mode, active === m.id && styles.modeActive)}
              aria-pressed={active === m.id}
              onClick={() => {
                mode.value = m.id;
              }}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
      </header>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(copy.diagramKicker)}</p>
        <h2 class={styles.h2}>{t(copy.diagramTitle)}</h2>
        <FlowStory
          nodes={buildNodes(copy)}
          edges={EDGES}
          script={buildScript(copy)}
          width={VIEW_WIDTH}
          height={VIEW_HEIGHT}
          title={t(flow.diagramAlt)}
          playLabel={t(flow.play)}
          pauseLabel={t(flow.pause)}
        />
        <p class={styles.caption}>{t(copy.diagramCaption)}</p>
      </section>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(copy.walletKicker)}</p>
        <h2 class={styles.h2}>{t(copy.walletTitle)}</h2>
        <ol class={styles.walletList}>
          {wallet.map((item, i) => (
            <li class={styles.walletItem} key={item.title.key}>
              <span class={styles.walletNum} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div class={styles.walletBody}>
                <h3 class={styles.walletTitle}>{t(item.title)}</h3>
                <p class={styles.walletText}>{t(item.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(copy.stackKicker)}</p>
        <h2 class={styles.h2}>{t(copy.stackTitle)}</h2>
        <dl class={styles.stack}>
          {stack.map((item) => (
            <div class={styles.stackItem} key={item.term.key}>
              <dt class={styles.stackTerm}>
                <a class={styles.stackLink} href={item.href} target="_blank" rel="noreferrer">
                  {t(item.term)}
                </a>
              </dt>
              <dd class={styles.stackDef}>{t(item.def)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section class={styles.cta}>
        <h2 class={styles.ctaTitle}>{t(copy.ctaTitle)}</h2>
        <p class={styles.ctaBody}>{t(copy.ctaBody)}</p>
        <Button intent="primary" onClick={onLaunch}>
          {t(flow.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>{t(flow.footer)}</footer>
    </div>
  );
}
