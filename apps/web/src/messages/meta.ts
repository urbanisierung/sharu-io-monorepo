import { defineMessages } from '@cascivo/i18n';

/** Per-route document `<title>` and meta description, applied by the router on
 *  every navigation (see `router.ts`). Deliberately stable copy — not
 *  reading-mode-aware — because these surface in browser tabs, history, search
 *  results and link unfurls, where one canonical voice is what's wanted. */
export const meta = defineMessages('safu.meta', {
  landingTitle: 'Sharu — zero-knowledge, local-first backup & sync',
  landingDesc:
    'Sharu is a zero-knowledge, local-first backup & sync platform. Files are encrypted on your device and synced peer-to-peer across your own machines — no servers, no accounts, no one who can read them but you.',
  whitepaperTitle: 'Whitepaper · Sharu',
  whitepaperDesc:
    'The Sharu protocol: Argon2id key derivation, AES-256-GCM chunks, BLAKE3 content addressing, conflict-free CRDT sync over Iroh, and signed authorship — guarantees enforced by tests.',
  comparisonTitle: 'IPFS vs. Iroh · Sharu',
  comparisonDesc:
    'Why Sharu syncs over Iroh instead of IPFS: encryption before the transport boundary, direct peer-to-peer transfer, and privacy as an invariant rather than a convention.',
  howTitle: 'How it works · Sharu',
  howDesc:
    'How Sharu works: encrypt on device, address by hash, sync peer-to-peer over Iroh, and restore anywhere with per-block verification.',
  cliTitle: 'Backup node (CLI) · Sharu',
  cliDesc:
    'Run safu-node on a server, NAS, or Raspberry Pi to keep an always-on, zero-knowledge ciphertext replica of everything your devices back up.',
  appTitle: 'Your files · Sharu',
  appDesc:
    'Sharu is a zero-knowledge, local-first backup & sync platform — your files, encrypted on your device and synced across your own machines.',
  shareTitle: 'Shared · Sharu',
  shareDesc: 'A zero-knowledge public share, decrypted in your browser.',
});
