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
  booting: 'Getting things ready…',
  createTitle: 'Create your password',
  createSubtitle: 'This password locks your files. Pick something you’ll remember.',
  unlockTitle: 'Welcome back',
  unlockSubtitle: 'Enter your password to open your files.',
  passwordLabel: 'Password',
  passwordConfirmLabel: 'Repeat password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  passwordTooShort: 'Use at least 8 characters.',
  passwordMismatch: 'The two passwords don’t match.',
  passwordWarning:
    'This password is your only key. If you forget it, your files can’t be recovered — there is no reset.',
  create: 'Create password',
  unlock: 'Unlock',
  unlocking: 'Unlocking…',
  wrongPassword:
    'That password doesn’t match the one set on this device. Enter the password you created here.',
  unlockFailed: 'Something went wrong unlocking. Please try again.',
  saveRecovery: 'Save a recovery sheet',
  recoveryFilename: 'sharu-recovery.txt',
  recoverySheet:
    'SHARU RECOVERY SHEET\n\nYour password:\n{password}\n\nKeep this somewhere safe and private. Anyone with this password can read your files — and without it, your files cannot be recovered. There is no reset.\n',
  backupWarn: 'These files are only on this device. Add another device to keep them safe.',
  backupOk: 'Backed up · synced to {count} device(s)',
  dropPrompt: 'Drop files here to back them up',
  dropValid: 'Release to encrypt and sync',
  dropInvalid: 'That item can’t be backed up',
  addFiles: 'Add files',
  chunking: 'Encrypting and chunking…',
  success: 'Backed up and synced',
  errorGeneric: 'Backup failed',
  retry: 'Try again',
  addMore: 'Add more',
  backingUp: 'Backing up',
  fileQueued: 'Waiting',
  fileAdding: 'Adding…',
  fileDone: 'Safe',
  fileError: 'Failed',
  noPeers:
    'No other devices yet. Open Sharu on your phone or another computer with the same password to back up.',
  peersOnline: '{count} device(s) syncing',
  syncStatus: 'Sync: {status}',
  filesHeading: 'Your files',
  empty: 'Nothing here yet — drop files above or tap “Add files” to protect your first one.',
  download: 'Download',
  restoreFailed: 'We couldn’t open this file. Make sure every device uses the same password.',
  searchFiles: 'Search files',
  noMatches: 'No files match “{query}”',
  storageSummary: '{count} file(s) · {size}',
  colName: 'Name',
  colSize: 'Size',
  colModified: 'Modified',
  colChunks: 'Chunks',
  delete: 'Delete',
  deleteConfirm: 'Delete it?',
  deleteYes: 'Remove',
  deleteCancel: 'Keep',
  devicesHeading: 'Devices',
  yourCode: 'Your link code (share it with your other device)',
  copy: 'Copy',
  copied: 'Copied',
  peerCodePlaceholder: 'Paste the link code from your other device',
  pair: 'Link device',
  pairError: 'That link code doesn’t look right. Copy it again from your other device.',
  sasPrompt: 'Check that both devices show the same safety number:',
  confirm: 'Codes match',
  reject: 'Codes differ',
  statusPending: 'Unverified',
  statusVerified: 'Verified',
  statusRejected: 'Blocked — this device can no longer make changes',
  watchHeading: 'Watched folders',
  watchPlaceholder: 'Folder path to auto-back-up',
  watch: 'Watch folder',
});
