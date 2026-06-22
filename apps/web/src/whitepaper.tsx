// The in-app whitepaper: a technical description of how Sharu works, rendered
// from @cascivo/i18n copy (no hardcoded strings, no React hooks). Reachable from
// the landing page; `onBack` returns there and `onLaunch` opens the app.
import { t } from '@cascivo/i18n';
import { whitepaper } from './messages.js';
import { Button } from './ui/button.js';
import styles from './whitepaper.module.css';

const sections = [
  {
    kicker: whitepaper.modelKicker,
    title: whitepaper.modelTitle,
    body: [whitepaper.modelBody, whitepaper.modelBody2],
  },
  {
    kicker: whitepaper.identityKicker,
    title: whitepaper.identityTitle,
    body: [whitepaper.identityBody, whitepaper.identityBody2],
  },
  {
    kicker: whitepaper.cryptoKicker,
    title: whitepaper.cryptoTitle,
    body: [whitepaper.cryptoBody, whitepaper.cryptoBody2],
  },
  {
    kicker: whitepaper.addressingKicker,
    title: whitepaper.addressingTitle,
    body: [whitepaper.addressingBody, whitepaper.addressingBody2],
  },
  {
    kicker: whitepaper.syncKicker,
    title: whitepaper.syncTitle,
    body: [whitepaper.syncBody, whitepaper.syncBody2],
  },
  {
    kicker: whitepaper.crdtKicker,
    title: whitepaper.crdtTitle,
    body: [whitepaper.crdtBody, whitepaper.crdtBody2],
  },
  {
    kicker: whitepaper.trustKicker,
    title: whitepaper.trustTitle,
    body: [whitepaper.trustBody, whitepaper.trustBody2],
  },
];

const guarantees = [
  whitepaper.guarantee1,
  whitepaper.guarantee2,
  whitepaper.guarantee3,
  whitepaper.guarantee4,
  whitepaper.guarantee5,
  whitepaper.guarantee6,
];

export interface WhitepaperProps {
  onBack: () => void;
  onLaunch: () => void;
}

export function Whitepaper({ onBack, onLaunch }: WhitepaperProps) {
  return (
    <div class={styles.page}>
      <nav class={styles.nav}>
        <Button intent="neutral" onClick={onBack}>
          {t(whitepaper.back)}
        </Button>
        <span class={styles.meta}>{t(whitepaper.meta)}</span>
      </nav>

      <header class={styles.head}>
        <h1 class={styles.title}>{t(whitepaper.title)}</h1>
        <p class={styles.subtitle}>{t(whitepaper.subtitle)}</p>
      </header>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(whitepaper.abstractKicker)}</p>
        <h2 class={styles.h2}>{t(whitepaper.abstractTitle)}</h2>
        <p class={styles.body}>{t(whitepaper.abstractBody)}</p>
      </section>

      {sections.map((item) => (
        <section class={styles.section} key={item.kicker.key}>
          <p class={styles.kicker}>{t(item.kicker)}</p>
          <h2 class={styles.h2}>{t(item.title)}</h2>
          {item.body.map((para) => (
            <p class={styles.body} key={para.key}>
              {t(para)}
            </p>
          ))}
        </section>
      ))}

      <section class={styles.section}>
        <p class={styles.kicker}>{t(whitepaper.guaranteesKicker)}</p>
        <h2 class={styles.h2}>{t(whitepaper.guaranteesTitle)}</h2>
        <ul class={styles.guarantees}>
          {guarantees.map((line) => (
            <li class={styles.guarantee} key={line.key}>
              {t(line)}
            </li>
          ))}
        </ul>
      </section>

      <section class={styles.cta}>
        <Button intent="primary" onClick={onLaunch}>
          {t(whitepaper.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>{t(whitepaper.footer)}</footer>
    </div>
  );
}
