/** @type {import('next').NextConfig} */
// Site público: exportação estática (out/) publicada no GitHub Pages e servida em
// https://www.tce.ap.gov.br/tce-na-comunidade/ (proxy institucional). Como a pasta de publicação muda
// entre os dois endereços, os assets usam caminho relativo (todas as páginas ficam na raiz: index.html,
// tv.html, totem.html, resumo.html, placas.html).
const nextConfig = {
  output: 'export',
  assetPrefix: './',
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ['@tce/core'],
  reactStrictMode: true,
  poweredByHeader: false,
  // Permite vários `next dev`/`next build` em paralelo na mesma pasta (NEXT_DIST_DIR=.next-xxx).
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
