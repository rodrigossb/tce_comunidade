// Módulo de impressão: previsão de senhas por sala (parseParams + previsao) a partir de um estado como o de db.state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, previsao, paramsOf, PREVISAO } from '../lib/impressao.js';

const state = {
  day: '2026-11-06', venue: 'jn',
  configs: [
    { service_id: 'consulta', place_id: 'jn-r09', n_total: 50, p_total: 10, n_prefix: 'N', p_prefix: 'P', pattern: '1:1', mode: 'chamada' },
    { service_id: 'pilar-2', place_id: 'jn-r19', n_total: 0, p_total: 0, n_prefix: 'N', p_prefix: 'P', pattern: '1:1', mode: 'chamada' }, // previsão zero
    { service_id: 'consulta', place_id: 'jn-x8', n_total: 10, p_total: 6, n_prefix: 'N', p_prefix: 'P', pattern: '1:2', mode: 'chamada' },
    { service_id: 'pilar-6', place_id: 'jn-t4', n_total: 40, p_total: 0, n_prefix: 'N', p_prefix: 'P', pattern: '1:1', mode: 'contagem' },
  ],
  extras: [{ id: 'jn-x8', extra: true, service_id: 'consulta', name: 'Pediatra', kind: 'sala', num: '08' }, { id: 'jn-r09', override: true, service_id: 'consulta', name: 'Consulta médica', kind: 'sala', num: '08' }],
  disabled: ['jn-t4'],
};

test('parseParams: local/dia válidos, serviços por lista ou caixas, previsão e inativas', () => {
  const f = parseParams({ local: 'jn', dia: '2026-11-06', servicos: 'consulta,xxx', svc: ['pilar-6', 'consulta'], previsao: 'todas', inativas: '1' }, '2026-11-05');
  assert.deepEqual(f, { day: '2026-11-06', venue: 'jn', svcs: ['consulta', 'pilar-6'], previsao: 'todas', inativas: true });
  const g = parseParams({ local: 'nada', dia: 'ontem' }, '2026-11-05');
  assert.equal(g.venue, 'manga', 'local inválido → primeiro dia de serviços'); assert.match(g.day, /^2026-11-\d\d$/); assert.deepEqual(g.svcs, []); assert.equal(g.previsao, 'com'); assert.equal(g.inativas, false);
  assert.equal(paramsOf(f), 'local=jn&dia=2026-11-06&servicos=consulta%2Cpilar-6&previsao=todas&inativas=1'); assert.equal(PREVISAO.length, 2);
});

test('previsao: só salas com previsão (>0), por serviço, com subtotais e total; desativadas só com inativas', () => {
  const r = previsao(state, { svcs: [], previsao: 'com', inativas: false });
  assert.deepEqual(r.groups.map((g) => g.service.id), ['consulta']);
  const c = r.groups[0]; assert.deepEqual(c.places.map((p) => [p.name, p.num, p.n, p.p, p.total, p.pattern, p.extra]), [['Consulta médica', '08', 50, 10, 60, '1P : 1N', false], ['Pediatra', '08', 10, 6, 16, '1P : 2N', true]]);
  assert.deepEqual(c.sub, { n: 60, p: 16, total: 76, count: 2 }); assert.deepEqual(r.total, { n: 60, p: 16, total: 76, count: 2 });
  assert.ok(r.services.some((s) => s.id === 'consulta') && r.services.some((s) => s.id === 'pilar-1'));
  // Tenda Pet tem previsão mas está desativada: entra só com inativas, marcada
  const i = previsao(state, { previsao: 'com', inativas: true }); const pet = i.groups.find((g) => g.service.id === 'pilar-6').places[0];
  assert.equal(pet.disabled, true); assert.equal(pet.n, 40); assert.equal(pet.mode, 'contagem'); assert.equal(i.total.n, 100);
  // filtro por serviço
  const s = previsao(state, { svcs: ['pilar-2'], previsao: 'com' }); assert.deepEqual(s.groups, []); assert.equal(s.total.count, 0);
});

test('previsao "todas": planta inteira; sem previsão vale o padrão (100 N / 20 P) marcado como padrão; previsão zero fica 0', () => {
  const r = previsao(state, { previsao: 'todas' });
  const p2 = r.groups.find((g) => g.service.id === 'pilar-2'); const superfacil = p2.places.find((p) => p.id === 'jn-r19'); const detran = p2.places.find((p) => p.id === 'jn-r18');
  assert.equal(superfacil.zero, true); assert.equal(superfacil.n, 0); assert.equal(superfacil.total, 0);
  assert.equal(detran.default, true); assert.equal(detran.n, 100); assert.equal(detran.p, 20);
  assert.ok(!r.groups.some((g) => g.places.some((p) => p.id === 'jn-t4')), 'desativada continua fora sem inativas');
});
