// Voz da TV: escolha da voz pt-BR e diagnóstico do estado (bloqueada até o gesto, sem voz, pronta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, voiceState, voiceLabel, numeroExtenso, cleanSpoken, placePhrase, ticketPhrase, clipsFor, announcementFor, placeClipOk, CLIP_MAX } from '../lib/voz.js';

const V = (name, lang, localService = true) => ({ name, lang, localService });

test('pickVoice prefere Google/Microsoft pt-BR, depois qualquer pt-BR, depois pt; nada sem português', () => {
  assert.equal(pickVoice([V('Microsoft Maria', 'pt-BR'), V('Google português do Brasil', 'pt-BR', false), V('Luciana', 'pt_BR')]).name, 'Google português do Brasil');
  assert.equal(pickVoice([V('Joana', 'pt-PT'), V('Luciana', 'pt_BR')]).name, 'Luciana');
  assert.equal(pickVoice([V('Joana', 'pt-PT'), V('Samantha', 'en-US')]).name, 'Joana');
  assert.equal(pickVoice([V('Samantha', 'en-US')]), null);
  assert.equal(pickVoice([]), null); assert.equal(pickVoice(undefined), null);
});

test('voiceState: off sem ?voz=1; locked até o gesto; novoice/fallback/ready conforme as vozes; erro prevalece', () => {
  assert.equal(voiceState({ wanted: false, supported: true, voices: [], unlocked: false }), 'off');
  assert.equal(voiceState({ wanted: true, supported: false, unlocked: true }), 'unsupported');
  assert.equal(voiceState({ wanted: true, supported: false, unlocked: true, clips: true }), 'clips', 'áudios prontos valem mesmo sem speechSynthesis');
  assert.equal(voiceState({ wanted: true, supported: false, unlocked: false, clips: true }), 'locked', 'mas só depois do gesto');
  assert.equal(voiceState({ wanted: true, supported: true, voices: null, unlocked: false }), 'locked');
  assert.equal(voiceState({ wanted: true, supported: true, voices: [], unlocked: true }), 'novoice');
  assert.equal(voiceState({ wanted: true, supported: true, voices: [V('Samantha', 'en-US')], unlocked: true }), 'fallback');
  assert.equal(voiceState({ wanted: true, supported: true, voices: [V('Luciana', 'pt-BR')], unlocked: true }), 'ready');
  assert.equal(voiceState({ wanted: true, supported: true, voices: [V('Luciana', 'pt-BR')], unlocked: true, lastError: 'not-allowed' }), 'error:not-allowed');
});

test('voiceLabel explica o que fazer', () => {
  assert.match(voiceLabel('locked'), /toque na tela/);
  assert.match(voiceLabel('error:not-allowed'), /bloqueada/);
  assert.match(voiceLabel('novoice'), /pacote de voz/);
  assert.equal(voiceLabel('ready', V('Luciana', 'pt-BR')), 'voz ativa · Luciana');
  assert.equal(voiceLabel('off'), '');
});

test('números por extenso e frases dos áudios prontos', () => {
  assert.equal(numeroExtenso(1), 'um'); assert.equal(numeroExtenso(16), 'dezesseis'); assert.equal(numeroExtenso(21), 'vinte e um');
  assert.equal(numeroExtenso(100), 'cem'); assert.equal(numeroExtenso(101), 'cento e um'); assert.equal(numeroExtenso(250), 'duzentos e cinquenta'); assert.equal(numeroExtenso(999), 'novecentos e noventa e nove');
  assert.equal(ticketPhrase(42), 'Senha quarenta e dois.');
  assert.equal(cleanSpoken('Odontologia + Sorriso'), 'Odontologia e Sorriso');
  assert.equal(cleanSpoken('SEJUSP e MPC'), 'sejúspi e ême pê cê');
  assert.equal(placePhrase({ kind: 'sala', num: '04', name: 'Laboratório (exames)' }), 'Laboratório, exames, sala quatro.');
  assert.equal(placePhrase({ kind: 'tenda', num: '4', name: 'Tenda Pet' }), 'Tenda Pet, tenda quatro.');
});

test('clipsFor monta a sequência de arquivos e devolve null fora do que foi gerado', () => {
  const m = { numbers: CLIP_MAX, places: ['jn-r04'] };
  assert.deepEqual(clipsFor({ ticket: 7, placeId: 'jn-r04' }, m), ['n-7.mp3', 'p-jn-r04.mp3']);
  assert.deepEqual(clipsFor({ ticket: 7, placeId: 'jn-r04', priority: true }, Object.assign({}, m, { extras: ['x-prioridade'] })), ['x-prioridade.mp3', 'n-7.mp3', 'p-jn-r04.mp3']);
  assert.deepEqual(clipsFor({ ticket: 7, placeId: 'jn-r04', priority: true }, m), ['n-7.mp3', 'p-jn-r04.mp3'], 'sem o áudio de prioridade gerado, anuncia normalmente');
  assert.deepEqual(clipsFor({ ticket: 7, placeId: 'jn-r04', again: true }, m), ['x-novamente.mp3', 'n-7.mp3', 'p-jn-r04.mp3']);
  assert.deepEqual(clipsFor({ ticket: 7, placeId: 'xx' }, m), ['n-7.mp3'], 'sala sem áudio: só a senha');
});

test('sala renomeada depois da gravação não toca o áudio antigo (fala a frase atual por síntese)', () => {
  const m = { numbers: CLIP_MAX, places: ['jn-r09', 'jn-r04'], phrases: { 'p-jn-r09': 'Pediatria, sala nove.', 'p-jn-r04': 'Ginecologista, sala quatro.' } };
  const r09 = { id: 'jn-r09', kind: 'sala', num: '09', name: 'Consulta médica' }; const r04 = { id: 'jn-r04', kind: 'sala', num: '04', name: 'Ginecologista' };
  assert.equal(placeClipOk('jn-r04', r04, m), true); assert.equal(placeClipOk('jn-r09', r09, m), false); assert.equal(placeClipOk('jn-r09', null, m), true, 'sem a sala atual, confia no manifest');
  assert.deepEqual(clipsFor({ ticket: 3, placeId: 'jn-r09', place: r09 }, m), ['n-3.mp3']);
  const a = announcementFor({ ticket: 3, place: r09 }, m);
  assert.deepEqual(a.files, ['n-3.mp3']); assert.equal(a.after, 'Consulta médica, sala nove.'); assert.equal(a.text, 'Senha três. Consulta médica, sala nove.');
  const b = announcementFor({ ticket: 3, place: r04, priority: true, again: true }, m);
  assert.deepEqual(b.files, ['x-novamente.mp3', 'n-3.mp3', 'p-jn-r04.mp3']); assert.equal(b.after, null); assert.match(b.text, /^Atenção, chamando novamente. Senha prioritária. Senha três. Ginecologista, sala quatro.$/);
  // fila criada na triagem (sem áudio): número pronto + sala por síntese; senha acima do gravado: tudo por síntese
  const x = announcementFor({ ticket: 3, place: { id: 'jn-x4', kind: 'sala', num: '08', name: 'Vacinação' } }, m);
  assert.deepEqual(x.files, ['n-3.mp3']); assert.equal(x.after, 'Vacinação, sala oito.');
  const y = announcementFor({ ticket: 999, place: r04 }, m); assert.equal(y.files, null); assert.equal(y.after, null); assert.equal(y.text, 'Senha novecentos e noventa e nove. Ginecologista, sala quatro.');
  assert.equal(clipsFor({ ticket: CLIP_MAX + 1, placeId: 'jn-r04' }, m), null);
  assert.equal(clipsFor({ ticket: 7, placeId: 'jn-r04' }, null), null);
});
