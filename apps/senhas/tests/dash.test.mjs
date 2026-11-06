// Cálculos do dashboard de resultados: séries por hora, rankings e destaques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '@tce/core/stats';
import { hourSeries, highlights, placeRows, serviceRows, defaultDay, arcPath, countEvents, allEvents } from '../lib/dash-stats.js';

const t0 = Date.UTC(2026, 10, 7, 11, 0); // 08:00 em Belém (UTC-3)
const min = (m) => t0 + m * 60000;
const calls = [
  { id: 1, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 1, called_at: min(0), status: 'served', status_at: min(1), ended_at: null },
  { id: 2, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 2, called_at: min(10), status: 'served', status_at: min(11), ended_at: null },
  { id: 3, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 3, called_at: min(20), status: 'absent', status_at: min(21), ended_at: null },
  { id: 4, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 4, called_at: min(70), status: 'served', status_at: min(71), ended_at: min(80) },
  { id: 5, service_id: 'pilar-2', place_id: 'jn-r14', ticket: 1, called_at: min(75), status: 'served', status_at: min(76), ended_at: min(78) },
  { id: 6, service_id: 'pilar-2', place_id: 'jn-r14', ticket: 2, called_at: min(130), status: 'called', status_at: null, ended_at: null },
];
const issued = [{ service_id: 'pilar-1', place_id: 'jn-r11', count: 6, ts: min(0) }, { service_id: 'pilar-2', place_id: 'jn-r14', count: 3, ts: min(0) }];
const stats = summarize(issued, calls, min(200));

test('série por hora cobre 8h–17h e conta chamadas, entradas e faltas', () => {
  const s = hourSeries(calls);
  assert.equal(s[0].hour, 8); assert.equal(s[s.length - 1].hour, 17);
  assert.deepEqual([s[0].called, s[0].served, s[0].absent], [3, 2, 1]);
  assert.equal(s.find((x) => x.hour === 9).called, 2);
  assert.deepEqual(hourSeries([]), []);
});
test('rankings por sala e por serviço', () => {
  const rows = placeRows(stats); assert.equal(rows.length, 2);
  const r11 = rows.find((r) => r.place_id === 'jn-r11'); assert.equal(r11.served, 3); assert.equal(r11.absent_rate, 25); assert.match(r11.room, /Sala 11/);
  const sv = serviceRows(stats); assert.equal(sv[0].service.id, 'pilar-1'); assert.equal(sv[0].active_rooms, 1);
});
test('destaques: primeira/última chamada, pico, sala mais movimentada', () => {
  const h = highlights(stats, calls);
  assert.equal(h.first.id, 1); assert.equal(h.last.id, 6); assert.equal(h.peak.hour, 8);
  assert.equal(h.busiest.place_id, 'jn-r11'); assert.equal(h.spanMin, 130); assert.equal(h.activeRooms, 2);
});
test('dia padrão: hoje se for dia de serviços; senão o último passado; senão o próximo', () => {
  assert.equal(defaultDay('2026-11-04').date, '2026-11-04');
  assert.equal(defaultDay('2026-11-05').date, '2026-11-05'); assert.equal(defaultDay('2026-11-05').venue, 'jn');
  assert.equal(defaultDay('2026-11-05', 'manga').venue, 'manga'); assert.equal(defaultDay('2026-11-20', 'manga').date, '2026-11-04');
  assert.equal(defaultDay('2026-11-01').date, '2026-11-04');
  assert.equal(defaultDay('2026-11-20').date, '2026-11-07');
});
test('arco do donut', () => { assert.match(arcPath(50, 50, 40, 0, 90), /^M 50 10 A 40 40 0 0 1 90 50$/); });

test('countEvents: senhas de filas "só contagem" viram atendimentos no horário do lançamento; correção para baixo tira as últimas', () => {
  const hist = [
    { service_id: 'amprev', place_id: 'jn-x5', kind: 'n', count: 3, ts: min(5) }, { service_id: 'amprev', place_id: 'jn-x5', kind: 'n', count: 5, ts: min(70) },
    { service_id: 'amprev', place_id: 'jn-x5', kind: 'p', count: 1, ts: min(75) }, { service_id: 'amprev', place_id: 'jn-x5', kind: 'n', count: 4, ts: min(80) },
    { service_id: 'pilar-1', place_id: 'jn-r11', kind: 'n', count: 6, ts: min(0) }];
  const ev = countEvents(hist, new Set(['jn-x5']));
  assert.equal(ev.length, 5, '3 + 2 − 1 comuns + 1 prioritária'); assert.ok(ev.every((e) => e.counted && e.status === 'served' && e.service_id === 'amprev'));
  assert.equal(ev.filter((e) => e.called_at === min(5)).length, 3); assert.equal(ev.filter((e) => e.called_at === min(70)).length, 1, 'a correção tirou uma das 9h');
  assert.deepEqual(countEvents(hist, new Set()), []);
  const all = allEvents(calls, hist, new Set(['jn-x5'])); assert.equal(all.length, calls.length + 5);
  const s = hourSeries(all); assert.equal(s[0].counted, 3); assert.equal(s[0].called, 6); assert.equal(s.find((x) => x.hour === 9).counted, 2);
  const st2 = summarize(issued.concat([{ service_id: 'amprev', place_id: 'jn-x5', count: 5, ts: min(80) }]), calls, min(200), new Set(['jn-x5']));
  const rows = placeRows(st2); const x5 = rows.find((r) => r.place_id === 'jn-x5'); assert.ok(x5.count_only); assert.equal(x5.served, 5); assert.equal(x5.absent_rate, null);
  const sv = serviceRows(st2).find((r) => r.service.id === 'amprev'); assert.equal(sv.count_rooms, 1); assert.equal(sv.counted, 5);
  assert.ok(highlights(st2, all).mostAbsent == null || !highlights(st2, all).mostAbsent.count_only);
});

test('filterData: sem filtro devolve os números do servidor; com turno/serviço recalcula (entregues = contagem no fim do turno − anterior)', async () => {
  const { filterData, filterDays, normFilters, hasFilters, shiftOfHour } = await import('../lib/dash-stats.js');
  assert.equal(shiftOfHour(8), 'manha'); assert.equal(shiftOfHour(13), 'tarde'); assert.equal(shiftOfHour(18), 'noite');
  assert.equal(hasFilters({}), false); assert.equal(hasFilters({ shift: 'tarde' }), true); assert.equal(normFilters({ svcs: 'a,b' }).svcs.size, 2);
  const t13 = Date.UTC(2026, 10, 7, 16, 0); // 13:00 em Belém
  const issued_history = [
    { service_id: 'pilar-1', place_id: 'jn-r11', kind: 'n', count: 10, ts: min(5) }, { service_id: 'pilar-1', place_id: 'jn-r11', kind: 'n', count: 30, ts: t13 + 60000 },
    { service_id: 'pilar-2', place_id: 'jn-r20', kind: 'n', count: 4, ts: min(6) },
  ];
  const callsDay = calls.concat([{ id: 9, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 11, called_at: t13 + 120000, status: 'served', status_at: t13 + 130000, ended_at: t13 + 300000 }]);
  const data = { total: { issued: 34, called: callsDay.length }, services: [{ service_id: 'pilar-1' }], per_hour: {}, calls: callsDay, issued_history, count_only: ['jn-r20'], now: t13 + 600000 };
  const all = filterData(data, {});
  assert.equal(all.filtered, false); assert.equal(all.stats.total.issued, 34, 'sem filtro: total do servidor'); assert.equal(all.countedTotal, 4); assert.equal(all.events.length, callsDay.length + 4);
  const tarde = filterData(data, { shift: 'tarde' });
  assert.equal(tarde.filtered, true); assert.equal(tarde.stats.total.issued, 20, 'entregues à tarde: 30 − 10'); assert.equal(tarde.stats.total.called, 1); assert.equal(tarde.events.length, 1); assert.equal(tarde.countedTotal, 0);
  const manha = filterData(data, { shift: 'manha' });
  assert.equal(manha.stats.total.issued, 14, 'manhã: 10 + 4 (contagem)'); assert.equal(manha.countedTotal, 4);
  const svc = filterData(data, { svcs: ['pilar-2'] });
  assert.equal(svc.stats.total.issued, 4); assert.equal(svc.stats.services[0].places.find((p) => p.place_id === 'jn-r20').served, 4, 'só contagem: served = entregues'); assert.equal(svc.stats.services.length, 1); assert.equal(svc.events.every((e) => e.service_id === 'pilar-2'), true);
  const days = filterDays([{ day: '2026-11-04', venue: 'manga' }, { day: '2026-11-05', venue: 'jn' }], 'jn');
  assert.equal(days[0].date, '2026-11-03'); const d4 = days.find((d) => d.date === '2026-11-04'); assert.equal(d4.service_day, false); assert.equal(d4.has_data, false); assert.deepEqual(d4.venues, ['manga']);
  const d5 = days.find((d) => d.date === '2026-11-05'); assert.equal(d5.has_data, true); const d7 = days.find((d) => d.date === '2026-11-07'); assert.equal(d7.service_day, true); assert.equal(d7.venue, 'jn');
  // dias desativados pela administração: strings (dias deste local) ou { day, venue } (de qualquer local, filtrados pelo local pedido)
  const off1 = filterDays([], 'jn', ['2026-11-06']); assert.equal(off1.find((d) => d.date === '2026-11-06').off, true); assert.equal(off1.find((d) => d.date === '2026-11-05').off, false);
  const off2 = filterDays([], 'jn', [{ day: '2026-11-06', venue: 'manga' }, { day: '2026-11-07', venue: 'jn' }]); assert.equal(off2.find((d) => d.date === '2026-11-06').off, false); assert.equal(off2.find((d) => d.date === '2026-11-07').off, true);
  const off3 = filterDays([], null, [{ day: '2026-11-06', venue: 'manga' }]); assert.equal(off3.find((d) => d.date === '2026-11-06').off, true, 'sem local: qualquer local conta');
});
