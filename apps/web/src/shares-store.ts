// The list of files this wallet has published as public shares
// (docs/public-share.md). Like device names, this is local, per-device UI
// bookkeeping — not secret and not synced — so it lives in localStorage, keyed
// by wallet id so switching wallets never mixes shares. The share *key* is part
// of `link` (in its fragment); everything here is already public-by-design, but
// it is still local-only because it is a record of what THIS device published.

/** One published share, as the UI lists it for copying or revoking. */
export interface PublishedShare {
  /** Ciphertext address of the sealed manifest — the share's stable id. */
  root: string;
  /** The wallet file this share was published from. */
  path: string;
  /** The full openable link (carries the key in its fragment). */
  link: string;
  /** Every block address pinned to the node, so a future unpublish can drop them. */
  pin: string[];
  /** When it was published (ms epoch), for sorting newest-first. */
  created: number;
}

const key = (walletId: string) => `safu.shares-${walletId}`;

/** All shares published from `walletId`, newest first. */
export function loadShares(walletId: string): PublishedShare[] {
  try {
    const raw = globalThis.localStorage?.getItem(key(walletId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PublishedShare[]) : [];
  } catch {
    return [];
  }
}

/** Record a newly-published share (replacing any prior share of the same root),
 *  returning the updated list for the caller to publish to a signal. */
export function addShare(walletId: string, share: PublishedShare): PublishedShare[] {
  const shares = [share, ...loadShares(walletId).filter((s) => s.root !== share.root)];
  globalThis.localStorage?.setItem(key(walletId), JSON.stringify(shares));
  return shares;
}

/** Forget a published share by root, returning the updated list. */
export function removeShare(walletId: string, root: string): PublishedShare[] {
  const shares = loadShares(walletId).filter((s) => s.root !== root);
  globalThis.localStorage?.setItem(key(walletId), JSON.stringify(shares));
  return shares;
}
