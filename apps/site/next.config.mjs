/** @type {import('next').NextConfig} */
// Site público: exportação estática (out/) publicada no GitHub Pages e servida em
// https://www.tce.ap.gov.br/tce-na-comunidade/ (proxy institucional). Como a pasta de publicação muda
// entre os dois endereços, os assets usam caminho relativo (todas as páginas ficam na raiz: index.html,
// tv.html, totem.html, resumo.html, placas.html).
const nextConfig = {
  output: 'export',
  // Relativo só no export: no `next dev` o prefixo relativo impede a hidratação/HMR.
  assetPrefix: process.env.NODE_ENV === 'development' ? undefined : './',
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ['@tce/core'],
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  // Permite vários `next dev`/`next build` em paralelo na mesma pasta (NEXT_DIST_DIR=.next-xxx).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Só em desenvolvimento: deixa os links relativos do export (tv.html, totem.html…) funcionarem no `next dev`.
  ...(process.env.NODE_ENV === 'development' ? { async rewrites() { return [{ source: '/:page(index|tv|totem|totem-classico|resumo|resumo-cursos|placas).html', destination: '/:page' }]; } } : {}),
};
export default nextConfig;
