// Voz da TV: escolha da voz pt-BR e diagnóstico do estado (bloqueada até o gesto, sem voz, pronta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, voiceState, voiceLabel } from '../lib/voz.js';

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
  assert.equal(voiceState({ wanted: true, supported: false }), 'unsupported');
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
