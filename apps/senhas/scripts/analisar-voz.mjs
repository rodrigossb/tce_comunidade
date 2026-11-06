#!/usr/bin/env node
// Analisador da voz da TV — roda no servidor onde está o banco de produção (ex.: o servidor local do TCE). Varre os dias
// do evento e os locais, lê as filas como a TV as vê (planta + edições/criações da triagem) e mostra, sala por sala, que
// áudio a chamada usaria: pronto da planta (p-), peças gravadas (s- nome + w- número), frase gerada no servidor (f-, já
// existente ou ainda por gerar) ou NADA (a TV cairia na síntese do navegador / só a senha). Com --gerar, gera por aqui
// mesmo, com piper, tudo o que falta (frases das salas e nomes), em data/voz ao lado do banco — a TV passa a achar.
//
// Uso (na raiz do repositório ou em apps/senhas):
//   node apps/senhas/scripts/analisar-voz.mjs                 # hoje (dia de senhas) em todos os locais
//   node apps/senhas/scripts/analisar-voz.mjs --todos          # todos os dias do evento
//   node apps/senhas/scripts/analisar-voz.mjs --dia 2026-11-06 --local jn
//   node apps/senhas/scripts/analisar-voz.mjs --gerar          # gera o que falta (precisa de PIPER/MODEL/FFMPEG)
//   node apps/senhas/scripts/analisar-voz.mjs --json           # saída em JSON (para outros scripts)
// Variáveis (lidas do ambiente ou de apps/senhas/.env): DB_PATH (padrão apps/senhas/data/senhas.db), VOZ_DIR (padrão
// data/voz ao lado do banco), PIPER, MODEL, FFMPEG. Sem piper: só analisa e explica como instalar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); const app = path.join(here, '..');
// .env do app (sem sobrescrever o ambiente) — só as chaves que interessam aqui
try { for (const line of fs.readFileSync(path.join(app, '.env'), 'utf8').split('\n')) { const m = line.match(/^\s*(DB_PATH|VOZ_DIR|PIPER|MODEL|FFMPEG)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* sem .env */ }
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(app, 'data', 'senhas.db');
if (!process.env.VOZ_PUBLIC) process.env.VOZ_PUBLIC = path.join(app, 'public', 'voz');

const { TCE: T } = await import('@tce/core');
const db = await import('../lib/db.js');
const { fixedQueues, mergeExtras } = await import('../lib/filas-extra.js');
const { announcementFor, placePhrase, namePhrase, nameKey } = await import('../lib/voz.js');
const V = await import('../lib/voz-server.js');

const args = process.argv.slice(2); const flag = (f) => args.includes(f); const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const gerar = flag('--gerar'); const json = flag('--json'); const todos = flag('--todos');
const D = T.D; const venues = opt('--local') ? [opt('--local')] : Object.keys(D.maps || {});
const days = opt('--dia') ? [opt('--dia')] : todos ? T.eventDays() : null;
if (!fs.existsSync(process.env.DB_PATH)) { console.error(`Banco não encontrado: ${process.env.DB_PATH} (defina DB_PATH)`); process.exit(2); }

const manifest = V.fullManifest();
if (!manifest) { console.error(`Sem áudios prontos em ${process.env.VOZ_PUBLIC} (rode scripts/gerar-voz.mjs ou faça deploy com public/voz).`); process.exit(2); }
const tts = V.ttsAvailable(); manifest.tts = tts; // como a TV veria: com gerador, o que falta vira frase gerada
const exists = (spec) => { if (spec.startsWith('frase.mp3?t=')) { const t = decodeURIComponent(spec.slice(12)); return fs.existsSync(path.join(V.vozDir(), `${V.phraseFile(t)}.mp3`)); } return !!V.clipPath(spec); };

/** Analisa uma sala: como a TV anunciaria a senha 1 dela. */
function analisar(place) {
  const a = announcementFor({ ticket: 1, place }, manifest);
  const parts = (a.files || []).filter((f) => !f.startsWith('n-')).map((f) => ({ spec: f, ok: exists(f), kind: f.startsWith('p-') ? 'pronto' : f.startsWith('s-') || f.startsWith('w-') ? 'peça' : f.startsWith('frase') ? 'frase' : 'aviso' }));
  const faltam = parts.filter((p) => !p.ok);
  const status = !a.complete ? 'SEM AUDIO' : faltam.length ? (tts ? 'GERAR' : 'FALTA') : 'OK';
  return { status, phrase: placePhrase(place), parts, note: !a.complete ? (tts ? 'frase será gerada' : 'sem áudio da sala: a TV usa a síntese do navegador (ou só a senha)') : '' };
}

const report = []; let totals = { ok: 0, gerar: 0, sem: 0 }; const toGenerate = new Map();
for (const venue of venues) {
  const dias = days || [(T.ticketDay(T.now().date, venue) || T.serviceDays()[0]).date];
  for (const day of dias) {
    let st; try { st = db.state(day, venue); } catch (e) { report.push({ day, venue, error: e.message }); continue; }
    const rooms = [];
    for (const g of mergeExtras(fixedQueues(venue, day), st.extras || [])) for (const p of g.places) {
      const r = analisar(p); const off = (st.disabled || []).includes(p.id); const mode = (st.configs || []).find((c) => c.place_id === p.id)?.mode === 'contagem' ? 'contagem' : 'chamada';
      rooms.push({ id: p.id, name: p.name, kind: p.kind, num: p.num, service: g.service.short, extra: !!p.extra, disabled: off, mode, ...r });
      if (off || mode === 'contagem') continue; // não chama na TV: não conta nos totais, mas aparece
      if (r.status === 'OK') totals.ok++; else if (r.status === 'SEM AUDIO') totals.sem++; else totals.gerar++;
      if (r.status !== 'OK') { toGenerate.set(`f|${r.phrase}`, { phrase: r.phrase }); if (nameKey(p.name)) toGenerate.set(`n|${namePhrase(p.name)}`, { name: p.name, nameOnly: true }); }
    }
    report.push({ day, venue, rooms });
  }
}

if (!json) {
  console.log(`Voz da TV · áudios prontos: ${manifest.numbers} senhas, ${(manifest.places || []).length} salas da planta, ${Object.keys(manifest.names || {}).length} nomes · gerados em ${V.vozDir()} · gerador piper: ${tts ? 'DISPONÍVEL' : 'não configurado'}`);
  for (const r of report) {
    const vn = D.venues[r.venue] ? D.venues[r.venue].short : r.venue;
    if (r.error) { console.log(`\n== ${T.fmtDate(r.day, 'wd')} · ${vn}: erro ${r.error}`); continue; }
    console.log(`\n== ${T.fmtDate(r.day, 'wdlong')} · ${vn} · ${r.rooms.length} filas`);
    for (const x of r.rooms) {
      const tag = x.disabled ? 'desativada' : x.mode === 'contagem' ? 'só contagem' : x.status;
      const how = x.parts.map((p) => `${p.kind}${p.ok ? '' : '✗'}:${p.spec.startsWith('frase') ? '"' + decodeURIComponent(p.spec.slice(12)) + '"' : p.spec.replace('.mp3', '')}`).join(' + ') || '(só a senha)';
      console.log(`  ${tag.padEnd(11)} ${(x.kind === 'tenda' ? 'tenda ' : 'sala ')}${String(x.num || '—').padEnd(3)} ${x.name.padEnd(32).slice(0, 32)} ${x.service.padEnd(16).slice(0, 16)} → ${how}${x.note ? `  [${x.note}]` : ''}`);
    }
  }
  console.log(`\nSalas que chamam na TV: ${totals.ok} com áudio completo · ${totals.gerar} ${tts ? 'a gerar' : 'faltando (sem gerador)'} · ${totals.sem} sem áudio.`);
}

if (toGenerate.size && !tts) {
  console.log(`\nPara gerar aqui mesmo: instale o piper e configure o .env de apps/senhas:\n  python3 -m venv ~/tools/piper && ~/tools/piper/bin/pip install piper-tts\n  (modelo pt_BR-faber-medium .onnx + .onnx.json em ~/tools/piper/voices/, de https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/faber/medium)\n  PIPER=~/tools/piper/bin/piper  MODEL=~/tools/piper/voices/pt_BR-faber-medium.onnx  FFMPEG=ffmpeg\nDepois: node apps/senhas/scripts/analisar-voz.mjs --gerar`);
}
let generated = 0;
if (gerar && tts && toGenerate.size) {
  if (!json) console.log(`\nGerando ${toGenerate.size} áudios em ${V.vozDir()}…`);
  const t0 = Date.now();
  await Promise.all([...toGenerate.values()].map(async (p) => { const r = p.nameOnly ? await V.ensureNameClip(p.name) : await V.ensurePhraseClip(p.phrase); if (r) generated++; }));
  if (!json) console.log(`✔ ${generated} prontos em ${Math.round((Date.now() - t0) / 1000)} s. A TV passa a usá-los ao reler o manifest (até 5 min) ou ao recarregar a página.`);
} else if (toGenerate.size && tts && !gerar && !json) console.log(`\nRode com --gerar para gerar ${toGenerate.size} áudios agora.`);
if (json) console.log(JSON.stringify({ tts, vozDir: V.vozDir(), totals, generated, report }, null, 1));
db.close?.();
