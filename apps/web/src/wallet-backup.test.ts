import { describe, expect, it } from 'vitest';
import { backupFilename, parseWalletBackup, serializeWalletBackup } from './wallet-backup.js';

describe('wallet backup', () => {
  it('round-trips a wallet backup through serialize/parse', () => {
    const backup = {
      name: 'Personal',
      password: 'correcthorse',
      salt: new Uint8Array([1, 2, 3, 4]),
    };
    const parsed = parseWalletBackup(serializeWalletBackup(backup));
    expect(parsed.name).toBe('Personal');
    expect(parsed.password).toBe('correcthorse');
    expect(parsed.salt).toEqual(backup.salt);
  });

  it('rejects files that are not Sharu wallet backups', () => {
    expect(() => parseWalletBackup('not json')).toThrow(/invalid JSON/);
    expect(() => parseWalletBackup('{}')).toThrow(/not a Sharu wallet backup/);
    expect(() => parseWalletBackup(JSON.stringify({ kind: 'sharu-wallet' }))).toThrow(/name/);
  });

  it('derives a filesystem-safe download name', () => {
    expect(backupFilename('My Work Wallet!')).toBe('sharu-wallet-my-work-wallet.json');
    expect(backupFilename('   ')).toBe('sharu-wallet-backup.json');
  });
});
