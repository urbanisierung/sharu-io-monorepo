// Map a file path to a content type for site shares. A folder picked with
// <input webkitdirectory> often yields File.type === '' for .css/.js/.html, but
// a navigable site needs correct types so the browser parses each subresource.
// Small, static, extension-based — not a full database; the default is the safe
// binary type, which still downloads correctly.
const TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** The content type for `path`, by extension; binary fallback when unknown. */
export function mimeOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : '';
  return TYPES[ext] ?? 'application/octet-stream';
}
