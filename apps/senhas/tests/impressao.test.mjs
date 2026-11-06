// Módulo de impressão: previsão de senhas por sala (parseParams + previsao) a partir de um estado como o de db.state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, previsao, paramsOf, rangeText, PREVISAO, SERIES, PRESETS, ticketsOf, pagesOf, padTicket, PER_PAGE, FORMATOS } from '../lib/impressao.js';

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
  assert.deepEqual(f, { day: '2026-11-06', venue: 'jn', svcs: ['consulta', 'pilar-6'], salas: [], previsao: 'todas', inativas: true, formato: 'senhas', serie: 'np', de: null, ate: null });
  const g = parseParams({ local: 'nada', dia: 'ontem' }, '2026-11-05');
  assert.equal(g.venue, 'manga', 'local inválido → primeiro dia de serviços'); assert.match(g.day, /^2026-11-\d\d$/); assert.deepEqual(g.svcs, []); assert.equal(g.previsao, 'com'); assert.equal(g.inativas, false);
  assert.equal(paramsOf(f), 'local=jn&dia=2026-11-06&servicos=consulta%2Cpilar-6&previsao=todas&inativas=1'); assert.equal(PREVISAO.length, 2);
});

test('parseParams: salas (lista ou caixas, ids válidos), série e faixa de números (de/ate trocados se invertidos)', () => {
  const f = parseParams({ local: 'jn', dia: '2026-11-06', salas: 'jn-r09,lixo;x', sala: ['jn-x8', 'jn-r09'], serie: 'n', de: '48', ate: '25' }, '2026-11-05');
  assert.deepEqual(f.salas, ['jn-r09', 'jn-x8']); assert.equal(f.serie, 'n'); assert.equal(f.de, 25); assert.equal(f.ate, 48);
  assert.equal(paramsOf(f), 'local=jn&dia=2026-11-06&salas=jn-r09%2Cjn-x8&serie=n&de=25&ate=48');
  assert.equal(rangeText(f), 'só comuns · do nº 25 ao 48');
  const g = parseParams({ local: 'jn', serie: 'xx', de: '0', ate: 'abc' }, '2026-11-05'); assert.equal(g.serie, 'np'); assert.equal(g.de, null); assert.equal(g.ate, null); assert.equal(rangeText(g), '');
  assert.equal(rangeText({ serie: 'p', de: 7 }), 'só prioritárias · a partir do nº 7'); assert.equal(rangeText({ serie: 'np', ate: 24 }), 'até o nº 24'); assert.equal(rangeText({ de: 3, ate: 3 }), 'só o nº 3');
  assert.deepEqual(SERIES.map((x) => x.id), ['np', 'n', 'p']); assert.deepEqual(PRESETS.map((x) => [x.de, x.ate]), [[1, 24], [25, 48], [49, 72], [73, 96]]);
});

test('previsao: filtro por sala entra mesmo sem previsão ou desativada; rooms lista todas as salas do local com serviço e situação', () => {
  const r = previsao(state, { salas: ['jn-x8', 'jn-r19', 'jn-t4'], previsao: 'com', inativas: false });
  assert.deepEqual(r.groups.map((g) => [g.service.id, g.places.map((p) => p.id)]), [['consulta', ['jn-x8']], ['pilar-2', ['jn-r19']], ['pilar-6', ['jn-t4']]]);
  assert.equal(r.groups[1].places[0].zero, true); assert.equal(r.groups[2].places[0].disabled, true);
  const pet = r.rooms.find((x) => x.id === 'jn-t4'); assert.deepEqual([pet.service_id, pet.disabled, pet.has, pet.n, pet.p], ['pilar-6', true, true, 40, 0]);
  const cm = r.rooms.find((x) => x.id === 'jn-r09'); assert.deepEqual([cm.name, cm.num, cm.service_id, cm.has], ['Consulta médica', '08', 'consulta', true]);
  assert.ok(r.rooms.some((x) => x.id === 'jn-r18' && !x.has && !x.disabled), 'sala da planta sem previsão também aparece para marcar');
  // sala marcada fora da categoria marcada não entra (os dois filtros valem juntos)
  assert.deepEqual(previsao(state, { svcs: ['pilar-2'], salas: ['jn-x8'] }).groups, []);
});

test('faixa de senhas: série e intervalo valem dentro de cada série; folhas seguem a faixa', () => {
  const r = previsao(state, { previsao: 'com' }); const cm = r.groups[0].places[0]; // 50 N + 10 P
  assert.deepEqual(ticketsOf(cm, { serie: 'n', de: 49 }).map((t) => t.label), ['49', '50']);
  assert.deepEqual(ticketsOf(cm, { serie: 'p', de: 9, ate: 10 }).map((t) => t.label), ['P09', 'P10']);
  assert.deepEqual(ticketsOf(cm, { de: 1, ate: 2 }).map((t) => t.label), ['01', '02', 'P01', 'P02'], 'sem série: o intervalo vale nas duas');
  assert.equal(ticketsOf(cm, { serie: 'np' }).length, 60); assert.equal(ticketsOf(cm, { de: 100 }).length, 0);
  assert.deepEqual(pagesOf(cm, undefined, { serie: 'n', de: 25, ate: 48 }).map((p) => p.length), [24]);
  assert.deepEqual(ticketsOf({ n: 3, p: 2, from: { n: 101, p: 7 } }, { de: 102, ate: 102 }).map((x) => x.label), ['102'], 'faixa compara o número impresso (com n_from)');
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

test('senhas para recortar: comuns só com o número (01…), prioritárias P01…, a partir do início configurado; 24 por folha; formato na URL', () => {
  const r = previsao(state, { previsao: 'com' }); const cm = r.groups[0].places[0];
  const t = ticketsOf(cm); assert.equal(t.length, 60); assert.deepEqual(t[0], { num: 1, prio: false, label: '01' }); assert.equal(t[49].label, '50'); assert.deepEqual(t[50], { num: 1, prio: true, label: 'P01' }); assert.equal(t[59].label, 'P10');
  assert.deepEqual(pagesOf(cm).map((p) => p.length), [24, 24, 12]); assert.equal(PER_PAGE, 24);
  assert.deepEqual(ticketsOf({ n: 3, p: 2, from: { n: 101, p: 7 }, labels: { n: 'N', p: 'P' } }).map((x) => x.label), ['101', '102', '103', 'P07', 'P08']);
  assert.equal(padTicket(5), '05'); assert.equal(padTicket(120), '120'); assert.deepEqual(ticketsOf({ n: 0, p: 0 }), []);
  const f = parseParams({ local: 'jn', dia: '2026-11-06', formato: 'lista' }, '2026-11-05'); assert.equal(f.formato, 'lista'); assert.match(paramsOf(f), /formato=lista$/);
  assert.equal(parseParams({ local: 'jn' }, '2026-11-05').formato, 'senhas'); assert.equal(FORMATOS[0].id, 'senhas');
});
