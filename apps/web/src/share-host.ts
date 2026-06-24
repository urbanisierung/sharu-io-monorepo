// Which paired peer hosts this wallet's public shares — the always-on node a
// share's blocks are pinned to and whose address goes in the link. With more
// than one paired peer (a phone, a laptop, a node) there is no device/node
// distinction in the protocol, so the user picks; we remember the choice per
// wallet (the signing id of the chosen peer). Local, per-device, not secret.
const key = (walletId: string) => `safu.share-host-${walletId}`;

/** The chosen host peer's signing id for `walletId`, or undefined if unset
 *  (the runtime then falls back to the only/first paired peer). */
export function loadShareHost(walletId: string): string | undefined {
  return globalThis.localStorage?.getItem(key(walletId)) ?? undefined;
}

/** Remember `signId` as the share host for `walletId`. */
export function saveShareHost(walletId: string, signId: string): void {
  globalThis.localStorage?.setItem(key(walletId), signId);
}
