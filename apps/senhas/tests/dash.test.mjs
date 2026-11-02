// Cálculos do dashboard de resultados: séries por hora, rankings e destaques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '@tce/core/stats';
import { hourSeries, highlights, placeRows, serviceRows, defaultDay, arcPath } from '../lib/dash-stats.js';

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
  assert.equal(defaultDay('2026-11-05').date, '2026-11-04');
  assert.equal(defaultDay('2026-11-01').date, '2026-11-04');
  assert.equal(defaultDay('2026-11-20').date, '2026-11-07');
});
test('arco do donut', () => { assert.match(arcPath(50, 50, 40, 0, 90), /^M 50 10 A 40 40 0 0 1 90 50$/); });
