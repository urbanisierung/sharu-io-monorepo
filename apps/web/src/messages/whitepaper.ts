import { defineMessages } from '@cascivo/i18n';

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

/** ELI5 reading mode — same keys, retold so a five-year-old gets it. */
export const whitepaperEli5 = defineMessages('safu.whitepaper.eli5', {
  back: 'Go back',
  title: 'The Sharu Story Book',
  subtitle: 'A way to keep copies of your things that nobody else can peek at',
  meta: 'Story number 1 · 2026 · sharu.io',
  launch: 'Open the app',

  abstractKicker: 'The short version',
  abstractTitle: 'A copy of your stuff that you never have to trust anyone else to hold.',
  abstractBody:
    'Sharu keeps copies of your things, and it does it in a sneaky-safe way. Your toys get locked inside magic boxes right on your own computer, and then those locked boxes travel to your other computers all by themselves. No big company holds your real things, nobody needs you to sign up, and nobody can open the boxes, look inside, or hide them from you. This story explains how it all works: how your secret word is made, how your toys get locked up and named, how your computers find each other and swap boxes, and how everything stays tidy even when you change things in two places at once.',

  modelKicker: 'Who we don’t trust',
  modelTitle: 'Pretend everyone carrying your boxes might be sneaky.',
  modelBody:
    'Sharu acts like every box that leaves your computer could be seen by a sneaky person. The helpers who carry boxes, the roads they travel on, and any place that keeps boxes after your computer is gone — we pretend a bad guy is in charge of all of them, and that they want to peek inside or mess things up. The only place we really trust is your own computer while it is open and awake.',
  modelBody2:
    'So here’s the rule: only locked boxes are allowed to leave, the secret word is never written down where it lives, and every box your computer gets must match a name it already knows is real. Keeping a spare copy safe is one job, and keeping it secret is a different job — that way a helper can hold your boxes for you without ever being able to open them.',

  identityKicker: 'Your secret word',
  identityTitle: 'One secret word, made on your computer, never sent away.',
  identityBody:
    'Your computer makes a special key out of one secret word you pick, using a slow puzzle-maker that takes lots of effort so a bad guy can’t just guess word after word quickly. That key never leaves your computer and is never written down plainly; it only lives in your computer’s memory while the app is open. So if you forget your secret word, it is gone for good on purpose — there is no do-over and no spare hidden anywhere, because anyone who could give you a do-over could also peek at your things.',
  identityBody2:
    'From that one key your computer makes the little keys that lock your stuff and the special name-tag that lets your other computers know it’s really you. The only safety net is a recovery sheet — your secret word written on paper and kept somewhere safe and offline.',

  cryptoKicker: 'Locking and slicing',
  cryptoTitle: 'Pour it through, slice it up, lock each piece — never hold the whole thing.',
  cryptoBody:
    'Your files flow through like water instead of being picked up all at once. Each file is sliced into little pieces, so if you change one bit, only the pieces that changed get re-locked, and if two files share the same piece it is only kept once. Every piece gets its own lock with a special little seal, and that seal lets the reader spot if anyone tried to mess with a piece before it is ever unlocked.',
  cryptoBody2:
    'Because everything flows through bit by bit, even a giant file gets locked, named, and sent using only a little bit of space at a time. The whole unlocked file is never put back together all at once, not on the disk and not in memory, on either computer.',

  addressingKicker: 'Naming by what’s inside',
  addressingTitle: 'Every box gets its name from a magic fingerprint of what’s inside.',
  addressingBody:
    'Each locked box is named by a magic fingerprint made from the locked-up stuff inside it. The name is both how you find the box and how you know it’s the real one: a computer asks for a box by its fingerprint and checks that the box it gets matches that fingerprint before trusting it. A broken or swapped box just won’t match, so it gets thrown away.',
  addressingBody2:
    'Naming things this way also means matching boxes are only kept once, and nobody can sneakily change a box — because a changed box can never match its own name.',

  syncKicker: 'Computers talking to each other',
  syncTitle: 'Computers talk straight to each other; the helper only ever sees locked boxes.',
  syncBody:
    'Your computers find each other and connect using Iroh, a clever way for them to chat directly. On a desktop, they can poke a little tunnel straight to each other; in a web browser, where that isn’t allowed, the boxes go through a helper instead. Either way, the helper and the roads only ever see locked-up boxes with a seal — never your keys, never your real stuff, never even the names of your files.',
  syncBody2:
    'Swapping is just trading boxes: a computer says which box-fingerprints it has, asks for the ones it’s missing, and checks each one against its name when it arrives. So it doesn’t matter who carries the boxes — they can be swapped out or untrusted, because your safety doesn’t depend on them.',

  crdtKicker: 'Staying tidy with no boss',
  crdtTitle: 'A shared list that always agrees, even with nobody in charge.',
  crdtBody:
    'Which pieces make up which file, and how every file looks on every computer, is kept on a special shared list that every computer holds its own copy of and changes on its own. When computers reconnect, their lists blend together the same way every time: the same changes always end up the same, no matter what order they show up in.',
  crdtBody2:
    'All the sorting-out happens right on this shared list and doesn’t need any computers to be connected, so a change is never quietly lost, and two computers that have seen the same story always agree. Changing things while you’re offline counts just as much: being connected makes it faster, but you never need it.',

  trustKicker: 'Trusting your computers',
  trustTitle: 'Add friends on purpose, double-check another way, and shoo them away cleanly.',
  trustBody:
    'Adding a computer is something you do on purpose. A new computer shows a little code (also drawn as a square you can scan), and when they pair up, both computers show a short secret string. You check with your own eyes that the two strings match, which stops a sneaky go-between from pretending to be your other computer.',
  trustBody2:
    'You can take trust back too: a lost or sneaky computer can be shooed away so it can’t change anything anymore, and you don’t have to redo all your locks. Trusted, not-yet-checked, and shooed-away are clear labels you can see in the app.',

  guaranteesKicker: 'Our promises',
  guaranteesTitle: 'Promises that are true because of how it’s built, not just because we say so.',
  guarantee1:
    'Nobody can peek — only locked boxes ever leave, and the secret word is never written down plainly.',
  guarantee2:
    'Lives with you — your stuff sits on your own computers and works even with no internet.',
  guarantee3:
    'Computer-to-computer — no big company owns your stuff; your computers share it straight across.',
  guarantee4:
    'Flows through — files are never held all at once, so making copies stays light and easy.',
  guarantee5:
    'Named by its fingerprint — every box is named by its magic fingerprint, so tampering always shows.',
  guarantee6: 'Always agrees — the shared list always ends up the same and never loses a change.',

  footer: 'Sharu — copies of your stuff that nobody else can peek at',
});

/** Machine reading mode — same keys, stripped to terse near-protocol notation. */
export const whitepaperMachine = defineMessages('safu.whitepaper.machine', {
  back: 'back',
  title: 'sharu.whitepaper',
  subtitle: 'zero-knowledge, local-first backup+sync protocol',
  meta: 'rev=1 · 2026 · sharu.io',
  launch: 'app → launch',

  abstractKicker: 'abstract',
  abstractTitle: 'backup := trust(nobody) + durability',
  abstractBody:
    'sharu := decentralized + zero-knowledge + local-first backup+sync. files encrypt@owner-device → replicate p2p across user devices. servers.plaintext=0; accounts=0; operator: read=no, scan=no, withhold=no. spec covers: identity+keys := derive(); files := encrypt+address(); devices := discover+exchange(blocks); concurrent.edits → converge w/ coordinator=none.',

  modelKicker: 'threat model',
  modelTitle: 'assume net + relay := hostile',
  modelBody:
    'byte leaves device ⇒ observable(adversary). relays + transit + persistent.storage := attacker-controlled; goal = read | tamper. trusted.boundary := device while unlocked.',
  modelBody2:
    '⇒ wire = ciphertext only; keys.persist(plaintext) = no; recv(block) ⇒ verify(block, trusted.addr). availability decoupled from {confidentiality, integrity} → untrusted.host stores but read=no.',

  identityKicker: 'identity+keys',
  identityTitle: 'passphrase x1 := derive(local); transmit=no',
  identityBody:
    'device.identity := argon2id(passphrase); argon2id := memory-hard ⇒ brute-force.cost↑. root.key: leave(device)=no + disk.plaintext=no; scope := mem while unlocked. forget(passphrase) ⇒ unrecoverable by-design; reset=none + escrow=none (reset ⇒ read).',
  identityBody2:
    'root.key → {sym.keys := seal(content), keypair := id@peers}. recovery := print(passphrase)@offline = sole backstop.',

  cryptoKicker: 'encrypt+chunk',
  cryptoTitle: 'stream → split → seal; buffer(file)=no',
  cryptoBody:
    'files := stream. file → chunks(content-defined) ⇒ edit re-encrypts changed-chunks only + dup.chunks stored x1. chunk := aes-256-gcm(seal); tag → detect(tamper) before plaintext.expose.',
  cryptoBody2:
    'pipeline := stream(e2e) ⇒ file[multi-GB] encrypt+hash+transfer @ mem=bounded. plaintext.assemble(full) := no @ {disk, ram} x {src, dst}.',

  addressingKicker: 'content addressing',
  addressingTitle: 'block.name := blake3(ciphertext)',
  addressingBody:
    'block.addr := blake3(ciphertext) = storage.key + integrity.proof. get(hash) → recv(bytes); verify(blake3(bytes)==hash) before trust. mismatch ⇒ discard.',
  addressingBody2:
    'content-addr ⇒ dedup(free) + tamper-evident; name(block) == altered.content := impossible.',

  syncKicker: 'p2p sync',
  syncTitle: 'device↔device direct; relay sees ciphertext only',
  syncBody:
    'devices := connect@iroh (quic, p2p). desktop: nat.holepunch → direct(machine↔machine). browser: socket=none ⇒ via relay. all: relay + net see {auth.ciphertext.blocks}; keys=no, plaintext=no, filenames=no.',
  syncBody2:
    'sync := content.exchange: announce(have.hashes) → request(missing) → verify(addr)@arrival. transport := interchangeable + untrusted; security independent of transport.',

  crdtKicker: 'conflict-free state',
  crdtTitle: 'replicated table → converge w/ coordinator=none',
  crdtBody:
    'map(block→file) + file.state@all.devices := crdt(alloc.table); each device holds copy + update(local). reconnect ⇒ merge(deterministic): sum(updates) → same.result for any order.',
  crdtBody2:
    'conflict.resolve in replicated.doc, decoupled from transport.state ⇒ write.drop=no + same.history → agree. offline.edit := first-class; net := optimization, not prerequisite.',

  trustKicker: 'device trust',
  trustTitle: 'pair(deliberate) → verify(oob) → revoke(clean)',
  trustBody:
    'add(device) := explicit. new.device → link.code (=qr); pair ⇒ both show sas := derive(conn). user.confirm(sas.a == sas.b)@oob ⇒ defeat(mitm).',
  trustBody2:
    'trust := revocable: lost | compromised → block(device) ⇒ write=no, re-key(history)=none. states := {verified, unverified, blocked} → ui.',

  guaranteesKicker: 'guarantees',
  guaranteesTitle: 'properties := construction, not policy',
  guarantee1: 'zero-knowledge — wire = ciphertext; keys.persist(plaintext)=no.',
  guarantee2: 'local-first — data @ user.devices + offline=full.',
  guarantee3: 'p2p — central.server.owns(data)=none; devices sync direct.',
  guarantee4: 'streaming — buffer(file, full)=no ⇒ backup.mem = bounded.',
  guarantee5: 'content-addressed — block.name := blake3 + tamper-evident.',
  guarantee6: 'conflict-free — crdt.alloc.table → converge(deterministic) + drop(write)=no.',

  footer: 'sharu — zero-knowledge, local-first backup+sync',
});
