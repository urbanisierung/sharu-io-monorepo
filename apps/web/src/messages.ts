// All user-facing strings flow through @cascivo/i18n (plan §2.4) — no hardcoded
// English in components. The lint guard in this app's test suite enforces it.
import { defineMessages } from '@cascivo/i18n';

export const messages = defineMessages('safu', {
  title: 'Safu',
  tagline: 'Zero-knowledge, local-first backup & sync',
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
});
