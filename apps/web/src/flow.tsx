// The "How it works" page (route: /how-it-works): a Cascivo Flow (cascivo.com/flow)
// that walks, step by step, through how the participants in a backup actually
// talk — your devices, an untrusted Iroh relay, and an optional always-on node —
// how it all ties back to a wallet, and the tech stack behind each step. The
// prose re-voices with the global reading mode: every string goes through `tr`
// (imported as `t`), so the regular / ELI5 / machine toggle in the navbar swaps
// the depth over one shared structure. No React hooks. `onBack` returns to the
// landing page, `onLaunch` opens the app.
import styles from './flow.module.css';
import { flow } from './messages.js';
import { tr as t } from './reading-mode.js';
import { Button } from './ui/button.js';
import { type FlowEdge, type FlowNode, FlowStory, type StoryStep } from './ui/flow-story.js';

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 400;

function buildNodes(): FlowNode[] {
  return [
    {
      id: 'laptop',
      position: { x: 120, y: 200 },
      data: { label: t(flow.nodeLaptop), role: 'device', sublabel: t(flow.nodeLaptopRole) },
    },
    {
      id: 'phone',
      position: { x: 600, y: 200 },
      data: { label: t(flow.nodePhone), role: 'device', sublabel: t(flow.nodePhoneRole) },
    },
    {
      id: 'relay',
      position: { x: 360, y: 70 },
      data: { label: t(flow.nodeRelay), role: 'relay', sublabel: t(flow.nodeRelayRole) },
    },
    {
      id: 'backup',
      position: { x: 360, y: 330 },
      data: { label: t(flow.nodeBackup), role: 'store', sublabel: t(flow.nodeBackupRole) },
    },
  ];
}

const EDGES: FlowEdge[] = [
  { id: 'laptop-relay', source: 'laptop', target: 'relay' },
  { id: 'relay-phone', source: 'relay', target: 'phone' },
  { id: 'relay-backup', source: 'relay', target: 'backup' },
  { id: 'laptop-phone', source: 'laptop', target: 'phone' },
];

function buildScript(): StoryStep[] {
  return [
    { from: 'laptop', to: 'relay', label: t(flow.step1) },
    { from: 'relay', to: 'phone', label: t(flow.step2) },
    { from: 'phone', to: 'relay', label: t(flow.step3) },
    { from: 'relay', to: 'phone', label: t(flow.step4) },
    { from: 'laptop', to: 'phone', label: t(flow.step5) },
    { from: 'relay', to: 'backup', label: t(flow.step6) },
  ];
}

// How the pieces above add up to the wallet you actually use.
function buildWallet() {
  return [
    { title: flow.wallet1Title, body: flow.wallet1Body },
    { title: flow.wallet2Title, body: flow.wallet2Body },
    { title: flow.wallet3Title, body: flow.wallet3Body },
    { title: flow.wallet4Title, body: flow.wallet4Body },
  ];
}

// Each technology links to its canonical home so readers can dig deeper.
function buildStack() {
  return [
    { term: flow.stackIrohTerm, def: flow.stackIrohDef, href: 'https://www.iroh.computer' },
    {
      term: flow.stackBlake3Term,
      def: flow.stackBlake3Def,
      href: 'https://github.com/BLAKE3-team/BLAKE3',
    },
    {
      term: flow.stackArgon2Term,
      def: flow.stackArgon2Def,
      href: 'https://github.com/P-H-C/phc-winner-argon2',
    },
    {
      term: flow.stackAesTerm,
      def: flow.stackAesDef,
      href: 'https://csrc.nist.gov/pubs/sp/800/38/d/final',
    },
    { term: flow.stackCrdtTerm, def: flow.stackCrdtDef, href: 'https://crdt.tech' },
    {
      term: flow.stackCascivoTerm,
      def: flow.stackCascivoDef,
      href: 'https://docs.cascivo.com/flow',
    },
    {
      term: flow.stackPreactTerm,
      def: flow.stackPreactDef,
      href: 'https://preactjs.com/guide/v10/signals/',
    },
    { term: flow.stackTauriTerm, def: flow.stackTauriDef, href: 'https://tauri.app' },
  ];
}

export interface FlowPageProps {
  onLaunch: () => void;
}

export function FlowPage({ onLaunch }: FlowPageProps) {
  const wallet = buildWallet();
  const stack = buildStack();

  return (
    <div class={styles.page}>
      <header class={styles.head}>
        <span class={styles.meta}>{t(flow.meta)}</span>
        <h1 class={styles.title}>{t(flow.title)}</h1>
        <p class={styles.subtitle}>{t(flow.subtitle)}</p>
      </header>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(flow.diagramKicker)}</p>
        <h2 class={styles.h2}>{t(flow.diagramTitle)}</h2>
        <FlowStory
          nodes={buildNodes()}
          edges={EDGES}
          script={buildScript()}
          width={VIEW_WIDTH}
          height={VIEW_HEIGHT}
          title={t(flow.diagramAlt)}
          playLabel={t(flow.play)}
          pauseLabel={t(flow.pause)}
        />
        <p class={styles.caption}>{t(flow.diagramCaption)}</p>
      </section>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(flow.walletKicker)}</p>
        <h2 class={styles.h2}>{t(flow.walletTitle)}</h2>
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
        <p class={styles.kicker}>{t(flow.stackKicker)}</p>
        <h2 class={styles.h2}>{t(flow.stackTitle)}</h2>
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
        <h2 class={styles.ctaTitle}>{t(flow.ctaTitle)}</h2>
        <p class={styles.ctaBody}>{t(flow.ctaBody)}</p>
        <Button intent="primary" onClick={onLaunch}>
          {t(flow.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>{t(flow.footer)}</footer>
    </div>
  );
}
