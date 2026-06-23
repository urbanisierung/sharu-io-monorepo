// All user-facing strings flow through @cascivo/i18n (plan §2.4) — no hardcoded
// English in components. The lint guard in this app's test suite enforces it.
import { defineMessages } from '@cascivo/i18n';

/** Landing page copy: what Sharu is, the problem it solves, and how. */
export const landing = defineMessages('safu.landing', {
  brand: 'SHARU',
  logoAlt: 'Sharu wolf logo',
  whitepaper: 'Read the whitepaper',
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

/** Whitepaper copy: a technical description of how Sharu works. Inspired by the
 *  original sharu-io whitepaper, but rewritten for this architecture (Iroh +
 *  BLAKE3 + Argon2id + AES-256-GCM + a CRDT allocation table). */
export const whitepaper = defineMessages('safu.whitepaper', {
  back: 'Back',
  title: 'Sharu Whitepaper',
  subtitle: 'A zero-knowledge, local-first backup & sync protocol',
  meta: 'Revision 1 · 2026 · sharu.io',
  launch: 'Launch the app',

  abstractKicker: 'Abstract',
  abstractTitle: 'Backup you do not have to trust anyone to keep.',
  abstractBody:
    'Sharu is a decentralized, zero-knowledge, local-first backup and sync system. Files are encrypted on the device that owns them and replicated peer-to-peer across the user’s own machines. There are no servers that hold plaintext, no accounts, and no operator who can read, scan, or withhold a user’s data. This paper describes the protocol: how identity and keys are derived, how files are encrypted and addressed, how devices discover one another and exchange blocks, and how concurrent edits converge without a coordinator.',

  modelKicker: 'Threat model',
  modelTitle: 'Assume the network and any relay are hostile.',
  modelBody:
    'Sharu treats every byte that leaves a device as observable by an adversary. Relays, transit links, and storage that outlive a device are all assumed to be controlled by an attacker whose goal is to read or tamper with user data. The only trusted boundary is the user’s own device while it is unlocked.',
  modelBody2:
    'From this it follows that only ciphertext may cross the wire, keys may never be persisted in plaintext, and every block a device receives must be verifiable against an address it already trusts. Availability — keeping a copy reachable — is explicitly separated from confidentiality and integrity, so an untrusted host can help store data without ever being able to read it.',

  identityKicker: 'Identity & keys',
  identityTitle: 'One passphrase, derived locally, never transmitted.',
  identityBody:
    'A device’s identity is derived from a single user passphrase using Argon2id, a memory-hard key-derivation function chosen to make brute-force search expensive. The derived root key never leaves the device and is never written to disk in plaintext; it exists only in memory while the app is unlocked. Forgetting the passphrase is therefore unrecoverable by design — there is no reset and no escrow, because anyone who could reset it could also read the data.',
  identityBody2:
    'From the root key the device derives the symmetric keys used to seal content and the long-lived keypair that identifies it to peers. A recovery sheet — the passphrase, printed for offline storage — is the user’s sole backstop.',

  cryptoKicker: 'Encryption & chunking',
  cryptoTitle: 'Stream, split, seal — never buffer a whole file.',
  cryptoBody:
    'Files are processed as streams. Each file is split into content-defined chunks so that an edit re-encrypts only the chunks that actually changed, and identical chunks across files are stored once. Every chunk is sealed independently with AES-256-GCM, whose authentication tag lets the reader detect any tampering before the plaintext is ever exposed.',
  cryptoBody2:
    'Because the pipeline is streaming end to end, a multi-gigabyte file is encrypted, hashed, and transferred in bounded memory. The plaintext is never assembled in full, on disk or in RAM, on either side of a transfer.',

  addressingKicker: 'Content addressing',
  addressingTitle: 'Every block is named by its BLAKE3 hash.',
  addressingBody:
    'Each sealed block is addressed by the BLAKE3 hash of its ciphertext. The address is both the storage key and a proof of integrity: a device asks for a block by hash and verifies the bytes it receives against that same hash before trusting them. A corrupted or substituted block simply fails to match and is discarded.',
  addressingBody2:
    'Content addressing also gives Sharu deduplication for free and makes storage tamper-evident — the name of a block cannot agree with altered contents.',

  syncKicker: 'Peer-to-peer sync',
  syncTitle: 'Devices talk directly; the relay only sees ciphertext.',
  syncBody:
    'Devices find and connect to each other over Iroh, a QUIC-based peer-to-peer transport. On desktop, NAT hole-punching establishes direct connections between machines; in the browser, where direct sockets are unavailable, traffic is carried through a relay. In both cases the relay and the network see only authenticated ciphertext blocks — never keys, never plaintext, never file names.',
  syncBody2:
    'Synchronization is a content exchange: a device announces which block hashes it has, requests the ones it is missing, and verifies each against its address on arrival. The transport is therefore interchangeable and untrusted; security does not depend on it.',

  crdtKicker: 'Conflict-free state',
  crdtTitle: 'A replicated table that converges without a coordinator.',
  crdtBody:
    'Which blocks compose which file, and the current state of every file across devices, is tracked in a conflict-free replicated data type (CRDT) — an allocation table that every device holds a copy of and updates locally. When devices reconnect, their tables merge deterministically: the same set of updates always yields the same result, regardless of the order they arrive in.',
  crdtBody2:
    'Conflict resolution lives entirely in this replicated document and is decoupled from transport state, so a write is never silently dropped and two devices that have seen the same history always agree. Offline edits are first-class: the network is an optimization, not a prerequisite.',

  trustKicker: 'Device trust',
  trustTitle: 'Pair deliberately, verify out of band, revoke cleanly.',
  trustBody:
    'Adding a device is an explicit act. A new device presents a link code (also rendered as a QR code) and, on pairing, both devices display a short authentication string (SAS) derived from the connection. The user confirms that the two strings match out of band, which defeats a machine-in-the-middle attempting to impersonate a peer.',
  trustBody2:
    'Trust is revocable: a lost or compromised device can be blocked so it can no longer make changes, without re-keying the entire history. Verified, unverified, and blocked are explicit states surfaced in the UI.',

  guaranteesKicker: 'Guarantees',
  guaranteesTitle: 'Properties enforced by construction, not by policy.',
  guarantee1:
    'Zero-knowledge — only ciphertext crosses the wire; keys are never persisted in plaintext.',
  guarantee2: 'Local-first — data lives on the user’s devices and works fully offline.',
  guarantee3: 'Peer-to-peer — no central server owns the data; devices sync directly.',
  guarantee4: 'Streaming — files are never fully buffered, so backups stay memory-bounded.',
  guarantee5: 'Content-addressed — blocks are named by BLAKE3 hash and are tamper-evident.',
  guarantee6:
    'Conflict-free — a CRDT allocation table converges deterministically and never drops a write.',

  footer: 'Sharu — zero-knowledge, local-first backup & sync',
});

export const messages = defineMessages('safu', {
  title: 'Sharu',
  logoAlt: 'Sharu wolf logo',
  tagline: 'Zero-knowledge, local-first backup & sync',
  primaryNav: 'Main navigation',
  navFiles: 'Files',
  navDevices: 'Devices',
  navSettings: 'Settings',
  booting: 'Getting things ready…',
  syncUpToDate: 'Up to date',
  syncingNow: 'Syncing…',
  syncProblem: 'Sync problem',
  createTitle: 'Create a wallet',
  createSubtitle:
    'Name it and set a password. The password locks this wallet — pick something you’ll remember.',
  unlockTitle: 'Welcome back',
  unlockSubtitle: 'Enter your password to open this wallet.',
  pairTitle: 'Link this device',
  pairSubtitle:
    'Enter the same password you use on your other device. We’ll link them automatically once it’s unlocked.',
  walletNameLabel: 'Wallet name',
  walletNamePlaceholder: 'Name this wallet (e.g. Personal)',
  passwordLabel: 'Password',
  passwordConfirmLabel: 'Repeat password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  passwordTooShort: 'Use at least 8 characters.',
  passwordMismatch: 'The two passwords don’t match.',
  passwordWarning:
    'This password is your only key. If you forget it, your files can’t be recovered — there is no reset.',
  create: 'Create wallet',
  unlock: 'Unlock',
  unlocking: 'Unlocking…',
  useAnotherWallet: 'Use a different wallet',
  walletsTitle: 'Your wallets',
  walletsSubtitle: 'Choose a wallet to open, or add another to this device.',
  newWallet: 'Create a new wallet',
  restoreWallet: 'Restore from a backup',
  restoreError: 'That file isn’t a valid Sharu wallet backup.',
  linking: 'Linking your other device…',
  walletHeading: 'Wallet',
  backupWallet: 'Back up this wallet',
  backupHint:
    'Save a backup file to restore this wallet on another device. It contains your password — keep it private.',
  switchWallet: 'Switch wallet',
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
  emptyTitle: 'Nothing here yet',
  emptyBody:
    'Drag files anywhere onto this panel, or use Add files. Everything is encrypted on this device before it syncs.',
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
  scanPrompt: 'Scan this with your other device’s camera, or share the link.',
  qrLabel: 'QR code to link another device',
  copyLink: 'Copy link',
  shareLink: 'Share link',
  incomingPair: 'A device wants to link. Enter your password, then tap Link device.',
  copy: 'Copy',
  copied: 'Copied',
  renameDevice: 'Rename',
  renamePlaceholder: 'Name this device (e.g. Mom’s phone)',
  saveName: 'Save',
  cancelName: 'Cancel',
  unnamedDevice: 'Unnamed device',
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
