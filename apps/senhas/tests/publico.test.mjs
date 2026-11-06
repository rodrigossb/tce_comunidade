// Retrato público do atendimento por dia (GET /api/atendimento → db.atendimentoPublico): banco temporário próprio.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publico-'));
process.env.DB_PATH = path.join(dir, 'senhas.db');
const db = await import('../lib/db.js');
const { TCE: T } = await import('@tce/core');
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const SEX = '2026-11-06'; const SAB = '2026-11-07'; const V = 'jn';
const dayOf = (data, date, venue) => data.days.find((d) => d.date === date && d.venue === venue) || null;

test('banco vazio: só os dias de serviços da programação, com toda a planta e a oferta da programação', () => {
  const data = db.atendimentoPublico(null); assert.equal(data.updatedAt, 0, 'banco sem mudanças: sem carimbo');
  assert.deepEqual(data.days.map((d) => `${d.date}@${d.venue}@${d.source}`), ['2026-11-04@manga@programacao', '2026-11-07@jn@programacao']);
  const sab = dayOf(data, SAB, V);
  assert.equal(sab.queues.length, T.ticketQueuesOf(V).reduce((n, g) => n + g.places.length, 0));
  const r11 = sab.queues.find((x) => x.place_id === 'jn-r11'); assert.equal(r11.service_id, 'pilar-1'); assert.equal(r11.extra, false);
  assert.ok(r11.items.some((it) => /Vacinação/.test(it.t)) && r11.items.every((it) => it.shifts === null || it.shifts.length));
  for (const x of sab.queues) for (const k of Object.keys(x)) assert.ok(['service_id', 'place_id', 'name', 'kind', 'num', 'extra', 'items'].includes(k), `campo inesperado ${k}`);
  assert.equal(db.atendimentoPublico('manga').days.length, 1);
});
test('triagem configura a sexta na Joaquim Nabuco: dia entra; sala desativada sai; sala criada e sala editada vêm com a oferta do dia/turno', () => {
  db.setQueueEnabled({ day: SEX, venue: V, service_id: 'pilar-1', place_id: 'jn-r11', enabled: false, device: 't' });
  const ex = db.addExtra({ day: SEX, venue: V, service_id: 'consulta', name: 'Pediatra', kind: 'sala', num: '08', n_total: 50, p_total: 10, pattern: '1:1', device: 't' });
  db.setQueueInfo({ day: SEX, venue: V, service_id: 'consulta', place_id: ex.place_id, name: 'Pediatra', kind: 'sala', num: '08', items: [{ t: 'Pediatria', when: { [SEX]: ['manha', 'tarde'] } }, { t: 'Puericultura', when: { [SAB]: ['manha'] } }], device: 't' });
  db.setQueueInfo({ day: SEX, venue: V, service_id: 'consulta', place_id: 'jn-r09', name: 'Consulta médica', kind: 'sala', num: '08', items: [{ t: 'Ginecologia', when: { [SEX]: ['tarde'], [SAB]: true } }, { t: 'Psicologia' }], device: 't' });
  const data = db.atendimentoPublico(null); assert.ok(data.updatedAt > 0 && data.updatedAt <= Date.now(), 'updatedAt = última mudança no banco');
  const sex = dayOf(data, SEX, V); assert.ok(sex, 'sexta entra por ter configuração da triagem'); assert.equal(sex.source, 'triagem');
  assert.ok(!sex.queues.some((x) => x.place_id === 'jn-r11'), 'desativada na sexta não aparece');
  const ped = sex.queues.find((x) => x.place_id === ex.place_id); assert.equal(ped.extra, true); assert.equal(ped.num, '08');
  assert.deepEqual(ped.items, [{ t: 'Pediatria', shifts: ['manha', 'tarde'] }], 'só o que vale na sexta');
  const r09 = sex.queues.find((x) => x.place_id === 'jn-r09'); assert.equal(r09.name, 'Consulta médica'); assert.equal(r09.num, '08'); assert.equal(r09.extra, false);
  assert.deepEqual(r09.items, [{ t: 'Ginecologia', shifts: ['tarde'] }, { t: 'Psicologia', shifts: null }]);
  // sábado: a sala criada na sexta continua (vale até o fim do evento) com a oferta do sábado; a desativação era só da sexta
  const sab = dayOf(data, SAB, V); assert.equal(sab.source, 'programacao', 'dia de serviços sem ação da triagem nesse dia; as filas mesmo assim refletem a triagem');
  assert.deepEqual(sab.queues.find((x) => x.place_id === ex.place_id).items, [{ t: 'Puericultura', shifts: ['manha'] }]);
  assert.deepEqual(sab.queues.find((x) => x.place_id === 'jn-r09').items, [{ t: 'Ginecologia', shifts: null }, { t: 'Psicologia', shifts: null }]);
  assert.ok(sab.queues.some((x) => x.place_id === 'jn-r11'));
  assert.equal(dayOf(data, '2026-11-05', V), null, 'quinta sem nada da triagem não entra');
});
test('dia desativado pela administração some do retrato; reativado volta', () => {
  db.setDayEnabled({ day: SAB, venue: V, enabled: false, device: 'g' });
  assert.equal(dayOf(db.atendimentoPublico(null), SAB, V), null);
  db.setDayEnabled({ day: SAB, venue: V, enabled: true, device: 'g' });
  assert.ok(dayOf(db.atendimentoPublico(null), SAB, V));
});
