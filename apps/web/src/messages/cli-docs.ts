import { defineMessages } from '@cascivo/i18n';

/** Docs page for the sharu CLI. The command/option tables are rendered from
 *  the generated spec (cli-docs/cli-spec.generated.ts); this namespace is the
 *  surrounding explanatory prose. */
export const cliDocs = defineMessages('safu.cli', {
  title: 'The backup node',
  subtitle:
    'sharu is an always-on, zero-knowledge replica of your backups you run from your terminal.',
  versionLabel: 'Version',
  introHeading: 'What it is',
  introBody:
    'sharu is a small headless binary you run on a machine that is always on — a home server, NAS, or Raspberry Pi. It joins your devices over Iroh and keeps a full ciphertext replica of everything they back up, so a copy stays reachable even when every other device is offline. It is zero-knowledge: it stores and serves only ciphertext and never sees your keys or your files.',
  useCasesHeading: 'When to run one',
  uc1Title: 'An always-on copy',
  uc1Body:
    'Your laptop and phone come and go. A node that never sleeps keeps your backups reachable around the clock.',
  uc2Title: 'Host public shares',
  uc2Body:
    'Publishing a file or a folder as a public link needs a node to host the ciphertext. It serves the link without ever being able to read what is inside.',
  uc3Title: 'Fan out to many replicas',
  uc3Body:
    'Give each node its own data dir and run as many as you like — each keeps an independent ciphertext replica of the same backups.',
  startHeading: 'Getting started',
  startIntro: 'Install the binary, create an identity, link a device, then leave it serving.',
  installHeading: 'Install',
  installNote:
    'No prebuilt binary for your platform? Build it from source with cargo build --release -p sharu.',
  quickstartHeading: 'First run',
  quickstartIntro:
    'Set the passphrase that derives this node identity (prefer an environment variable so it stays out of your shell history), then run these in order:',
  pairNote:
    'Copy the connection code the web app shows under "Link this device" and pass it to link. To let the app show this node back, paste the node info code into the app.',
  commandsHeading: 'Commands',
  commandsIntro: 'Every subcommand the CLI accepts:',
  thCommand: 'Command',
  thWhat: 'What it does',
  configHeading: 'Options & environment',
  configIntro:
    'Flags can be passed on the command line or set once as environment variables. Flags must come before the command.',
  thOption: 'Flag',
  thEnv: 'Environment',
  thMeaning: 'What it does',
  thDefault: 'Default',
  badgeRequired: 'Required',
  dataLayoutHeading: 'Data directory',
  dataLayoutIntro:
    'Everything the node owns lives under its data dir. Point --data-dir (or SHARU_DATA_DIR) at a durable location:',
  dataLayout:
    '<data-dir>/\n  identity/signer.salt   the salt; the secret key is never written to disk\n  doc.json               the replicated allocation table\n  devices.json           linked devices: signing id and address\n  blocks/                content-addressed ciphertext, one file per hash',
  securityHeading: 'Zero-knowledge by construction',
  securityBody:
    'The node only ever holds ciphertext. Your passphrase derives its identity on the machine itself and the secret key is never written to disk. Linked devices are explicit and revocable — unlink a lost device to stop replicating for it. Pass the passphrase through an environment variable, not an argument, to keep it out of process listings and shell history.',
  ctaTitle: 'Run your own node',
  ctaBody: 'Open the app, go to Devices, and link your always-on backup node.',
});

/** ELI5 reading mode — same keys, retold so a five-year-old gets it. */
export const cliDocsEli5 = defineMessages('safu.cli.eli5', {
  title: 'The helper that holds your backups',
  subtitle:
    'sharu is a helper computer that never sleeps and keeps a locked-up copy of your backups, started from your keyboard.',
  versionLabel: 'Version',
  introHeading: 'What it is',
  introBody:
    'sharu is a tiny program you run on a computer that is always awake — like a home server, a NAS, or a Raspberry Pi. It holds hands with your other gadgets over Iroh and keeps a full copy of everything they tuck away, all locked tight, so a copy is always there even when every other gadget has gone to sleep. It never peeks: it only holds and hands out locked boxes, and it never sees your secret word or what is inside.',
  useCasesHeading: 'When to run one',
  uc1Title: 'A copy that never sleeps',
  uc1Body:
    'Your laptop and phone wander off and come back. A helper that never sleeps keeps your backups ready any time of day or night.',
  uc2Title: 'Share things with friends',
  uc2Body:
    'To turn a file or folder into a link anyone can open, you need a helper to hold the locked box. It hands out the link without ever being able to peek inside.',
  uc3Title: 'Make lots of copies',
  uc3Body:
    'Give each helper its own little drawer and run as many as you like — each one keeps its own locked-up copy of the very same backups.',
  startHeading: 'Getting started',
  startIntro:
    'Put the program on the computer, give it a name, hold hands with one of your gadgets, then let it keep watch.',
  installHeading: 'Install',
  installNote:
    'No ready-made program for your kind of computer? Build your own with cargo build --release -p sharu.',
  quickstartHeading: 'First run',
  quickstartIntro:
    'Pick the secret word that gives this helper its name (it is tidier to tuck it into an environment variable so it stays out of your typing history), then run these one after another:',
  pairNote:
    'Copy the little connection code the web app shows under "Link this device" and hand it to link. To let the app see this helper wave back, paste the helper\'s info code into the app.',
  commandsHeading: 'Commands',
  commandsIntro: 'Every little word you can tell the helper:',
  thCommand: 'Command',
  thWhat: 'What it does',
  configHeading: 'Options & environment',
  configIntro:
    'You can hand the helper these settings when you start it, or set them once as environment variables. Settings go before the command word.',
  thOption: 'Flag',
  thEnv: 'Environment',
  thMeaning: 'What it does',
  thDefault: 'Default',
  badgeRequired: 'Required',
  dataLayoutHeading: 'Data directory',
  dataLayoutIntro:
    'Everything the helper keeps lives inside its own drawer. Point --data-dir (or SHARU_DATA_DIR) at a safe, sturdy spot:',
  dataLayout:
    '<data-dir>/\n  identity/signer.salt   a sprinkle of magic dust; the real secret key is never written down\n  doc.json               the shared list of what goes where\n  devices.json           the gadgets it holds hands with: their signature and where to find them\n  blocks/                the locked boxes, named by what is inside, one file each',
  securityHeading: 'Zero-knowledge by construction',
  securityBody:
    'The helper only ever holds locked boxes. Your secret word makes its name right there on its own computer, and the real secret key is never written down anywhere. The gadgets it holds hands with are chosen on purpose and can be let go — unlink a lost gadget to stop keeping copies for it. Whisper the secret word through an environment variable, not as a word you type out, so it stays out of nosy lists and your typing history.',
  ctaTitle: 'Run your own node',
  ctaBody: 'Open the app, go to Devices, and hold hands with your never-sleeping backup helper.',
});

/** Machine reading mode — same keys, stripped to terse near-protocol notation. */
export const cliDocsMachine = defineMessages('safu.cli.machine', {
  title: 'backup node',
  subtitle: 'sharu := always-on, zero-knowledge replica of backups; run from terminal.',
  versionLabel: 'Version',
  introHeading: 'def',
  introBody:
    'sharu := small headless binary on always-on host (home server | NAS | Raspberry Pi). joins devices over Iroh → keeps full ciphertext replica of all backups; copy stays reachable while all other devices = offline. zero-knowledge: stores+serves ciphertext only; keys = never seen, files = never seen.',
  useCasesHeading: 'when to run',
  uc1Title: 'always-on copy',
  uc1Body: 'laptop, phone → intermittent. node that never sleeps → backups reachable 24/7.',
  uc2Title: 'host public shares',
  uc2Body:
    'public link of file|folder requires node to host ciphertext. serves link; read of contents = impossible.',
  uc3Title: 'fan out → many replicas',
  uc3Body:
    'per node: own data dir → run n nodes. each := independent ciphertext replica of same backups.',
  startHeading: 'getting started',
  startIntro: 'install binary → create identity → link device → leave serving.',
  installHeading: 'install',
  installNote:
    'no prebuilt binary for platform → build from source: cargo build --release -p sharu.',
  quickstartHeading: 'first run',
  quickstartIntro:
    'set passphrase → derives node identity (prefer env var → stays out of shell history), then run in order:',
  pairNote:
    'copy connection code from web app under "Link this device" → pass to link. reverse: paste node info code into app → app shows node.',
  commandsHeading: 'commands',
  commandsIntro: 'all cli subcommands:',
  thCommand: 'Command',
  thWhat: 'op',
  configHeading: 'options & env',
  configIntro: 'flags := cli args | set once as env vars. flags → before command.',
  thOption: 'Flag',
  thEnv: 'Environment',
  thMeaning: 'op',
  thDefault: 'Default',
  badgeRequired: 'Required',
  dataLayoutHeading: 'data dir',
  dataLayoutIntro:
    'all node state → under data dir. point --data-dir (or SHARU_DATA_DIR) → durable location:',
  dataLayout:
    '<data-dir>/\n  identity/signer.salt   salt; secret key → never on disk\n  doc.json               replicated allocation table\n  devices.json           linked devices = signing id + address\n  blocks/                content-addressed ciphertext, 1 file = 1 hash',
  securityHeading: 'zero-knowledge by construction',
  securityBody:
    'node holds ciphertext only. passphrase → derives identity on-host; secret key → never on disk. linked devices = explicit + revocable → unlink lost device = stop replicating for it. pass passphrase via env var, not arg → keeps it out of process listings + shell history.',
  ctaTitle: 'run your own node',
  ctaBody: 'open app → Devices → link your always-on backup node.',
});
