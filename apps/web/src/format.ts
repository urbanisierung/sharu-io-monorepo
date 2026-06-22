// Pure, framework-free formatting helpers for the file table — the kind of
// display logic every file manager needs (human-readable sizes, dates, and a
// type icon from the extension). Kept out of the component so they are unit
// tested directly and stay deterministic (no locale/timezone dependence).

/** Bytes as a short human string: `0 B`, `1.5 KB`, `3 MB`. Base-1024, one
 *  decimal below 10 of a unit, none above (matches how Finder/Drive read). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} ${units[unit]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A stable, locale-independent `Mon D, YYYY` (UTC) so the rendered date — and
 *  its tests — are deterministic across machines and CI. */
export function formatDate(ms: number): string {
  const date = new Date(ms);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'file';

const KIND_BY_EXT: Record<string, FileKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  heic: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  txt: 'document',
  md: 'document',
  csv: 'document',
  zip: 'archive',
  gz: 'archive',
  tar: 'archive',
  rar: 'archive',
  '7z': 'archive',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  json: 'code',
  rs: 'code',
  py: 'code',
  go: 'code',
};

/** Classify a path by its extension — the basis for the row's type icon. */
export function fileKind(path: string): FileKind {
  const dot = path.lastIndexOf('.');
  if (dot < 0 || dot === path.length - 1) return 'file';
  return KIND_BY_EXT[path.slice(dot + 1).toLowerCase()] ?? 'file';
}

const ICON_BY_KIND: Record<FileKind, string> = {
  image: '🖼️',
  video: '🎞️',
  audio: '🎵',
  document: '📄',
  archive: '🗜️',
  code: '🧩',
  file: '📦',
};

/** A decorative glyph for a path's type (rendered aria-hidden). */
export function fileIcon(path: string): string {
  return ICON_BY_KIND[fileKind(path)];
}
