// Hand a public-share link to the OS share sheet via the Web Share API, so on a
// phone one tap forwards it to WhatsApp, Messages, email, etc. — no copy-then-
// switch-apps dance. Most desktop browsers lack `navigator.share`, so callers
// keep their Copy button as the always-available fallback and only show the
// Send button when `canWebShare()` is true.

/** Whether this browser can hand a link to the native share sheet. */
export function canWebShare(): boolean {
  return typeof globalThis.navigator?.share === 'function';
}

/** Open the native share sheet for `url`, with `text` as the accompanying note
 *  (gives the receiver context in the resulting WhatsApp/email message). A
 *  dismissed sheet or an unsupported platform rejects — there is nothing to do. */
export async function webShare(url: string, text: string): Promise<void> {
  try {
    await globalThis.navigator.share({ text, url });
  } catch {
    // User dismissed the sheet, or the platform refused it — no-op.
  }
}
