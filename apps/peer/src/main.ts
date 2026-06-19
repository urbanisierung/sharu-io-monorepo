// CLI entry for the always-on backup peer. Configured via environment:
//   SAFU_PEER_DATA_DIR    directory the node owns (default ./safu-peer-data)
//   SAFU_PEER_PASSPHRASE  derives this node's signing identity (required)
//   SAFU_PEER_AUTHORIZE   comma-separated device signing ids to back up
//
// This wires identity → fs stores → createPeer → serve and stays resident. The
// transport comes from createPeerTransport(), the single unimplemented seam
// (see transport.ts); everything above it is exercised by the loopback tests.
import { loadOrCreateSigner } from './identity.js';
import { createPeer } from './peer.js';
import { createPeerTransport } from './transport.js';

const dataDir = process.env.SAFU_PEER_DATA_DIR ?? './safu-peer-data';
const passphrase = process.env.SAFU_PEER_PASSPHRASE;
if (!passphrase) throw new Error('SAFU_PEER_PASSPHRASE is required');

const authorized = (process.env.SAFU_PEER_AUTHORIZE ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const signer = await loadOrCreateSigner(dataDir, passphrase);
const transport = await createPeerTransport();
const peer = await createPeer({ dataDir, signer, transport });
for (const id of authorized) peer.authorize(id);

console.log(`safu peer online\n  signing id: ${peer.id}\n  address: ${JSON.stringify(peer.addr)}`);

// Stay resident: DocSync's accept loops keep replicating until signalled. Flush
// the doc snapshot on shutdown so nothing in flight is lost.
const shutdown = (): void => {
  void peer.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
