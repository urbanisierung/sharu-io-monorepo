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
  launchShort: 'Launch',
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
  p7Title: 'Relay-optional',
  p7Body:
    'The relay only forwards ciphertext, and only when a direct link fails. Point Sharu at your own relay, or give a node a reachable address and skip it entirely — no dependency on us.',

  cliKicker: 'Backup node',
  cliTitle: 'Add an always-on replica from your terminal.',
  cliBody:
    'Run sharu on a server, NAS, or Raspberry Pi to keep a full ciphertext replica of everything your devices back up — an always-reachable copy, zero-knowledge and over Iroh. One command installs it; link a device with its connection code and it starts replicating.',
  cliUnixLabel: 'Linux & macOS',
  cliUnixCmd: `curl -fsSL ${SITE_URL}/install.sh | sh`,
  cliWindowsLabel: 'Windows · PowerShell',
  cliWindowsCmd: `irm ${SITE_URL}/install.ps1 | iex`,
  cliLink: 'Read the backup-node docs',
  cliVerify: 'Prefer to read it first? Inspect the install script before you run it.',

  ctaTitle: 'Take your backups back.',
  ctaBody: 'No account. No upload to anyone. Set a passphrase and start.',
  footer: 'Sharu — zero-knowledge, local-first backup & sync',
  footerNav: 'Footer',
  sourceLink: 'View the source',
  rights: '© Sharu',
});

/** ELI5 reading mode — same keys, retold so a five-year-old gets it. */
export const landingEli5 = defineMessages('safu.landing.eli5', {
  brand: 'SHARU',
  logoAlt: 'Picture of the Sharu wolf',
  whitepaper: 'Read the big story about how it works',
  comparison: 'IPFS next to Iroh',
  badge: 'only-you-can-peek · lives-on-your-stuff · talks-friend-to-friend',
  heroLine1: 'Your things.',
  heroLine2: 'Your gadgets.',
  heroLine3: 'Nobody else.',
  heroSubtitle:
    'Sharu keeps copies of your things safe. It locks them up on your own gadget with a secret word, then hands the locked boxes straight to your other gadgets — no faraway helper holding them, no sign-up, and nobody but you can ever peek inside.',
  launch: 'Open the app',
  launchShort: 'Open',
  learnMore: 'See how the boxes travel',
  watchFlow: 'How it works',

  problemKicker: 'The problem',
  problemTitle: 'Faraway helpers want you to trust them with all your things.',
  problem1Title: 'You give away the key',
  problem1Body:
    'Faraway box-keepers can open, look at, and sell your things. One slip-up or rule change can show everything you ever saved.',
  problem2Title: 'Only one helper holding everything',
  problem2Body:
    'Helpers lock the door, close shop, or change the rules. Your safe copies should not need one helper to stay open and nice forever.',
  problem3Title: 'Stuck and paying rent',
  problem3Body: 'Your own things kept behind a monthly fee and a special tool you cannot control.',

  howKicker: 'How it works',
  howTitle: 'Lock it at home. Pass it straight over. Get it back anywhere.',
  step1Title: 'Lock it on your gadget',
  step1Body:
    'Your secret word makes a special key. Your things are cut into little pieces and each piece is locked tight. The key never, ever leaves your gadget.',
  step2Title: 'Give each box a name from its insides',
  step2Body:
    'Every locked box gets a name made from what is inside it — so you always know if a box was poked, and only locked boxes are ever kept.',
  step3Title: 'Pass boxes friend-to-friend',
  step3Body:
    'Your gadgets wave hello to each other and hand the locked boxes straight across. A helper in the middle may carry a box, but it can never open it — it only ever sees the locked one.',
  step4Title: 'Get it back, all checked',
  step4Body:
    'A magic list remembers every thing on every gadget and never argues. Getting it back un-does all the steps and checks each box against its name to make sure it is right.',

  principlesKicker: 'Promises',
  principlesTitle: 'Built on sure things, not maybes.',
  p1Title: 'Only-you-can-peek',
  p1Body:
    'Only locked boxes ever travel. The key is never written down where someone could read it.',
  p2Title: 'Lives-on-your-stuff',
  p2Body:
    'Your things sit on your gadgets and work even with no internet. The network just helps; it is not needed.',
  p3Title: 'Friend-to-friend',
  p3Body:
    'No big helper in the middle owns your things. Gadgets pass boxes straight to each other.',
  p4Title: 'A little at a time',
  p4Body: 'Things are never held all at once — even giant piles stay small in memory as they go.',
  p5Title: 'Never argues',
  p5Body: 'The magic list always agrees in the end and never quietly loses a single thing.',
  p6Title: 'Truly yours',
  p6Body:
    'An open design, things you can keep on your own helper, and a way to say no more to a gadget you lost.',
  p7Title: 'Middle-helper optional',
  p7Body:
    'The helper in the middle only ever carries locked boxes, and only when two gadgets can’t reach each other. Run your own, or give a gadget a spot others can reach and skip it — you never need ours.',

  cliKicker: 'Always-awake helper',
  cliTitle: 'Add a helper that never sleeps, right from your typing box.',
  cliBody:
    'Run sharu on a little always-on machine to keep a full set of the locked boxes for everything your gadgets save — a copy that is always there, can never be peeked at, and travels the friend-to-friend way. One line sets it up; tell a gadget its little code word and it starts keeping copies.',
  cliUnixLabel: 'Linux & macOS',
  cliUnixCmd: `curl -fsSL ${SITE_URL}/install.sh | sh`,
  cliWindowsLabel: 'Windows · PowerShell',
  cliWindowsCmd: `irm ${SITE_URL}/install.ps1 | iex`,
  cliLink: 'Read the always-awake-helper guide',
  cliVerify: 'Want to peek first? Look at the little setup script before you run it.',

  ctaTitle: 'Take your safe copies back.',
  ctaBody: 'No sign-up. Nothing handed to anyone. Pick a secret word and start.',
  footer: 'Sharu — only-you-can-peek, lives-on-your-stuff backup & sync',
  footerNav: 'Footer',
  sourceLink: 'See how it’s built',
  rights: '© Sharu',
});

/** Machine reading mode — same keys, stripped to terse near-protocol notation. */
export const landingMachine = defineMessages('safu.landing.machine', {
  brand: 'SHARU',
  logoAlt: 'img := sharu wolf logo',
  whitepaper: 'whitepaper → read',
  comparison: 'ipfs vs iroh',
  badge: 'zk · local-first · p2p',
  heroLine1: 'data := yours.',
  heroLine2: 'devices := yours.',
  heroLine3: 'others := none.',
  heroSubtitle:
    'sharu := decentralized, zk, local-first backup+sync. encrypt@device → sync p2p across own devices. servers=0, accounts=0, readers := you-only.',
  launch: 'app → launch',
  launchShort: 'launch',
  learnMore: 'pipeline → view',
  watchFlow: 'mechanism → how',

  problemKicker: 'problem',
  problemTitle: 'cloud-backup ⇒ trust(3rd-party, all).',
  problem1Title: 'keys → handed off',
  problem1Body:
    'cloud can read+scan+monetize files. breach | policy-change → lifetime-data exposed.',
  problem2Title: 'spof := 1',
  problem2Body:
    'account → locked, vendor → dead, terms → change. backup must not depend on 1 provider alive + benign.',
  problem3Title: 'lock-in + rent',
  problem3Body: 'own-files gated by monthly-sub + proprietary-client you do not control.',

  howKicker: 'mechanism',
  howTitle: 'encrypt@local → sync@direct → restore@anywhere.',
  step1Title: 'encrypt @device',
  step1Body:
    'key := argon2id(passphrase). files → content-defined chunks → seal aes-256-gcm. key never leaves device.',
  step2Title: 'addr := hash',
  step2Body:
    'block.addr := blake3(block). content-addressed, tamper-evident; writes = ciphertext only.',
  step3Title: 'sync p2p',
  step3Body:
    'devices connect via iroh(quic), exchange enc-blocks direct. web := relay-only; desktop := hole-punch. relay sees ciphertext only.',
  step4Title: 'restore + proof',
  step4Body:
    'crdt-table tracks files across devices. restore := reverse(pipeline) + verify(block, hash) per block.',

  principlesKicker: 'principles',
  principlesTitle: 'guarantees, not promises.',
  p1Title: 'zero-knowledge',
  p1Body: 'wire = ciphertext. keys never persisted in plaintext.',
  p2Title: 'local-first',
  p2Body: 'files @devices, offline-ok. network := optimization, not dependency.',
  p3Title: 'peer-to-peer',
  p3Body: 'central-server := none. devices sync direct.',
  p4Title: 'streaming',
  p4Body: 'files not fully buffered. multi-GB backup → mem-bounded.',
  p5Title: 'conflict-free',
  p5Body: 'crdt alloc-table → converge(deterministic). dropped-writes := 0.',
  p6Title: 'owned',
  p6Body: 'open-arch + self-host(content) + revocable-trust(lost-device).',
  p7Title: 'relay-optional',
  p7Body:
    'relay forwards ciphertext only, only on direct-fail. self-host(relay) | reachable-node ⇒ relay=0. dependency(n0) := none.',

  cliKicker: 'backup-node',
  cliTitle: 'replica := always-on, via terminal.',
  cliBody:
    'sharu @server|nas|rpi → full ciphertext-replica(all device-backups). always-reachable, zk, over-iroh. install := 1 cmd; link(device, conn-code) → replicate.',
  cliUnixLabel: 'Linux & macOS',
  cliUnixCmd: `curl -fsSL ${SITE_URL}/install.sh | sh`,
  cliWindowsLabel: 'Windows · PowerShell',
  cliWindowsCmd: `irm ${SITE_URL}/install.ps1 | iex`,
  cliLink: 'backup-node docs → read',
  cliVerify: 'read-first? inspect install script before exec.',

  ctaTitle: 'backups → reclaim.',
  ctaBody: 'account=0. upload(anyone)=0. set passphrase → start.',
  footer: 'sharu — zk, local-first backup+sync',
  footerNav: 'footer',
  sourceLink: 'source → view',
  rights: '© sharu',
});
