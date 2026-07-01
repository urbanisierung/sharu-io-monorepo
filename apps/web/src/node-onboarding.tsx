// The browser onboarding view (route `/link`) for the sharu CLI. When the
// operator runs `sharu serve`, it prints a deep link carrying the node's
// pairing code in the URL hash (`/link#node=…`, see pairing.ts `nodeLink`).
// Opening that link lands here: a guided companion to the CLI's first-run
// wizard. It decodes the node identity so the operator can eyeball it against
// the terminal, lays out the round trip (link here, confirm the safety number,
// send this device's code back), and hands off into the app — reusing the
// existing `/app#pair=…` auto-link-on-unlock path. The node code stays in the
// hash, which browsers never send to a server. No hooks; copy via `tr`.

import styles from './cli-docs.module.css';
import { link as messages } from './messages.js';
import { decodePairingCode, readNodeFromHash, readPairingFromHash } from './pairing.js';
import { tr as t } from './reading-mode.js';
import { Button } from './ui/button.js';

const STEPS = [
  { title: messages.step1Title, body: messages.step1Body },
  { title: messages.step2Title, body: messages.step2Body },
  { title: messages.step3Title, body: messages.step3Body },
] as const;

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}…` : id;
}

/** The node pairing code from the URL hash — `#node=…` (the CLI's deep link), or
 *  `#pair=…` as a fallback so a hand-built link still resolves. */
function nodeCodeFromHash(): string | undefined {
  const hash = globalThis.location?.hash ?? '';
  return readNodeFromHash(hash) ?? readPairingFromHash(hash);
}

export interface NodeOnboardingProps {
  /** Continue into the app to unlock and auto-link the node with this code. */
  onContinue: (code: string) => void;
  /** Open the backup-node docs (shown when the link carries no node code). */
  onCliDocs: () => void;
}

export function NodeOnboarding({ onContinue, onCliDocs }: NodeOnboardingProps) {
  const code = nodeCodeFromHash();
  const node = decodeNode(code);

  if (!code || !node) {
    return (
      <div class={styles.page}>
        <header class={styles.head}>
          <h1 class={styles.title}>{t(messages.invalidTitle)}</h1>
          <p class={styles.subtitle}>{t(messages.invalidBody)}</p>
        </header>
        <section class={styles.cta}>
          <Button intent="primary" onClick={onCliDocs}>
            {t(messages.invalidCta)}
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div class={styles.page}>
      <header class={styles.head}>
        <h1 class={styles.title}>{t(messages.title)}</h1>
        <p class={styles.subtitle}>{t(messages.intro)}</p>
      </header>

      <section class={styles.section}>
        <h2 class={styles.h2}>{t(messages.nodeHeading)}</h2>
        <div class={styles.command}>
          <span class={styles.cmdLabel}>{t(messages.signingIdLabel)}</span>
          <code class={styles.code} title={node.signId}>
            {shortId(node.signId)}
          </code>
        </div>
        <div class={styles.command}>
          <span class={styles.cmdLabel}>{t(messages.relayLabel)}</span>
          {node.relayUrl ? (
            <code class={styles.code}>{node.relayUrl}</code>
          ) : (
            <span class={styles.note}>{t(messages.relayUnknown)}</span>
          )}
        </div>
      </section>

      <section class={styles.section}>
        <div class={styles.cards}>
          {STEPS.map((step) => (
            <article class={styles.card} key={step.title.key}>
              <h3 class={styles.cardTitle}>{t(step.title)}</h3>
              <p class={styles.cardBody}>{t(step.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section class={styles.cta}>
        <Button intent="primary" onClick={() => onContinue(code)}>
          {t(messages.cta)}
        </Button>
      </section>
    </div>
  );
}

/** Decode the node identity for display, or undefined if the code is malformed
 *  (the view then shows its "no node code" guidance). */
function decodeNode(code: string | undefined): { signId: string; relayUrl?: string } | undefined {
  if (!code) return undefined;
  try {
    const { addr, signId } = decodePairingCode(code);
    return { signId, relayUrl: addr.relayUrl };
  } catch {
    return undefined;
  }
}
