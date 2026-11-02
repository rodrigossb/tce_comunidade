#!/usr/bin/env bash
# Insere (ou substitui) o bloco location /tce-senhas no nginx, com backup, testa e recarrega. Rodar com sudo.
# Remove o bloco antigo do backend Node puro (location = /tce-senhas + location /tce-senhas/ com proxy_pass com barra),
# que em conjunto com o 308 do Next formaria um loop de redirecionamentos.
set -euo pipefail
CONF=${NGINX_CONF:-/etc/nginx/conf.d/gerenciahub.conf}
SNIP="$(cd "$(dirname "$0")" && pwd)/nginx-tce-senhas.conf"
# Sob sudo o PATH não tem o Node do nvm: procura o binário.
NODE=${NODE:-$(command -v node || ls -d /home/*/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)}
[ -x "$NODE" ] || { echo "node não encontrado; rode: sudo env PATH=\$PATH $0"; exit 1; }
cp "$CONF" "$CONF.bak-tce-senhas-$(date +%Y%m%d-%H%M%S)"
"$NODE" - "$CONF" "$SNIP" <<'EOF'
const fs = require('fs');
const [conf, snip] = process.argv.slice(2);
let s = fs.readFileSync(conf, 'utf8'); const block = fs.readFileSync(snip, 'utf8');
// Remove qualquer versão anterior (comentários da linha anterior + location = /tce-senhas + location /tce-senhas[/] { ... }).
const before = s;
s = s.replace(/^[ \t]*#[^\n]*controle de senhas[^\n]*\n/gm, '');
s = s.replace(/^[ \t]*location = \/tce-senhas \{[^\n]*\}\n/gm, '');
s = s.replace(/^[ \t]*#[^\n]*(tce-senhas|Block access to sensitive files" acima|proxy_pass: o Next)[^\n]*\n/gm, (m) => (m.includes('Block access to sensitive files') && !m.includes('Cole este bloco') ? m : ''));
s = s.replace(/^[ \t]*location \/tce-senhas\/? \{\n(?:[^\n]*\n)*?[ \t]*\}\n/gm, '');
const marker = '    # Block access to sensitive files';
if (!s.includes(marker)) { console.error('marcador não encontrado'); process.exit(1); }
s = s.replace(marker, () => block + '\n' + marker);
fs.writeFileSync(conf, s);
console.log(before === s ? 'sem mudanças' : 'bloco /tce-senhas gravado');
EOF
nginx -t && systemctl reload nginx && echo "nginx recarregado"
curl -s -m 10 -o /dev/null -w "health: HTTP %{http_code}\n" https://dev.gerenciahub.com.br/tce-senhas/api/health
curl -s -m 10 -o /dev/null -w "tela de PIN: HTTP %{http_code} (redirecionamentos: %{num_redirects})\n" -L --max-redirs 3 https://dev.gerenciahub.com.br/tce-senhas/
