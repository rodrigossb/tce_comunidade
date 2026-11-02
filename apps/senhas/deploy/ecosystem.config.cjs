// pm2: `pm2 start apps/senhas/deploy/ecosystem.config.cjs` (depois de `npm ci` e `npm run build:senhas` na raiz).
// PORT e HOST vêm do apps/senhas/.env (o `next start` não lê .env para a própria porta).
const fs = require('fs');
const path = require('path');
const cwd = path.resolve(__dirname, '..');
const env = { NODE_ENV: 'production' };
try {
  for (const line of fs.readFileSync(path.join(cwd, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*(PORT|HOST)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sem .env: usa os padrões do package.json (3015, 127.0.0.1) */ }
module.exports = { apps: [{ name: 'tce-senhas', cwd, script: 'npm', args: 'start', env, time: true, autorestart: true, max_memory_restart: '400M' }] };
