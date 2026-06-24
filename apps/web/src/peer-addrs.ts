// The dialable address (id + relay) of each peer this wallet has paired with,
// keyed by the peer's signing id. The writer *set* persists in the synced
// document, but a writer's transport address does not — so to pin public-share
// blocks to the always-on node after a reload (without re-pairing), we remember
// the addresses here. Local, per-device, not secret; keyed by wallet id.
import type { PeerAddr } from '@safu/transport';

const key = (walletId: string) => `safu.peer-addrs-${walletId}`;

/** All known peer addresses for `walletId`, keyed by signing id. */
export function loadPeerAddrs(walletId: string): Record<string, PeerAddr> {
  try {
    const raw = globalThis.localStorage?.getItem(key(walletId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, PeerAddr>)
      : {};
  } catch {
    return {};
  }
}

/** Remember `addr` for the peer with signing id `signId`, returning the map. */
export function savePeerAddr(
  walletId: string,
  signId: string,
  addr: PeerAddr,
): Record<string, PeerAddr> {
  const addrs = loadPeerAddrs(walletId);
  addrs[signId] = addr;
  globalThis.localStorage?.setItem(key(walletId), JSON.stringify(addrs));
  return addrs;
}
