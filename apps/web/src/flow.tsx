// The "Interaction" page: a Cascivo Flow (cascivo.com/flow) that walks, step by
// step, through how the participants in a backup actually talk — your devices,
// an untrusted Iroh relay, and an optional always-on node — followed by the tech
// stack that powers each step. Reachable from the landing page; all copy via
// @cascivo/i18n, no React hooks. `onBack` returns to the landing page,
// `onLaunch` opens the app.
import { t } from '@cascivo/i18n';
import styles from './flow.module.css';
import { flow } from './messages.js';
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

// Each technology links to its canonical home so readers can dig deeper.
const stack = [
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
  { term: flow.stackCascivoTerm, def: flow.stackCascivoDef, href: 'https://docs.cascivo.com/flow' },
  {
    term: flow.stackPreactTerm,
    def: flow.stackPreactDef,
    href: 'https://preactjs.com/guide/v10/signals/',
  },
  { term: flow.stackTauriTerm, def: flow.stackTauriDef, href: 'https://tauri.app' },
];

export interface FlowPageProps {
  onBack: () => void;
  onLaunch: () => void;
}

export function FlowPage({ onBack, onLaunch }: FlowPageProps) {
  return (
    <div class={styles.page}>
      <nav class={styles.nav}>
        <Button intent="neutral" onClick={onBack}>
          {t(flow.back)}
        </Button>
        <span class={styles.meta}>{t(flow.meta)}</span>
      </nav>

      <header class={styles.head}>
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
