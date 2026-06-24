import { describe, expect, it } from 'vitest';
import { createIrohTransport } from './iroh.js';

// Proves the relay-only WASM binding boots headless under Node (the always-on
// peer's transport seam): the `.wasm` is read from disk and an endpoint with a
// real Ed25519 id is created. A short online timeout keeps it fast offline —
// reaching the relay is a network concern, not what this asserts.
describe('iroh WASM transport under Node', () => {
  it('boots from disk and creates an endpoint with an id', async () => {
    const transport = await createIrohTransport(['safu/test/1'], 300);
    const id = transport.id();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(transport.addr().id).toBe(id);
    await transport.close();
  }, 20_000);
});
