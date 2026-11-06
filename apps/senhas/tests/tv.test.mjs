// TV das senhas: seleção de filas por parâmetros (salas, serviços, grupos por localização) e quadro do banco.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TCE as T } from '@tce/core';
import { selectQueues, groupsOf, queuesFor, placeIdOf, defaultVenue } from '../lib/tv-grupos.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-tv-'));
process.env.DB_PATH = path.join(dir, 'senhas.db');
const db = await import('../lib/db.js');
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const DAY = '2026-11-07';

test('sem parâmetros: todas as filas do local, ordenadas por número da sala', () => {
  const r = selectQueues({}, DAY);
  assert.equal(r.venue, 'jn'); // 07/11 = dia de serviços na Joaquim Nabuco
  assert.equal(r.queues.length, queuesFor('jn').length);
  assert.ok(r.queues.length >= 20);
  const nums = r.queues.filter((q) => q.place.kind === 'sala').map((q) => Number(q.place.num));
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
  assert.equal(r.unknown.length, 0);
  assert.equal(defaultVenue('2026-11-04'), 'manga');
});
test('grupos entrada/fundos cobrem todos os ambientes visíveis, sem repetir', () => {
  for (const venue of ['jn', 'manga']) {
    const g = groupsOf(venue); const map = T.D.maps[venue];
    const visible = map.places.filter((p) => !p.hide).map((p) => p.id).sort();
    const both = [...g.entrada.places, ...g.fundos.places].sort();
    assert.deepEqual(both, visible, venue);
    assert.ok(g.entrada.places.length && g.fundos.places.length, venue);
  }
  // Joaquim Nabuco: bloco junto ao acesso principal (01–05) na entrada; 13–24 nos fundos.
  const jn = groupsOf('jn');
  for (const id of ['jn-r01', 'jn-r03', 'jn-r05', 'jn-r11']) assert.ok(jn.entrada.places.includes(id), id);
  for (const id of ['jn-r13', 'jn-r17', 'jn-r24', 'jn-triagem']) assert.ok(jn.fundos.places.includes(id), id);
  const e = selectQueues({ grupo: 'entrada' }, DAY); const f = selectQueues({ grupo: 'fundos' }, DAY);
  assert.ok(e.queues.length && f.queues.length);
  assert.equal(e.queues.length + f.queues.length, queuesFor('jn').length);
  assert.equal(e.group.key, 'entrada'); assert.equal(e.title, 'Entrada');
});
test('salas por id ou número, serviços por pilar, parâmetros desconhecidos são informados', () => {
  assert.equal(placeIdOf('jn', '03'), 'jn-r03'); assert.equal(placeIdOf('jn', 'sala 3'), 'jn-r03'); assert.equal(placeIdOf('jn', 't2'), 'jn-t2'); assert.equal(placeIdOf('jn', 'jn-r11'), 'jn-r11');
  assert.equal(placeIdOf('jn', 'xyz'), null);
  const p = new URLSearchParams('local=jn&salas=03,04,t2&servicos=pilar-1&grupo=nada');
  const r = selectQueues(p, DAY);
  assert.deepEqual(r.queues.map((q) => q.place.id), ['jn-r03', 'jn-r04']); // t2 é do pilar 2: filtrado por servicos
  assert.deepEqual(r.unknown, ['grupo nada']);
  const s = selectQueues({ servicos: 'pilar-6' }, DAY);
  assert.ok(s.queues.length && s.queues.every((q) => q.service.id === 'pilar-6'));
  assert.equal(selectQueues({ local: 'manga' }, DAY).venue, 'manga');
});
test('quadro da TV: senha atual por sala, aguardando e últimas chamadas', async () => {
  db.issued({ day: DAY, venue: 'jn', service_id: 'pilar-1', place_id: 'jn-r11', count: 5, device: 't' });
  db.call({ day: DAY, venue: 'jn', service_id: 'pilar-1', place_id: 'jn-r11', ticket: 1, status: 'served', device: 't' });
  await new Promise((r) => setTimeout(r, 3));
  const c2 = db.call({ day: DAY, venue: 'jn', service_id: 'pilar-1', place_id: 'jn-r11', ticket: 2, device: 't' });
  const c3 = db.call({ day: DAY, venue: 'jn', service_id: 'pilar-2', place_id: 'jn-r17', ticket: 7, status: 'served', device: 't' });
  const b = db.tvBoard(DAY, 'jn');
  const r11 = b.places.find((p) => p.place_id === 'jn-r11');
  assert.equal(r11.current.ticket, 2); assert.equal(r11.current.status, 'called'); assert.equal(r11.waiting, 3); assert.equal(r11.issued, 5);
  assert.equal(b.recent[0].id, c3.id); assert.equal(b.recent[1].id, c2.id); assert.equal(b.recent.length, 3);
  // jn-r17 chamou a 7 sem a triagem ter lançado nada: a porta passou a contar 7 entregues (6 aguardando) → 3 + 6
  assert.equal(b.places.find((p) => p.place_id === 'jn-r17').issued, 7); assert.equal(b.total.waiting, 9);
  assert.throws(() => db.tvBoard('ontem', 'jn'), (e) => e.status === 400);
});

test('grupos configurados na triagem: ?grupo=<chave> usa o grupo da API (prevalece sobre o automático) e marca custom', () => {
  const custom = [{ key: 'bloco-b', name: 'Bloco B', places: ['jn-r14', 'jn-r15', 'jn-x9'] }, { key: 'entrada', name: 'Entrada (ajustada)', places: ['jn-r03'] }];
  const g = groupsOf('jn', custom); assert.equal(g['bloco-b'].custom, true); assert.deepEqual(g.entrada.places, ['jn-r03']); assert.equal(g.fundos.auto, true);
  const r = selectQueues({ local: 'jn', grupo: 'bloco-b' }, DAY, custom);
  assert.deepEqual(r.queues.map((q) => q.place.id).sort(), ['jn-r14', 'jn-r15'], 'jn-x9 é extra da triagem: entra pela API, não pela planta');
  assert.equal(r.custom, true); assert.ok(r.places.has('jn-x9')); assert.equal(r.title, 'Bloco B'); assert.deepEqual(r.unknown, []);
  const e = selectQueues({ local: 'jn', grupo: 'entrada' }, DAY, custom); assert.deepEqual(e.queues.map((q) => q.place.id), ['jn-r03']); assert.equal(e.custom, true);
  const auto = selectQueues({ local: 'jn', grupo: 'fundos' }, DAY, custom); assert.equal(auto.custom, false); assert.ok(auto.places.size > 3);
  const none = selectQueues({ local: 'jn' }, DAY, custom); assert.equal(none.places, null); assert.equal(none.custom, false);
  assert.deepEqual(selectQueues({ local: 'jn', grupo: 'bloco-b' }, DAY).unknown, ['grupo bloco-b'], 'sem a API, chave desconhecida');
});
