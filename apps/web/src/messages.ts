// All user-facing strings flow through @cascivo/i18n (plan §2.4) — no hardcoded
// English in components. The lint guard in this app's test suite enforces it.
//
// Each surface owns a `messages/<name>.ts` file holding three parallel
// namespaces — regular, ELI5, and machine — with identical keys. Components read
// the active one through `tr` (see reading-mode.ts) so the reading-mode toggle
// re-voices the whole app. This barrel keeps the historical `./messages.js`
// import path stable and wires the variants to the resolver.
import { messages, messagesEli5, messagesMachine } from './messages/app.js';
import { cliDocs, cliDocsEli5, cliDocsMachine } from './messages/cli-docs.js';
import { comparison, comparisonEli5, comparisonMachine } from './messages/comparison.js';
import { flow, flowEli5, flowMachine } from './messages/flow.js';
import { landing, landingEli5, landingMachine } from './messages/landing.js';
import { link, linkEli5, linkMachine } from './messages/link.js';
import { nav } from './messages/nav.js';
import { shareView, shareViewEli5, shareViewMachine } from './messages/share.js';
import { whitepaper, whitepaperEli5, whitepaperMachine } from './messages/whitepaper.js';
import { registerVariants } from './reading-mode.js';

export {
  cliDocs,
  cliDocsEli5,
  cliDocsMachine,
  comparison,
  comparisonEli5,
  comparisonMachine,
  flow,
  flowEli5,
  flowMachine,
  landing,
  landingEli5,
  landingMachine,
  link,
  linkEli5,
  linkMachine,
  messages,
  messagesEli5,
  messagesMachine,
  nav,
  shareView,
  shareViewEli5,
  shareViewMachine,
  whitepaper,
  whitepaperEli5,
  whitepaperMachine,
};

// Wire each namespace's three voices to the reading-mode resolver, so `tr`
// (reading-mode.ts) can swap any regular message for its ELI5 / machine sibling.
registerVariants(landing, landingEli5, landingMachine);
registerVariants(link, linkEli5, linkMachine);
registerVariants(whitepaper, whitepaperEli5, whitepaperMachine);
registerVariants(comparison, comparisonEli5, comparisonMachine);
registerVariants(cliDocs, cliDocsEli5, cliDocsMachine);
registerVariants(flow, flowEli5, flowMachine);
registerVariants(shareView, shareViewEli5, shareViewMachine);
registerVariants(messages, messagesEli5, messagesMachine);
