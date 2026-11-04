#!/usr/bin/env node
// Grava a configuração de abertura do controle de senhas em TODAS as filas de cada dia de serviços: séries N (comuns) e
// P (prioritárias) com prefixo, número inicial e total possível, e a ordem de chamada. Não mexe em salas já configuradas,
// salvo com --force.
// Uso (no servidor, com o banco do app):
//   cd apps/senhas && node scripts/padrao-senhas.mjs [--n 100] [--p 20] [--ordem 1:1] [--n-de 1] [--p-de 1] [--prefixo-n N] [--prefixo-p P]
//        [--day 2026-11-07 --venue jn] [--force]            (ou, da raiz: npm run senhas:padrao -- --force)
// Senhas já impressas numa sequência única (1-79 comuns, 80-100 prioritárias): --n 79 --p 21 --p-de 80
import { TCE as T } from '@tce/core';
import * as db from '../lib/db.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const cfg = { n_total: Number(arg('n', 100)), p_total: Number(arg('p', 20)), pattern: arg('ordem', '1:1'), n_from: Number(arg('n-de', 1)), p_from: Number(arg('p-de', 1)), n_prefix: arg('prefixo-n', 'N'), p_prefix: arg('prefixo-p', 'P') };
const force = process.argv.includes('--force');
const only = arg('day', '') ? [{ date: arg('day'), venue: arg('venue', '') }] : T.serviceDays().map((d) => ({ date: d.date, venue: d.venue }));
let set = 0; let kept = 0;
for (const d of only) {
  if (!d.venue) { console.error('informe --venue junto com --day'); process.exit(1); }
  const st = db.state(d.date, d.venue);
  for (const g of T.ticketQueuesOf(d.venue)) for (const p of g.places) {
    const has = st.configs.some((x) => x.place_id === p.id && x.service_id === g.service.id);
    if (force || !has) { db.setQueueConfig(Object.assign({ day: d.date, venue: d.venue, service_id: g.service.id, place_id: p.id, device: 'padrao' }, cfg)); set++; } else kept++;
  }
  console.log(`${d.date} · ${d.venue}: ${T.ticketQueuesOf(d.venue).reduce((a, g) => a + g.places.length, 0)} salas`);
}
console.log(`✔ configurações gravadas: ${set} · mantidas (já configuradas): ${kept} · ${cfg.n_prefix} ${cfg.n_from}… (${cfg.n_total}) · ${cfg.p_prefix} ${cfg.p_from}… (${cfg.p_total}) · ordem ${cfg.pattern} · banco ${db.dbPath()}`);
db.close();
