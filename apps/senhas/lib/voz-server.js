// Voz da TV no servidor: manifest dinâmico e geração de áudios de NOMES em tempo de execução. Os áudios da planta vêm
// prontos em public/voz (scripts/gerar-voz.mjs); quando a triagem renomeia ou cria uma sala, o nome novo não tem áudio e a TV
// teria de completar com a voz do navegador (outra voz no meio da chamada). Se PIPER, MODEL e FFMPEG estiverem no .env,
// o servidor gera s-<chave>.mp3 em data/voz/ (ao lado do banco; VOZ_DIR muda) na primeira vez que o nome aparece — ao
// gravar na triagem ou quando a TV pede o manifest — e o inclui em /api/voz/manifest.json; /api/voz/<arquivo>.mp3 serve
// tanto os prontos quanto os gerados. Sem piper, nada é gerado e a TV fala a chamada inteira com uma voz só.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { dbPath, extras } from './db.js';
import { nameKey, namePhrase, placePhrase } from './voz.js';
import { fixedQueues, mergeExtras } from './filas-extra.js';

const pubDir = () => process.env.VOZ_PUBLIC || path.join(process.cwd(), 'public', 'voz');
export const vozDir = () => process.env.VOZ_DIR || path.join(path.dirname(dbPath()), 'voz');
const cfg = () => ({ piper: process.env.PIPER || '', model: process.env.MODEL || '', ffmpeg: process.env.FFMPEG || 'ffmpeg' });
/** Há gerador de voz configurado neste servidor? (piper + modelo existentes) */
export const ttsAvailable = () => { const c = cfg(); try { return !!(c.piper && c.model && fs.existsSync(c.piper) && fs.existsSync(c.model)); } catch { return false; } };

let staticCache = null;
/** Manifest dos áudios prontos (public/voz/manifest.json), relido quando o arquivo muda. */
export function staticManifest() {
  const f = path.join(pubDir(), 'manifest.json');
  try { const st = fs.statSync(f); if (!staticCache || staticCache.mtime !== st.mtimeMs || staticCache.file !== f) staticCache = { file: f, mtime: st.mtimeMs, manifest: JSON.parse(fs.readFileSync(f, 'utf8')) }; return staticCache.manifest; } catch { return null; }
}
const namesFile = () => path.join(vozDir(), 'names.json');
/** Nomes gerados em tempo de execução: { 's-<chave>': frase }. */
export function dynamicNames() { try { return JSON.parse(fs.readFileSync(namesFile(), 'utf8')) || {}; } catch { return {}; } }
function saveDynamic(names) { fs.mkdirSync(vozDir(), { recursive: true }); fs.writeFileSync(namesFile(), JSON.stringify(names, null, 1)); }
/** Manifest para a TV: prontos + gerados (os gerados prevalecem: podem corrigir a frase de um nome da planta). */
export function fullManifest() {
  const m = staticManifest(); if (!m) return null;
  return Object.assign({}, m, { names: Object.assign({}, m.names || {}, dynamicNames()), tts: ttsAvailable() });
}
const FILE_RE = /^[a-z0-9-]+\.mp3$/;
/** Caminho no disco de um áudio (gerado primeiro, depois pronto) → { file, dynamic } ou null. */
export function clipPath(file) {
  if (!FILE_RE.test(String(file || ''))) return null;
  const dyn = path.join(vozDir(), file); if (fs.existsSync(dyn)) return { file: dyn, dynamic: true };
  const pub = path.join(pubDir(), file); if (fs.existsSync(pub)) return { file: pub, dynamic: false };
  return null;
}

const run = (cmd, args, input) => new Promise((res, rej) => {
  const c = spawn(cmd, args, { stdio: [input != null ? 'pipe' : 'ignore', 'ignore', 'pipe'] }); let err = '';
  c.stderr.on('data', (d) => { err += d; }); c.on('error', rej);
  c.on('close', (code) => (code === 0 ? res() : rej(new Error(`${path.basename(cmd)} saiu com ${code}: ${err.slice(-200)}`))));
  if (input != null) c.stdin.end(input);
});
/** Gera <file>.mp3 em data/voz com a mesma receita de scripts/gerar-voz.mjs (fala mais lenta, silêncio antes/depois, volume normalizado). */
async function synth(file, text, pad) {
  const c = cfg(); fs.mkdirSync(vozDir(), { recursive: true });
  const wav = path.join(os.tmpdir(), `voz-${file}-${process.pid}-${Date.now()}.wav`); const mp3 = path.join(vozDir(), `${file}.mp3`); const tmp = path.join(vozDir(), `${file}.tmp.mp3`);
  try {
    await run(c.piper, ['-m', c.model, '-f', wav, '--length-scale', '1.15', '--noise-scale', '0.5', '--noise-w', '0.6', '--sentence-silence', '0.2'], `${text}\n`);
    await run(c.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', `adelay=${pad.pre},apad=pad_dur=${pad.post},acompressor=threshold=-18dB:ratio=3:attack=5:release=80:makeup=4,loudnorm=I=-12:TP=-1:LRA=7`, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', '22050', tmp]);
    fs.renameSync(tmp, mp3);
  } finally { fs.rmSync(wav, { force: true }); fs.rmSync(tmp, { force: true }); }
}

// Fila de geração: no máximo 2 piper ao mesmo tempo (cada um carrega o modelo; mais que isso só disputa CPU).
const pending = new Map(); let running = 0; const waiting = [];
const slot = () => new Promise((res) => { if (running < 2) { running++; res(); } else waiting.push(res); });
const release = () => { running--; const next = waiting.shift(); if (next) { running++; next(); } };
async function generate(file, text, pad) { await slot(); try { await synth(file, text, pad); } finally { release(); } }
const phrasesFile = () => path.join(vozDir(), 'frases.json');
/** Arquivo de uma frase qualquer: f-<hash do texto>. */
export const phraseFile = (text) => `f-${crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 14)}`;
/** Garante o áudio de uma frase inteira (ex.: "Consulta médica, sala oito.") → caminho do mp3, ou null sem gerador/falha. */
export function ensurePhraseClip(text) {
  const t = String(text || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160); if (!t) return Promise.resolve(null);
  const file = phraseFile(t); const mp3 = path.join(vozDir(), `${file}.mp3`);
  if (fs.existsSync(mp3)) return Promise.resolve(mp3);
  if (!ttsAvailable()) return Promise.resolve(null);
  if (pending.has(file)) return pending.get(file);
  const p = generate(file, t, { pre: 400, post: 0.3 })
    .then(() => { try { const m = (() => { try { return JSON.parse(fs.readFileSync(phrasesFile(), 'utf8')) || {}; } catch { return {}; } })(); m[file] = t; fs.writeFileSync(phrasesFile(), JSON.stringify(m, null, 1)); } catch { /* só registro */ } console.log(`[voz] gerado ${file}.mp3 ("${t}")`); return mp3; })
    .catch((e) => { console.error(`[voz] falha ao gerar frase "${t}": ${e.message}`); return null; })
    .finally(() => pending.delete(file));
  pending.set(file, p); return p;
}
/** Áudio da frase de uma sala como a TV fala ("<nome>, sala N.") — ao gravar na triagem e ao carregar a TV. */
export const ensurePlaceClip = (place) => (place && place.name ? ensurePhraseClip(placePhrase(place)) : Promise.resolve(null));
/** Garante o áudio do nome de um atendimento. → Promise<boolean>: true = existe (pronto ou gerado agora); false = sem gerador ou falhou. */
export function ensureNameClip(name) {
  const key = nameKey(name); if (!key) return Promise.resolve(false);
  const file = `s-${key}`; const phrase = namePhrase(name);
  const dyn = dynamicNames(); if (dyn[file] === phrase && fs.existsSync(path.join(vozDir(), `${file}.mp3`))) return Promise.resolve(true);
  const st = staticManifest(); if (!dyn[file] && st && st.names && st.names[file] === phrase && fs.existsSync(path.join(pubDir(), `${file}.mp3`))) return Promise.resolve(true);
  if (!ttsAvailable()) return Promise.resolve(false);
  if (pending.has(file)) return pending.get(file);
  const p = generate(file, phrase, { pre: 400, post: 0.12 })
    .then(() => { const d = dynamicNames(); d[file] = phrase; saveDynamic(d); console.log(`[voz] gerado ${file}.mp3 ("${phrase}")`); return true; })
    .catch((e) => { console.error(`[voz] falha ao gerar ${file}: ${e.message}`); return false; })
    .finally(() => pending.delete(file));
  pending.set(file, p); return p;
}
/** Dispara (sem esperar) a geração da frase de cada sala do dia/local (nome + número, como a TV fala) e do nome avulso —
    chamado quando a TV pede o manifest, para a primeira chamada já encontrar o áudio pronto. */
export function ensureClipsFor(day, venue) {
  if (!ttsAvailable()) return 0;
  let n = 0;
  try { for (const g of mergeExtras(fixedQueues(venue, day), extras(day, venue))) for (const p of g.places) { ensurePlaceClip(p); ensureNameClip(p.name); n++; } } catch (e) { console.error('[voz] ensureClipsFor:', e.message); }
  return n;
}
