import { defineMessages } from '@cascivo/i18n';

/** Public share viewer copy: the keyless page that opens a shared file or site
 *  from a link and decrypts it in the browser. */
export const shareView = defineMessages('safu.share', {
  loading: 'Opening the shared file…',
  loadingHint: 'Fetching it from the network and decrypting it in your browser.',
  sharedWithYou: 'Someone shared a file with you',
  missingTitle: 'No share in this link',
  missingBody: 'This page opens a public share. The link you followed has no share data in it.',
  failedTitle: 'Couldn’t open this share',
  failedBody:
    'The file may be offline, or the link got cut short. If you opened this inside another app like WhatsApp, try opening it in your normal browser instead.',
  retry: 'Try again',
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
  sharedWithYou: 'Someone sent you a file',
  missingTitle: 'There’s nothing to open',
  missingBody:
    'This page opens a secret someone shared. But the link you used doesn’t have any secret inside it.',
  failedTitle: 'We couldn’t open this',
  failedBody:
    'Maybe the file isn’t online right now, or the link got cut off. If you tapped it inside another app like WhatsApp, try opening it in your normal web browser instead. Don’t worry — nothing was unlocked.',
  retry: 'Try again',
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
  sharedWithYou: 'inbound share',
  missingTitle: 'no share in link',
  missingBody: 'page := public-share viewer. link → no share payload.',
  failedTitle: 'share open failed',
  failedBody:
    'cause := file offline | link truncated | in-app webview. fix := retry | open in full browser.',
  retry: 'retry',
  siteTitle: 'open shared site…',
  siteBody: 'decrypt files @browser → load',
  siteFrame: 'shared site',
  download: 'download',
  zeroKnowledge: 'decrypt @browser. host served ciphertext only.',
});
