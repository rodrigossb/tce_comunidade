#!/usr/bin/env bash
# Insere o bloco location /tce-senhas/ no nginx (com backup), testa e recarrega. Rodar com sudo.
set -euo pipefail
CONF=/etc/nginx/conf.d/gerenciahub.conf
SNIP="$(dirname "$0")/nginx-tce-senhas.conf"
if grep -q "location /tce-senhas/" "$CONF"; then echo "bloco já existe em $CONF"; else
  cp "$CONF" "$CONF.bak-tce-senhas-$(date +%Y%m%d-%H%M%S)"
  python3 - "$CONF" "$SNIP" <<'EOF'
import sys
conf, snip = sys.argv[1], sys.argv[2]
s = open(conf).read(); block = open(snip).read()
marker = "    # Block access to sensitive files"
assert marker in s, "marcador não encontrado"
open(conf, "w").write(s.replace(marker, block + "\n" + marker, 1))
print("bloco adicionado")
EOF
fi
nginx -t && systemctl reload nginx && echo "nginx recarregado"
curl -s -m 10 https://dev.gerenciahub.com.br/tce-senhas/api/health && echo
