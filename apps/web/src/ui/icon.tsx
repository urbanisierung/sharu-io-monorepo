// In-repo inline-SVG icon set — one consistent stroke voice across the whole
// shell, replacing the colour-emoji that rendered differently on every OS.
// Local-first forbids an icon-font CDN, so the glyphs live here. Each icon is a
// 24×24 stroke drawing sized at 1em and inheriting `currentColor`, so callers
// scale and colour it with plain font-size / color. Decorative by default
// (aria-hidden) — every icon in this app sits beside a real text label.
import type { JSX } from 'preact';
import type { FileKind } from '../format.js';

export type IconName =
  | 'files'
  | 'devices'
  | 'settings'
  | 'inbox'
  | 'plus'
  | 'menu'
  | 'close'
  | 'download'
  | 'share'
  | 'trash'
  | 'check'
  | 'copy'
  | 'more'
  | 'wallet'
  | 'lock'
  | 'chevronRight'
  | 'info'
  | 'swap'
  | 'key'
  | 'plug'
  | FileKind;

const GLYPHS: Record<IconName, JSX.Element> = {
  files: (
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  more: (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  menu: (
    <>
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </>
  ),
  close: (
    <>
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </>
  ),
  // A desktop beside a handset — the redesign's Devices tab and the mental model
  // the copy uses ("your phones and computers"), not the chain-link it replaced.
  devices: (
    <>
      <rect x="2" y="4" width="13" height="9" rx="1" />
      <path d="M6.5 20h5" />
      <path d="M8.5 16v-3" />
      <rect x="16" y="9" width="6" height="11" rx="1" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h12v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z" />
      <circle cx="17" cy="13.5" r="1" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  chevronRight: <polyline points="9 5 16 12 9 19" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  swap: (
    <>
      <polyline points="7 7 4 10 7 13" />
      <path d="M4 10h16" />
      <polyline points="17 11 20 14 17 17" />
      <path d="M20 14H4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m10.9 10.9 8.1 8.1" />
      <path d="m16 16-2 2" />
      <path d="m19 19 2-2" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6Z" />
      <path d="M12 17v4" />
    </>
  ),
  settings: (
    <>
      <line x1="21" x2="14" y1="6" y2="6" />
      <line x1="10" x2="3" y1="6" y2="6" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="18" y2="18" />
      <line x1="12" x2="3" y1="18" y2="18" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </>
  ),
  plus: (
    <>
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </>
  ),
  video: (
    <>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
  audio: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  document: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <line x1="8" x2="16" y1="13" y2="13" />
      <line x1="8" x2="14" y1="17" y2="17" />
    </>
  ),
  archive: (
    <>
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <line x1="10" x2="14" y1="12" y2="12" />
    </>
  ),
  code: (
    <>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </>
  ),
  file: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  class?: string;
}

export function Icon({ name, class: cls }: IconProps) {
  return (
    <svg
      class={cls}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
