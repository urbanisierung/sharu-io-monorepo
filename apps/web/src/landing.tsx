// One-page landing for Sharu (Cascivo primitives + CSS Modules, cyberpunk
// theme). A Narrative Workflow: the page spine is the encryption pipeline —
// Encrypt → Address → Sync → Restore — then hands off to the app via `onLaunch`.
// All copy through @cascivo/i18n; no React hooks.
import { cn } from '@cascivo/core';
import { t } from '@cascivo/i18n';
import styles from './landing.module.css';
import { landing } from './messages.js';
import { Button } from './ui/button.js';

const problems = [
  { title: landing.problem1Title, body: landing.problem1Body },
  { title: landing.problem2Title, body: landing.problem2Body },
  { title: landing.problem3Title, body: landing.problem3Body },
];

const stages = [
  { title: landing.step1Title, body: landing.step1Body },
  { title: landing.step2Title, body: landing.step2Body },
  { title: landing.step3Title, body: landing.step3Body },
  { title: landing.step4Title, body: landing.step4Body },
];

const guarantees = [
  { term: landing.p1Title, def: landing.p1Body },
  { term: landing.p2Title, def: landing.p2Body },
  { term: landing.p3Title, def: landing.p3Body },
  { term: landing.p4Title, def: landing.p4Body },
  { term: landing.p5Title, def: landing.p5Body },
  { term: landing.p6Title, def: landing.p6Body },
];

const installs = [
  { label: landing.cliUnixLabel, command: landing.cliUnixCmd },
  { label: landing.cliWindowsLabel, command: landing.cliWindowsCmd },
];

const CLI_DOCS_URL =
  'https://github.com/urbanisierung/sharu-io-monorepo/tree/main/crates/safu-node';

export interface LandingProps {
  onLaunch: () => void;
  onWhitepaper: () => void;
}

export function Landing({ onLaunch, onWhitepaper }: LandingProps) {
  return (
    <div class={styles.page}>
      <nav class={styles.nav}>
        <span class={styles.brand}>
          <img class={styles.brandLogo} src="/logo.png" alt={t(landing.logoAlt)} />
          <span class={styles.wordmark}>{t(landing.brand)}</span>
        </span>
        <Button intent="primary" onClick={onLaunch}>
          {t(landing.launch)}
        </Button>
      </nav>

      <header class={cn(styles.hero, styles.reveal)} style={{ '--i': '0' }}>
        <span class={styles.badge}>{t(landing.badge)}</span>
        <h1 class={styles.heroTitle}>
          <span class={styles.heroLine}>{t(landing.heroLine1)}</span>
          <span class={styles.heroLine}>{t(landing.heroLine2)}</span>
          <span class={cn(styles.heroLine, styles.heroLineAccent)}>{t(landing.heroLine3)}</span>
        </h1>
        <p class={styles.heroLede}>{t(landing.heroSubtitle)}</p>
        <div class={styles.actions}>
          <Button intent="primary" onClick={onLaunch}>
            {t(landing.launch)}
          </Button>
          <a class={styles.ghost} href="#pipeline">
            {t(landing.learnMore)}
          </a>
          <button class={styles.textLink} type="button" onClick={onWhitepaper}>
            {t(landing.whitepaper)}
          </button>
        </div>
      </header>

      <section class={cn(styles.section, styles.reveal)} style={{ '--i': '1' }}>
        <p class={styles.kicker}>{t(landing.problemKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.problemTitle)}</h2>
        <div class={styles.problems}>
          {problems.map((item) => (
            <article class={styles.problem} key={item.title.key}>
              <h3 class={styles.problemTitle}>{t(item.title)}</h3>
              <p class={styles.problemBody}>{t(item.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pipeline" class={cn(styles.section, styles.reveal)} style={{ '--i': '2' }}>
        <p class={styles.kicker}>{t(landing.howKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.howTitle)}</h2>
        <ol class={styles.pipeline}>
          {stages.map((item, i) => (
            <li class={styles.stage} key={item.title.key}>
              <span class={styles.stageNum} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div class={styles.stageBody}>
                <h3 class={styles.stageTitle}>{t(item.title)}</h3>
                <p class={styles.stageText}>{t(item.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section class={cn(styles.section, styles.reveal)} style={{ '--i': '3' }}>
        <p class={styles.kicker}>{t(landing.principlesKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.principlesTitle)}</h2>
        <dl class={styles.guarantees}>
          {guarantees.map((item) => (
            <div class={styles.guarantee} key={item.term.key}>
              <dt class={styles.guaranteeTerm}>{t(item.term)}</dt>
              <dd class={styles.guaranteeDef}>{t(item.def)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section class={cn(styles.section, styles.reveal)} style={{ '--i': '4' }}>
        <p class={styles.kicker}>{t(landing.cliKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.cliTitle)}</h2>
        <p class={styles.cliLede}>{t(landing.cliBody)}</p>
        <div class={styles.cliCommands}>
          {installs.map((item) => (
            <div class={styles.cliCommand} key={item.label.key}>
              <span class={styles.cliLabel}>{t(item.label)}</span>
              <code class={styles.cliCode}>{t(item.command)}</code>
            </div>
          ))}
        </div>
        <a class={styles.ghost} href={CLI_DOCS_URL} target="_blank" rel="noreferrer">
          {t(landing.cliLink)}
        </a>
      </section>

      <section class={cn(styles.cta, styles.reveal)} style={{ '--i': '5' }}>
        <h2 class={styles.ctaTitle}>{t(landing.ctaTitle)}</h2>
        <p class={styles.ctaBody}>{t(landing.ctaBody)}</p>
        <Button intent="primary" onClick={onLaunch}>
          {t(landing.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>
        <span class={styles.footerWord}>{t(landing.brand)}</span>
        <span>{t(landing.footer)}</span>
      </footer>
    </div>
  );
}
