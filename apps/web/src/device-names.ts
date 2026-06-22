// Friendly, human names for paired devices ("Mom's phone") so the UI never
// forces the user to read a raw key id. Names are a local, per-device label —
// not secret and not synced — stored in localStorage, mirroring how messaging
// apps let you label contacts locally. Keyed by the peer's signing id.

const KEY = 'safu.device-names';

/** All locally-saved device names, keyed by peer signing id. */
export function loadDeviceNames(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Save (or, with an empty name, clear) the label for one device; returns the
 *  updated map so callers can publish it to a signal. */
export function saveDeviceName(id: string, name: string): Record<string, string> {
  const names = loadDeviceNames();
  const trimmed = name.trim();
  if (trimmed) names[id] = trimmed;
  else delete names[id];
  globalThis.localStorage?.setItem(KEY, JSON.stringify(names));
  return names;
}
