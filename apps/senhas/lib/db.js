// Banco do controle de senhas: SQLite embutido do Node (node:sqlite), sem dependências nativas.
// Mesmo esquema do backend antigo (server/senhas.js): tabelas issued_log e calls. Usado só no servidor
// (server actions, route handlers, scripts). Conexão única guardada em globalThis para sobreviver ao HMR.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { summarize } from '@tce/core/stats';
import { queuePlan, normalizeCfg, DEFAULT_CFG } from '@tce/core/fila';
import { normalizeLugar } from '@tce/core/lugares';
import { TCE as T } from '@tce/core';
import { notify } from './bus.js';
import { activeQueues, fixedQueues } from './filas-extra.js';

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
CREATE TABLE IF NOT EXISTS filas_extra (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, kind TEXT NOT NULL, num TEXT NOT NULL DEFAULT '', device TEXT, created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS filas_off (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, device TEXT, ts INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS filas_off_key ON filas_off(day, venue, place_id);
CREATE TABLE IF NOT EXISTS fila_cursor (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, normal_last INTEGER NOT NULL DEFAULT 0, prio_last INTEGER NOT NULL DEFAULT 0, device TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fila_cursor_key ON fila_cursor(day, venue, service_id, place_id, ts);
CREATE TABLE IF NOT EXISTS fila_cfg (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, n_prefix TEXT NOT NULL DEFAULT 'N', p_prefix TEXT NOT NULL DEFAULT 'P', n_from INTEGER NOT NULL DEFAULT 1, p_from INTEGER NOT NULL DEFAULT 1, n_total INTEGER NOT NULL DEFAULT 100, p_total INTEGER NOT NULL DEFAULT 20, pattern TEXT NOT NULL DEFAULT '1:1', device TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fila_cfg_key ON fila_cfg(day, venue, service_id, place_id, id);
CREATE TABLE IF NOT EXISTS fila_info (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, num TEXT NOT NULL DEFAULT '', offer TEXT NOT NULL DEFAULT '', device TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fila_info_key ON fila_info(day, venue, place_id, id);`;

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(DDL);
  if (!db.prepare(`PRAGMA table_info(issued_log)`).all().some((c) => c.name === 'place_id')) db.exec(`ALTER TABLE issued_log ADD COLUMN place_id TEXT NOT NULL DEFAULT ''`);
  if (!db.prepare(`PRAGMA table_info(calls)`).all().some((c) => c.name === 'recalled_at')) db.exec(`ALTER TABLE calls ADD COLUMN recalled_at INTEGER`); // "chamar novamente" (reanuncia na TV)
  if (!db.prepare(`PRAGMA table_info(calls)`).all().some((c) => c.name === 'priority')) db.exec(`ALTER TABLE calls ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`); // senha prioritária, chamada fora da ordem (não avança a sequência)
  if (!db.prepare(`PRAGMA table_info(issued_log)`).all().some((c) => c.name === 'kind')) db.exec(`ALTER TABLE issued_log ADD COLUMN kind TEXT NOT NULL DEFAULT 'n'`); // série: 'n' comuns, 'p' prioritárias
  const q = {
    // última contagem por sala E série (kind 'n'/'p'); vale o lançamento mais recente (id)
    issuedLatest: db.prepare(`SELECT service_id, place_id, kind, count, ts FROM issued_log i WHERE day=? AND venue=? AND id=(SELECT MAX(id) FROM issued_log WHERE day=i.day AND venue=i.venue AND service_id=i.service_id AND place_id=i.place_id AND kind=i.kind)`),
    issuedInsert: db.prepare(`INSERT INTO issued_log (day, venue, service_id, place_id, kind, count, device, ts) VALUES (?,?,?,?,?,?,?,?)`),
    callsAllPlace: db.prepare(`SELECT id, ticket, called_at, priority FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=?`),
    issuedHistory: db.prepare(`SELECT service_id, place_id, kind, count, ts FROM issued_log WHERE day=? AND venue=? ORDER BY ts`),
    cfgOf: db.prepare(`SELECT * FROM fila_cfg WHERE day=? AND venue=? AND service_id=? AND place_id=? ORDER BY id DESC LIMIT 1`),
    cfgAll: db.prepare(`SELECT * FROM fila_cfg f WHERE day=? AND venue=? AND id=(SELECT MAX(id) FROM fila_cfg WHERE day=f.day AND venue=f.venue AND service_id=f.service_id AND place_id=f.place_id)`),
    cfgInsert: db.prepare(`INSERT INTO fila_cfg (day, venue, service_id, place_id, n_prefix, p_prefix, n_from, p_from, n_total, p_total, pattern, device, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`),
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
    offAll: db.prepare(`SELECT service_id, place_id, ts FROM filas_off WHERE day=? AND venue=? ORDER BY ts`),
    offInsert: db.prepare(`INSERT OR REPLACE INTO filas_off (day, venue, service_id, place_id, device, ts) VALUES (?,?,?,?,?,?)`),
    offDelete: db.prepare(`DELETE FROM filas_off WHERE day=? AND venue=? AND place_id=?`),
    cursorOf: db.prepare(`SELECT normal_last, prio_last, ts FROM fila_cursor WHERE day=? AND venue=? AND service_id=? AND place_id=? ORDER BY ts DESC, id DESC LIMIT 1`),
    cursorAll: db.prepare(`SELECT service_id, place_id, normal_last, prio_last, ts FROM fila_cursor f WHERE day=? AND venue=? AND id=(SELECT MAX(id) FROM fila_cursor WHERE day=f.day AND venue=f.venue AND service_id=f.service_id AND place_id=f.place_id)`),
    infoAll: db.prepare(`SELECT service_id, place_id, name, kind, num, offer, ts FROM fila_info f WHERE day=? AND venue=? AND id=(SELECT MAX(id) FROM fila_info WHERE day=f.day AND venue=f.venue AND place_id=f.place_id)`),
    infoInsert: db.prepare(`INSERT INTO fila_info (day, venue, service_id, place_id, name, kind, num, offer, device, ts) VALUES (?,?,?,?,?,?,?,?,?,?)`),
    cursorInsert: db.prepare(`INSERT INTO fila_cursor (day, venue, service_id, place_id, normal_last, prio_last, device, ts) VALUES (?,?,?,?,?,?,?,?)`),
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

/** Entregues por sala: { [place_id]: { service_id, n, p, ts } } a partir da última contagem de cada série. */
function issuedMap(day, venue) {
  const out = {};
  for (const r of rows(conn().q.issuedLatest.all(day, venue))) { const o = (out[r.place_id] = out[r.place_id] || { service_id: r.service_id, place_id: r.place_id, n: 0, p: 0, ts: 0 }); o[r.kind === 'p' ? 'p' : 'n'] = r.count; o.ts = Math.max(o.ts, r.ts); }
  return out;
}
/** Linhas agregadas (n+p) no formato que summarize() espera: [{ service_id, place_id, count, ts }]. */
const issuedAgg = (map) => Object.values(map).map((o) => ({ service_id: o.service_id, place_id: o.place_id, count: o.n + o.p, ts: o.ts }));
const cfgRow = (r) => (r ? { n_prefix: r.n_prefix, p_prefix: r.p_prefix, n_from: num(r.n_from), p_from: num(r.p_from), n_total: num(r.n_total), p_total: num(r.p_total), pattern: r.pattern } : null);
/** Configuração da fila (última gravada) ou a padrão. */
function cfgOf(day, venue, s, p) { return cfgRow(conn().q.cfgOf.get(day, venue, s, p)) || Object.assign({}, DEFAULT_CFG); }
/** Configurações do dia/local: { [service|place]: cfg }. */
function cfgMap(day, venue) { const out = {}; for (const r of conn().q.cfgAll.all(day, venue)) out[`${r.service_id}|${r.place_id}`] = cfgRow(r); return out; }

export function state(day, venue) {
  const c = ctx(day, venue); const { q } = conn();
  const imap = issuedMap(c.day, c.venue); const calls = rows(q.callsDay.all(c.day, c.venue));
  const configs = []; for (const r of q.cfgAll.all(c.day, c.venue)) configs.push(Object.assign({ service_id: r.service_id, place_id: r.place_id, ts: num(r.ts) }, cfgRow(r)));
  return { day: c.day, venue: c.venue, now: Date.now(), issued: Object.values(imap), configs, default_cfg: DEFAULT_CFG, stats: summarize(issuedAgg(imap), calls, Date.now()), extras: extras(c.day, c.venue), disabled: disabled(c.day, c.venue) };
}
export function stats(day, venue) {
  const st = state(day, venue); const { q } = conn();
  st.issued_history = rows(q.issuedHistory.all(st.day, st.venue));
  return st;
}
export function queue(day, venue, service, place) {
  const c = ctx(day, venue); const s = clean(service, 32); const p = clean(place, 32); if (!s || !p) throw err(400, 'parâmetros');
  const { q } = conn();
  const issued = issuedMap(c.day, c.venue)[p] || { service_id: s, place_id: p, n: 0, p: 0, ts: 0 };
  const cfg = cfgOf(c.day, c.venue, s, p);
  const plan = planOf(c.day, c.venue, s, p, cfg, issued);
  return {
    calls: rows(q.callsPlace.all(c.day, c.venue, s, p, 30)),
    open: q.openServed.all(c.day, c.venue, s, p).map((x) => num(x.id)),
    last_ticket: plan.normal.last || 0, // última comum segundo o plano (respeita o ajuste manual da porta)
    issued, cfg,
    cursor: cursorOf(c.day, c.venue, s, p),
    plan,
  };
}
/** Plano da fila (próxima N/P pela ordem configurada) a partir de tudo que já foi chamado na sala. */
function planOf(day, venue, s, p, cfg, issued) { return queuePlan({ cfg, issued, calls: rows(conn().q.callsAllPlace.all(day, venue, s, p)), from: cursorOf(day, venue, s, p) }); }
/** Último ajuste manual do número atual da sala ({ normal, prio, ts }) ou null. */
function cursorOf(day, venue, s, p) { const r = conn().q.cursorOf.get(day, venue, s, p); return r ? { normal: num(r.normal_last), prio: num(r.prio_last), ts: num(r.ts) } : null; }
/** Porta da sala: "o número atual é X" — corrige a sequência quando avançou errado (ou volta ao início com 0).
    normal = última senha comum (N) chamada; prio = última prioritária (P) chamada (0 = nenhuma). As chamadas
    anteriores ficam no histórico/estatística; só deixam de contar para a próxima senha. */
export function setCursor(b) {
  const day = b.day; const venue = clean(b.venue, 16); const s = clean(b.service_id, 32); const p = clean(b.place_id, 32);
  const normal = b.normal == null || b.normal === '' ? 0 : Number(b.normal); const prio = b.prio == null || b.prio === '' ? 0 : Number(b.prio);
  if (!isDay(day) || !venue || !s || !p) throw err(400, 'dados');
  if (!Number.isInteger(normal) || normal < 0 || normal > 100000) throw err(400, 'informe a última senha comum chamada (0 = recomeçar do início)');
  if (!Number.isInteger(prio) || prio < 0 || prio > 100000) throw err(400, 'última prioritária inválida');
  const ts = Date.now(); conn().q.cursorInsert.run(day, venue, s, p, normal, prio, clean(b.device, 40), ts);
  notify(day, venue); return { ok: true, ts, normal, prio };
}
/** Triagem: configuração da fila { day, venue, service_id, place_id, n_prefix, p_prefix, n_from, p_from, n_total, p_total,
    pattern, device, all }. Com `all: true` grava a mesma configuração em TODAS as filas ativas do local/dia. */
export function setQueueConfig(b) {
  const c = ctx(b && b.day, b && b.venue); const { cfg, error } = normalizeCfg(b); if (error) throw err(400, error);
  const device = clean(b.device, 40); const ts = Date.now(); const { q } = conn();
  const targets = [];
  if (b.all) { for (const g of activeQueues(fixedQueues(c.venue, c.day), extras(c.day, c.venue), disabled(c.day, c.venue))) for (const p of g.places) targets.push([g.service.id, p.id]); }
  else { const s = clean(b.service_id, 32); const p = clean(b.place_id, 32); if (!s || !p) throw err(400, 'dados'); targets.push([s, p]); }
  for (const [s, p] of targets) q.cfgInsert.run(c.day, c.venue, s, p, cfg.n_prefix, cfg.p_prefix, cfg.n_from, cfg.p_from, cfg.n_total, cfg.p_total, cfg.pattern, device, ts);
  notify(c.day, c.venue); return { ok: true, ts, cfg, count: targets.length };
}
/** Triagem: quantas senhas de uma série ({ kind: 'n' | 'p' }) já foram entregues na sala; vale a última contagem. */
export function issued(b) {
  const count = Number(b.count); const kind = b.kind === 'p' ? 'p' : 'n';
  if (!isDay(b.day) || !clean(b.venue, 16) || !clean(b.service_id, 32) || !Number.isInteger(count) || count < 0 || count > 100000) throw err(400, 'dados');
  const ts = Date.now(); conn().q.issuedInsert.run(b.day, clean(b.venue, 16), clean(b.service_id, 32), clean(b.place_id, 32), kind, count, clean(b.device, 40), ts);
  notify(b.day, clean(b.venue, 16)); return { ok: true, ts, kind, count };
}
export function call(b) {
  const day = b.day; const venue = clean(b.venue, 16); const s = clean(b.service_id, 32); const p = clean(b.place_id, 32); const ticket = b.ticket == null ? null : Number(b.ticket);
  if (!isDay(day) || !venue || !s || !p || (ticket != null && (!Number.isInteger(ticket) || ticket < 0 || ticket > 100000))) throw err(400, 'dados');
  const { q } = conn(); const now = Date.now();
  const status = ['served', 'absent'].includes(b.status) ? b.status : null;
  const priority = b.priority ? 1 : 0; // série: 1 = prioritária (P), 0 = comum (N); a porta sempre informa
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
  const imap = issuedMap(c.day, c.venue); const calls = rows(q.callsDay.all(c.day, c.venue));
  const st = summarize(issuedAgg(imap), calls, now);
  // Quem está em atendimento agora em cada sala (entrou e ainda não saiu), além da última chamada (que pode estar na porta).
  const serving = {};
  for (const c of calls) if (c.status === 'served' && !c.ended_at) { const k = c.place_id; if (!serving[k] || c.status_at > serving[k].status_at) serving[k] = { id: c.id, ticket: c.ticket, status_at: c.status_at }; }
  const places = []; const labels = {};
  const cfgs = cfgMap(c.day, c.venue);
  const cursors = {}; for (const r of rows(q.cursorAll.all(c.day, c.venue))) cursors[`${r.service_id}|${r.place_id}`] = { normal: num(r.normal_last), prio: num(r.prio_last), ts: num(r.ts) };
  for (const s of st.services) for (const p of s.places) {
    const key = `${s.service_id}|${p.place_id}`; const cfg = cfgs[key] || DEFAULT_CFG;
    const plan = queuePlan({ cfg, issued: imap[p.place_id] || null, calls: calls.filter((x) => x.service_id === s.service_id && x.place_id === p.place_id), from: cursors[key] || null });
    labels[p.place_id] = { n: cfg.n_prefix, p: cfg.p_prefix };
    // seq: o que a TV mostra de cada fila (última e próxima comum/prioritária) — só quando a sala tem prioritárias
    places.push({ service_id: s.service_id, place_id: p.place_id, issued: p.issued || 0, called: p.called || 0, waiting: p.not_called || 0, in_service: p.in_service || 0, current: p.current || null, serving: serving[p.place_id] && (!p.current || serving[p.place_id].id !== p.current.id) ? serving[p.place_id] : null, labels: labels[p.place_id], seq: plan.has_prio ? { normal: plan.normal, prio: plan.prio, next: plan.next } : null });
  }
  for (const k of Object.keys(cfgs)) { const pid = k.split('|')[1]; if (!labels[pid]) labels[pid] = { n: cfgs[k].n_prefix, p: cfgs[k].p_prefix }; }
  const recent = calls.slice().sort((a, b) => b.called_at - a.called_at || b.id - a.id).slice(0, 60)
    .map((x) => ({ id: x.id, ticket: x.ticket, service_id: x.service_id, place_id: x.place_id, status: x.status, called_at: x.called_at, recalled_at: x.recalled_at || null, priority: x.priority ? 1 : 0, status_at: x.status_at, ended_at: x.ended_at }));
  return { day: c.day, venue: c.venue, now, places, recent, labels, default_labels: { n: DEFAULT_CFG.n_prefix, p: DEFAULT_CFG.p_prefix }, extras: extras(c.day, c.venue), disabled: disabled(c.day, c.venue), total: { issued: st.total.issued, called: st.total.called, waiting: st.total.not_called, in_service: st.total.in_service } };
}
/** Chamadas do dia no local (para o dashboard: séries por hora e linha do tempo). */
export function callsOfDay(day, venue) { const c = ctx(day, venue); return rows(conn().q.callsDay.all(c.day, c.venue)); }
export function exportCsv(day) {
  if (!isDay(day)) throw err(400, 'day');
  const list = rows(conn().q.exportDay.all(day)); const iso = (t) => (t ? new Date(t).toISOString() : '');
  const csv = ['id;dia;local;servico;sala;serie;senha;chamada_em;status;status_em;fim_em;aparelho'].concat(list.map((r) => [r.id, r.day, r.venue, r.service_id, r.place_id, r.priority ? 'P' : 'N', r.ticket ?? '', iso(r.called_at), r.status, iso(r.status_at), iso(r.ended_at), r.device || ''].join(';'))).join('\n');
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
/** Filas extras do dia (`extra: true`), já com o que a triagem editou (fila_info), MAIS as salas fixas da planta editadas na
    triagem (`override: true`, sem `extra`): quem procura um ambiente por id (placeOf, TV, painel) vê nome/sala/oferta atuais. */
export function extras(day, venue) {
  const c = ctx(day, venue); const { q } = conn();
  const infos = {}; for (const r of rows(q.infoAll.all(c.day, c.venue))) infos[r.place_id] = r;
  const out = rows(q.extraAll.all(c.day, c.venue)).map((r) => { const i = infos[r.place_id]; delete infos[r.place_id]; return Object.assign({ id: r.place_id, extra_id: r.id, venue: c.venue, service_id: r.service_id, name: r.name, kind: r.kind, num: r.num, extra: true, created_at: r.created_at }, i ? { name: i.name, kind: i.kind, num: i.num, offer: i.offer } : {}); });
  for (const i of Object.values(infos)) out.push({ id: i.place_id, venue: c.venue, service_id: i.service_id, name: i.name, kind: i.kind, num: i.num, offer: i.offer, override: true, ts: i.ts });
  return out;
}
/** Triagem edita uma fila (fixa ou extra): { day, venue, service_id, place_id, name, kind, num, offer, device }. Vale para
    triagem, porta, TV e painel do dia; a planta e a programação pública não mudam. */
export function setQueueInfo(b) {
  const c = ctx(b && b.day, b && b.venue); const sid = clean(b.service_id, 32); const pid = clean(b.place_id, 32);
  if (!sid || !pid) throw err(400, 'dados');
  const name = text(b.name, 60); const kind = EXTRA_KINDS.includes(b.kind) ? b.kind : 'sala'; const num = text(b.num, 8).replace(/[^\w\- ]/g, ''); const offer = text(String(b.offer == null ? '' : b.offer).replace(/\r?\n+/g, '; '), 400).replace(/\s*;\s*(;\s*)*/g, '; ').replace(/^; |; $/g, '');
  if (name.length < 2) throw err(400, 'informe o nome do atendimento');
  const ts = Date.now(); conn().q.infoInsert.run(c.day, c.venue, sid, pid, name, kind, num, offer, clean(b.device, 40), ts);
  notify(c.day, c.venue); return { ok: true, ts, place_id: pid, name, kind, num, offer };
}
/** Cria uma fila extra { day, venue, service_id, name, kind, num, device, + configuração (n_total, p_total, pattern, prefixos,
    inícios) e entregues iniciais (issued_n, issued_p) }: a nova sala já nasce configurada para a porta e a TV. */
export function addExtra(b) {
  const c = ctx(b && b.day, b && b.venue); const sid = clean(b.service_id, 32);
  const name = text(b.name, 60); const kind = EXTRA_KINDS.includes(b.kind) ? b.kind : 'sala'; const num = text(b.num, 8).replace(/[^\w\- ]/g, '');
  if (!sid || !D.services.some((s) => s.id === sid)) throw err(400, 'serviço (pilar) inválido');
  if (name.length < 2) throw err(400, 'informe o nome do atendimento');
  const { cfg, error } = normalizeCfg(b); if (error) throw err(400, error);
  const init = {}; for (const k of ['issued_n', 'issued_p']) { const v = b[k] == null || b[k] === '' ? 0 : Number(b[k]); if (!Number.isInteger(v) || v < 0 || v > 100000) throw err(400, 'quantidade de senhas entregues inválida'); init[k] = v; }
  const { db, q } = conn(); const now = Date.now(); const device = clean(b.device, 40);
  let out;
  db.exec('BEGIN');
  try {
    const r = q.extraInsert.run(c.day, c.venue, sid, '', name, kind, num, device, now); const id = Number(r.lastInsertRowid);
    const place_id = `${c.venue}-x${id}`; q.extraSetPlace.run(place_id, id);
    q.cfgInsert.run(c.day, c.venue, sid, place_id, cfg.n_prefix, cfg.p_prefix, cfg.n_from, cfg.p_from, cfg.n_total, cfg.p_total, cfg.pattern, device, now);
    if (init.issued_n) q.issuedInsert.run(c.day, c.venue, sid, place_id, 'n', init.issued_n, device, now);
    if (init.issued_p) q.issuedInsert.run(c.day, c.venue, sid, place_id, 'p', init.issued_p, device, now);
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

/** Filas desativadas na triagem (ids de ambiente) no dia/local: somem da triagem, da porta e da TV até serem reativadas. */
export function disabled(day, venue) { const c = ctx(day, venue); return rows(conn().q.offAll.all(c.day, c.venue)).map((r) => r.place_id); }
/** Liga/desliga uma fila { day, venue, service_id, place_id, enabled, device }. O histórico de chamadas não muda. */
export function setQueueEnabled(b) {
  const c = ctx(b && b.day, b && b.venue); const sid = clean(b.service_id, 32); const pid = clean(b.place_id, 32); if (!sid || !pid) throw err(400, 'dados');
  const { q } = conn();
  if (b.enabled) q.offDelete.run(c.day, c.venue, pid); else q.offInsert.run(c.day, c.venue, sid, pid, clean(b.device, 40), Date.now());
  notify(c.day, c.venue); return { ok: true, place_id: pid, enabled: !!b.enabled };
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
