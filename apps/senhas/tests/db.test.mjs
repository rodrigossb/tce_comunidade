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
