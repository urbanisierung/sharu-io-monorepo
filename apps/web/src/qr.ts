// Tiny pure wrapper over the QR encoder, so the rest of the app gets a clean,
// testable `value → SVG path` function and the dependency is touched in exactly
// one place. No DOM here; the component renders the path as an <svg>.
import qrcode from 'qrcode-generator';

/** The dark modules of the QR for `value` as one SVG path (1 unit per module),
 *  plus the module count for the viewBox. Error-correction level M. */
export function qrSvgPath(value: string): { count: number; path: string } {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { count, path };
}
