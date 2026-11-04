// Banco do controle de senhas (node --test): usa um SQLite temporário via DB_PATH.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-senhas-'));
process.env.DB_PATH = path.join(dir, 'senhas.db');
const db = await import('../lib/db.js');
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const DAY = '2026-11-07'; const V = 'jn'; const S = 'pilar-1'; const P = 'jn-r11';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('validação: dia/local/serviço inválidos dão erro 400', () => {
  assert.throws(() => db.state('07/11', V), (e) => e.status === 400);
  assert.throws(() => db.issued({ day: DAY, venue: V, service_id: S, count: -1 }), (e) => e.status === 400);
  assert.throws(() => db.call({ day: DAY, venue: V, service_id: S, place_id: P, ticket: 'x' }), (e) => e.status === 400);
  assert.throws(() => db.setStatus(999, 'served'), (e) => e.status === 404);
  assert.throws(() => db.exportCsv('hoje'), (e) => e.status === 400);
});
test('triagem: vale a última contagem por sala', async () => {
  db.issued({ day: DAY, venue: V, service_id: S, place_id: P, count: 3, device: 'a' }); await sleep(2);
  db.issued({ day: DAY, venue: V, service_id: S, place_id: P, count: 10, device: 'a' });
  const st = db.state(DAY, V);
  assert.equal(st.issued.length, 1); assert.equal(st.issued[0].count, 10); assert.equal(st.stats.total.issued, 10);
  assert.equal(db.stats(DAY, V).issued_history.length, 2);
});
test('chamadas: a próxima espera na porta (não encerra quem está em atendimento); entrou encerra; faltou/desfazer/finalizar', async () => {
  const c1 = db.call({ day: DAY, venue: V, service_id: S, place_id: P, ticket: 1, status: 'served', device: 'a' });
  assert.equal(c1.status, 'served'); await sleep(2);
  const c2 = db.call({ day: DAY, venue: V, service_id: S, place_id: P, ticket: 2, device: 'a' });
  assert.equal(c2.status, 'called');
  let q = db.queue(DAY, V, S, P);
  assert.equal(q.calls[0].id, c2.id); assert.equal(q.last_ticket, 2); assert.equal(q.issued.count, 10);
  assert.equal(q.calls.find((x) => x.id === c1.id).ended_at, null, 'chamar a próxima não encerra quem está em atendimento');
  assert.deepEqual(q.open, [c1.id]);
  const tv = db.tvBoard(DAY, V); const pl = tv.places.find((x) => x.place_id === P); assert.equal(pl.current.ticket, 2); assert.equal(pl.serving.ticket, 1);
  db.setStatus(c2.id, 'served'); q = db.queue(DAY, V, S, P); assert.ok(q.calls.find((x) => x.id === c1.id).ended_at, 'entrou encerra o atendimento anterior'); assert.deepEqual(q.open, [c2.id]);
  db.setStatus(c2.id, 'absent'); q = db.queue(DAY, V, S, P); assert.equal(q.calls[0].status, 'absent');
  db.setStatus(c2.id, 'called'); q = db.queue(DAY, V, S, P); assert.equal(q.calls[0].status, 'called'); assert.equal(q.calls[0].status_at, null);
  db.setStatus(c2.id, 'served'); q = db.queue(DAY, V, S, P); assert.deepEqual(q.open, [c2.id]);
  db.endCall(c2.id); q = db.queue(DAY, V, S, P); assert.deepEqual(q.open, []); assert.ok(q.calls[0].ended_at);
  const c3 = db.call({ day: DAY, venue: V, service_id: S, place_id: P, ticket: 3, device: 'a' });
  assert.deepEqual(db.setStatus(c3.id, 'undo'), { ok: true, deleted: true });
  q = db.queue(DAY, V, S, P); assert.equal(q.calls.length, 2); assert.equal(q.last_ticket, 2);
  const st = db.state(DAY, V); assert.equal(st.stats.total.called, 2); assert.equal(st.stats.total.served, 2); assert.equal(st.stats.total.not_called, 8);
});
test('CSV do dia com BOM, cabeçalho e uma linha por chamada', () => {
  const { csv, name } = db.exportCsv(DAY);
  assert.equal(name, `atendimentos-${DAY}.csv`); assert.ok(csv.startsWith('﻿id;dia;local'));
  assert.equal(csv.split('\n').length, 3);
  assert.equal(db.exportCsv('2026-11-04').csv.split('\n').length, 1);
});

test('chamar novamente: marca recalled_at na senha que está chamando, aparece no quadro da TV e recusa senha já resolvida', () => {
  const DAY2 = '2026-11-07'; const V2 = 'jn'; const S2 = 'pilar-1'; const P2 = 'jn-r03';
  const c = db.call({ day: DAY2, venue: V2, service_id: S2, place_id: P2, ticket: 41 });
  const r = db.recall(c.id); assert.ok(r.ok && r.recalled_at > 0);
  const b = db.tvBoard(DAY2, V2); assert.equal(b.recent.find((x) => x.id === c.id).recalled_at, r.recalled_at);
  db.setStatus(c.id, 'served'); assert.ok(db.recall(c.id).ok, 'na sala (entrou e não encerrou) ainda pode chamar de novo');
  db.endCall(c.id); assert.throws(() => db.recall(c.id), (e) => e.status === 409);
  assert.throws(() => db.recall(999999), (e) => e.status === 404);
});

test('chamar a próxima (advance): a anterior sai como atendida contando desde a chamada, ou como falta; e a próxima é chamada', async () => {
  const P2 = 'jn-r12';
  const a = db.call({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 1, device: 'a' }); await sleep(5);
  const r = db.advance({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 2, device: 'a', prev_id: a.id, prev_status: 'served' });
  assert.equal(r.status, 'served', 'a próxima entra no ato');
  let q = db.queue(DAY, V, S, P2); const pa = q.calls.find((x) => x.id === a.id);
  assert.equal(pa.status, 'served'); assert.equal(pa.status_at, pa.called_at, 'entrou quando foi chamada'); assert.ok(pa.ended_at >= pa.called_at + 5, 'saiu ao chamar a próxima');
  assert.equal(q.calls[0].id, r.id); assert.equal(q.calls[0].status, 'served'); assert.deepEqual(q.open, [r.id], 'só a senha da vez fica em atendimento');
  const r2 = db.advance({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 3, device: 'a', prev_id: r.id, prev_status: 'absent' });
  q = db.queue(DAY, V, S, P2); assert.equal(q.calls.find((x) => x.id === r.id).status, 'absent'); assert.equal(q.calls[0].id, r2.id); assert.equal(q.last_ticket, 3);
  // anterior já encerrada: só chama a próxima (não vira falta)
  db.setStatus(r2.id, 'served'); db.endCall(r2.id); const r3 = db.advance({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 4, device: 'a', prev_id: r2.id, prev_status: 'absent' });
  q = db.queue(DAY, V, S, P2); assert.equal(q.calls.find((x) => x.id === r2.id).status, 'served'); assert.equal(q.calls[0].id, r3.id);
});

test('senha prioritária: chamada fora da ordem, entra no ato, não avança a sequência normal e aparece marcada na TV', async () => {
  const P3 = 'jn-r13';
  db.call({ day: DAY, venue: V, service_id: S, place_id: P3, ticket: 5, status: 'served', device: 'a' }); await sleep(2);
  const pr = db.call({ day: DAY, venue: V, service_id: S, place_id: P3, ticket: 57, status: 'served', priority: 1, device: 'a' });
  assert.equal(pr.priority, 1);
  const q = db.queue(DAY, V, S, P3);
  assert.equal(q.last_ticket, 5, 'a próxima comum continua sendo a 6'); assert.equal(q.calls[0].ticket, 57); assert.equal(q.calls[0].priority, 1);
  assert.ok(q.calls.find((x) => x.ticket === 5).ended_at, 'a prioritária encerra quem estava na sala');
  const tv = db.tvBoard(DAY, V); const pl = tv.places.find((x) => x.place_id === P3); assert.equal(pl.current.ticket, 57); assert.equal(pl.current.priority, 1);
  assert.equal(tv.recent.find((x) => x.id === pr.id).priority, 1);
});

test('prioridades da triagem: lista/intervalos gravados, plano intercalado na fila, chamada classificada pelo servidor e seq na TV', async () => {
  const P4 = 'jn-r14'; const B = { day: DAY, venue: V, service_id: S, place_id: P4, device: 'a' };
  db.issued({ ...B, count: 12 });
  assert.throws(() => db.priorities({ ...B, spec: '3, x' }), (e) => e.status === 400);
  assert.deepEqual(db.priorities({ ...B, spec: '12-10, 3' }).spec, '3, 10-12');
  let q = db.queue(DAY, V, S, P4); assert.equal(q.prio_spec, '3, 10-12'); assert.deepEqual(q.plan.next, { ticket: 3, priority: true, why: 'alternado' });
  const c1 = db.call({ ...B, ticket: 3, status: 'served' }); assert.equal(c1.priority, 1, 'classificada pela lista'); await sleep(2);
  q = db.queue(DAY, V, S, P4); assert.deepEqual(q.plan.next, { ticket: 1, priority: false, why: 'alternado' });
  const c2 = db.advance({ ...B, ticket: 1, prev_id: c1.id, prev_status: 'served' }); assert.equal(c2.priority, 0);
  q = db.queue(DAY, V, S, P4); assert.equal(q.plan.next.ticket, 10); assert.equal(q.last_ticket, 1);
  const tv = db.tvBoard(DAY, V); const pl = tv.places.find((x) => x.place_id === P4);
  assert.deepEqual(pl.seq.normal, { last: 1, next: 2, left: 7, total: 8 }); assert.deepEqual(pl.seq.prio, { last: 3, next: 10, left: 3, total: 4 });
  assert.equal(db.state(DAY, V).priorities.find((x) => x.place_id === P4).spec, '3, 10-12');
  assert.equal(tv.places.find((x) => x.place_id === P).seq, null, 'sala sem prioritárias não mostra filas');
});

test('lugares do mapa: cria, atualiza, valida e remove', () => {
  assert.throws(() => db.saveLugar({ name: 'X', kind: 'hotel', lat: 3.84, lng: -51.83 }), (e) => e.status === 400); // nome curto
  assert.throws(() => db.saveLugar({ name: 'Hotel Teste', kind: 'spa', lat: 3.84, lng: -51.83 }), (e) => e.status === 400); // tipo
  assert.throws(() => db.saveLugar({ name: 'Hotel Teste', kind: 'hotel', lat: 0, lng: -51.83 }), (e) => e.status === 400); // fora da região
  const a = db.saveLugar({ name: 'Hotel Teste', kind: 'hotel', address: 'Rua A, 1', lat: '3,8440', lng: '-51,8350', phone: '(96) 9999-0000', device: 'd1' });
  assert.ok(a.ok && a.id > 0);
  const b = db.saveLugar({ name: 'Restaurante Beira Rio', kind: 'restaurante', lat: 3.845, lng: -51.836 });
  let list = db.lugares(); assert.equal(list.length, 2); assert.equal(list[0].kind, 'hotel'); assert.equal(list[0].lat, 3.844); assert.equal(list[0].phone, '(96) 9999-0000');
  db.saveLugar({ id: a.id, name: 'Hotel Teste Novo', kind: 'hotel', lat: 3.8441, lng: -51.8351 });
  list = db.lugares(); assert.equal(list.find((l) => l.id === a.id).name, 'Hotel Teste Novo');
  assert.throws(() => db.saveLugar({ id: 999, name: 'Nada', kind: 'outro', lat: 3.84, lng: -51.83 }), (e) => e.status === 404);
  db.deleteLugar(b.id); assert.equal(db.lugares().length, 1);
  assert.throws(() => db.deleteLugar(b.id), (e) => e.status === 404);
});

test('filas extras: criar na triagem já lança o padrão de senhas e prioritárias; entra no estado e na TV; remover tira', () => {
  assert.throws(() => db.addExtra({ day: DAY, venue: V, service_id: 'nada', name: 'Fisioterapia' }), /pilar/);
  assert.throws(() => db.addExtra({ day: DAY, venue: V, service_id: S, name: 'F' }), /nome/);
  assert.throws(() => db.addExtra({ day: DAY, venue: V, service_id: S, name: 'Fisioterapia', spec: '80-' }), /não entendi/);
  const r = db.addExtra({ day: DAY, venue: V, service_id: S, name: 'Nutrição <b>', kind: 'sala', num: '19', count: 100, spec: '80-100', device: 't' });
  assert.equal(r.place_id, `${V}-x${r.id}`);
  const st = db.state(DAY, V);
  const e = st.extras.find((x) => x.id === r.place_id); assert.ok(e, 'extra no estado'); assert.equal(e.name, 'Nutrição'); assert.equal(e.kind, 'sala'); assert.equal(e.num, '19'); assert.equal(e.service_id, S); assert.equal(e.extra, true);
  assert.equal(st.issued.find((x) => x.place_id === r.place_id).count, 100);
  assert.equal(st.priorities.find((x) => x.place_id === r.place_id).spec, '80-100');
  const q = db.queue(DAY, V, S, r.place_id); assert.equal(q.plan.has_prio, true); assert.equal(q.plan.next.ticket, 80); // intercala: começa pela prioritária
  const tv = db.tvBoard(DAY, V); assert.ok(tv.extras.some((x) => x.id === r.place_id)); assert.ok(tv.places.some((p) => p.place_id === r.place_id && p.issued === 100));
  db.removeExtra(r.id);
  assert.ok(!db.state(DAY, V).extras.some((x) => x.id === r.place_id));
  assert.throws(() => db.removeExtra(r.id), /não encontrada/);
});
