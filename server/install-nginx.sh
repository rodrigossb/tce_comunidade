#!/usr/bin/env bash
# Insere o bloco location /tce-senhas/ no nginx (com backup), testa e recarrega. Rodar com sudo.
set -euo pipefail
CONF=/etc/nginx/conf.d/gerenciahub.conf
SNIP="$(dirname "$0")/nginx-tce-senhas.conf"
if grep -q "location /tce-senhas/" "$CONF"; then echo "bloco já existe em $CONF"; else
  cp "$CONF" "$CONF.bak-tce-senhas-$(date +%Y%m%d-%H%M%S)"
  node - "$CONF" "$SNIP" <<'EOF'
const fs = require('fs');
const [conf, snip] = process.argv.slice(2);
const s = fs.readFileSync(conf, 'utf8'), block = fs.readFileSync(snip, 'utf8');
const marker = '    # Block access to sensitive files';
if (!s.includes(marker)) { console.error('marcador não encontrado'); process.exit(1); }
fs.writeFileSync(conf, s.replace(marker, () => block + '\n' + marker));
console.log('bloco adicionado');
EOF
fi
nginx -t && systemctl reload nginx && echo "nginx recarregado"
curl -s -m 10 https://dev.gerenciahub.com.br/tce-senhas/api/health && echo
