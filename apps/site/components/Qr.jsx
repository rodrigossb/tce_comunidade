import { qrPath } from '@tce/core';

/** QR Code em SVG (gerado localmente, sem rede), como elemento <svg> real: seletores `… > svg` do CSS antigo continuam valendo. */
export default function Qr({ text, margin, dark, light, className, style }) {
  const opts = Object.fromEntries(Object.entries({ margin, dark, light }).filter(([, v]) => v != null));
  const q = qrPath(text, opts);
  return (
    <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${q.size} ${q.size}`} shapeRendering="crispEdges" role="img" aria-label="QR Code">
      <rect width={q.size} height={q.size} fill={q.light} />
      <path d={q.path} fill={q.dark} />
    </svg>
  );
}
