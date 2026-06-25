import { defineMessages } from '@cascivo/i18n';

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

/** ELI5 reading mode — same keys, retold so a five-year-old gets it. */
export const comparisonEli5 = defineMessages('safu.comparison.eli5', {
  back: 'Back',
  title: 'The old toy box vs. the new toy box',
  subtitle: 'Why we rebuilt Sharu so devices find each other and pass boxes straight across',
  meta: 'A note about how it’s built · 2026 · sharu.io',
  launch: 'Open the app',

  abstractKicker: 'In one breath',
  abstractTitle: 'Two ways to pass locked boxes between your gadgets.',
  abstractBody:
    'The first Sharu used IPFS, like a giant shared playground where any helper could hold your boxes and you found them by a magic fingerprint. That gave us nice fingerprints for free — but you had to ask lots of helpers “who has it?” before anything moved, gadgets often couldn’t reach each other through walls, the app was big and heavy, and the locks were just taped on afterward. The rebuild keeps the one good idea — naming each box by its magic fingerprint — and rethinks the rest around what Sharu really is: fast, private passing of locked boxes between your own gadgets.',

  tableKicker: 'Side by side',
  tableTitle: 'Same job, two ways of building it.',
  tableColDimension: 'Thing',
  tableColOriginal: 'Old way (IPFS)',
  tableColModern: 'New way (Iroh)',

  rowDiscoveryDim: 'Finding things',
  rowDiscoveryOld: 'Ask a giant global address book (DHT) to find it',
  rowDiscoveryNew: 'Go straight to the gadget; its secret name is its address',
  rowTransportDim: 'Moving things',
  rowTransportOld: 'libp2p streams along the path the DHT found',
  rowTransportNew: 'A straight QUIC pipe (iroh-blobs for boxes, iroh-docs for notes)',
  rowNatDim: 'Getting through walls',
  rowNatOld: 'DHT + relay; breaks behind tricky walls (symmetric NAT)',
  rowNatNew: 'Pokes a hole through the wall (UDP), with a DERP/relay helper if stuck',
  rowAddrDim: 'Naming each box',
  rowAddrOld: 'CIDs (a fingerprint, usually SHA-256)',
  rowAddrNew: 'A BLAKE3 fingerprint of the locked box',
  rowRuntimeDim: 'What it runs on',
  rowRuntimeOld: 'Electron (a whole web browser + Node packed in)',
  rowRuntimeNew: 'Tauri 2.0 (uses your computer’s own window + a tiny Rust helper)',
  rowParityDim: 'Web and desktop the same',
  rowParityOld: 'A separate js-ipfs path just for browsers',
  rowParityNew: 'One Rust helper → WASM on the web, native on desktop',
  rowCryptoDim: 'Locking',
  rowCryptoOld: 'Locks taped on top of IPFS storage',
  rowCryptoNew: 'Nobody-can-peek; locked before it ever leaves the gadget',
  rowStateDim: 'Notes and disagreements',
  rowStateOld: 'Sorted out by the app, tangled up with the network',
  rowStateNew: 'Tidy shared notebooks that always agree (iroh-docs)',

  originalProsKicker: 'IPFS · the good parts',
  originalProsTitle: 'What the old way got right.',
  originalPro1:
    'Free fingerprints — each box is named by its own magic fingerprint, can’t be secretly changed, and copies are never doubled up.',
  originalPro2:
    '“Anyone can hold it” — any helper or public window can hand you a box; you only need to know what you want, not who has it.',
  originalPro3: 'A big, grown-up pile of tools, public windows, and helpers who keep boxes safe.',
  originalPro4:
    'Hard to silence — your box can be copied and handed out by as many helpers as you like.',

  originalConsKicker: 'IPFS · the cost',
  originalConsTitle: 'Where it fought against this app.',
  originalCon1:
    'Lots of asking around — finding a box means many “who has it?” trips before a single piece moves.',
  originalCon2:
    'Gadgets can’t reach each other — tricky walls often block the way, so passing just stops.',
  originalCon3:
    'Big and heavy — Electron packs a whole browser + Node, eating memory and disk and giving bad guys more to poke at.',
  originalCon4:
    'Locks taped on after — locking sits on top of a system made for sharing in the open, so it leaks little hints about you.',
  originalCon5: 'Two of everything — a real browser version meant building the same brains twice.',

  modernProsKicker: 'Iroh · the good parts',
  modernProsTitle: 'What the rebuild gives us.',
  modernPro1:
    'Instant hellos — using the secret name and a straight QUIC pipe skips all the “who has it?” asking.',
  modernPro2:
    'Gets through walls — pokes a hole, and a helper steps in for the tricky walls that used to stop everything.',
  modernPro3:
    'Nobody can peek, by design — only scrambled boxes ever leave, and keys are never written down in plain sight.',
  modernPro4:
    'Sips memory — huge files flow through like a hose instead of filling a giant bucket.',
  modernPro5:
    'One set of brains — the same core works on web and desktop, so nothing is built twice.',
  modernPro6:
    'Nice and light — Tauri borrows your computer’s own window, a tiny fraction of Electron’s weight and risk.',

  modernConsKicker: 'Iroh · the trade-offs',
  modernConsTitle: 'What we gave up — on purpose.',
  modernCon1:
    'You go straight to gadgets — it’s a private link between your own gadgets and friends you trust, not a big playground where “anyone can hand out this CID.”',
  modernCon2: 'A smaller, younger crowd — fewer outside windows, tools, and helpers than IPFS has.',
  modernCon3:
    'Needs a helper in mean networks — when the hole-poke fails, boxes go through a relay helper instead.',
  modernCon4:
    'Trickier to build — making the core work as both WASM and native is more work for the builders (paid once, while building).',

  whyKicker: 'The choice',
  whyTitle: 'Why Sharu is built this way.',
  why1Title: 'It’s private passing, not shouting to the world',
  why1Body:
    'IPFS is great when “anyone can find and hand out this thing.” But Sharu’s stuff is private and locked — nobody else should find it or hand it out — so the giant address book is just extra waiting, and we took it out. Using each gadget’s secret name fits how it really works: you share with friends you already know.',
  why2Title: 'Fast and dependable IS the app',
  why2Body:
    'Local-first means passing has to feel instant and keep working on bad networks. Asking a giant address book and getting stuck behind walls ruins that. A straight QUIC pipe plus poking holes makes connecting feel instant and handles the walls that broke the old way.',
  why3Title: 'Nobody-can-peek has to be built in, not taped on',
  why3Body:
    'Locking on top of a system made for open sharing leaks little hints and makes privacy wobbly. Locking before the box leaves means the network only ever sees scrambled stuff — privacy becomes a rule the tests guard, not just a promise.',
  why4Title: 'One brain, two homes — no doubles',
  why4Body:
    'Building one Rust core into both WASM and native makes web and desktop truly match, keeps the brains tidy in one place, and means the locking and passing logic exists exactly once. Tauri keeps the desktop version light enough to quietly back things up all day.',
  why5Title: 'Keep only what earns its spot',
  why5Body:
    'The one IPFS idea we kept is naming boxes by their fingerprint — now BLAKE3 — because never-changing, never-doubled, can’t-be-faked boxes are truly handy. The giant DHT address book, libp2p routing, Electron, and taped-on locks cost a lot without helping this app, so they’re gone.',

  footer: 'Sharu — nobody-can-peek, local-first backup & sync',
});

/** Machine reading mode — same keys, stripped to terse near-protocol notation. */
export const comparisonMachine = defineMessages('safu.comparison.machine', {
  back: 'back',
  title: 'IPFS vs Iroh',
  subtitle: 'why sharu := rebuilt on direct-QUIC p2p transport',
  meta: 'arch note · 2026 · sharu.io',
  launch: 'launch app',

  abstractKicker: 'tl;dr',
  abstractTitle: 'move encrypted blocks device→device: 2 designs.',
  abstractBody:
    'orig sharu := IPFS → free content-addressing + store-anywhere decentralization. cost: DHT latency, NAT-fragile connectivity, heavy Electron runtime, crypto bolted onto storage. rewrite keeps 1 IPFS idea (block addr = hash), rebuilds rest for actual goal := private, instant, zero-knowledge sync across user-owned devices.',

  tableKicker: 'side by side',
  tableTitle: 'same job, 2 architectures.',
  tableColDimension: 'dim',
  tableColOriginal: 'orig (IPFS)',
  tableColModern: 'safu (Iroh)',

  rowDiscoveryDim: 'discovery',
  rowDiscoveryOld: 'global DHT routing',
  rowDiscoveryNew: 'direct node→node; pubkey = addr',
  rowTransportDim: 'transport',
  rowTransportOld: 'libp2p streams over DHT-resolved path',
  rowTransportNew: 'native QUIC (iroh-blobs=blocks, iroh-docs=state)',
  rowNatDim: 'NAT traversal',
  rowNatOld: 'DHT + relay; fails @ symmetric NAT',
  rowNatNew: 'UDP hole-punch, fallback → DERP/relay',
  rowAddrDim: 'addressing',
  rowAddrOld: 'CID (multihash, usually SHA-256)',
  rowAddrNew: 'BLAKE3(ciphertext)',
  rowRuntimeDim: 'runtime',
  rowRuntimeOld: 'Electron (bundled Chromium + Node)',
  rowRuntimeNew: 'Tauri 2.0 (system webview + small Rust core)',
  rowParityDim: 'web/desktop parity',
  rowParityOld: 'separate js-ipfs browser path',
  rowParityNew: '1 Rust core → WASM web, native desktop',
  rowCryptoDim: 'encryption',
  rowCryptoOld: 'layered on top of IPFS storage',
  rowCryptoNew: 'zero-knowledge; encrypt-before-transmit @ block boundary',
  rowStateDim: 'state/conflicts',
  rowStateOld: 'app-level, coupled to net state',
  rowStateNew: 'deterministic replicated docs (iroh-docs)',

  originalProsKicker: 'IPFS · pro',
  originalProsTitle: 'what orig got right.',
  originalPro1:
    'content-addressing free → immutable, hash-named, dedup blocks w/ intrinsic integrity.',
  originalPro2: 'store-anywhere → any node/public gateway serves a block; know what, not who.',
  originalPro3: 'large mature ecosystem: tooling, gateways, pinning services.',
  originalPro4:
    'censorship-resistant → content replicable + servable by arbitrarily many independent nodes.',

  originalConsKicker: 'IPFS · cost',
  originalConsTitle: 'where it worked against this product.',
  originalCon1: 'DHT latency → resolve addr = many round-trips before byte 0 moves.',
  originalCon2: 'conn fragility → symmetric NAT defeats DHT connectivity → transfers stall.',
  originalCon3: 'heavy runtime → Electron = full Chromium + Node = RAM/disk/attack-surface cost.',
  originalCon4:
    'crypto bolted onto storage → encryption over public-replicated system → metadata leak.',
  originalCon5: 'no clean runtime parity → real browser client = duplicated business logic.',

  modernProsKicker: 'Iroh · pro',
  modernProsTitle: 'what rewrite buys.',
  modernPro1: 'instant connect → pubkey addr + direct QUIC = 0 DHT round-trips.',
  modernPro2: 'robust NAT traversal → hole-punch + relay fallback handles DHT-breaking cases.',
  modernPro3:
    'zero-knowledge by construction → only opaque ciphertext crosses boundary; keys never persisted plaintext.',
  modernPro4: 'streaming, bounded mem → multi-GB files via pipelines, no buffer inflate.',
  modernPro5:
    'true multi-runtime parity → 1 runtime-agnostic core, WASM web + native desktop, 0 dup logic.',
  modernPro6:
    'lightweight runtime → Tauri reuses OS webview; much smaller than Electron footprint + attack surface.',

  modernConsKicker: 'Iroh · trade-offs',
  modernConsTitle: 'what it gives up — deliberately.',
  modernCon1:
    'assumes direct connectivity → sync fabric across own devices + trusted peers, not public anyone-serves-this-CID net.',
  modernCon2:
    'smaller/newer ecosystem → fewer 3rd-party gateways, tools, community resources vs IPFS.',
  modernCon3: 'relay dep in hostile nets → hole-punch fail → fallback to relay infra.',
  modernCon4:
    'build complexity → cross-compile core to WASM + native = toolchain/CI burden (paid once @ build).',

  whyKicker: 'decision',
  whyTitle: 'why sharu built this way.',
  why1Title: 'product = private sync, not public publishing',
  why1Body:
    'IPFS optimizes anyone-discovers-and-serves-content. sharu data = private + encrypted → nobody else should discover/serve it → DHT core feature = pure overhead → removed. pubkey addr fits real access pattern: sync w/ already-known peers.',
  why2Title: 'latency + reliability = the product',
  why2Body:
    'local-first → sync must feel instant + survive bad nets. DHT resolution + NAT fragility undermine that. direct QUIC + hole-punch → conn setup = line-speed transit, handles NAT cases that broke old design.',
  why3Title: 'zero-knowledge must be structural, not layered',
  why3Body:
    'encrypt on top of public-replicated-block system → metadata leak + fragile privacy. encrypt before transport boundary → net sees ciphertext only → privacy = invariant enforced by tests, not convention.',
  why4Title: '1 core, 2 runtimes — no dup',
  why4Body:
    'compile 1 Rust core → WASM + native → genuine web/desktop parity, SDK stays runtime-agnostic, crypto+sync logic exists exactly once. Tauri keeps desktop shell light enough for always-on background backup agent.',
  why5Title: 'keep only what earns its place',
  why5Body:
    'retained IPFS concept = content-addr by hash → now BLAKE3 → immutability + dedup + intrinsic integrity = genuinely valuable. global DHT, libp2p routing, Electron, storage-coupled crypto = cost w/o matching benefit → replaced.',

  footer: 'Sharu — zero-knowledge, local-first backup & sync',
});
