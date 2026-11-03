#!/usr/bin/env node
// Grava o padrão de abertura do controle de senhas: para cada sala/instituição que entrega senha, nos dias de serviços
// (04/11 Manga, 07/11 Joaquim Nabuco), a contagem de senhas entregues (padrão 100: todas já impressas) e a lista de
// prioritárias (padrão "80-100"). Não mexe em salas que já têm lançamento, salvo com --force.
// Uso (no servidor, com o banco do app):  cd apps/senhas && node scripts/padrao-senhas.mjs [--count 100] [--prio 80-100]
//      [--day 2026-11-04 --venue manga] [--force]      (ou, da raiz: npm run senhas:padrao -- --force)
import { TCE as T } from '@tce/core';
import * as db from '../lib/db.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const count = Number(arg('count', 100)); const prio = String(arg('prio', '80-100')); const force = process.argv.includes('--force');
const only = arg('day', '') ? [{ date: arg('day'), venue: arg('venue', '') }] : T.serviceDays().map((d) => ({ date: d.date, venue: d.venue }));
let setC = 0; let setP = 0; let kept = 0;
for (const d of only) {
  if (!d.venue) { console.error('informe --venue junto com --day'); process.exit(1); }
  const st = db.state(d.date, d.venue);
  for (const g of T.ticketQueuesOf(d.venue)) for (const p of g.places) {
    const hasC = st.issued.some((x) => x.place_id === p.id); const hasP = st.priorities.some((x) => x.place_id === p.id && x.service_id === g.service.id);
    if (force || !hasC) { db.issued({ day: d.date, venue: d.venue, service_id: g.service.id, place_id: p.id, count, device: 'padrao' }); setC++; } else kept++;
    if (force || !hasP) { db.priorities({ day: d.date, venue: d.venue, service_id: g.service.id, place_id: p.id, spec: prio, device: 'padrao' }); setP++; } else kept++;
  }
  console.log(`${d.date} · ${d.venue}: ${T.ticketQueuesOf(d.venue).reduce((a, g) => a + g.places.length, 0)} salas`);
}
console.log(`✔ contagens gravadas: ${setC} · listas de prioridade gravadas: ${setP} · mantidos (já lançados): ${kept} · padrão ${count} senhas, prioritárias ${prio} · banco ${db.dbPath()}`);
db.close();
