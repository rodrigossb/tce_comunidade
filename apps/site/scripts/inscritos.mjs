#!/usr/bin/env node
// Gera apps/site/public/inscritos.json a partir do painel da ESCON (HTML salvo, texto copiado ou JSON).
// Uso: node apps/site/scripts/inscritos.mjs <arquivo>   ou   cat painel.txt | node apps/site/scripts/inscritos.mjs
// Publicar depois: git add apps/site/public/inscritos.json && git commit && git push (o workflow republica o site).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAny, panelCards, fromPanelCards, htmlToText } from '../lib/inscritos.js';
import { TCE as T } from '@tce/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'inscritos.json');
const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
const cards = /po-cartao|pessoas? inscritas?/i.test(input) ? panelCards(input) : [];
const panel = cards.length ? fromPanelCards(cards) : null;
const byId = panel ? panel.byKey : parseAny(input);
const ids = Object.keys(byId);
const plain = /<\w+[\s>]/.test(input) ? htmlToText(input) : input;
const MES = { janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
const pi = plain.match(/N[úu]meros de (\d{1,2}) de (\w+),? [àa]s (\d{1,2}:\d{2})/i);
const painelInfo = pi ? `${pi[1].padStart(2, '0')}/${MES[pi[2].toLowerCase()] || pi[2]} ${pi[3]}` : '';
if (!ids.length) { console.error('Nenhum curso reconhecido na entrada.'); process.exit(1); }
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { byId: {} };
const merged = Object.assign({}, prev.byId || {}, byId); // cursos ausentes na entrada mantêm o último valor
fs.writeFileSync(out, JSON.stringify({ updatedAt: Date.now(), source: 'painel', painelInfo, byId: merged }, null, 2) + '\n');
console.log(`${ids.length} curso(s) atualizados, ${Object.keys(merged).length} no arquivo → ${path.relative(process.cwd(), out)}`);
if (panel) {
  for (const x of panel.matches.sort((a, b) => a.group.course.id - b.group.course.id || a.group.venue.localeCompare(b.group.venue))) console.log(`  ${x.group.course.id} ${T.title(x.group.course)} · ${T.D.venues[x.group.venue].short}: ${x.card.inscritos} inscritos / ${x.group.course.seats} vagas  ← "${x.card.title}"`);
  if (panel.unmatched.length) { console.log('Cartões do painel SEM correspondência (ajustar o leitor):'); for (const c of panel.unmatched) console.log(`  - ${c.title} | ${c.date} | ${c.inscritos}`); }
} else {
  for (const id of ids.sort((a, b) => a - b)) { const c = T.courseById(id); const e = byId[id]; if (c) console.log(`  ${id} ${T.title(c)}: vagas ${e.vagas ?? c.seats} · inscritos ${e.inscritos ?? '?'} · restantes ${e.restantes ?? '?'}`); }
}
const covered = new Set(Object.keys(merged).map((k) => k.split('@')[0]));
const missing = T.D.courses.filter((c) => !covered.has(String(c.id))).map((c) => c.id);
if (missing.length) console.log(`Cursos sem dado: ${missing.join(', ')}`);
