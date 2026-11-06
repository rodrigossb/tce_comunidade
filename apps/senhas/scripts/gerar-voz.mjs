#!/usr/bin/env node
// Gera os áudios prontos da TV (public/voz): "Senha N" (1..CLIP_MAX), uma frase por sala que entrega senha
// ("Ginecologista, sala quatro.") e avisos. A TV toca esses arquivos em vez de depender da síntese de voz do
// navegador (o Chrome de TV Android não tem speechSynthesis). Ferramentas externas, fora do repositório:
//   - piper (TTS neural offline): pip install piper-tts; modelo pt_BR-faber-medium (.onnx + .onnx.json) de
//     https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/faber/medium
//   - ffmpeg com libmp3lame (MP3 mono 40 kb/s: toca em qualquer navegador)
// Além da frase inteira de cada sala da planta, gera as PEÇAS para montar a sala atual quando ela foi renomeada, mudou de
// número ou foi criada na triagem: o nome do atendimento (s-<chave>.mp3, "Consulta médica.") e o número (w-sala-8.mp3,
// "Sala oito."). Os nomes vêm da planta e, com DB_PATH, também das edições/filas criadas na triagem (fila_info, filas_extra).
// Uso: PIPER=/caminho/piper MODEL=/caminho/pt_BR-faber-medium.onnx [DB_PATH=apps/senhas/data/senhas.db] node apps/senhas/scripts/gerar-voz.mjs [--force]
//      (sem --force, só gera o que ainda não existe ou cuja frase mudou desde o manifest anterior). Saída: apps/senhas/public/voz/*.mp3 + manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TCE as T } from '@tce/core';
import { CLIP_MAX, placePhrase, ticketPhrase, namePhrase, nameKey, roomPhrase, ROOM_KINDS } from '../lib/voz.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public', 'voz');
const PIPER = process.env.PIPER || 'piper'; const MODEL = process.env.MODEL || ''; const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const force = process.argv.includes('--force');
// Frases já gravadas (manifest anterior): um arquivo é regravado quando a frase mudou (ex.: sala renomeada em data.js).
let prev = {}; try { const m = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); prev = Object.assign({}, m.phrases || {}, m.names || {}); } catch { /* primeira geração */ }
if (!MODEL) { console.error('Defina MODEL=/caminho/pt_BR-faber-medium.onnx (e PIPER=, FFMPEG= se não estiverem no PATH).'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// ---- frases ----
const items = [];
for (let n = 1; n <= CLIP_MAX; n++) items.push({ file: `n-${n}`, text: ticketPhrase(n) });
const places = new Map();
for (const v of Object.keys(T.D.venues)) for (const g of T.ticketQueuesOf(v)) for (const p of g.places) if (!places.has(p.id)) places.set(p.id, p);
for (const p of places.values()) items.push({ file: `p-${p.id}`, text: placePhrase(p) });
// peças: nomes (planta + triagem) e números por tipo de ambiente — pausas curtas entre as peças (pré/pós em ms)
const names = new Map(); const addName = (n) => { const k = nameKey(n); if (k && !names.has(k)) names.set(k, namePhrase(n)); };
for (const p of places.values()) addName(p.name);
if (process.env.DB_PATH) {
  const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
  for (const r of db.prepare('SELECT DISTINCT name FROM fila_info UNION SELECT DISTINCT name FROM filas_extra WHERE deleted=0').all()) addName(r.name);
  db.close(); console.log(`${names.size} nomes (planta + triagem em ${process.env.DB_PATH})`);
}
for (const [k, text] of names) items.push({ file: `s-${k}`, text, pre: 400, post: 0.12 });
for (const [kind, max] of Object.entries(ROOM_KINDS)) for (let n = 1; n <= max; n++) items.push({ file: `w-${kind}-${n}`, text: roomPhrase(kind, n), pre: 120, post: 0.3 });
items.push({ file: 'x-som', text: 'Som ativado. As senhas serão anunciadas.' });
items.push({ file: 'x-novamente', text: 'Atenção, chamando novamente.' });
items.push({ file: 'x-prioridade', text: 'Atenção, senha prioritária.' });

const run = (cmd, args, input) => new Promise((res, rej) => { const c = spawn(cmd, args, { stdio: [input != null ? 'pipe' : 'ignore', 'ignore', 'pipe'] }); let err = ''; c.stderr.on('data', (d) => { err += d; }); c.on('error', rej); c.on('close', (code) => (code === 0 ? res() : rej(new Error(`${cmd} saiu com ${code}: ${err.slice(-300)}`)))); if (input != null) { c.stdin.end(input); } });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-'));
let done = 0; let skipped = 0; const t0 = Date.now();
async function one(it) {
  const mp3 = path.join(OUT, `${it.file}.mp3`);
  if (!force && fs.existsSync(mp3) && (!prev[it.file] || prev[it.file] === it.text)) { skipped++; return; }
  const wav = path.join(tmp, `${it.file}.wav`);
  // Fala um pouco mais lenta e com menos "ruído" de síntese (mais clara em alto-falante de TV).
  await run(PIPER, ['-m', MODEL, '-f', wav, '--length-scale', '1.15', '--noise-scale', '0.5', '--noise-w', '0.6', '--sentence-silence', '0.2'], it.text + '\n');
  // 0,4 s de silêncio antes e 0,3 s depois (TVs cortam o começo de um áudio recém-iniciado), volume normalizado
  // (compressor leve + loudnorm -12 LUFS, pico -1 dB) e MP3 de 64 kb/s para não "embolar" a voz.
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', `adelay=${it.pre == null ? 400 : it.pre},apad=pad_dur=${it.post == null ? 0.3 : it.post},acompressor=threshold=-18dB:ratio=3:attack=5:release=80:makeup=4,loudnorm=I=-12:TP=-1:LRA=7`, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', '22050', mp3]);
  fs.rmSync(wav, { force: true }); done++;
  if (done % 25 === 0) console.log(`${done} gerados… (${Math.round((Date.now() - t0) / 1000)} s)`);
}
// 2 em paralelo (cada piper carrega o modelo; mais que isso só disputa CPU)
const queue = items.slice(); const workers = Array.from({ length: 2 }, async () => { for (let it = queue.shift(); it; it = queue.shift()) await one(it); });
await Promise.all(workers);
fs.rmSync(tmp, { recursive: true, force: true });
const manifest = { numbers: CLIP_MAX, places: [...places.keys()], extras: ['x-som', 'x-novamente', 'x-prioridade'], voice: path.basename(MODEL, '.onnx'), generatedAt: new Date().toISOString(), phrases: Object.fromEntries(items.filter((i) => i.file.startsWith('p-') || i.file.startsWith('x-')).map((i) => [i.file, i.text])),
  names: Object.fromEntries(items.filter((i) => i.file.startsWith('s-')).map((i) => [i.file, i.text])), rooms: ROOM_KINDS };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
const size = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`✔ ${done} gerados, ${skipped} já existiam · ${items.length} arquivos · ${(size / 1048576).toFixed(1)} MB em ${path.relative(process.cwd(), OUT)}`);
