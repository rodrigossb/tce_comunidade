/** @type {import('next').NextConfig} */
// Controle de senhas: roda como servidor Node (pm2 → next start) atrás do nginx em /tce-senhas/.
// BASE_PATH muda o prefixo (ex.: "" para servir na raiz de um servidor local).
const basePath = process.env.BASE_PATH ?? '/tce-senhas';
const nextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@tce/core'],
  reactStrictMode: true,
  agentRules: false,
  // Só em desenvolvimento: libera acesso por IP/127.0.0.1 aos recursos do `next dev`.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '10.*.*.*', '192.168.*.*', '172.16.*.*', '172.31.*.*'],
  poweredByHeader: false,
  compress: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      // Hosts aceitos nas server actions quando o navegador acessa por outro nome/IP (servidor local). Separados por vírgula.
      allowedOrigins: ['localhost:3015', 'localhost:3115', '127.0.0.1:3015', ...(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)],
      bodySizeLimit: '100kb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Cache-Control', value: 'no-store' },
    ] }];
  },
};
export default nextConfig;
