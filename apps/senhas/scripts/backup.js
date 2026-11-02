// Backup do controle de senhas: cópia consistente do SQLite (VACUUM INTO, segura com WAL e app no ar)
// + .env, em um zip com data/hora em apps/senhas/backups/. Mantém os últimos BACKUP_KEEP (padrão 60).
// Uso: node apps/senhas/scripts/backup.js [rótulo]   → backups/tce-senhas-<rótulo->AAAAMMDD-HHMMSS.zip
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.DB_PATH || path.join(DIR, 'data', 'senhas.db');
const OUT = process.env.BACKUP_DIR || path.join(DIR, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 60);
const label = (process.argv[2] || '').replace(/[^\w-]/g, '');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const name = `tce-senhas-${label ? label + '-' : ''}${stamp}`;

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(OUT, '.tmp-'));
try {
  const dbCopy = path.join(tmp, 'senhas.db');
  if (fs.existsSync(DB)) {
    const db = new DatabaseSync(DB, { readonly: true });
    db.exec(`VACUUM INTO '${dbCopy.replace(/'/g, "''")}'`);
    db.close();
  } else fs.writeFileSync(path.join(tmp, 'SEM-BANCO.txt'), `Banco não encontrado em ${DB}\n`);
  const env = path.join(DIR, '.env'); if (fs.existsSync(env)) fs.copyFileSync(env, path.join(tmp, '.env'));
  let resumo = `Backup ${name}\nBanco: ${DB}\n`;
  if (fs.existsSync(dbCopy)) {
    const d = new DatabaseSync(dbCopy, { readonly: true });
    const n = d.prepare('SELECT (SELECT COUNT(*) FROM calls) calls, (SELECT COUNT(*) FROM issued_log) issued').get();
    const days = d.prepare('SELECT day, venue, COUNT(*) n FROM calls GROUP BY day, venue').all();
    resumo += `Chamadas: ${n.calls} · lançamentos da triagem: ${n.issued}\n` + days.map((x) => `  ${x.day} ${x.venue}: ${x.n} chamadas`).join('\n') + '\n';
    d.close();
  }
  fs.writeFileSync(path.join(tmp, 'LEIA-ME.txt'), resumo + `\nRestaurar: pare o processo (pm2 stop tce-senhas), copie senhas.db para apps/senhas/data/ e .env para apps/senhas/, e inicie de novo (pm2 start tce-senhas).\n`);
  const zip = path.join(OUT, `${name}.zip`);
  execFileSync('zip', ['-q', '-j', '-r', zip, tmp + '/.'], { stdio: 'inherit' });
  const olds = fs.readdirSync(OUT).filter((f) => /^tce-senhas-.*\.zip$/.test(f)).sort();
  for (const f of olds.slice(0, Math.max(0, olds.length - KEEP))) fs.unlinkSync(path.join(OUT, f));
  console.log(`✔ Backup gravado em ${zip} (${(fs.statSync(zip).size / 1024).toFixed(1)} KB)`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
