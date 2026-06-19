import { describe, expect, it } from 'vitest';
import { deriveSas } from './sas.js';

// A Short Authentication String lets two freshly-paired devices detect a relay
// MITM: both derive the same code from their two ids and compare it out-of-band
// (plan §2.2 open question "relay trust at rendezvous").
describe('deriveSas', () => {
  it('is a stable 6-digit code', async () => {
    const sas = await deriveSas('peerA', 'peerB');
    expect(sas).toMatch(/^\d{6}$/);
    expect(await deriveSas('peerA', 'peerB')).toBe(sas);
  });

  it('is symmetric — both devices derive the same code regardless of order', async () => {
    expect(await deriveSas('peerA', 'peerB')).toBe(await deriveSas('peerB', 'peerA'));
  });

  it('differs for a different peer pair', async () => {
    expect(await deriveSas('peerA', 'peerB')).not.toBe(await deriveSas('peerA', 'peerC'));
  });
});
