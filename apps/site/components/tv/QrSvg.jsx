import { qrSvg } from '@tce/core';

/** QR Code como elemento <svg> de verdade (sem wrapper): o CSS da TV usa `.tv-qr>svg` (filho direto). */
export default function QrSvg({ text, margin = 2, dark = '#0b1b3a', light = '#ffffff' }) {
  const s = qrSvg(text, { margin, dark, light });
  const size = Number((s.match(/viewBox="0 0 (\d+) \d+"/) || [])[1] || 0);
  const d = (s.match(/<path d="([^"]*)"/) || [])[1] || '';
  if (!size) return null;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR Code">
      <rect width={size} height={size} fill={light} />
      <path d={d} fill={dark} />
    </svg>
  );
}
