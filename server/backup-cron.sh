#!/usr/bin/env bash
# Backup do controle de senhas (zip com banco + .env) e cópia para um destino externo.
# Agende no cron, ex.: 40 3 * * * /home/ec2-user/repos/tce_comunidade/server/backup-cron.sh
# Variáveis: BACKUP_DEST (padrão ~/backups/tce-senhas), BACKUP_KEEP (zips mantidos no repo, padrão 60).
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:/usr/local/bin:/usr/bin:/bin"
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="${BACKUP_DEST:-$HOME/backups/tce-senhas}"
mkdir -p "$DEST"
node "$DIR/backup.js" "${1:-}"
rsync -a "$DIR/backups/" "$DEST/"
# Mantém 90 dias no destino externo.
find "$DEST" -maxdepth 1 -type f -name 'tce-senhas-*.zip' -mtime +90 -delete
echo "backup ok em $DEST"
