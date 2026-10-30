// Agregações do controle de senhas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { summarize } = require('../server/stats.js');

const T0 = Date.parse('2026-11-07T12:00:00Z');
const min = (n) => T0 + n * 60000;

test('senhas entregues, chamadas, atendidas, faltas e tempo médio', () => {
  const issued = [{ service_id: 'pilar-1', count: 40, ts: min(30) }];
  const calls = [
    { id: 1, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 1, called_at: min(0), status: 'served', status_at: min(1), ended_at: null },
    { id: 2, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 2, called_at: min(11), status: 'served', status_at: min(12), ended_at: null }, // encerra a 1 (11 min)
    { id: 3, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 3, called_at: min(20), status: 'absent', status_at: min(21), ended_at: null },
    { id: 4, service_id: 'pilar-1', place_id: 'jn-r11', ticket: 4, called_at: min(22), status: 'served', status_at: min(23), ended_at: min(28) }, // encerra a 2 (11 min); dura 5
    { id: 5, service_id: 'pilar-1', place_id: 'jn-r12', ticket: 1, called_at: min(5), status: 'called', status_at: null, ended_at: null },
  ];
  const s = summarize(issued, calls, min(30));
  assert.equal(s.total.issued, 40); assert.equal(s.total.called, 5); assert.equal(s.total.served, 3); assert.equal(s.total.absent, 1); assert.equal(s.total.pending_result, 1);
  assert.equal(s.total.not_called, 35);
  const p1 = s.services.find((x) => x.service_id === 'pilar-1');
  assert.equal(p1.samples, 3); assert.equal(p1.avg_min, 9); assert.equal(p1.median_min, 11);
  assert.equal(p1.in_service, 0); assert.equal(p1.absent_rate, 20); assert.equal(p1.last_ticket, 4);
  const r11 = p1.places.find((x) => x.place_id === 'jn-r11'); assert.equal(r11.current.ticket, 4); assert.equal(r11.served, 3);
  assert.equal(p1.est_wait_min, 315); // 35 × 9 ÷ 1 sala ativa
});
test('atendimento em curso conta como em serviço', () => {
  const calls = [{ id: 1, service_id: 'pilar-2', place_id: 'jn-r17', ticket: 7, called_at: min(0), status: 'served', status_at: min(1), ended_at: null }];
  const s = summarize([], calls, min(9));
  assert.equal(s.total.in_service, 1); assert.equal(s.total.avg_min, null);
  assert.equal(s.services[0].places[0].current.in_service_min, 8);
});
