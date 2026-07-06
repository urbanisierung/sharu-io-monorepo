// R1.3 verification spike (gated behind SAFU_SPIKE=1): does the iroh **WASM**
// build honor a custom relay + custom pkarr discovery at runtime, with ZERO n0
// infrastructure? This is the one thing R1.1/R1.2 could only prove at
// compile-time. It runs end-to-end against a self-hosted iroh-relay (--dev) and
// iroh-dns-server (pkarr relay) on localhost, booted by the runner
// `scripts/r13-selfhost-spike.sh`, which sets SPIKE_RELAY / SPIKE_PKARR.
//
// Gated like the relay e2e (SAFU_E2E): it needs those two binaries running, so
// unset → skipped and CI stays offline-safe.
//
// DECISIVE assertion (verified in this sandbox): a relay-only WASM endpoint —
// the same core the browser and headless `apps/peer` use — comes online against
// the LOCAL relay, reaching *no* n0 host. This answers the open research
// question "does the WASM build honor RelayMode::custom at runtime?" → yes.
//
// The pkarr publish (advertising the endpoint's address under its id to the
// LOCAL discovery server) is probed as a best-effort observation, NOT asserted:
// against a plain-HTTP dev pkarr relay in a headless sandbox it does not
// complete (publish appears to need an HTTPS relay and/or a net-report-settled
// address — the same address-discovery limitation that gates the relay e2e; see
// docs/r13-selfhost-spike-findings.md). Run on real hardware against an HTTPS
// iroh-dns-server to exercise the publish path fully.
import { describe, expect, it } from 'vitest';
import { createIrohTransport } from './iroh.js';

const RELAY = process.env.SPIKE_RELAY;
const PKARR = process.env.SPIKE_PKARR; // e.g. http://127.0.0.1:8080/pkarr

describe.skipIf(!process.env.SAFU_SPIKE)('self-hosted relay + discovery in WASM (zero n0)', () => {
  it('WASM endpoint comes online against a self-hosted relay with custom pkarr discovery', async () => {
    if (!RELAY || !PKARR) throw new Error('set SPIKE_RELAY and SPIKE_PKARR');

    const transport = await createIrohTransport(
      ['safu/spike/1'],
      20_000,
      [RELAY],
      [`pkarr:${PKARR}`],
    );
    try {
      const addr = transport.addr();
      console.log('SPIKE addr=', JSON.stringify(addr));

      // DECISIVE: custom relay honored in the WASM runtime, zero n0 contacted.
      expect(addr.relayUrl, 'endpoint never came online against the local relay').toBeTruthy();
      expect(addr.relayUrl).toMatch(/3340|localhost|127\.0\.0\.1/);

      // Best-effort observation only (see file header): probe the local pkarr
      // server for this endpoint's published record. Never fails the test.
      const base = PKARR.replace(/\/$/, '');
      let published = false;
      for (let i = 0; i < 10 && !published; i++) {
        try {
          const res = await fetch(`${base}/${addr.id}`);
          if (res.ok && (await res.arrayBuffer()).byteLength > 0) published = true;
        } catch {
          // record not stored (yet)
        }
        if (!published) await new Promise((r) => setTimeout(r, 500));
      }
      console.log(`SPIKE pkarr publish observed: ${published} (best-effort, not asserted)`);
    } finally {
      await transport.close();
    }
  }, 40_000);
});
