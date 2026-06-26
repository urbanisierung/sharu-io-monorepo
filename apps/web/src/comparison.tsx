// Architecture comparison: this system (Iroh / direct-QUIC) vs. the original
// sharu-io approach (js-ipfs + a global DHT + Electron). Rendered from
// @cascivo/i18n copy (no hardcoded strings, no React hooks), mirroring
// docs/architecture-comparison-ipfs-vs-iroh.md. Reachable from the landing page;
// `onBack` returns there and `onLaunch` opens the app.

import styles from './comparison.module.css';
import { comparison } from './messages.js';
import { tr as t } from './reading-mode.js';
import { Button } from './ui/button.js';

const rows = [
  {
    dim: comparison.rowDiscoveryDim,
    old: comparison.rowDiscoveryOld,
    new: comparison.rowDiscoveryNew,
  },
  {
    dim: comparison.rowTransportDim,
    old: comparison.rowTransportOld,
    new: comparison.rowTransportNew,
  },
  { dim: comparison.rowNatDim, old: comparison.rowNatOld, new: comparison.rowNatNew },
  { dim: comparison.rowAddrDim, old: comparison.rowAddrOld, new: comparison.rowAddrNew },
  { dim: comparison.rowRuntimeDim, old: comparison.rowRuntimeOld, new: comparison.rowRuntimeNew },
  { dim: comparison.rowParityDim, old: comparison.rowParityOld, new: comparison.rowParityNew },
  { dim: comparison.rowCryptoDim, old: comparison.rowCryptoOld, new: comparison.rowCryptoNew },
  { dim: comparison.rowStateDim, old: comparison.rowStateOld, new: comparison.rowStateNew },
];

const originalPros = [
  comparison.originalPro1,
  comparison.originalPro2,
  comparison.originalPro3,
  comparison.originalPro4,
];

const originalCons = [
  comparison.originalCon1,
  comparison.originalCon2,
  comparison.originalCon3,
  comparison.originalCon4,
  comparison.originalCon5,
];

const modernPros = [
  comparison.modernPro1,
  comparison.modernPro2,
  comparison.modernPro3,
  comparison.modernPro4,
  comparison.modernPro5,
  comparison.modernPro6,
];

const modernCons = [
  comparison.modernCon1,
  comparison.modernCon2,
  comparison.modernCon3,
  comparison.modernCon4,
];

const reasons = [
  { title: comparison.why1Title, body: comparison.why1Body },
  { title: comparison.why2Title, body: comparison.why2Body },
  { title: comparison.why3Title, body: comparison.why3Body },
  { title: comparison.why4Title, body: comparison.why4Body },
  { title: comparison.why5Title, body: comparison.why5Body },
];

export interface ComparisonProps {
  onLaunch: () => void;
}

export function Comparison({ onLaunch }: ComparisonProps) {
  return (
    <div class={styles.page}>
      <header class={styles.head}>
        <span class={styles.meta}>{t(comparison.meta)}</span>
        <h1 class={styles.title}>{t(comparison.title)}</h1>
        <p class={styles.subtitle}>{t(comparison.subtitle)}</p>
      </header>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(comparison.abstractKicker)}</p>
        <h2 class={styles.h2}>{t(comparison.abstractTitle)}</h2>
        <p class={styles.body}>{t(comparison.abstractBody)}</p>
      </section>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(comparison.tableKicker)}</p>
        <h2 class={styles.h2}>{t(comparison.tableTitle)}</h2>
        <div class={styles.tableWrap}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t(comparison.tableColDimension)}</th>
                <th scope="col">{t(comparison.tableColOriginal)}</th>
                <th scope="col">{t(comparison.tableColModern)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dim.key}>
                  <th scope="row" class={styles.dimCell}>
                    {t(row.dim)}
                  </th>
                  <td class={styles.oldCell}>{t(row.old)}</td>
                  <td class={styles.newCell}>{t(row.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class={styles.section}>
        <div class={styles.columns}>
          <div>
            <p class={styles.kicker}>{t(comparison.originalProsKicker)}</p>
            <h2 class={styles.h2}>{t(comparison.originalProsTitle)}</h2>
            <ul class={styles.cards}>
              {originalPros.map((line) => (
                <li class={styles.card} key={line.key}>
                  {t(line)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p class={styles.kicker}>{t(comparison.originalConsKicker)}</p>
            <h2 class={styles.h2}>{t(comparison.originalConsTitle)}</h2>
            <ul class={styles.cards}>
              {originalCons.map((line) => (
                <li class={`${styles.card} ${styles.cardCon}`} key={line.key}>
                  {t(line)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section class={styles.section}>
        <div class={styles.columns}>
          <div>
            <p class={styles.kicker}>{t(comparison.modernProsKicker)}</p>
            <h2 class={styles.h2}>{t(comparison.modernProsTitle)}</h2>
            <ul class={styles.cards}>
              {modernPros.map((line) => (
                <li class={styles.card} key={line.key}>
                  {t(line)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p class={styles.kicker}>{t(comparison.modernConsKicker)}</p>
            <h2 class={styles.h2}>{t(comparison.modernConsTitle)}</h2>
            <ul class={styles.cards}>
              {modernCons.map((line) => (
                <li class={`${styles.card} ${styles.cardCon}`} key={line.key}>
                  {t(line)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section class={styles.section}>
        <p class={styles.kicker}>{t(comparison.whyKicker)}</p>
        <h2 class={styles.h2}>{t(comparison.whyTitle)}</h2>
        <div class={styles.why}>
          {reasons.map((item) => (
            <article class={styles.whyItem} key={item.title.key}>
              <h3 class={styles.whyTitle}>{t(item.title)}</h3>
              <p class={styles.whyBody}>{t(item.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section class={styles.cta}>
        <Button intent="primary" onClick={onLaunch}>
          {t(comparison.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>{t(comparison.footer)}</footer>
    </div>
  );
}
