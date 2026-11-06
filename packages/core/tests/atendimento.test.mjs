// Atendimento público por dia (@tce/core/atendimento): retrato da triagem × planta × programação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCE as T } from '../src/shared.js';
import { TCE_DATA as D } from '../src/data.js';
import * as A from '../src/atendimento.js';

// Retrato como o da API: sexta 06/11 na Joaquim Nabuco configurada na triagem (não é dia de serviços da programação)
// e sábado 07/11 (dia de serviços) com a triagem já configurada.
const DATA = { updatedAt: 1, days: [
  { date: '2026-11-06', venue: 'jn', source: 'triagem', queues: [
    { service_id: 'consulta', place_id: 'jn-r09', name: 'Consulta médica', kind: 'sala', num: '08', extra: false, items: [{ t: 'Ginecologia', shifts: null }, { t: 'Urologia', shifts: ['manha'] }] },
    { service_id: 'consulta', place_id: 'jn-x8', name: 'Pediatra', kind: 'sala', num: '08', extra: true, items: [{ t: 'Pediatria', shifts: ['manha', 'tarde'] }] },
    { service_id: 'pilar-2', place_id: 'jn-r17', name: 'Polícia Científica', kind: 'sala', num: '18', extra: false, items: [{ t: 'Carteira de Identidade Nacional (CIN)', shifts: null }] },
    { service_id: 'pilar-1', place_id: 'jn-x6', name: 'IDHAMP', kind: 'sala', num: '99', extra: true, items: [{ t: 'Avaliação psicopedagógica', shifts: null }] },
  ] },
  { date: '2026-11-07', venue: 'jn', source: 'triagem', queues: [
    { service_id: 'pilar-6', place_id: 'jn-t4', name: 'Tenda Pet', kind: 'tenda', num: '4', extra: false, items: [{ t: 'Vacinação antirrábica', shifts: null }] },
  ] },
] };

test('dias de atendimento: programação + triagem, em ordem, com live/official', () => {
  const days = A.attendanceDays(DATA);
  assert.deepEqual(days.map((d) => `${d.date}@${d.venue}`), ['2026-11-04@manga', '2026-11-06@jn', '2026-11-07@jn']);
  const sex = days[1]; assert.equal(sex.live, true); assert.equal(sex.official, false); assert.equal(sex.place, D.venues.jn.short);
  const sab = days[2]; assert.equal(sab.live, true); assert.equal(sab.official, true); assert.equal(sab.placeLong, T.serviceDayOf('2026-11-07').placeLong);
  assert.equal(days[0].live, false);
  assert.deepEqual(A.attendanceDays(null).map((d) => d.date), T.serviceDays().map((d) => d.date));
  assert.deepEqual(A.venueDays(DATA, 'jn'), ['2026-11-06', '2026-11-07']);
  assert.equal(A.attendanceDayOf(DATA, '2026-11-06').venue, 'jn'); assert.equal(A.attendanceDayOf(DATA, '2026-11-06', 'manga'), null);
});
test('dia padrão do mapa: hoje se atende hoje, senão o próximo, senão o último', () => {
  assert.equal(A.defaultDay(DATA, 'jn', '2026-11-06'), '2026-11-06');
  assert.equal(A.defaultDay(DATA, 'jn', '2026-11-05'), '2026-11-06');
  assert.equal(A.defaultDay(DATA, 'jn', '2026-11-08'), '2026-11-07');
  assert.equal(A.defaultDay(DATA, 'manga', '2026-11-06'), '2026-11-04');
  assert.equal(A.defaultDay(DATA, 'sebrae', '2026-11-06'), null);
});
test('pino na planta: sala fixa movida de número e sala criada com número da planta caem no pino daquele número', () => {
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-r09', kind: 'sala', num: '08' }), 'jn-r08');
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-r09', kind: 'sala', num: '09' }), 'jn-r09');
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-r09', kind: 'sala', num: '' }), 'jn-r09');
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-x8', kind: 'sala', num: '8' }), 'jn-r08');
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-x6', kind: 'sala', num: '99' }), null);
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-r19', kind: 'sala', num: '0' }), 'jn-r19', '"0" = sem número: fica onde está');
  assert.equal(A.mapPlaceIdOf('jn', { place_id: 'jn-t4', kind: 'tenda', num: '4' }), 'jn-t4');
});
test('filas do dia: só o que a triagem definiu num dia fora da programação; nada sem retrato fora dos dias de serviços', () => {
  const qs = A.dayQueues(DATA, 'jn', '2026-11-06');
  assert.deepEqual(qs.map((q) => q.place.name), ['Consulta médica', 'Pediatra', 'Polícia Científica', 'IDHAMP']);
  assert.ok(qs.every((q) => !q.plant));
  assert.deepEqual(A.placeQueues(DATA, 'jn-r08', 'jn', '2026-11-06').map((q) => q.place.name), ['Consulta médica', 'Pediatra']);
  assert.deepEqual(A.placeQueues(DATA, 'jn-r09', 'jn', '2026-11-06'), []);
  assert.deepEqual(A.servicePlaceIds(DATA, 'consulta', 'jn', '2026-11-06'), ['jn-r08']);
  assert.deepEqual(A.dayServices(DATA, 'jn', '2026-11-06').map((s) => s.id), ['pilar-1', 'consulta', 'pilar-2']);
  assert.deepEqual(A.dayQueues(DATA, 'jn', '2026-11-05'), []);
  assert.deepEqual(A.dayQueues(null, 'jn', '2026-11-06'), []);
  const off = A.inactivePlaceIds(DATA, 'jn', '2026-11-06');
  assert.ok(off.includes('jn-r09') && off.includes('jn-r11') && off.includes('jn-r17') && !off.includes('jn-r08') && !off.includes('jn-r18'), 'sala 17 passou a atender na 18: pino 18 ativo, 17 não');
  assert.deepEqual(A.inactivePlaceIds(DATA, 'jn', '2026-11-05'), []);
  assert.deepEqual(A.placeDays(DATA, 'jn-r08', 'jn'), ['2026-11-06']); assert.deepEqual(A.placeDays(DATA, 'jn-t4', 'jn'), ['2026-11-07']);
  assert.deepEqual(A.serviceDays(DATA, 'pilar-6', 'jn'), ['2026-11-07']);
});
test('dia de serviços da programação com retrato: filas da triagem + ambientes da planta sem senha (acolhida, áreas, cursos)', () => {
  const qs = A.dayQueues(DATA, 'jn', '2026-11-07');
  assert.equal(qs.filter((q) => !q.plant).length, 1);
  const ticket = new Set(T.ticketQueuesOf('jn').flatMap((g) => g.places.map((p) => p.id)));
  for (const q of qs.filter((q) => q.plant)) assert.ok(!ticket.has(q.place.id), `${q.place.id} distribui senha: só a triagem decide`);
  assert.ok(qs.some((q) => q.plant && q.place.id === 'jn-triagem'));
  assert.ok(!qs.some((q) => q.place.id === 'jn-r11'), 'sala com senha fora do retrato não entra');
});
test('sem retrato num dia de serviços da programação: toda a planta, com a oferta da programação do dia', () => {
  const qs = A.dayQueues(null, 'manga', '2026-11-04');
  assert.equal(qs.length, T.queuesOf('manga').reduce((n, g) => n + g.places.length, 0));
  const doc = qs.find((q) => q.place.id === 'mg-r06'); assert.equal(doc.service.id, 'pilar-2'); assert.ok(doc.items.some((it) => /Carteira de Identidade/.test(it.t)));
  assert.deepEqual(A.inactivePlaceIds(null, 'manga', '2026-11-04'), []);
});
test('turnos e títulos', () => {
  assert.equal(A.shiftsText(null), ''); assert.equal(A.shiftsText(['manha', 'tarde']), ''); assert.equal(A.shiftsText(['manha']), 'de manhã'); assert.equal(A.shiftsText(['tarde']), 'à tarde'); assert.equal(A.shiftsText(['manha', 'noite']), 'manhã e noite');
  assert.equal(A.placeTitle({ kind: 'sala', num: '08' }), 'Sala 08'); assert.equal(A.placeTitle({ kind: 'tenda', num: '4' }), 'Tenda 4'); assert.equal(A.placeTitle({ kind: 'area', num: '', name: 'Quadra' }), 'Quadra'); assert.equal(A.placeTitle({ kind: 'area', num: '0', name: 'Pátio' }), 'Pátio');
  assert.equal(A.placeTitle({ kind: 'sala', num: '0', name: 'Superfácil' }), 'Superfácil', '"0" = sem número'); assert.equal(A.queueLabel({ kind: 'sala', num: '0', name: 'Superfácil' }), 'Superfácil'); assert.equal(A.queueLabel({ kind: 'sala', num: '08', name: 'Pediatra' }), 'Sala 08 · Pediatra');
  // filas iguais no mesmo pino viram uma só
  const dup = { days: [{ date: '2026-11-06', venue: 'jn', queues: [{ service_id: 'pilar-6', place_id: 'jn-r21', name: 'Castramóvel', kind: 'sala', num: '22', items: [{ t: 'Castração' }] }, { service_id: 'pilar-6', place_id: 'jn-r22', name: 'Castramóvel', kind: 'sala', num: '22', items: [{ t: 'Castração' }] }] }] };
  assert.equal(A.dayQueues(dup, 'jn', '2026-11-06').length, 1); assert.deepEqual(A.inactivePlaceIds(dup, 'jn', '2026-11-06').includes('jn-r22'), false);
  const q = A.dayQueues(DATA, 'jn', '2026-11-06')[0];
  assert.deepEqual(A.itemsAt(q, 'tarde').map((x) => x.t), ['Ginecologia']); assert.deepEqual(A.itemsAt(q, null).map((x) => x.t), ['Ginecologia', 'Urologia']);
});
