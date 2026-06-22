// One-page landing for Sharu (Cascivo primitives + CSS Modules, cyberpunk
// theme). Explains what Sharu is, the problem it solves, and how — then hands
// off to the app via `onLaunch`. All copy through @cascivo/i18n; no React hooks.
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

const steps = [
  { title: landing.step1Title, body: landing.step1Body },
  { title: landing.step2Title, body: landing.step2Body },
  { title: landing.step3Title, body: landing.step3Body },
  { title: landing.step4Title, body: landing.step4Body },
];

const principles = [
  { title: landing.p1Title, body: landing.p1Body },
  { title: landing.p2Title, body: landing.p2Body },
  { title: landing.p3Title, body: landing.p3Body },
  { title: landing.p4Title, body: landing.p4Body },
  { title: landing.p5Title, body: landing.p5Body },
  { title: landing.p6Title, body: landing.p6Body },
];

export interface LandingProps {
  onLaunch: () => void;
  onWhitepaper: () => void;
}

export function Landing({ onLaunch, onWhitepaper }: LandingProps) {
  return (
    <div class={styles.page}>
      <header class={styles.hero}>
        <img class={styles.logo} src="/logo.png" alt={t(landing.logoAlt)} />
        <span class={styles.badge}>{t(landing.badge)}</span>
        <h1 class={styles.brand}>{t(landing.brand)}</h1>
        <p class={styles.title}>{t(landing.heroTitle)}</p>
        <p class={styles.subtitle}>{t(landing.heroSubtitle)}</p>
        <div class={styles.actions}>
          <Button intent="primary" onClick={onLaunch}>
            {t(landing.launch)}
          </Button>
          <a class={styles.ghost} href="#how">
            {t(landing.learnMore)}
          </a>
          <button class={styles.ghost} type="button" onClick={onWhitepaper}>
            {t(landing.whitepaper)}
          </button>
        </div>
      </header>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(landing.problemKicker)}</p>
        <h2 class={styles.h2}>{t(landing.problemTitle)}</h2>
        <div class={styles.grid3}>
          {problems.map((item) => (
            <article class={styles.card} key={item.title.key}>
              <h3 class={styles.cardTitle}>{t(item.title)}</h3>
              <p class={styles.cardBody}>{t(item.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" class={styles.section}>
        <p class={styles.kicker}>{t(landing.howKicker)}</p>
        <h2 class={styles.h2}>{t(landing.howTitle)}</h2>
        <ol class={styles.steps}>
          {steps.map((item) => (
            <li class={styles.step} key={item.title.key}>
              <h3 class={styles.stepTitle}>{t(item.title)}</h3>
              <p class={styles.cardBody}>{t(item.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(landing.principlesKicker)}</p>
        <h2 class={styles.h2}>{t(landing.principlesTitle)}</h2>
        <div class={styles.grid3}>
          {principles.map((item) => (
            <article class={cn(styles.card, styles.principle)} key={item.title.key}>
              <h3 class={styles.cardTitle}>{t(item.title)}</h3>
              <p class={styles.cardBody}>{t(item.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section class={cn(styles.section, styles.cta)}>
        <h2 class={styles.ctaTitle}>{t(landing.ctaTitle)}</h2>
        <p class={styles.subtitle}>{t(landing.ctaBody)}</p>
        <Button intent="primary" onClick={onLaunch}>
          {t(landing.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>{t(landing.footer)}</footer>
    </div>
  );
}
