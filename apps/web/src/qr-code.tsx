// Renders a value as a scannable QR code (SVG). Used to show the pairing link
// so another device's camera can open the app prefilled. Pure/presentational;
// the encoding lives in qr.ts.
import { qrSvgPath } from './qr.js';
import styles from './qr.module.css';

const MARGIN = 2; // quiet zone (modules) required around a QR for reliable scans

export interface QrCodeProps {
  value: string;
  /** Accessible description of what the code is for. */
  label: string;
}

export function QrCode({ value, label }: QrCodeProps) {
  const { count, path } = qrSvgPath(value);
  const size = count + MARGIN * 2;
  return (
    <svg
      class={styles.qr}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} transform={`translate(${MARGIN} ${MARGIN})`} fill="#000000" />
    </svg>
  );
}
