import { defineMessages } from '@cascivo/i18n';

/** "How it works" page copy: a Cascivo Flow that walks, step by step, through how
 *  participants — your devices, the relay, and a backup node — actually talk,
 *  plus the technology stack that makes each step possible. The reading-mode
 *  toggle's own labels live in `nav`, not here. */
export const flow = defineMessages('safu.flow', {
  back: 'Back',
  launch: 'Launch the app',
  meta: 'Live walkthrough · zero-knowledge by construction',

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
  nodeBackupRole: 'sharu replica',

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

/** ELI5 reading mode — same keys as `flow`, retold so a five-year-old gets it.
 *  Files are toys, a wallet is a magic box, the relay is a helper who carries
 *  boxes it can't open. Technology names stay as names. */
export const flowEli5 = defineMessages('safu.flow.eli5', {
  back: 'Go back',
  launch: 'Open the app',
  meta: 'A little show · nobody can peek',

  title: 'How it works, the easy way.',
  subtitle:
    'Think of your files like toys. Sharu locks them in a magic box that only you can open, then quietly copies the box to your other gadgets so you never lose anything. Nobody else can peek inside.',

  diagramKicker: 'The story',
  diagramTitle: 'Two gadgets sharing a secret box.',
  diagramCaption:
    'Watch the boxes travel from one gadget to another. They stay locked the whole way, so the helpers carrying them can never see what is inside.',
  diagramAlt:
    'A picture of a laptop and a phone passing a locked box through a helper, with a box that never sleeps keeping a spare copy.',
  play: 'Play the show',
  pause: 'Pause the show',

  nodeLaptop: 'Laptop',
  nodeLaptopRole: 'Your gadget',
  nodePhone: 'Phone',
  nodePhoneRole: 'Your gadget',
  nodeRelay: 'A helper',
  nodeRelayRole: 'A helper who carries boxes',
  nodeBackup: 'Sleepless box',
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
  stackIrohTerm: 'Iroh (QUIC)',
  stackIrohDef: 'The mail carrier that lets your gadgets pass boxes straight to each other.',
  stackBlake3Term: 'BLAKE3',
  stackBlake3Def: 'A sticker name for every box, so you always know you got the right one.',
  stackArgon2Term: 'Argon2id',
  stackArgon2Def: 'Turns your secret word into a strong key, right on your gadget.',
  stackAesTerm: 'AES-256-GCM',
  stackAesDef: 'The lock on every box. It also tells you if someone tried to peek.',
  stackCrdtTerm: 'CRDT allocation table',
  stackCrdtDef: 'A shared list so all your gadgets agree on what is where, with no arguing.',
  stackCascivoTerm: 'Cascivo Flow',
  stackCascivoDef: 'The little drawing you are watching that shows the boxes moving.',
  stackPreactTerm: 'Preact + Signals',
  stackPreactDef: 'The bits that make this page light up the moment something changes.',
  stackTauriTerm: 'Tauri 2.0',
  stackTauriDef: 'The app on your computer that lets gadgets talk straight to each other.',

  ctaTitle: 'Ready to lock up your stuff?',
  ctaBody: 'No sign-up, no handing your toys to a stranger. Pick a secret word and you are done.',
  footer: 'Sharu — copies of your stuff that nobody else can peek at',
});

/** Machine reading mode — same keys as `flow`, stripped to terse near-protocol
 *  notation. Technology names stay as names. */
export const flowMachine = defineMessages('safu.flow.machine', {
  back: 'back',
  launch: 'launch app',
  meta: 'live trace · zk by construction',

  title: 'Spec: zero-knowledge backup & sync.',
  subtitle:
    'Local-first replication of content-addressed ciphertext across user-owned peers. Plaintext and keys never leave the device; transport is untrusted; state converges via CRDT.',

  diagramKicker: 'protocol',
  diagramTitle: 'peers=4 · trust=0 · payload=ciphertext',
  diagramCaption:
    'Per-step message trace. The wire carries authenticated ciphertext blocks only — no keys, no filenames, no plaintext.',
  diagramAlt:
    'flow: laptop + phone sync encrypted file via iroh relay; always-on backup node holds replica.',
  play: 'play',
  pause: 'pause',

  nodeLaptop: 'laptop',
  nodeLaptopRole: 'peer:device',
  nodePhone: 'phone',
  nodePhoneRole: 'peer:device',
  nodeRelay: 'relay',
  nodeRelayRole: 'transport:untrusted',
  nodeBackup: 'replica',
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
    'Recovery sheet restores wallet on any peer. sharu holds an always-on ciphertext replica.',

  stackKicker: 'stack',
  stackTitle: 'components.',
  stackIrohTerm: 'Iroh (QUIC)',
  stackIrohDef: 'P2P QUIC transport. Rust→WASM (web) / native (desktop) behind one interface.',
  stackBlake3Term: 'BLAKE3',
  stackBlake3Def: 'Content address = hash(ciphertext). Yields dedup + tamper-evidence.',
  stackArgon2Term: 'Argon2id',
  stackArgon2Def: 'Memory-hard KDF. password→key, on-device only.',
  stackAesTerm: 'AES-256-GCM',
  stackAesDef: 'AEAD per chunk. Auth tag = integrity check before decrypt.',
  stackCrdtTerm: 'CRDT allocation table',
  stackCrdtDef: 'Replicated state. Deterministic convergence, no coordinator, no dropped writes.',
  stackCascivoTerm: 'Cascivo Flow',
  stackCascivoDef: 'Signal-driven render layer for this trace.',
  stackPreactTerm: 'Preact + Signals',
  stackPreactDef: 'Reactive UI shell. Signals as state; no virtual-DOM churn.',
  stackTauriTerm: 'Tauri 2.0',
  stackTauriDef: 'Native shell. Iroh hole-punch → direct peer links, relay-free.',

  ctaTitle: 'init backup.',
  ctaBody: 'No account, no upload to third parties. Set passphrase → peers replicate.',
  footer: 'sharu — zero-knowledge, local-first backup+sync',
});
