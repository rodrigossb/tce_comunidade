// Banco do controle de senhas: SQLite embutido do Node (node:sqlite), sem dependências nativas.
// Mesmo esquema do backend antigo (server/senhas.js): tabelas issued_log e calls. Usado só no servidor
// (server actions, route handlers, scripts). Conexão única guardada em globalThis para sobreviver ao HMR.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { summarize } from '@tce/core/stats';
import { parsePrioList, queuePlan } from '@tce/core/fila';
import { normalizeLugar } from '@tce/core/lugares';
import { TCE as T } from '@tce/core';
import { notify } from './bus.js';

export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const err = (status, msg) => new ApiError(status, msg);
export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const clean = (s, n) => String(s == null ? '' : s).slice(0, n || 64).replace(/[^\w.@:\- ]/g, '');
export const dbPath = () => process.env.DB_PATH || path.join(process.cwd(), 'data', 'senhas.db');

const DDL = `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS issued_log (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, count INTEGER NOT NULL, device TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS issued_day ON issued_log(day, venue, service_id, ts);
CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, ticket INTEGER, called_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'called', status_at INTEGER, ended_at INTEGER, device TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS calls_day ON calls(day, venue, service_id, place_id, called_at);
CREATE TABLE IF NOT EXISTS prio_log (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, spec TEXT NOT NULL, device TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS prio_day ON prio_log(day, venue, service_id, place_id, ts);
CREATE TABLE IF NOT EXISTS inscritos_snap (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, painel_info TEXT, source TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lugares (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, address TEXT, lat REAL NOT NULL, lng REAL NOT NULL, note TEXT, phone TEXT, device TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS filas_extra (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, kind TEXT NOT NULL, num TEXT NOT NULL DEFAULT '', device TEXT, created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);`;

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(DDL);
  if (!db.prepare(`PRAGMA table_info(issued_log)`).all().some((c) => c.name === 'place_id')) db.exec(`ALTER TABLE issued_log ADD COLUMN place_id TEXT NOT NULL DEFAULT ''`);
  if (!db.prepare(`PRAGMA table_info(calls)`).all().some((c) => c.name === 'recalled_at')) db.exec(`ALTER TABLE calls ADD COLUMN recalled_at INTEGER`); // "chamar novamente" (reanuncia na TV)
  if (!db.prepare(`PRAGMA table_info(calls)`).all().some((c) => c.name === 'priority')) db.exec(`ALTER TABLE calls ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`); // senha prioritária, chamada fora da ordem (não avança a sequência)
  const q = {
    issuedLatest: db.prepare(`SELECT service_id, place_id, count, ts FROM issued_log i WHERE day=? AND venue=? AND ts=(SELECT MAX(ts) FROM issued_log WHERE day=i.day AND venue=i.venue AND service_id=i.service_id AND place_id=i.place_id)`),
    issuedInsert: db.prepare(`INSERT INTO issued_log (day, venue, service_id, place_id, count, device, ts) VALUES (?,?,?,?,?,?,?)`),
    prioLatest: db.prepare(`SELECT service_id, place_id, spec, ts FROM prio_log p WHERE day=? AND venue=? AND ts=(SELECT MAX(ts) FROM prio_log WHERE day=p.day AND venue=p.venue AND service_id=p.service_id AND place_id=p.place_id)`),
    prioInsert: db.prepare(`INSERT INTO prio_log (day, venue, service_id, place_id, spec, device, ts) VALUES (?,?,?,?,?,?,?)`),
    prioOf: db.prepare(`SELECT spec FROM prio_log WHERE day=? AND venue=? AND service_id=? AND place_id=? ORDER BY ts DESC, id DESC LIMIT 1`),
    callsAllPlace: db.prepare(`SELECT id, ticket, called_at FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=?`),
    issuedHistory: db.prepare(`SELECT service_id, place_id, count, ts FROM issued_log WHERE day=? AND venue=? ORDER BY ts`),
    callsDay: db.prepare(`SELECT * FROM calls WHERE day=? AND venue=? ORDER BY called_at, id`),
    callsPlace: db.prepare(`SELECT * FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=? ORDER BY called_at DESC, id DESC LIMIT ?`),
    callInsert: db.prepare(`INSERT INTO calls (day, venue, service_id, place_id, ticket, called_at, status, device, priority) VALUES (?,?,?,?,?,?,'called',?,?)`),
    callGet: db.prepare(`SELECT * FROM calls WHERE id=?`),
    callStatus: db.prepare(`UPDATE calls SET status=?, status_at=? WHERE id=?`),
    callEnd: db.prepare(`UPDATE calls SET ended_at=? WHERE id=?`),
    callDelete: db.prepare(`DELETE FROM calls WHERE id=?`),
    callRecall: db.prepare(`UPDATE calls SET recalled_at=? WHERE id=?`),
    openServed: db.prepare(`SELECT id FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=? AND status='served' AND ended_at IS NULL`),
    lastTicket: db.prepare(`SELECT MAX(ticket) t FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=? AND priority=0`), // a sequência normal ignora as prioritárias
    exportDay: db.prepare(`SELECT * FROM calls WHERE day=? ORDER BY venue, service_id, place_id, called_at`),
    snapInsert: db.prepare(`INSERT INTO inscritos_snap (ts, painel_info, source, data) VALUES (?,?,?,?)`),
    snapLatest: db.prepare(`SELECT ts, painel_info, source, data FROM inscritos_snap ORDER BY ts DESC, id DESC LIMIT 1`),
    snapPrune: db.prepare(`DELETE FROM inscritos_snap WHERE id NOT IN (SELECT id FROM inscritos_snap ORDER BY ts DESC, id DESC LIMIT 500)`),
    lugarAll: db.prepare(`SELECT id, name, kind, address, lat, lng, note, phone, created_at, updated_at FROM lugares WHERE deleted=0 ORDER BY kind, name`),
    lugarGet: db.prepare(`SELECT * FROM lugares WHERE id=?`),
    lugarInsert: db.prepare(`INSERT INTO lugares (name, kind, address, lat, lng, note, phone, device, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`),
    lugarUpdate: db.prepare(`UPDATE lugares SET name=?, kind=?, address=?, lat=?, lng=?, note=?, phone=?, device=?, updated_at=? WHERE id=?`),
    lugarDelete: db.prepare(`UPDATE lugares SET deleted=1, updated_at=? WHERE id=?`),
    extraAll: db.prepare(`SELECT id, service_id, place_id, name, kind, num, created_at FROM filas_extra WHERE day=? AND venue=? AND deleted=0 ORDER BY id`),
    extraGet: db.prepare(`SELECT * FROM filas_extra WHERE id=?`),
    extraInsert: db.prepare(`INSERT INTO filas_extra (day, venue, service_id, place_id, name, kind, num, device, created_at) VALUES (?,?,?,?,?,?,?,?,?)`),
    extraSetPlace: db.prepare(`UPDATE filas_extra SET place_id=? WHERE id=?`),
    extraDelete: db.prepare(`UPDATE filas_extra SET deleted=1 WHERE id=?`),
  };
  return { db, q, file };
}
/** Conexão única por caminho (globalThis: o Next recarrega módulos em desenvolvimento). */
export function conn() {
  const file = dbPath(); const g = globalThis;
  if (!g.__tceSenhas || g.__tceSenhas.file !== file) { if (g.__tceSenhas) { try { g.__tceSenhas.db.close(); } catch { /* */ } } g.__tceSenhas = open(file); }
  return g.__tceSenhas;
}
export function close() { const g = globalThis; if (g.__tceSenhas) { try { g.__tceSenhas.db.close(); } catch { /* */ } g.__tceSenhas = null; } }

const D = T.D;
const num = (x) => (typeof x === 'bigint' ? Number(x) : x);
const rows = (list) => list.map((r) => { const o = {}; for (const k of Object.keys(r)) o[k] = num(r[k]); return o; });

// ---- domínio (todas lançam ApiError com status em entrada inválida) ----
function ctx(day, venue) { const v = clean(venue, 16); if (!isDay(day) || !v) throw err(400, 'day/venue'); return { day, venue: v }; }

export function state(day, venue) {
  const c = ctx(day, venue); const { q } = conn();
  const issued = rows(q.issuedLatest.all(c.day, c.venue)); const calls = rows(q.callsDay.all(c.day, c.venue));
  return { day: c.day, venue: c.venue, now: Date.now(), issued, priorities: rows(q.prioLatest.all(c.day, c.venue)), stats: summarize(issued, calls, Date.now()), extras: extras(c.day, c.venue) };
}
export function stats(day, venue) {
  const st = state(day, venue); const { q } = conn();
  st.issued_history = rows(q.issuedHistory.all(st.day, st.venue));
  return st;
}
export function queue(day, venue, service, place) {
  const c = ctx(day, venue); const s = clean(service, 32); const p = clean(place, 32); if (!s || !p) throw err(400, 'parâmetros');
  const { q } = conn();
  const issuedRow = rows(q.issuedLatest.all(c.day, c.venue)).find((x) => x.place_id === p) || null;
  const spec = prioSpec(c.day, c.venue, s, p);
  return {
    calls: rows(q.callsPlace.all(c.day, c.venue, s, p, 30)),
    open: q.openServed.all(c.day, c.venue, s, p).map((x) => num(x.id)),
    last_ticket: num(q.lastTicket.get(c.day, c.venue, s, p).t),
    issued: issuedRow,
    prio_spec: spec,
    plan: planOf(c.day, c.venue, s, p, issuedRow ? issuedRow.count : null, spec),
  };
}
/** Lista de senhas prioritárias da sala (texto normalizado) ou ''. */
function prioSpec(day, venue, s, p) { const r = conn().q.prioOf.get(day, venue, s, p); return r ? String(r.spec) : ''; }
/** Plano da fila (próxima comum/prioritária, intercalação) a partir de tudo que já foi chamado na sala. */
function planOf(day, venue, s, p, count, spec) { return queuePlan({ count: count == null ? null : num(count), prio: parsePrioList(spec || '').nums, calls: rows(conn().q.callsAllPlace.all(day, venue, s, p)) }); }
/** Triagem: senhas prioritárias da sala ("5, 12, 100-120"); vale a última gravação. */
export function priorities(b) {
  if (!isDay(b.day) || !clean(b.venue, 16) || !clean(b.service_id, 32) || !clean(b.place_id, 32)) throw err(400, 'dados');
  const parsed = parsePrioList(b.spec); if (parsed.error) throw err(400, parsed.error);
  const ts = Date.now(); conn().q.prioInsert.run(b.day, clean(b.venue, 16), clean(b.service_id, 32), clean(b.place_id, 32), parsed.spec, clean(b.device, 40), ts);
  notify(b.day, clean(b.venue, 16)); return { ok: true, ts, spec: parsed.spec, count: parsed.nums.length };
}
export function issued(b) {
  const count = Number(b.count);
  if (!isDay(b.day) || !clean(b.venue, 16) || !clean(b.service_id, 32) || !Number.isInteger(count) || count < 0 || count > 100000) throw err(400, 'dados');
  const ts = Date.now(); conn().q.issuedInsert.run(b.day, clean(b.venue, 16), clean(b.service_id, 32), clean(b.place_id, 32), count, clean(b.device, 40), ts);
  notify(b.day, clean(b.venue, 16)); return { ok: true, ts };
}
export function call(b) {
  const day = b.day; const venue = clean(b.venue, 16); const s = clean(b.service_id, 32); const p = clean(b.place_id, 32); const ticket = b.ticket == null ? null : Number(b.ticket);
  if (!isDay(day) || !venue || !s || !p || (ticket != null && (!Number.isInteger(ticket) || ticket < 0 || ticket > 100000))) throw err(400, 'dados');
  const { q } = conn(); const now = Date.now();
  const status = ['served', 'absent'].includes(b.status) ? b.status : null;
  // Prioritária = está na lista da triagem para esta sala (ou veio marcada explicitamente).
  const priority = b.priority != null ? (b.priority ? 1 : 0) : (ticket != null && parsePrioList(prioSpec(day, venue, s, p)).nums.includes(ticket) ? 1 : 0);
  // Porta da sala: a chamada já é a entrada (status served no ato), e entrar encerra quem estava em atendimento na mesma
  // sala. Uma chamada sem status ("called") fica aguardando e não encerra ninguém.
  if (status === 'served') for (const o of q.openServed.all(day, venue, s, p)) q.callEnd.run(now, o.id);
  const r = q.callInsert.run(day, venue, s, p, ticket, now, clean(b.device, 40), priority);
  const id = Number(r.lastInsertRowid);
  if (status) q.callStatus.run(status, now, id);
  notify(day, venue); return { ok: true, id, called_at: now, status: status || 'called', priority };
}
export function setStatus(idRaw, status) {
  const id = Number(idRaw); const { q } = conn(); const c = q.callGet.get(id); if (!c) throw err(404, 'chamada não encontrada');
  const now = Date.now();
  if (status === 'undo') { q.callDelete.run(id); notify(c.day, c.venue); return { ok: true, deleted: true }; }
  if (status === 'called') { q.callStatus.run('called', null, id); q.callEnd.run(null, id); notify(c.day, c.venue); return { ok: true }; }
  if (!['served', 'absent'].includes(status)) throw err(400, 'status');
  if (status === 'served') for (const o of q.openServed.all(c.day, c.venue, c.service_id, c.place_id)) if (num(o.id) !== id) q.callEnd.run(now, o.id);
  q.callStatus.run(status, now, id); if (status === 'absent') q.callEnd.run(null, id);
  notify(c.day, c.venue); return { ok: true, status_at: now };
}
/** Fluxo "chamada = entra na sala": a senha que estava na sala sai (atendida, já registrada como "entrou" no momento da
    chamada; ou "não veio", se o operador disser) e a próxima é chamada numa só gravação (uma ida ao servidor, um item
    na fila offline). A próxima entra no ato (served), o que encerra a anterior com o tempo entre as duas chamadas. */
export function advance(b) {
  const prevId = Number(b.prev_id); const { q } = conn(); const prev = prevId ? q.callGet.get(prevId) : null; const now = Date.now();
  if (prev && prev.status !== 'absent' && !prev.ended_at) {
    if (b.prev_status === 'absent') { q.callStatus.run('absent', now, prevId); q.callEnd.run(null, prevId); }
    else if (prev.status === 'called') q.callStatus.run('served', prev.called_at, prevId); // chamada antiga (sem entrada no ato): entrou quando foi chamada
  }
  return call(Object.assign({}, b, { status: 'served' }));
}
/** Chamar novamente: a senha continua a mesma (sem nova chamada no histórico), mas a TV volta a anunciá-la. Só para a senha
    da vez (chamando, ou na sala e ainda não encerrada). */
export function recall(idRaw) {
  const id = Number(idRaw); const { q } = conn(); const c = q.callGet.get(id); if (!c) throw err(404, 'chamada não encontrada');
  if (c.status === 'absent' || c.ended_at) throw err(409, 'essa senha já foi encerrada ou faltou');
  const now = Date.now(); q.callRecall.run(now, id); notify(c.day, c.venue); return { ok: true, recalled_at: now };
}
export function endCall(idRaw) {
  const id = Number(idRaw); const { q } = conn(); const c = q.callGet.get(id); if (!c) throw err(404, 'chamada não encontrada');
  const now = Date.now(); q.callEnd.run(now, id); notify(c.day, c.venue); return { ok: true, ended_at: now };
}
/** Quadro da TV (público, só leitura): situação de cada sala (senha atual, aguardando) e as últimas chamadas do dia. */
export function tvBoard(day, venue) {
  const c = ctx(day, venue); const { q } = conn(); const now = Date.now();
  const issued = rows(q.issuedLatest.all(c.day, c.venue)); const calls = rows(q.callsDay.all(c.day, c.venue));
  const st = summarize(issued, calls, now);
  // Quem está em atendimento agora em cada sala (entrou e ainda não saiu), além da última chamada (que pode estar na porta).
  const serving = {};
  for (const c of calls) if (c.status === 'served' && !c.ended_at) { const k = c.place_id; if (!serving[k] || c.status_at > serving[k].status_at) serving[k] = { id: c.id, ticket: c.ticket, status_at: c.status_at }; }
  const places = [];
  const prios = {}; for (const r of rows(q.prioLatest.all(c.day, c.venue))) prios[`${r.service_id}|${r.place_id}`] = r.spec;
  const issuedBy = {}; for (const r of issued) issuedBy[r.place_id] = r.count;
  for (const s of st.services) for (const p of s.places) {
    const spec = prios[`${s.service_id}|${p.place_id}`] || '';
    const plan = queuePlan({ count: issuedBy[p.place_id] == null ? null : issuedBy[p.place_id], prio: parsePrioList(spec).nums, calls: calls.filter((x) => x.service_id === s.service_id && x.place_id === p.place_id) });
    // seq: o que a TV mostra de cada fila (última e próxima comum/prioritária) — só quando a sala tem prioritárias
    places.push({ service_id: s.service_id, place_id: p.place_id, issued: p.issued || 0, called: p.called || 0, waiting: p.not_called || 0, in_service: p.in_service || 0, current: p.current || null, serving: serving[p.place_id] && (!p.current || serving[p.place_id].id !== p.current.id) ? serving[p.place_id] : null, seq: plan.has_prio ? { normal: plan.normal, prio: plan.prio, next: plan.next } : null });
  }
  const recent = calls.slice().sort((a, b) => b.called_at - a.called_at || b.id - a.id).slice(0, 60)
    .map((x) => ({ id: x.id, ticket: x.ticket, service_id: x.service_id, place_id: x.place_id, status: x.status, called_at: x.called_at, recalled_at: x.recalled_at || null, priority: x.priority ? 1 : 0, status_at: x.status_at, ended_at: x.ended_at }));
  return { day: c.day, venue: c.venue, now, places, recent, extras: extras(c.day, c.venue), total: { issued: st.total.issued, called: st.total.called, waiting: st.total.not_called, in_service: st.total.in_service } };
}
/** Chamadas do dia no local (para o dashboard: séries por hora e linha do tempo). */
export function callsOfDay(day, venue) { const c = ctx(day, venue); return rows(conn().q.callsDay.all(c.day, c.venue)); }
export function exportCsv(day) {
  if (!isDay(day)) throw err(400, 'day');
  const list = rows(conn().q.exportDay.all(day)); const iso = (t) => (t ? new Date(t).toISOString() : '');
  const csv = ['id;dia;local;servico;sala;senha;chamada_em;status;status_em;fim_em;aparelho'].concat(list.map((r) => [r.id, r.day, r.venue, r.service_id, r.place_id, r.ticket ?? '', iso(r.called_at), r.status, iso(r.status_at), iso(r.ended_at), r.device || ''].join(';'))).join('\n');
  return { csv: '﻿' + csv, name: `atendimentos-${day}.csv` };
}

// ---- inscritos (painel da ESCON): último retrato recebido do coletor ----
/** Grava um retrato { byId, painelInfo, source }; mantém os últimos 500. */
export function saveInscritos({ byId, painelInfo, source }) {
  if (!byId || typeof byId !== 'object' || !Object.keys(byId).length) throw err(400, 'sem cursos');
  const { q } = conn(); const ts = Date.now();
  // Envio parcial (ex.: um cartão) não apaga os demais: funde com o último retrato.
  const prev = latestInscritos(); const merged = Object.assign({}, prev ? prev.byId : {}, byId);
  const info = String(painelInfo || '').slice(0, 40).replace(/[^\w/: \-]/g, '');
  q.snapInsert.run(ts, info, clean(source, 24), JSON.stringify(merged)); q.snapPrune.run();
  return { ok: true, updatedAt: ts, cursos: Object.keys(byId).length, total: Object.keys(merged).length };
}
/** Último retrato ou null. */
export function latestInscritos() {
  const { q } = conn(); const r = q.snapLatest.get(); if (!r) return null;
  return { updatedAt: num(r.ts), painelInfo: r.painel_info || '', source: r.source || 'coletor', byId: JSON.parse(r.data) };
}

// ---- filas extras (triagem): serviços/salas criados no dia, além das filas fixas da planta (T.ticketQueuesOf) ----
const EXTRA_KINDS = ['sala', 'tenda', 'area'];
const text = (s, n) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Filas extras do dia/local no formato de ambiente da planta (+ service_id e extra: true), para somar às filas fixas. */
export function extras(day, venue) {
  const c = ctx(day, venue);
  return rows(conn().q.extraAll.all(c.day, c.venue)).map((r) => ({ id: r.place_id, extra_id: r.id, venue: c.venue, service_id: r.service_id, name: r.name, kind: r.kind, num: r.num, extra: true, created_at: r.created_at }));
}
/** Cria uma fila extra { day, venue, service_id, name, kind, num, count, spec, device }: já lança o padrão de senhas
    entregues (count, ex. 100) e prioritárias (spec, ex. "80-100") para a nova sala. */
export function addExtra(b) {
  const c = ctx(b && b.day, b && b.venue); const sid = clean(b.service_id, 32);
  const name = text(b.name, 60); const kind = EXTRA_KINDS.includes(b.kind) ? b.kind : 'sala'; const num = text(b.num, 8).replace(/[^\w\- ]/g, '');
  if (!sid || !D.services.some((s) => s.id === sid)) throw err(400, 'serviço (pilar) inválido');
  if (name.length < 2) throw err(400, 'informe o nome do atendimento');
  const count = b.count == null || b.count === '' ? null : Number(b.count);
  if (count != null && (!Number.isInteger(count) || count < 0 || count > 100000)) throw err(400, 'quantidade de senhas inválida');
  const parsed = parsePrioList(b.spec || ''); if (parsed.error) throw err(400, parsed.error);
  const { db, q } = conn(); const now = Date.now(); const device = clean(b.device, 40);
  let out;
  db.exec('BEGIN');
  try {
    const r = q.extraInsert.run(c.day, c.venue, sid, '', name, kind, num, device, now); const id = Number(r.lastInsertRowid);
    const place_id = `${c.venue}-x${id}`; q.extraSetPlace.run(place_id, id);
    if (count != null) q.issuedInsert.run(c.day, c.venue, sid, place_id, count, device, now);
    if (parsed.nums.length) q.prioInsert.run(c.day, c.venue, sid, place_id, parsed.spec, device, now);
    db.exec('COMMIT'); out = { ok: true, id, place_id };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  notify(c.day, c.venue); return out;
}
/** Remove (lógico) uma fila extra; as chamadas já feitas ficam no histórico. */
export function removeExtra(idRaw) {
  const id = Number(idRaw); if (!Number.isInteger(id) || id <= 0) throw err(400, 'id');
  const { q } = conn(); const cur = q.extraGet.get(id); if (!cur || num(cur.deleted)) throw err(404, 'fila não encontrada');
  q.extraDelete.run(id); notify(cur.day, cur.venue); return { ok: true, id };
}

// ---- lugares do mapa (mapa-eventos.html): cadastro da equipe, além dos locais fixos do evento (D.geo) ----
/** Lista os lugares ativos. */
export function lugares() { return rows(conn().q.lugarAll.all()); }
/** Cria (sem id) ou atualiza (com id) um lugar; validação em @tce/core/lugares. */
export function saveLugar(b) {
  let l; try { l = normalizeLugar(b); } catch (e) { throw err(e.status || 400, e.message); }
  const { q } = conn(); const now = Date.now(); const device = clean(b && b.device, 32);
  if (l.id) {
    const cur = q.lugarGet.get(l.id); if (!cur || num(cur.deleted)) throw err(404, 'lugar não encontrado');
    q.lugarUpdate.run(l.name, l.kind, l.address, l.lat, l.lng, l.note, l.phone, device, now, l.id);
    return { ok: true, id: l.id };
  }
  const r = q.lugarInsert.run(l.name, l.kind, l.address, l.lat, l.lng, l.note, l.phone, device, now, now);
  return { ok: true, id: num(r.lastInsertRowid) };
}
/** Remove (lógico) um lugar. */
export function deleteLugar(idRaw) {
  const id = Number(idRaw); if (!Number.isInteger(id) || id <= 0) throw err(400, 'id');
  const { q } = conn(); const cur = q.lugarGet.get(id); if (!cur || num(cur.deleted)) throw err(404, 'lugar não encontrado');
  q.lugarDelete.run(Date.now(), id); return { ok: true, id };
}
