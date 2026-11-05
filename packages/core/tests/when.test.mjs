// when (dia/turno por item), oferta por sala/dia e dia de trabalho das senhas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCE as T } from '../src/shared.js';

const consulta = () => T.serviceById('consulta');

test('itemsOn respeita when (dia e turno): Consulta Médica por dia/turno', () => {
  const s = consulta(); assert.ok(s);
  const names = (date, shift) => T.itemsOn(s, date, shift).map((it) => T.itemText(it).split(' (')[0]);
  assert.deepEqual(names('2026-11-05', 'manha'), ['Psicologia']);
  assert.deepEqual(names('2026-11-05', 'tarde'), ['Ginecologia', 'Psiquiatria', 'Urologia', 'Psicologia']);
  assert.deepEqual(names('2026-11-06', 'manha'), ['Ginecologia', 'Urologia', 'Pediatria', 'Cardiologia', 'Exames laboratoriais', 'Psicologia']);
  assert.deepEqual(names('2026-11-06', 'tarde'), ['Ginecologia', 'Urologia', 'Pediatria', 'Cardiologia', 'Psicologia']);
  assert.deepEqual(names('2026-11-07'), ['Clínico geral', 'Psicologia']);
  assert.deepEqual(names('2026-11-04'), []);
  assert.equal(T.itemsOn(s).length, s.items.length, 'sem data: tudo');
  // only continua valendo
  const saude = T.serviceById('pilar-1'); assert.ok(T.itemsOn(saude, '2026-11-04').length < saude.items.length);
});

test('whenLabel / itemShifts', () => {
  assert.equal(T.whenLabel({ '2026-11-06': ['manha', 'tarde'], '2026-11-05': ['tarde'], '2026-11-07': true }), 'qui 05/11 à tarde · sex 06/11 manhã e tarde · sáb 07/11');
  assert.equal(T.whenLabel(null), '');
  const it = consulta().items.find((x) => /Exames/.test(T.itemText(x)));
  assert.deepEqual(T.itemShifts(it, '2026-11-06'), ['manha']); assert.deepEqual(T.itemShifts(it, '2026-11-05'), []); assert.equal(T.itemShifts('texto', '2026-11-05'), null);
});

test('offerOn: itens da sala quando há where; senão todos os do dia', () => {
  const doc = T.offerOn(T.serviceById('pilar-2'), '2026-11-07', 'jn-r17', 'jn');
  assert.deepEqual(doc.map((x) => x.text), ['Carteira de Identidade Nacional (CIN)']); assert.equal(doc[0].shifts, null);
  const c = T.offerOn(consulta(), '2026-11-05', 'jn-x1', 'jn');
  assert.deepEqual(c.map((x) => [x.text.split(' (')[0], x.shifts]), [['Ginecologia', ['tarde']], ['Psiquiatria', ['tarde']], ['Urologia', ['tarde']], ['Psicologia', null]]);
});

test('ticketDay: dia de serviços → ele; outro dia do evento → hoje; fora do evento → próximo/último', () => {
  assert.equal(T.ticketDay('2026-11-04').date, '2026-11-04'); assert.equal(T.ticketDay('2026-11-04').venue, 'manga'); assert.equal(T.ticketDay('2026-11-04').service_day, true);
  const d5 = T.ticketDay('2026-11-05'); assert.deepEqual([d5.date, d5.venue, d5.service_day], ['2026-11-05', 'jn', false]); assert.ok(d5.place);
  assert.deepEqual([T.ticketDay('2026-11-04', 'jn').date, T.ticketDay('2026-11-04', 'jn').venue], ['2026-11-04', 'jn'], 'no Manga, mas o aparelho está na JN: hoje na JN');
  assert.equal(T.ticketDay('2026-11-06', 'manga').venue, 'manga');
  assert.equal(T.ticketDay('2026-11-01').date, '2026-11-04'); assert.equal(T.ticketDay('2026-11-20').date, '2026-11-07'); assert.equal(T.ticketDay('2026-11-20', 'manga').date, '2026-11-04');
});
