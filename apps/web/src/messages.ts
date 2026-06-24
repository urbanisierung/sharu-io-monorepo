// All user-facing strings flow through @cascivo/i18n (plan §2.4) — no hardcoded
// English in components. The lint guard in this app's test suite enforces it.
import { defineMessages } from '@cascivo/i18n';
import { SITE_URL } from '@safu/config';

/** Landing page copy: what Sharu is, the problem it solves, and how. */
export const landing = defineMessages('safu.landing', {
  brand: 'SHARU',
  logoAlt: 'Sharu wolf logo',
  whitepaper: 'Read the whitepaper',
  comparison: 'IPFS vs. Iroh',
  badge: 'zero-knowledge · local-first · peer-to-peer',
  heroLine1: 'Your data.',
  heroLine2: 'Your devices.',
  heroLine3: 'Nobody else.',
  heroSubtitle:
    'Sharu is a decentralized, zero-knowledge, local-first backup and sync platform. Files are encrypted on your device and synced peer-to-peer across your own machines — no servers, no accounts, and no one who can read them but you.',
  launch: 'Launch the app',
  learnMore: 'See the pipeline',
  watchFlow: 'How it works',

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
  step1Title: 'Encrypt on device',
  step1Body:
    'Your passphrase derives a key with Argon2id. Files are split into content-defined chunks and sealed with AES-256-GCM. The key never leaves your device.',
  step2Title: 'Address by hash',
  step2Body:
    'Every encrypted block is addressed by its BLAKE3 hash — content-addressed, tamper-evident storage where only ciphertext is ever written.',
  step3Title: 'Sync peer-to-peer',
  step3Body:
    'Your devices find each other over Iroh (QUIC) and exchange encrypted blocks directly — relay-only in the browser, direct hole-punching on desktop. The relay only ever sees ciphertext.',
  step4Title: 'Restore with proof',
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

  cliKicker: 'Backup node',
  cliTitle: 'Add an always-on replica from your terminal.',
  cliBody:
    'Run safu-node on a server, NAS, or Raspberry Pi to keep a full ciphertext replica of everything your devices back up — an always-reachable copy, zero-knowledge and over Iroh. One command installs it; link a device with its connection code and it starts replicating.',
  cliUnixLabel: 'Linux & macOS',
  cliUnixCmd: `curl -fsSL ${SITE_URL}/install.sh | sh`,
  cliWindowsLabel: 'Windows · PowerShell',
  cliWindowsCmd: `irm ${SITE_URL}/install.ps1 | iex`,
  cliLink: 'Read the backup-node docs',

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

/** Comparison page copy: this architecture (Iroh / direct-QUIC) vs. the original
 *  sharu-io approach (2019-era js-ipfs + a global DHT + Electron). Mirrors
 *  docs/architecture-comparison-ipfs-vs-iroh.md. */
export const comparison = defineMessages('safu.comparison', {
  back: 'Back',
  title: 'IPFS vs. Iroh',
  subtitle: 'Why Sharu was rebuilt on direct-QUIC peer-to-peer transport',
  meta: 'Architecture note · 2026 · sharu.io',
  launch: 'Launch the app',

  abstractKicker: 'In one line',
  abstractTitle: 'Two ways to move encrypted blocks between devices.',
  abstractBody:
    'The original Sharu used IPFS to get content addressing and “store it anywhere” decentralization for free — at the cost of DHT latency, fragile connectivity behind NAT, a heavy Electron runtime, and a security model bolted onto storage. The rewrite keeps the one IPFS idea that earns its place — addressing blocks by their hash — and rebuilds everything else around what this product actually is: private, instant, zero-knowledge sync between a user’s own devices.',

  tableKicker: 'Side by side',
  tableTitle: 'The same job, two architectures.',
  tableColDimension: 'Dimension',
  tableColOriginal: 'Original (IPFS)',
  tableColModern: 'Project Safu (Iroh)',

  rowDiscoveryDim: 'Content discovery',
  rowDiscoveryOld: 'Global Distributed Hash Table (DHT) routing',
  rowDiscoveryNew: 'Direct node-to-node; the public key is the address',
  rowTransportDim: 'Transport',
  rowTransportOld: 'libp2p streams over the DHT-resolved path',
  rowTransportNew: 'Native QUIC (iroh-blobs for blocks, iroh-docs for state)',
  rowNatDim: 'NAT traversal',
  rowNatOld: 'DHT + relay; fragile behind symmetric NAT',
  rowNatNew: 'UDP hole-punching with DERP/relay fallback',
  rowAddrDim: 'Content addressing',
  rowAddrOld: 'CIDs (multihash, typically SHA-256)',
  rowAddrNew: 'BLAKE3 hash of the ciphertext',
  rowRuntimeDim: 'Runtime',
  rowRuntimeOld: 'Electron (bundled Chromium + Node)',
  rowRuntimeNew: 'Tauri 2.0 (system webview + small Rust core)',
  rowParityDim: 'Web / desktop parity',
  rowParityOld: 'Separate js-ipfs browser path',
  rowParityNew: 'One Rust core → WASM on web, native on desktop',
  rowCryptoDim: 'Encryption',
  rowCryptoOld: 'Layered on top of IPFS storage',
  rowCryptoNew: 'Zero-knowledge; encrypt-before-transmit at the block boundary',
  rowStateDim: 'State / conflicts',
  rowStateOld: 'Application-level, coupled to network state',
  rowStateNew: 'Deterministic replicated documents (iroh-docs)',

  originalProsKicker: 'IPFS · the case for',
  originalProsTitle: 'What the original approach got right.',
  originalPro1:
    'Content addressing for free — immutable, hash-named, deduplicated blocks with intrinsic integrity.',
  originalPro2:
    '“Store it anywhere” — any node or public gateway can serve a block; you need to know what you want, not who has it.',
  originalPro3: 'A large, mature ecosystem of tooling, gateways, and pinning services.',
  originalPro4:
    'Censorship resistance — content can be replicated and served by arbitrarily many independent nodes.',

  originalConsKicker: 'IPFS · the cost',
  originalConsTitle: 'Where it worked against this product.',
  originalCon1:
    'DHT latency — resolving a content address means many round trips before a single byte transfers.',
  originalCon2:
    'Connection fragility — symmetric NATs frequently defeat DHT-mediated connectivity, so transfers stall.',
  originalCon3:
    'Heavy runtime — Electron bundles a full Chromium + Node, with the RAM, disk, and attack surface that implies.',
  originalCon4:
    'Security bolted onto storage — encryption sits on top of a system designed for public, replicated content, leaking metadata.',
  originalCon5:
    'No clean runtime parity — a real browser client meant duplicating the business logic.',

  modernProsKicker: 'Iroh · the case for',
  modernProsTitle: 'What the rewrite buys.',
  modernPro1:
    'Instant connections — public-key addressing and direct QUIC remove the DHT round-trips entirely.',
  modernPro2:
    'Robust NAT traversal — hole-punching plus relay fallback handles the cases that broke the DHT approach.',
  modernPro3:
    'Zero-knowledge by construction — only opaque ciphertext crosses the boundary; keys are never persisted in plaintext.',
  modernPro4:
    'Streaming, bounded memory — multi-gigabyte files flow through pipelines and never inflate a buffer.',
  modernPro5:
    'True multi-runtime parity — one runtime-agnostic core, WASM on web and native on desktop, no duplicated logic.',
  modernPro6:
    'Lightweight runtime — Tauri reuses the OS webview, a fraction of Electron’s footprint and attack surface.',

  modernConsKicker: 'Iroh · the trade-offs',
  modernConsTitle: 'What it gives up — deliberately.',
  modernCon1:
    'Direct-connectivity assumption — a sync fabric between your own devices and trusted peers, not a public “anyone can serve this CID” network.',
  modernCon2:
    'Smaller, newer ecosystem — fewer third-party gateways, tools, and community resources than IPFS.',
  modernCon3:
    'Relay dependency in hostile networks — when hole-punching fails, transfers fall back to relay infrastructure.',
  modernCon4:
    'Build complexity — cross-compiling the core to WASM and native adds toolchain and CI burden (paid once, at build time).',

  whyKicker: 'The decision',
  whyTitle: 'Why Sharu is built this way.',
  why1Title: 'The product is private sync, not public publishing',
  why1Body:
    'IPFS optimizes for “anyone can discover and serve this content.” Sharu’s data is private and encrypted — nobody else should discover or serve it — so the DHT’s central feature is pure overhead and is removed. Public-key addressing fits the real access pattern: you sync with peers you already know.',
  why2Title: 'Latency and reliability are the product',
  why2Body:
    'Local-first means sync must feel instant and survive bad networks. DHT resolution and NAT fragility undermine that. Direct QUIC plus hole-punching turns connection setup into line-speed transit and handles the NAT cases that broke the old design.',
  why3Title: 'Zero-knowledge must be structural, not layered',
  why3Body:
    'Encrypting on top of a system built for public, replicated blocks leaks metadata and makes the privacy story fragile. Encrypting before the transport boundary means the network only ever sees ciphertext — privacy becomes an invariant enforced by tests, not a convention.',
  why4Title: 'One core, two runtimes — no duplication',
  why4Body:
    'Compiling one Rust core to WASM and native gives genuine web/desktop parity, keeps the SDK runtime-agnostic, and means crypto and sync logic exist exactly once. Tauri keeps the desktop shell light enough for an always-on background backup agent.',
  why5Title: 'Keep only what earns its place',
  why5Body:
    'The one IPFS concept retained is content addressing by hash — now via BLAKE3 — because immutability, deduplication, and intrinsic integrity are genuinely valuable. The global DHT, libp2p routing, Electron, and storage-coupled crypto were costs without a matching benefit for this product, and were replaced.',

  footer: 'Sharu — zero-knowledge, local-first backup & sync',
});

/** "Interaction" page copy: a Cascivo Flow that walks, step by step, through how
 *  participants — your devices, the relay, and a backup node — actually talk,
 *  plus the technology stack that makes each step possible. */
export const flow = defineMessages('safu.flow', {
  back: 'Back',
  launch: 'Launch the app',
  meta: 'Live walkthrough · zero-knowledge by construction',

  // Reading-mode toggle: one page, three depths of explanation.
  modeLabel: 'Reading mode',
  modeRegular: 'Regular',
  modeEli5: 'ELI5',
  modeMachine: 'Machine',

  title: 'Watch your devices talk.',
  subtitle:
    'A backup is a conversation between participants you control — your devices, an untrusted relay, and an optional always-on node. Here is exactly what crosses the wire, step by step. Only ciphertext ever does.',

  diagramKicker: 'The interaction',
  diagramTitle: 'One file, four participants, zero trust required.',
  diagramCaption:
    'Each step replays a single exchange. The relay and the network only ever carry authenticated ciphertext — never your keys, filenames, or plaintext.',
  diagramAlt:
    'A flow diagram of a laptop and phone syncing an encrypted file through an Iroh relay, with an always-on backup node.',
  play: 'Play the walkthrough',
  pause: 'Pause the walkthrough',

  // Participants (nodes)
  nodeLaptop: 'Laptop',
  nodeLaptopRole: 'Your device',
  nodePhone: 'Phone',
  nodePhoneRole: 'Your device',
  nodeRelay: 'Iroh relay',
  nodeRelayRole: 'Untrusted transport',
  nodeBackup: 'Backup node',
  nodeBackupRole: 'safu-node replica',

  // Script (the walk) — one caption per exchange
  step1:
    'Your laptop seals each file chunk with AES-256-GCM and announces the BLAKE3 hashes of the blocks it holds.',
  step2:
    'The announcement travels over Iroh. The relay forwards bytes it cannot read — no keys, no filenames, only ciphertext.',
  step3: 'Your phone compares hashes and asks for exactly the blocks it is missing, by address.',
  step4:
    'The sealed blocks stream back. Your phone verifies every block against its hash before it trusts a single byte.',
  step5:
    'To pair, both devices show a short authentication string. You confirm they match — defeating any machine in the middle.',
  step6:
    'An always-on backup node keeps a full ciphertext replica, so a copy stays reachable even when every device is offline.',

  // Around the wallet: how the pieces above add up to the thing you actually use.
  walletKicker: 'Around the wallet',
  walletTitle: 'Everything ties back to one wallet.',
  wallet1Title: 'A wallet is your vault',
  wallet1Body:
    'A wallet is a named, encrypted space for your files. You create one with a name and a password, and everything you back up lives inside it.',
  wallet2Title: 'Your password is the only key',
  wallet2Body:
    'Argon2id derives the encryption key from your password, on your device. The key is never uploaded and never stored in plaintext — forget the password and there is no reset.',
  wallet3Title: 'Link devices to the same wallet',
  wallet3Body:
    'Linking is a deliberate step: share one device’s connection code (or scan its QR) with the other so they can find each other. Enter the same password on both, confirm the short safety number shown on each screen, and only then do they sync the wallet’s files directly over Iroh.',
  wallet4Title: 'Back up and restore the wallet',
  wallet4Body:
    'Save a recovery sheet to re-open the wallet anywhere, and run an always-on backup node to keep a full ciphertext replica reachable even when every device is offline.',

  stackKicker: 'Tech stack',
  stackTitle: 'What powers each step.',
  stackIrohTerm: 'Iroh (QUIC)',
  stackIrohDef:
    'The peer-to-peer transport. Rust compiled to WASM in the browser, run natively on desktop, behind one interface.',
  stackBlake3Term: 'BLAKE3',
  stackBlake3Def:
    'Content addressing: every block is named by the hash of its ciphertext, so storage is deduplicated and tamper-evident.',
  stackArgon2Term: 'Argon2id',
  stackArgon2Def:
    'Memory-hard key derivation from your passphrase — performed on-device only, so the key never leaves the machine.',
  stackAesTerm: 'AES-256-GCM',
  stackAesDef:
    'Authenticated encryption that seals each chunk independently and lets the reader detect tampering before decrypting.',
  stackCrdtTerm: 'CRDT allocation table',
  stackCrdtDef:
    'Conflict-free replicated state that converges deterministically across devices, with no coordinator and no dropped writes.',
  stackCascivoTerm: 'Cascivo Flow',
  stackCascivoDef:
    'The signal-driven, CSS-native design system — its new Flow surface renders this very walkthrough.',
  stackPreactTerm: 'Preact + Signals',
  stackPreactDef:
    'The local-first UI shell: reactive state as signals everywhere, with no virtual-DOM churn and no framework lock-in.',
  stackTauriTerm: 'Tauri 2.0',
  stackTauriDef:
    'The native desktop shell, where Iroh hole-punches direct device-to-device connections without any relay at all.',

  ctaTitle: 'Seen enough? Start backing up.',
  ctaBody: 'No account, no upload to anyone. Set a passphrase and your devices do the rest.',
  footer: 'Sharu — zero-knowledge, local-first backup & sync',
});

/** ELI5 copy: the same page structure as `flow`, retold so a five-year-old gets
 *  it. Files are toys, a wallet is a magic box, the relay is a helper who carries
 *  boxes it can't open. Only the prose changes — the keys mirror `flow`. */
export const flowEli5 = defineMessages('safu.flow.eli5', {
  title: 'How it works, the easy way.',
  subtitle:
    'Think of your files like toys. Sharu locks them in a magic box that only you can open, then quietly copies the box to your other gadgets so you never lose anything. Nobody else can peek inside.',

  diagramKicker: 'The story',
  diagramTitle: 'Two gadgets sharing a secret box.',
  diagramCaption:
    'Watch the boxes travel from one gadget to another. They stay locked the whole way, so the helpers carrying them can never see what is inside.',

  nodeLaptopRole: 'Your gadget',
  nodePhoneRole: 'Your gadget',
  nodeRelayRole: 'A helper who carries boxes',
  nodeBackupRole: 'A toy box that never sleeps',

  step1:
    'Your laptop puts each piece of a file into a locked box and calls out a sticker name for it.',
  step2: 'A helper passes the boxes along. The helper can carry them but can never open them.',
  step3: 'Your phone reads the sticker names and asks only for the boxes it does not have yet.',
  step4:
    'The locked boxes arrive. Your phone checks every sticker to make sure nothing was swapped.',
  step5:
    'To become friends, both gadgets show the same secret word. If the words match, they trust each other.',
  step6:
    'A toy box that never sleeps keeps a spare copy, so your files are safe even when your gadgets are off.',

  walletKicker: 'Your magic box',
  walletTitle: 'It all starts with one box.',
  wallet1Title: 'A box for your stuff',
  wallet1Body:
    'A wallet is your own magic box. You give it a name and a secret word, and everything you keep goes inside.',
  wallet2Title: 'Your secret word is the key',
  wallet2Body:
    'Only your secret word can open the box. It never leaves your gadget, and nobody can make a new one — so do not forget it!',
  wallet3Title: 'Link your other gadget to the box',
  wallet3Body:
    'First show the link (or the little square code) from one gadget to the other so they can find each other. Then type the same secret word on both, check that they show the same safety word, and now they share the very same box.',
  wallet4Title: 'Keep a spare and never lose it',
  wallet4Body:
    'Write your secret word on a recovery sheet, and let an always-awake toy box hold a spare copy for you.',

  stackKicker: 'The helpers',
  stackTitle: 'The clever bits that make it work.',
  stackIrohDef: 'The mail carrier that lets your gadgets pass boxes straight to each other.',
  stackBlake3Def: 'A sticker name for every box, so you always know you got the right one.',
  stackArgon2Def: 'Turns your secret word into a strong key, right on your gadget.',
  stackAesDef: 'The lock on every box. It also tells you if someone tried to peek.',
  stackCrdtDef: 'A shared list so all your gadgets agree on what is where, with no arguing.',
  stackCascivoDef: 'The little drawing you are watching that shows the boxes moving.',
  stackPreactDef: 'The bits that make this page light up the moment something changes.',
  stackTauriDef: 'The app on your computer that lets gadgets talk straight to each other.',

  ctaTitle: 'Ready to lock up your stuff?',
  ctaBody: 'No sign-up, no handing your toys to a stranger. Pick a secret word and you are done.',
});

/** Machine copy: the same structure stripped to a terse, near-protocol notation —
 *  the page reduced to the minimum a reader who just wants the mechanics needs.
 *  Keys mirror `flow`. */
export const flowMachine = defineMessages('safu.flow.machine', {
  title: 'Spec: zero-knowledge backup & sync.',
  subtitle:
    'Local-first replication of content-addressed ciphertext across user-owned peers. Plaintext and keys never leave the device; transport is untrusted; state converges via CRDT.',

  diagramKicker: 'protocol',
  diagramTitle: 'peers=4 · trust=0 · payload=ciphertext',
  diagramCaption:
    'Per-step message trace. The wire carries authenticated ciphertext blocks only — no keys, no filenames, no plaintext.',

  nodeLaptopRole: 'peer:device',
  nodePhoneRole: 'peer:device',
  nodeRelayRole: 'transport:untrusted',
  nodeBackupRole: 'peer:replica(always-on)',

  step1: 'laptop: chunk(file) → AES-256-GCM seal → emit HAVE[blake3(block)…].',
  step2: 'relay: forward(bytes) over Iroh/QUIC; payload opaque; no key/name access.',
  step3: 'phone: diff(local, HAVE) → request WANT[hash…] by address.',
  step4: 'laptop→phone: stream blocks; phone asserts blake3(block)==addr before accept.',
  step5: 'pair: both emit SAS; user asserts equality → machine-in-the-middle rejected.',
  step6: 'replica: persist full ciphertext set; availability decoupled from device liveness.',

  walletKicker: 'wallet',
  walletTitle: 'unit of state := wallet',
  wallet1Title: 'wallet := [name, encrypted_store]',
  wallet1Body: 'Container scoping all backed-up content. Constructed from (name, password).',
  wallet2Title: 'key := Argon2id(password)',
  wallet2Body:
    'KDF runs on-device. Key non-exportable, never persisted in plaintext. No reset, no escrow.',
  wallet3Title: 'link := connection_code + password + SAS',
  wallet3Body:
    'Pairing is explicit: peer A emits a connection code (addr + signing id); peer B imports it, derives the same key from the shared password, both confirm the SAS, then direct sync over Iroh.',
  wallet4Title: 'durability := recovery_sheet + replica',
  wallet4Body:
    'Recovery sheet restores wallet on any peer. safu-node holds an always-on ciphertext replica.',

  stackKicker: 'stack',
  stackTitle: 'components.',
  stackIrohDef: 'P2P QUIC transport. Rust→WASM (web) / native (desktop) behind one interface.',
  stackBlake3Def: 'Content address = hash(ciphertext). Yields dedup + tamper-evidence.',
  stackArgon2Def: 'Memory-hard KDF. password→key, on-device only.',
  stackAesDef: 'AEAD per chunk. Auth tag = integrity check before decrypt.',
  stackCrdtDef: 'Replicated state. Deterministic convergence, no coordinator, no dropped writes.',
  stackCascivoDef: 'Signal-driven render layer for this trace.',
  stackPreactDef: 'Reactive UI shell. Signals as state; no virtual-DOM churn.',
  stackTauriDef: 'Native shell. Iroh hole-punch → direct peer links, relay-free.',

  ctaTitle: 'init backup.',
  ctaBody: 'No account, no upload to third parties. Set passphrase → peers replicate.',
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
