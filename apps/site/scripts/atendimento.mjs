#!/usr/bin/env node
// Gera apps/site/public/atendimento.json (retrato público do atendimento por dia, igual ao GET /tce-senhas/api/atendimento)
// a partir do banco do controle de senhas. Roda onde está o banco (ex.: o servidor local do TCE):
//   DB_PATH=apps/senhas/data/senhas.db node apps/site/scripts/atendimento.mjs
// Publicar depois: git add apps/site/public/atendimento.json && git commit && git push (o workflow republica o site).
// O site prefere a API ao vivo; este arquivo é a reserva para quem não alcança o servidor das senhas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(root, 'apps', 'senhas', 'data', 'senhas.db');
if (!fs.existsSync(process.env.DB_PATH)) { console.error(`Banco não encontrado: ${process.env.DB_PATH} (defina DB_PATH).`); process.exit(1); }
const db = await import(path.join(root, 'apps', 'senhas', 'lib', 'db.js'));
const data = db.atendimentoPublico(null); db.close();
const out = path.join(here, '..', 'public', 'atendimento.json');
fs.writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
console.log(`${data.days.length} dia(s) com atendimento → ${path.relative(process.cwd(), out)}`);
for (const d of data.days) console.log(`  ${d.date} ${d.venue} · ${d.queues.length} fila(s) · ${d.source}`);
