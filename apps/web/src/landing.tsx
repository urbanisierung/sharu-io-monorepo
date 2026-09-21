// One-page landing for Sharu, built from the in-repo Cascivo components and
// `--cascivo-*` tokens (plan §2.4). The page is a full-bleed block grid: every
// card group is one bordered container whose cells draw their own right and
// bottom rules, so the page reads as a ruled table rather than a set of floating
// cards. All copy through @cascivo/i18n; no React hooks.
import { cn } from '@cascivo/core';
import type { Message } from '@cascivo/i18n';
import { GITHUB_URL } from '@safu/config';
import styles from './landing.module.css';
import { landing } from './messages.js';
import { tr as t } from './reading-mode.js';
import { Button } from './ui/button.js';
import buttonStyles from './ui/button.module.css';
import { CopyButton } from './ui/copy-button.js';
import { Icon, type IconName } from './ui/icon.js';
import { Stat } from './ui/stat.js';

/** The pipeline section's anchor — the hero's secondary action jumps to it. */
const PIPELINE_ID = 'pipeline';

const problems: readonly { icon: IconName; title: Message<string>; body: Message<string> }[] = [
  { icon: 'key', title: landing.problem1Title, body: landing.problem1Body },
  { icon: 'plug', title: landing.problem2Title, body: landing.problem2Body },
  { icon: 'lock', title: landing.problem3Title, body: landing.problem3Body },
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
  { term: landing.p7Title, def: landing.p7Body },
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
      <section class={styles.hero}>
        <div class={styles.heroGrid}>
          <div class={styles.heroMain}>
            {/* The three lines are hard-broken by the design, never rewrapped,
                and the highlight stays a single rect across its whole line. */}
            <h1 class={styles.heroTitle}>
              <span class={styles.heroLine}>{t(landing.heroLine1)}</span>
              <span class={styles.heroLine}>{t(landing.heroLine2)}</span>
              <span class={styles.heroLine}>
                <span class={styles.mark}>{t(landing.heroLine3)}</span>
              </span>
            </h1>

            <p class={styles.heroLede}>{t(landing.heroSubtitle)}</p>

            <div class={styles.actions}>
              <Button intent="primary" onClick={onLaunch}>
                {t(landing.launch)}
              </Button>
              {/* An in-page jump, so it stays an anchor wearing the secondary
                  button's chrome rather than a button that fakes navigation. */}
              <a class={cn(buttonStyles.button, buttonStyles.neutral)} href={`#${PIPELINE_ID}`}>
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
          </div>

          <div class={styles.heroStats}>
            <Stat
              class={styles.heroStat}
              tone="mark"
              labelPlacement="below"
              value={t(landing.statCryptoValue)}
              label={t(landing.statCryptoLabel)}
            />
            <Stat
              class={styles.heroStat}
              tone="chrome"
              labelPlacement="below"
              value={t(landing.statServersValue)}
              label={t(landing.statServersLabel)}
            />
            <Stat
              class={styles.heroStat}
              tone="ink"
              labelPlacement="below"
              value={t(landing.statP2pValue)}
              label={t(landing.statP2pLabel)}
            />
          </div>
        </div>
      </section>

      {/* One flush row of seven cells, one per principle — a fixed seven-track
          grid that never wraps and never scrolls. */}
      <div class={styles.band}>
        {guarantees.map((item) => (
          <span class={styles.bandCell} key={item.term.key}>
            {t(item.term)}
          </span>
        ))}
      </div>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(landing.problemKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.problemTitle)}</h2>
        <div class={styles.ruled} data-cols="auto">
          {problems.map((item) => (
            <article class={styles.cell} key={item.title.key}>
              <span class={styles.cautionTile} aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              <h3 class={styles.cellTitle}>{t(item.title)}</h3>
              <p class={styles.cellBody}>{t(item.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id={PIPELINE_ID} class={styles.section}>
        <p class={styles.kicker}>{t(landing.howKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.howTitle)}</h2>
        {/* Fixed 2×2, so the four steps always fill their rows. */}
        <ol class={styles.ruled} data-cols="two">
          {stages.map((item, i) => (
            <li class={styles.cell} key={item.title.key}>
              <div class={styles.stepHead}>
                <span class={styles.stepNum} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span class={styles.stepRule} aria-hidden="true" />
              </div>
              <h3 class={styles.cellTitle}>{t(item.title)}</h3>
              <p class={styles.cellBody}>{t(item.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section class={styles.section}>
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

      <section class={styles.section}>
        <p class={styles.kicker}>{t(landing.cliKicker)}</p>
        <h2 class={styles.sectionTitle}>{t(landing.cliTitle)}</h2>
        <p class={styles.cliLede}>{t(landing.cliBody)}</p>

        <div class={styles.ruled} data-cols="install">
          {installs.map((item) => (
            <div class={styles.installCell} key={item.label.key}>
              <span class={styles.installLabel}>{t(item.label)}</span>
              {/* The command wraps rather than clipping or scrolling, because the
                  copy beside it invites the reader to read it before running it. */}
              <div class={styles.command}>
                <code class={styles.commandText}>{t(item.command)}</code>
                <CopyButton
                  iconOnly
                  value={t(item.command)}
                  label={t(landing.cliCopy)}
                  copiedLabel={t(landing.cliCopied)}
                />
              </div>
            </div>
          ))}
        </div>

        <div class={styles.cliFoot}>
          <p class={styles.cliVerify}>{t(landing.cliVerify)}</p>
          <Button intent="neutral" onClick={onCliDocs}>
            {t(landing.cliLink)}
          </Button>
        </div>
      </section>

      <section class={styles.close}>
        <div class={styles.closeInner}>
          <h2 class={styles.closeTitle}>{t(landing.ctaTitle)}</h2>
          <p class={styles.closeBody}>{t(landing.ctaBody)}</p>
          <Button class={styles.closeAction} intent="neutral" onClick={onLaunch}>
            {t(landing.launch)}
          </Button>
        </div>
      </section>

      <footer class={styles.footer}>
        <div class={styles.footerBrand}>
          <img class={styles.footerMark} src="/logo.png" alt="" />
          <span class={styles.footerWord}>{t(landing.brand)}</span>
          <span class={styles.footerTag}>{t(landing.footer)}</span>
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
          <span class={styles.footerRights}>{t(landing.rights)}</span>
        </nav>
      </footer>
    </div>
  );
}
