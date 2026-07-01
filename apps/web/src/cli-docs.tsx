// The backup-node CLI docs (route: /cli-docs): getting started, use cases, and
// the full command + option reference. The reference tables and the quickstart
// are rendered from `cliSpec`, which a drift test regenerates from the Rust
// source (crates/sharu), so the page can't fall behind the CLI. The prose
// re-voices with the global reading mode via `tr` (imported as `t`); the install
// one-liners are reused from the landing copy. Reachable from the landing page's
// backup-node section; `onLaunch` opens the app.

import { cliSpec } from './cli-docs/cli-spec.generated.js';
import styles from './cli-docs.module.css';
import { cliDocs, landing } from './messages.js';
import { tr as t } from './reading-mode.js';
import { Button } from './ui/button.js';

const USE_CASES = [
  { title: cliDocs.uc1Title, body: cliDocs.uc1Body },
  { title: cliDocs.uc2Title, body: cliDocs.uc2Body },
  { title: cliDocs.uc3Title, body: cliDocs.uc3Body },
];

const withArg = (name: string, arg: string | null): string => (arg ? `${name} ${arg}` : name);

/** Build the first-run script straight from the spec, so renamed commands or a
 *  renamed passphrase env var flow through automatically. */
function quickstart(): string {
  const passEnv = cliSpec.options.find((option) => option.required)?.env ?? 'SHARU_PASSPHRASE';
  const order = ['init', 'info', 'link', 'serve'];
  const steps = order
    .map((name) => cliSpec.commands.find((command) => command.name === name))
    .filter((command): command is (typeof cliSpec.commands)[number] => command !== undefined)
    .map((command) => `${cliSpec.binary} ${withArg(command.name, command.arg)}`);
  return [`export ${passEnv}="…"`, ...steps].join('\n');
}

export interface CliDocsProps {
  onLaunch: () => void;
}

export function CliDocs({ onLaunch }: CliDocsProps) {
  return (
    <div class={styles.page}>
      <header class={styles.head}>
        <span class={styles.meta}>{`${cliSpec.binary} · v${cliSpec.version}`}</span>
        <h1 class={styles.title}>{t(cliDocs.title)}</h1>
        <p class={styles.subtitle}>{t(cliDocs.subtitle)}</p>
      </header>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.introHeading)}</h2>
        <p class={styles.body}>{t(cliDocs.introBody)}</p>
      </section>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.useCasesHeading)}</h2>
        <div class={styles.cards}>
          {USE_CASES.map((useCase) => (
            <article class={styles.card} key={useCase.title.key}>
              <h3 class={styles.cardTitle}>{t(useCase.title)}</h3>
              <p class={styles.cardBody}>{t(useCase.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.startHeading)}</h2>
        <p class={styles.body}>{t(cliDocs.startIntro)}</p>

        <h3 class={styles.h3}>{t(cliDocs.installHeading)}</h3>
        <div class={styles.commands}>
          <div class={styles.command}>
            <span class={styles.cmdLabel}>{t(landing.cliUnixLabel)}</span>
            <code class={styles.code}>{t(landing.cliUnixCmd)}</code>
          </div>
          <div class={styles.command}>
            <span class={styles.cmdLabel}>{t(landing.cliWindowsLabel)}</span>
            <code class={styles.code}>{t(landing.cliWindowsCmd)}</code>
          </div>
        </div>
        <p class={styles.note}>{t(cliDocs.installNote)}</p>

        <h3 class={styles.h3}>{t(cliDocs.quickstartHeading)}</h3>
        <p class={styles.body}>{t(cliDocs.quickstartIntro)}</p>
        <pre class={styles.pre}>{quickstart()}</pre>
        <p class={styles.note}>{t(cliDocs.pairNote)}</p>
      </section>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.commandsHeading)}</h2>
        <p class={styles.body}>{t(cliDocs.commandsIntro)}</p>
        <div class={styles.tableWrap}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t(cliDocs.thCommand)}</th>
                <th scope="col">{t(cliDocs.thWhat)}</th>
              </tr>
            </thead>
            <tbody>
              {cliSpec.commands.map((command) => (
                <tr key={command.name}>
                  <td>
                    <code class={styles.inlineCode}>{withArg(command.name, command.arg)}</code>
                  </td>
                  <td>{command.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.configHeading)}</h2>
        <p class={styles.body}>{t(cliDocs.configIntro)}</p>
        <div class={styles.tableWrap}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t(cliDocs.thOption)}</th>
                <th scope="col">{t(cliDocs.thEnv)}</th>
                <th scope="col">{t(cliDocs.thMeaning)}</th>
                <th scope="col">{t(cliDocs.thDefault)}</th>
              </tr>
            </thead>
            <tbody>
              {cliSpec.options.map((option) => (
                <tr key={option.flag}>
                  <td>
                    <code class={styles.inlineCode}>{withArg(option.flag, option.value)}</code>
                    {option.required ? (
                      <span class={styles.badge}>{t(cliDocs.badgeRequired)}</span>
                    ) : null}
                  </td>
                  <td>{option.env ? <code class={styles.inlineCode}>{option.env}</code> : '—'}</td>
                  <td>{option.summary}</td>
                  <td>
                    {option.default ? <code class={styles.inlineCode}>{option.default}</code> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.dataLayoutHeading)}</h2>
        <p class={styles.body}>{t(cliDocs.dataLayoutIntro)}</p>
        <pre class={styles.pre}>{t(cliDocs.dataLayout)}</pre>
      </section>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(cliDocs.securityHeading)}</h2>
        <p class={styles.body}>{t(cliDocs.securityBody)}</p>
      </section>

      <section class={styles.cta}>
        <h2 class={styles.ctaTitle}>{t(cliDocs.ctaTitle)}</h2>
        <p class={styles.ctaBody}>{t(cliDocs.ctaBody)}</p>
        <Button intent="primary" onClick={onLaunch}>
          {t(landing.launch)}
        </Button>
      </section>

      <footer class={styles.footer}>{t(landing.footer)}</footer>
    </div>
  );
}
