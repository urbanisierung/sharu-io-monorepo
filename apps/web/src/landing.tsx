// One-page landing for Sharu (Cascivo primitives + CSS Modules, cyberpunk
// theme). A Narrative Workflow: the page spine is the encryption pipeline —
// Encrypt → Address → Sync → Restore — then hands off to the app via `onLaunch`.
// All copy through @cascivo/i18n; no React hooks.
import { cn } from '@cascivo/core';
import { GITHUB_URL } from '@safu/config';
import styles from './landing.module.css';
import { landing } from './messages.js';
import { tr as t } from './reading-mode.js';
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

export interface LandingProps {
  onLaunch: () => void;
  onWhitepaper: () => void;
  onComparison: () => void;
  onFlow: () => void;
  onCliDocs: () => void;
}

export function Landing({ onLaunch, onWhitepaper, onComparison, onFlow, onCliDocs }: LandingProps) {
  return (
    <div class={styles.page}>
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
        </div>
        <div class={styles.heroLinks}>
          <button class={styles.textLink} type="button" onClick={onFlow}>
            {t(landing.watchFlow)}
          </button>
          <button class={styles.textLink} type="button" onClick={onWhitepaper}>
            {t(landing.whitepaper)}
          </button>
          <button class={styles.textLink} type="button" onClick={onComparison}>
            {t(landing.comparison)}
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
        <p class={styles.cliVerify}>{t(landing.cliVerify)}</p>
        <button class={styles.ghost} type="button" onClick={onCliDocs}>
          {t(landing.cliLink)}
        </button>
      </section>

      <section class={cn(styles.cta, styles.reveal)} style={{ '--i': '5' }}>
        <h2 class={styles.ctaTitle}>{t(landing.ctaTitle)}</h2>
        <p class={styles.ctaBody}>{t(landing.ctaBody)}</p>
        <Button intent="primary" onClick={onLaunch}>
          {t(landing.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>
        <div class={styles.footerBrand}>
          <span class={styles.footerWord}>{t(landing.brand)}</span>
          <span>{t(landing.footer)}</span>
        </div>
        <nav class={styles.footerLinks} aria-label={t(landing.footerNav)}>
          <button class={styles.footerLink} type="button" onClick={onWhitepaper}>
            {t(landing.whitepaper)}
          </button>
          <button class={styles.footerLink} type="button" onClick={onFlow}>
            {t(landing.watchFlow)}
          </button>
          <button class={styles.footerLink} type="button" onClick={onComparison}>
            {t(landing.comparison)}
          </button>
          <button class={styles.footerLink} type="button" onClick={onCliDocs}>
            {t(landing.cliLink)}
          </button>
          <a class={styles.footerLink} href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
            {t(landing.sourceLink)}
          </a>
        </nav>
        <span class={styles.footerRights}>{t(landing.rights)}</span>
      </footer>
    </div>
  );
}
