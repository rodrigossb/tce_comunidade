import { qrSvg } from '@tce/core';

/** QR Code em SVG (gerado localmente, sem rede). O wrapper tem display:contents para não alterar o layout. */
export default function Qr({ text, cell, margin, dark, light, className }) {
  const svg = qrSvg(text, { cell, margin, dark, light });
  return <span className={className} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
