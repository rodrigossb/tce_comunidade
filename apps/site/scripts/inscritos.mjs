#!/usr/bin/env node
// Gera apps/site/public/inscritos.json a partir do painel da ESCON (HTML salvo, texto copiado ou JSON).
// Uso: node apps/site/scripts/inscritos.mjs <arquivo>   ou   cat painel.txt | node apps/site/scripts/inscritos.mjs
// Publicar depois: git add apps/site/public/inscritos.json && git commit && git push (o workflow republica o site).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAny } from '../lib/inscritos.js';
import { TCE as T } from '@tce/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'inscritos.json');
const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
const byId = parseAny(input);
const ids = Object.keys(byId);
if (!ids.length) { console.error('Nenhum curso reconhecido na entrada.'); process.exit(1); }
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { byId: {} };
const merged = Object.assign({}, prev.byId || {}, byId); // cursos ausentes na entrada mantêm o último valor
fs.writeFileSync(out, JSON.stringify({ updatedAt: Date.now(), source: 'painel', byId: merged }, null, 2) + '\n');
console.log(`${ids.length} curso(s) atualizados, ${Object.keys(merged).length} no arquivo → ${path.relative(process.cwd(), out)}`);
for (const id of ids.sort((a, b) => a - b)) { const c = T.courseById(id); const e = byId[id]; console.log(`  ${id} ${T.title(c)}: vagas ${e.vagas ?? c.seats} · inscritos ${e.inscritos ?? '?'} · restantes ${e.restantes ?? (e.inscritos != null ? (e.vagas ?? c.seats) - e.inscritos : '?')}`); }
const missing = T.D.courses.filter((c) => !merged[c.id]).map((c) => c.id);
if (missing.length) console.log(`Sem dado: ${missing.join(', ')}`);
