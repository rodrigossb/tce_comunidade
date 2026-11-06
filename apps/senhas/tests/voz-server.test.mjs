// Voz no servidor: manifest dinâmico (prontos + gerados) e localização dos áudios, sem piper (nada é gerado).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-voz-'));
process.env.DB_PATH = path.join(dir, 'senhas.db'); process.env.VOZ_PUBLIC = path.join(dir, 'pub'); process.env.VOZ_DIR = path.join(dir, 'dyn');
delete process.env.PIPER; delete process.env.MODEL;
fs.mkdirSync(process.env.VOZ_PUBLIC); fs.mkdirSync(process.env.VOZ_DIR);
fs.writeFileSync(path.join(process.env.VOZ_PUBLIC, 'manifest.json'), JSON.stringify({ numbers: 300, places: ['jn-r09'], phrases: { 'p-jn-r09': 'Pediatria, sala nove.' }, names: { 's-pediatria': 'Pediatria.' }, rooms: { sala: 40 } }));
fs.writeFileSync(path.join(process.env.VOZ_PUBLIC, 's-pediatria.mp3'), 'x'); fs.writeFileSync(path.join(process.env.VOZ_PUBLIC, 'n-1.mp3'), 'x');
const V = await import('../lib/voz-server.js');
after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

test('fullManifest junta os nomes gerados aos prontos (gerados prevalecem) e informa se há gerador', () => {
  assert.equal(V.ttsAvailable(), false);
  const m0 = V.fullManifest(); assert.deepEqual(m0.names, { 's-pediatria': 'Pediatria.' }); assert.equal(m0.tts, false); assert.equal(m0.numbers, 300);
  fs.writeFileSync(path.join(process.env.VOZ_DIR, 'names.json'), JSON.stringify({ 's-nutricao': 'Nutrição.', 's-pediatria': 'Pediatria, criança.' }));
  const m1 = V.fullManifest(); assert.deepEqual(m1.names, { 's-pediatria': 'Pediatria, criança.', 's-nutricao': 'Nutrição.' });
});

test('clipPath: gerado antes do pronto, só nomes de arquivo simples .mp3', () => {
  assert.equal(V.clipPath('n-1.mp3').dynamic, false); assert.equal(V.clipPath('nada.mp3'), null);
  assert.equal(V.clipPath('../manifest.json'), null); assert.equal(V.clipPath('s-pediatria.mp3; rm'), null); assert.equal(V.clipPath(''), null);
  fs.writeFileSync(path.join(process.env.VOZ_DIR, 's-pediatria.mp3'), 'y'); assert.equal(V.clipPath('s-pediatria.mp3').dynamic, true);
});

test('ensureNameClip: existente → true; sem piper → false (nada gerado); nome vazio → false', async () => {
  fs.writeFileSync(path.join(process.env.VOZ_DIR, 'names.json'), JSON.stringify({ 's-nutricao': 'Nutrição.' })); fs.writeFileSync(path.join(process.env.VOZ_DIR, 's-nutricao.mp3'), 'y');
  assert.equal(await V.ensureNameClip('Nutrição'), true, 'gerado antes');
  assert.equal(await V.ensureNameClip('Pediatria'), true, 'pronto na planta com a mesma frase');
  assert.equal(await V.ensureNameClip('Cardiologia'), false); assert.equal(await V.ensureNameClip(''), false);
  assert.ok(!fs.existsSync(path.join(process.env.VOZ_DIR, 's-cardiologia.mp3')));
  assert.equal(V.ensureClipsFor('2026-11-06', 'jn'), 0, 'sem gerador não dispara nada');
});
