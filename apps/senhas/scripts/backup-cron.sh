#!/usr/bin/env bash
# Backup do controle de senhas (zip com banco + .env) e cópia para um destino externo.
# Agende no cron, ex.: 40 3 * * * /home/ec2-user/repos/tce_comunidade/apps/senhas/scripts/backup-cron.sh
# Variáveis: BACKUP_DEST (padrão ~/backups/tce-senhas), BACKUP_KEEP (zips mantidos no app, padrão 60).
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:/usr/local/bin:/usr/bin:/bin"
APP="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BACKUP_DEST:-$HOME/backups/tce-senhas}"
mkdir -p "$DEST"
node "$APP/scripts/backup.js" "${1:-}"
rsync -a "$APP/backups/" "$DEST/"
# Mantém 90 dias no destino externo.
find "$DEST" -maxdepth 1 -type f -name 'tce-senhas-*.zip' -mtime +90 -delete
echo "backup ok em $DEST"
