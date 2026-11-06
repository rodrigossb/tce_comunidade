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
test('triagem: vale a última contagem por sala e por série (N e P somam nas estatísticas)', async () => {
  db.issued({ day: DAY, venue: V, service_id: S, place_id: P, count: 3, device: 'a' }); await sleep(2);
  db.issued({ day: DAY, venue: V, service_id: S, place_id: P, count: 8, device: 'a' }); await sleep(2);
  db.issued({ day: DAY, venue: V, service_id: S, place_id: P, kind: 'p', count: 2, device: 'a' });
  const st = db.state(DAY, V);
  assert.equal(st.issued.length, 1); assert.equal(st.issued[0].n, 8); assert.equal(st.issued[0].p, 2); assert.equal(st.stats.total.issued, 10);
  assert.equal(db.stats(DAY, V).issued_history.length, 3);
  const q = db.queue(DAY, V, S, P); assert.deepEqual(q.issued, { service_id: S, place_id: P, n: 8, p: 2, ts: q.issued.ts }); assert.equal(q.cfg.n_prefix, 'N');
});
test('chamadas: a próxima espera na porta (não encerra quem está em atendimento); entrou encerra; faltou/desfazer/finalizar', async () => {
  const c1 = db.call({ day: DAY, venue: V, service_id: S, place_id: P, ticket: 1, status: 'served', device: 'a' });
  assert.equal(c1.status, 'served'); await sleep(2);
  const c2 = db.call({ day: DAY, venue: V, service_id: S, place_id: P, ticket: 2, device: 'a' });
  assert.equal(c2.status, 'called');
  let q = db.queue(DAY, V, S, P);
  assert.equal(q.calls[0].id, c2.id); assert.equal(q.last_ticket, 2); assert.equal(q.issued.n + q.issued.p, 10);
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
  assert.equal(name, `atendimentos-${DAY}.csv`); assert.ok(csv.startsWith('﻿id;dia;local;servico;sala;serie;senha'));
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
  const a = db.call({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 1, device: 'a' }); await sleep(20); // folga: setTimeout pode disparar ~1 ms antes
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

test('configuração da fila (fila_cfg): séries N/P, entregues por série, plano pela ordem, chamada marcada pela porta e seq na TV', async () => {
  const P4 = 'jn-r14'; const B = { day: DAY, venue: V, service_id: S, place_id: P4, device: 'a' };
  assert.throws(() => db.setQueueConfig({ ...B, n_prefix: 'X', p_prefix: 'X' }), (e) => e.status === 400);
  const r = db.setQueueConfig({ ...B, n_total: 8, p_total: 4, pattern: '1:2' }); assert.equal(r.count, 1); assert.equal(r.cfg.pattern, '1:2');
  db.issued({ ...B, kind: 'n', count: 8 }); db.issued({ ...B, kind: 'p', count: 4 });
  let q = db.queue(DAY, V, S, P4); assert.equal(q.cfg.n_total, 8); assert.deepEqual(q.plan.next, { ticket: 1, priority: true, why: 'alternado' });
  const c1 = db.call({ ...B, ticket: 1, status: 'served', priority: 1 }); assert.equal(c1.priority, 1, 'a porta informa a série'); await sleep(2);
  q = db.queue(DAY, V, S, P4); assert.deepEqual(q.plan.next, { ticket: 1, priority: false, why: 'alternado' });
  const c2 = db.advance({ ...B, ticket: 1, prev_id: c1.id, prev_status: 'served' }); assert.equal(c2.priority, 0); await sleep(2);
  q = db.queue(DAY, V, S, P4); assert.deepEqual(q.plan.next, { ticket: 2, priority: false, why: 'alternado' }, '1P:2N: segunda comum'); assert.equal(q.last_ticket, 1);
  const tv = db.tvBoard(DAY, V); const pl = tv.places.find((x) => x.place_id === P4);
  assert.equal(pl.seq.normal.last, 1); assert.equal(pl.seq.normal.next, 2); assert.equal(pl.seq.normal.left, 7); assert.equal(pl.seq.prio.last, 1); assert.equal(pl.seq.prio.next, 2); assert.equal(pl.seq.prio.left, 3);
  assert.deepEqual(pl.labels, { n: 'N', p: 'P' }); assert.deepEqual(tv.labels[P4], { n: 'N', p: 'P' });
  assert.equal(db.state(DAY, V).configs.find((x) => x.place_id === P4).p_total, 4);
  // "aplicar a todas": grava em todas as filas ativas do local
  const all = db.setQueueConfig({ day: DAY, venue: V, n_total: 150, p_total: 30, pattern: '1:1', device: 'a', all: true });
  assert.ok(all.count >= 5); assert.equal(db.queue(DAY, V, 'pilar-1', 'jn-r11').cfg.n_total, 150);
  assert.ok(all.count >= 5 && db.state(DAY, V).configs.filter((x) => x.n_total === 150).length === all.count, 'uma configuração por fila ativa');
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
  assert.throws(() => db.addExtra({ day: DAY, venue: V, service_id: S, name: 'Fisioterapia', n_total: -5 }), /total de comuns/);
  const r = db.addExtra({ day: DAY, venue: V, service_id: S, name: 'Nutrição <b>', kind: 'sala', num: '19', n_total: 100, p_total: 20, pattern: '1:1', issued_n: 100, issued_p: 20, device: 't' });
  assert.equal(r.place_id, `${V}-x${r.id}`);
  const st = db.state(DAY, V);
  const e = st.extras.find((x) => x.id === r.place_id); assert.ok(e, 'extra no estado'); assert.equal(e.name, 'Nutrição'); assert.equal(e.kind, 'sala'); assert.equal(e.num, '19'); assert.equal(e.service_id, S); assert.equal(e.extra, true);
  assert.equal(st.issued.find((x) => x.place_id === r.place_id).n, 100); assert.equal(st.issued.find((x) => x.place_id === r.place_id).p, 20);
  assert.equal(st.configs.find((x) => x.place_id === r.place_id).p_total, 20);
  const q = db.queue(DAY, V, S, r.place_id); assert.equal(q.plan.has_prio, true); assert.deepEqual(q.plan.next, { ticket: 1, priority: true, why: 'alternado' }); // intercala: começa pela prioritária
  const tv = db.tvBoard(DAY, V); assert.ok(tv.extras.some((x) => x.id === r.place_id)); assert.ok(tv.places.some((p) => p.place_id === r.place_id && p.issued === 120));
  db.removeExtra(r.id);
  assert.ok(!db.state(DAY, V).extras.some((x) => x.id === r.place_id));
  assert.throws(() => db.removeExtra(r.id), /não encontrada/);
});

test('desativar fila na triagem: entra em disabled (estado e TV) e volta ao reativar', () => {
  db.setQueueEnabled({ day: DAY, venue: V, service_id: S, place_id: P, enabled: false, device: 't' });
  assert.deepEqual(db.state(DAY, V).disabled, [P]); assert.deepEqual(db.tvBoard(DAY, V).disabled, [P]);
  db.setQueueEnabled({ day: DAY, venue: V, service_id: S, place_id: P, enabled: false, device: 't' }); // repetir não duplica
  assert.deepEqual(db.state(DAY, V).disabled, [P]);
  db.setQueueEnabled({ day: DAY, venue: V, service_id: S, place_id: P, enabled: true, device: 't' });
  assert.deepEqual(db.state(DAY, V).disabled, []);
  assert.throws(() => db.setQueueEnabled({ day: DAY, venue: V, service_id: S, place_id: '', enabled: false }), /dados/);
});

test('dias de atendimento desativados pela administração: entram em days_off do local (estado) e em days_off_all (stats); reativar tira', () => {
  db.setDayEnabled({ day: '2026-11-06', venue: V, enabled: false, device: 't' });
  assert.deepEqual(db.state(DAY, V).days_off, ['2026-11-06']); assert.deepEqual(db.state(DAY, 'manga').days_off, [], 'por local');
  db.setDayEnabled({ day: '2026-11-06', venue: V, enabled: false, device: 't' }); // repetir não duplica
  assert.deepEqual(db.stats(DAY, V).days_off_all, [{ day: '2026-11-06', venue: V }]);
  db.setDayEnabled({ day: '2026-11-06', venue: V, enabled: true });
  assert.deepEqual(db.state(DAY, V).days_off, []); assert.deepEqual(db.daysOff(), []);
  assert.throws(() => db.setDayEnabled({ day: 'ontem', venue: V, enabled: false }), /day/);
});

test('ajustar número atual (fila_cursor): sequência recomeça do informado; chamadas anteriores ficam no histórico', async () => {
  const P2 = 'jn-r15';
  db.setQueueConfig({ day: DAY, venue: V, service_id: S, place_id: P2, n_total: 179, p_from: 180, p_total: 21, device: 't' });
  for (const t of [80, 1, 81, 2, 82]) { db.call({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: t, status: 'served', priority: t >= 80 ? 1 : 0, device: 't' }); await sleep(2); }
  db.call({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 84, status: 'served', device: 't' }); await sleep(2); // avançou errado
  let qd = db.queue(DAY, V, S, P2); assert.equal(qd.plan.normal.last, 84);
  assert.throws(() => db.setCursor({ day: DAY, venue: V, service_id: S, place_id: P2, normal: -1 }), /última senha comum/);
  const r = db.setCursor({ day: DAY, venue: V, service_id: S, place_id: P2, normal: 2, prio: 179, device: 't' }); assert.equal(r.ok, true);
  await sleep(2); qd = db.queue(DAY, V, S, P2);
  assert.equal(qd.plan.normal.last, 2); assert.equal(qd.plan.normal.next, 3); assert.equal(qd.plan.prio.next, 180); assert.equal(qd.last_ticket, 2);
  assert.equal(qd.cursor.normal, 2); assert.equal(qd.calls.length, 6); // histórico intacto
  db.call({ day: DAY, venue: V, service_id: S, place_id: P2, ticket: 180, status: 'served', priority: 1, device: 't' }); await sleep(2);
  qd = db.queue(DAY, V, S, P2); assert.deepEqual(qd.plan.next, { ticket: 3, priority: false, why: 'alternado' });
  const tv = db.tvBoard(DAY, V); const pl = tv.places.find((x) => x.place_id === P2); assert.equal(pl.seq.normal.next, 3); assert.equal(pl.seq.prio.last, 180);
  // zerar pela porta
  db.setCursor({ day: DAY, venue: V, service_id: S, place_id: P2, normal: 0, prio: 0, device: 't' }); await sleep(2);
  qd = db.queue(DAY, V, S, P2); assert.equal(qd.plan.normal.next, 1); assert.equal(qd.plan.prio.next, 180);
});

test('setQueueInfo: triagem edita nome, sala e oferta de uma fila fixa (override) e de uma extra; placeOf/mergeExtras aplicam', async () => {
  const { mergeExtras, placeOf, extraQueues } = await import('../lib/filas-extra.js');
  const { TCE: T } = await import('@tce/core');
  const DAYI = '2026-11-07'; const VI = 'jn';
  assert.throws(() => db.setQueueInfo({ day: DAYI, venue: VI, service_id: 'pilar-2', place_id: 'jn-r17', name: 'X' }), /nome/);
  const r = db.setQueueInfo({ day: DAYI, venue: VI, service_id: 'pilar-2', place_id: 'jn-r17', name: 'Identidade (CIN) <b>', kind: 'sala', num: '17A', offer: 'CIN e 2ª via', device: 't' });
  assert.equal(r.name, 'Identidade (CIN)'); assert.equal(r.num, '17A');
  const ex = db.extras(DAYI, VI); const ov = ex.find((e) => e.id === 'jn-r17');
  assert.ok(ov && ov.override && !ov.extra); assert.equal(ov.offer, 'CIN e 2ª via');
  const p = placeOf('jn-r17', ex); assert.equal(p.name, 'Identidade (CIN)'); assert.equal(p.num, '17A'); assert.equal(p.kind, 'sala'); assert.equal(p.venue, 'jn');
  const groups = mergeExtras(T.ticketQueuesOf(VI), ex); const all = groups.flatMap((g) => g.places);
  assert.equal(all.filter((x) => x.id === 'jn-r17').length, 1, 'override não cria fila'); assert.equal(all.find((x) => x.id === 'jn-r17').name, 'Identidade (CIN)');
  assert.ok(!extraQueues(ex).some((q) => q.place.id === 'jn-r17'), 'TV não trata override como fila extra');
  assert.equal(T.placeInfo('jn-r17').name !== 'Identidade (CIN)', true, 'a planta não muda');
  // extra editada
  const a = db.addExtra({ day: DAYI, venue: VI, service_id: 'consulta', name: 'Consulta Médica', kind: 'sala', num: '3', device: 't' });
  db.setQueueInfo({ day: DAYI, venue: VI, service_id: 'consulta', place_id: a.place_id, name: 'Consultas', kind: 'sala', num: '4', offer: 'Clínico geral\nPsicologia; Pediatria', device: 't' });
  const e2 = db.extras(DAYI, VI).find((e) => e.id === a.place_id); assert.ok(e2.extra && !e2.override); assert.equal(e2.name, 'Consultas'); assert.equal(e2.num, '4'); assert.equal(e2.offer, 'Clínico geral; Psicologia; Pediatria', 'uma linha por item vira "; "');
  assert.equal(db.state(DAYI, VI).extras.filter((e) => e.id === a.place_id).length, 1);
  // override numa sala fixa fora do dia de serviços do local não vira fila (fixedQueues vazio) mas placeOf a acha
  const { fixedQueues } = await import('../lib/filas-extra.js');
  assert.ok(fixedQueues('jn', '2026-11-05').length > 0, 'salas da planta valem em qualquer dia do evento'); assert.ok(fixedQueues('jn').length > 0);
});

test('setQueueInfo com itens por dia/turno e senhas por dia: grava items (JSON), vale nos dias seguintes e ajusta fila_cfg de cada dia', () => {
  const VI = 'jn'; const PID = 'jn-r18';
  assert.throws(() => db.setQueueInfo({ day: '2026-11-05', venue: VI, service_id: 'pilar-2', place_id: PID, name: 'Detran', totals: { '2026-11-06': { n: -1 } } }), /senhas por dia/);
  const r = db.setQueueInfo({ day: '2026-11-05', venue: VI, service_id: 'pilar-2', place_id: PID, name: 'Detran', kind: 'sala', num: '18',
    items: [{ t: 'CNH', when: { '2026-11-05': ['tarde'], '2026-11-06': true, '2026-11-09': ['manha'], 'x': true } }, { t: 'Veículos' }, { t: '' }, { t: 'Lei Seca', when: { '2026-11-06': ['madrugada'] } }],
    totals: { '2026-11-05': { n: 50, p: 10 }, '2026-11-06': { n: 80, p: '' }, 'nada': { n: 1 } }, device: 't' });
  assert.deepEqual(r.items, [{ t: 'CNH', when: { '2026-11-05': ['tarde'], '2026-11-06': true, '2026-11-09': ['manha'] } }, { t: 'Veículos' }, { t: 'Lei Seca', when: {} }], 'when vazio = nunca aparece');
  assert.equal(r.offer, 'CNH; Veículos; Lei Seca');
  const today = db.extras('2026-11-05', VI).find((e) => e.id === PID); assert.ok(today.override); assert.deepEqual(today.items[1], { t: 'Veículos' });
  const sat = db.extras('2026-11-07', VI).find((e) => e.id === PID); assert.ok(sat && sat.name === 'Detran', 'a edição vale nos dias seguintes');
  assert.equal(db.queue('2026-11-05', VI, 'pilar-2', PID).cfg.n_total, 50); assert.equal(db.queue('2026-11-05', VI, 'pilar-2', PID).cfg.p_total, 10);
  assert.equal(db.queue('2026-11-06', VI, 'pilar-2', PID).cfg.n_total, 80); assert.equal(db.queue('2026-11-06', VI, 'pilar-2', PID).cfg.p_total, 20, 'P em branco mantém o que havia (padrão)');
  const st = db.state('2026-11-05', VI); assert.equal(st.cfg_days[PID]['2026-11-06'].n_total, 80); assert.ok(st.days.includes('2026-11-07'));
  // extra criada hoje aparece amanhã; removida some de todos os dias
  const a = db.addExtra({ day: '2026-11-05', venue: VI, service_id: 'pilar-5', name: 'Defensoria', kind: 'sala', num: '2', device: 't' });
  assert.ok(db.extras('2026-11-06', VI).some((e) => e.id === a.place_id)); assert.ok(!db.extras('2026-11-04', VI).some((e) => e.id === a.place_id));
  db.removeExtra(a.id); assert.ok(!db.extras('2026-11-06', VI).some((e) => e.id === a.place_id));
});

test('modo "só contagem" por dia: senhas entregues contam como atendidas, a fila some da TV e o modo sobrevive ao padrão para todas', () => {
  const D5 = '2026-11-05'; const VI = 'jn'; const SID = 'amprev';
  const a = db.addExtra({ day: D5, venue: VI, service_id: SID, name: 'AMPREV', kind: 'sala', num: '4', device: 't' });
  db.issued({ day: D5, venue: VI, service_id: SID, place_id: a.place_id, kind: 'n', count: 37, device: 't' });
  db.issued({ day: D5, venue: VI, service_id: SID, place_id: a.place_id, kind: 'p', count: 3, device: 't' });
  let st = db.state(D5, VI); let sv = st.stats.services.find((x) => x.service_id === SID); assert.equal(sv.served, 0); assert.ok(db.tvBoard(D5, VI).places.some((p) => p.place_id === a.place_id));
  assert.equal(db.setQueueMode({ day: D5, venue: VI, service_id: SID, place_id: a.place_id, mode: 'contagem', device: 't' }).mode, 'contagem');
  st = db.state(D5, VI); sv = st.stats.services.find((x) => x.service_id === SID); const pl = sv.places.find((p) => p.place_id === a.place_id);
  assert.equal(pl.served, 40); assert.equal(pl.called, 40); assert.equal(pl.not_called, 0); assert.ok(pl.count_only); assert.equal(sv.served, 40); assert.equal(sv.not_called, 0);
  assert.deepEqual(st.count_only, [a.place_id]); assert.equal(st.cfg_days[a.place_id][D5].mode, 'contagem'); assert.equal(db.queue(D5, VI, SID, a.place_id).cfg.mode, 'contagem');
  const tv = db.tvBoard(D5, VI); assert.ok(!tv.places.some((p) => p.place_id === a.place_id)); assert.ok(tv.disabled.includes(a.place_id)); assert.equal(tv.total.served, undefined);
  // amanhã continua "chamada" (é por dia); o padrão para todas não mexe no modo; setQueueInfo totals.mode muda
  assert.equal(db.queue('2026-11-06', VI, SID, a.place_id).cfg.mode, 'chamada');
  db.setQueueConfig({ day: D5, venue: VI, all: true, n_total: 60, device: 't' }); assert.equal(db.queue(D5, VI, SID, a.place_id).cfg.mode, 'contagem'); assert.equal(db.queue(D5, VI, SID, a.place_id).cfg.n_total, 60);
  db.setQueueInfo({ day: D5, venue: VI, service_id: SID, place_id: a.place_id, name: 'AMPREV', totals: { '2026-11-06': { mode: 'contagem' }, [D5]: { mode: 'chamada' } }, device: 't' });
  assert.equal(db.queue('2026-11-06', VI, SID, a.place_id).cfg.mode, 'contagem'); assert.equal(db.queue(D5, VI, SID, a.place_id).cfg.mode, 'chamada');
  db.removeExtra(a.id);
});
