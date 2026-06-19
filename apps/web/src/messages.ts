// All user-facing strings flow through @cascivo/i18n (plan §2.4) — no hardcoded
// English in components. The lint guard in this app's test suite enforces it.
import { defineMessages } from '@cascivo/i18n';

/** Landing page copy: what Sharu is, the problem it solves, and how. */
export const landing = defineMessages('safu.landing', {
  brand: 'SHARU',
  badge: 'zero-knowledge · local-first · peer-to-peer',
  heroTitle: 'Your data. Your devices. Nobody else.',
  heroSubtitle:
    'Sharu is a decentralized, zero-knowledge, local-first backup and sync platform. Files are encrypted on your device and synced peer-to-peer across your own machines — no servers, no accounts, and no one who can read them but you.',
  launch: 'Launch the app',
  learnMore: 'See how it works',

  problemKicker: 'The problem',
  problemTitle: 'Cloud backup asks you to trust someone else with everything.',
  problem1Title: 'You hand over the keys',
  problem1Body:
    'Conventional cloud storage can read, scan, and monetize your files. One breach or quiet policy change exposes a lifetime of data.',
  problem2Title: 'A single point of failure',
  problem2Body:
    'Accounts get locked, companies shut down, terms change. Your backup should not depend on one provider staying alive and benevolent.',
  problem3Title: 'Lock-in and rent',
  problem3Body:
    'Your own files held behind a monthly subscription and a proprietary client you do not control.',

  howKicker: 'How it works',
  howTitle: 'Encrypt locally. Sync directly. Restore anywhere.',
  step1Title: '01 — Encrypt on device',
  step1Body:
    'Your passphrase derives a key with Argon2id. Files are split into content-defined chunks and sealed with AES-256-GCM. The key never leaves your device.',
  step2Title: '02 — Address by hash',
  step2Body:
    'Every encrypted block is addressed by its BLAKE3 hash — content-addressed, tamper-evident storage where only ciphertext is ever written.',
  step3Title: '03 — Sync peer-to-peer',
  step3Body:
    'Your devices find each other over Iroh (QUIC) and exchange encrypted blocks directly — relay-only in the browser, direct hole-punching on desktop. The relay only ever sees ciphertext.',
  step4Title: '04 — Restore with proof',
  step4Body:
    'A conflict-free replicated table tracks every file across devices. Restore reverses the pipeline and verifies each block against its hash.',

  principlesKicker: 'Principles',
  principlesTitle: 'Built on guarantees, not promises.',
  p1Title: 'Zero-knowledge',
  p1Body: 'Only ciphertext crosses the wire. Keys are never persisted in plaintext.',
  p2Title: 'Local-first',
  p2Body:
    'Your files live on your devices and work offline. The network is an optimization, not a dependency.',
  p3Title: 'Peer-to-peer',
  p3Body: 'No central server owns your data. Devices sync directly with each other.',
  p4Title: 'Streaming',
  p4Body: 'Files are never fully buffered — multi-gigabyte backups stay memory-bounded.',
  p5Title: 'Conflict-free',
  p5Body: 'A CRDT allocation table converges deterministically and never silently drops a write.',
  p6Title: 'Yours to own',
  p6Body:
    'Open architecture, content you can self-host, and a revocable trust model for lost devices.',

  ctaTitle: 'Take your backups back.',
  ctaBody: 'No account. No upload to anyone. Set a passphrase and start.',
  footer: 'Sharu — zero-knowledge, local-first backup & sync',
});

export const messages = defineMessages('safu', {
  title: 'Safu',
  tagline: 'Zero-knowledge, local-first backup & sync',
  booting: 'Booting the secure runtime…',
  firstRunPrompt: 'Enter a passphrase to derive your encryption key',
  passphrasePlaceholder: 'Passphrase',
  unlock: 'Unlock',
  dropPrompt: 'Drop files here to back them up',
  dropValid: 'Release to encrypt and sync',
  dropInvalid: 'That item can’t be backed up',
  chunking: 'Encrypting and chunking…',
  success: 'Backed up and synced',
  errorGeneric: 'Backup failed',
  retry: 'Try again',
  noPeers: 'No paired devices yet — open Safu on another device with the same passphrase',
  peersOnline: '{count} device(s) syncing',
  syncStatus: 'Sync: {status}',
  filesHeading: 'Backed-up files',
  empty: 'Nothing backed up yet',
  download: 'Download',
  devicesHeading: 'Devices',
  yourCode: 'Your connection code (share to pair)',
  copy: 'Copy',
  copied: 'Copied',
  peerCodePlaceholder: 'Paste a device’s connection code',
  pair: 'Pair',
  pairError: 'That connection code isn’t valid',
  sasPrompt: 'Compare this code on both devices before trusting it:',
  confirm: 'Codes match',
  reject: 'Codes differ',
  statusPending: 'Unverified',
  statusVerified: 'Verified',
  statusRejected: 'Rejected — writes blocked',
});
