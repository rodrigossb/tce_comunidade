#!/usr/bin/env node
// Coletor para rodar DENTRO da rede do TCE (servidor local ou um PC): baixa o painel da ESCON e envia para a API.
// Variáveis (ou apps/senhas/.env): PANEL_URL (com ?k=…), INSCRITOS_TOKEN, API_URL (padrão produção), INTERVAL_MIN (padrão 30).
// Uso: node apps/senhas/scripts/inscritos-coletor.mjs            → repete a cada INTERVAL_MIN
//      node apps/senhas/scripts/inscritos-coletor.mjs --once     → uma vez e sai
//      pm2 start apps/senhas/scripts/inscritos-coletor.mjs --name inscritos-coletor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '..', '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const PANEL = process.env.PANEL_URL || ''; const TOKEN = process.env.INSCRITOS_TOKEN || '';
const API = (process.env.API_URL || 'https://dev.gerenciahub.com.br/tce-senhas/api/inscritos').replace(/\/$/, '');
const EVERY = Math.max(5, Number(process.env.INTERVAL_MIN || 30)) * 60000;
if (!PANEL || !TOKEN) { console.error('Defina PANEL_URL e INSCRITOS_TOKEN (no ambiente ou em apps/senhas/.env).'); process.exit(1); }
const stamp = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Belem' });
async function run() {
  try {
    const r = await fetch(PANEL, { headers: { 'User-Agent': 'Mozilla/5.0 (tce-na-comunidade/coletor)' }, signal: AbortSignal.timeout(40000) });
    if (!r.ok) throw new Error(`painel HTTP ${r.status}`);
    const html = await r.text();
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body: JSON.stringify({ html, source: 'coletor-node' }), signal: AbortSignal.timeout(30000) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`API ${res.status}: ${out.error || ''}`);
    console.log(`${stamp()} ✔ ${out.cursos} turmas enviadas (painel ${out.painelInfo || '?'})${out.semCorrespondencia?.length ? ` · sem correspondência: ${out.semCorrespondencia.join(' | ')}` : ''}`);
  } catch (e) { console.error(`${stamp()} ✖ ${e.message}`); }
}
await run();
if (!process.argv.includes('--once')) setInterval(run, EVERY);
