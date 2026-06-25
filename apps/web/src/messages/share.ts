import { defineMessages } from '@cascivo/i18n';

/** Public share viewer copy: the keyless page that opens a shared file or site
 *  from a link and decrypts it in the browser. */
export const shareView = defineMessages('safu.share', {
  loading: 'Opening the shared file…',
  loadingHint: 'Fetching it from the network and decrypting it in your browser.',
  missingTitle: 'No share in this link',
  missingBody: 'This page opens a public share. The link you followed has no share data in it.',
  failedTitle: 'Couldn’t open this share',
  failedBody: 'The link may be wrong, or the file is no longer hosted. Nothing was decrypted.',
  siteTitle: 'Opening the shared site…',
  siteBody: 'Decrypting its files in your browser, then loading it.',
  siteFrame: 'Shared site',
  download: 'Download',
  zeroKnowledge: 'Decrypted in your browser. The host only ever served ciphertext.',
});

/** ELI5 reading mode — same keys, retold so a five-year-old gets it. */
export const shareViewEli5 = defineMessages('safu.share.eli5', {
  loading: 'Opening your secret file…',
  loadingHint: 'We’re grabbing it and unlocking it right here in front of you.',
  missingTitle: 'There’s nothing to open',
  missingBody:
    'This page opens a secret someone shared. But the link you used doesn’t have any secret inside it.',
  failedTitle: 'We couldn’t open this',
  failedBody:
    'Maybe the link is broken, or the file isn’t kept anywhere anymore. Don’t worry — nothing was unlocked.',
  siteTitle: 'Opening the shared little website…',
  siteBody: 'Unlocking all its pieces right here, then showing it to you.',
  siteFrame: 'Shared website',
  download: 'Save it',
  zeroKnowledge:
    'We opened it right here in front of you. The helper that kept it only ever saw a locked box it couldn’t peek inside.',
});

/** Machine reading mode — same keys, stripped to terse near-protocol notation. */
export const shareViewMachine = defineMessages('safu.share.machine', {
  loading: 'open shared file…',
  loadingHint: 'fetch → decrypt @browser',
  missingTitle: 'no share in link',
  missingBody: 'page := public-share viewer. link → no share payload.',
  failedTitle: 'share open failed',
  failedBody: 'cause := bad link | file unhosted. decrypt := none.',
  siteTitle: 'open shared site…',
  siteBody: 'decrypt files @browser → load',
  siteFrame: 'shared site',
  download: 'download',
  zeroKnowledge: 'decrypt @browser. host served ciphertext only.',
});
