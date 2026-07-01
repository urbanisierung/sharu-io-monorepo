import { defineMessages } from '@cascivo/i18n';

/** The browser onboarding view (route `/link`) that picks up the deep link
 *  `sharu serve` prints. It walks the operator through the round trip between
 *  this browser and their terminal: link the node here, confirm the safety
 *  number, and send this device's code back to the CLI. */
export const link = defineMessages('safu.link', {
  title: 'Link your backup node',
  intro:
    'You started sharu on your terminal and opened the link it printed. Here is how to finish pairing — it is a quick round trip between this browser and your terminal.',
  nodeHeading: 'The node you’re linking',
  signingIdLabel: 'Signing ID',
  relayLabel: 'Home relay',
  relayUnknown: 'Not connected to a relay yet',
  step1Title: '1. Link the node to this device',
  step1Body:
    'Continue into Sharu and unlock your wallet. This node is authorized automatically and then shows up under Devices.',
  step2Title: '2. Confirm the safety number',
  step2Body:
    'Your terminal prints a safety number for this node. Check it matches the one Sharu shows for the node under Devices before you trust it.',
  step3Title: '3. Send your device code back',
  step3Body:
    'Under Devices, use “Copy code” to copy this device’s code, paste it at the terminal’s “Device code:” prompt, and confirm the safety number there too.',
  cta: 'Open Sharu and link this node',
  invalidTitle: 'No node code in this link',
  invalidBody:
    'Run sharu serve (or sharu info) on your terminal and copy the link it prints into your browser’s address bar.',
  invalidCta: 'Read the backup-node docs',
});

/** ELI5 reading mode — same keys, retold so a five-year-old gets it. */
export const linkEli5 = defineMessages('safu.link.eli5', {
  title: 'Hook up your always-awake helper',
  intro:
    'You woke up your always-awake helper on your keyboard and opened the link it gave you. Here is how to finish making friends — you just pass a code back and forth between this page and your keyboard.',
  nodeHeading: 'The helper you’re hooking up',
  signingIdLabel: 'Name tag',
  relayLabel: 'Home relay',
  relayUnknown: 'Not connected yet',
  step1Title: '1. Hook the helper up to this gadget',
  step1Body:
    'Go into Sharu and say your secret word. This helper gets let in by itself and then shows up under Gadgets.',
  step2Title: '2. Check the safety number',
  step2Body:
    'Your keyboard shows a little safety number for this helper. Make sure it is the same as the one Sharu shows for it under Gadgets before you trust it.',
  step3Title: '3. Send your gadget’s code back',
  step3Body:
    'Under Gadgets, tap “Copy the code” to grab this gadget’s code, paste it where your keyboard asks for “Device code:”, and check the safety number there too.',
  cta: 'Open Sharu and hook up this helper',
  invalidTitle: 'No helper code in this link',
  invalidBody:
    'Wake up your helper with sharu serve (or sharu info) on your keyboard and copy the link it shows into your browser.',
  invalidCta: 'Read about the helper',
});

/** Machine reading mode — same keys, stripped to terse lowercase token style. */
export const linkMachine = defineMessages('safu.link.machine', {
  title: 'node.link',
  intro:
    'sharu serve started on terminal; deep link opened. finish pairing = round trip: browser <-> terminal.',
  nodeHeading: 'node being linked',
  signingIdLabel: 'signing id',
  relayLabel: 'home relay',
  relayUnknown: 'no relay yet',
  step1Title: '1. link node -> this device',
  step1Body: 'continue into sharu + unlock wallet. node auto-authorized → appears under devices.',
  step2Title: '2. verify sas',
  step2Body:
    'terminal prints node sas. verify == sas sharu shows for node under devices before trust.',
  step3Title: '3. send device code back',
  step3Body:
    'devices › “cp code” → paste at terminal “Device code:” prompt → confirm sas there too.',
  cta: 'open sharu + link node',
  invalidTitle: 'err: no node code in link',
  invalidBody: 'run sharu serve (|info) on terminal → copy printed link into browser address bar.',
  invalidCta: 'backup-node docs',
});
