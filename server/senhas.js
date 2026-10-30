// API do controle de senhas (atendimentos dos serviços) — Node 22 puro + SQLite embutido (node:sqlite).
// Sem dependências. Configuração em server/.env (PIN_OPERADOR, PIN_GESTOR, PORT, ORIGINS, DB_PATH).
// Rotas (prefixo /api): health, state, stats, issued (POST), call (POST), call/:id/status (POST),
// call/:id/end (POST), export.csv. Autenticação por PIN no cabeçalho X-Pin.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { summarize } = require('./stats');

// ---- config ----
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const PORT = Number(process.env.PORT || 3015);
const PIN_OP = String(process.env.PIN_OPERADOR || '');
const PIN_GE = String(process.env.PIN_GESTOR || '');
const ORIGINS = String(process.env.ORIGINS || 'https://www.tce.ap.gov.br,https://tce.ap.gov.br,https://rodrigossb.github.io').split(',').map((s) => s.trim()).filter(Boolean);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'senhas.db');
if (!PIN_OP || !PIN_GE) { console.error('Defina PIN_OPERADOR e PIN_GESTOR em server/.env'); process.exit(1); }

// ---- banco ----
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS issued_log (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, count INTEGER NOT NULL, device TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS issued_day ON issued_log(day, venue, service_id, ts);
CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, day TEXT NOT NULL, venue TEXT NOT NULL, service_id TEXT NOT NULL, place_id TEXT NOT NULL, ticket INTEGER, called_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'called', status_at INTEGER, ended_at INTEGER, device TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS calls_day ON calls(day, venue, service_id, place_id, called_at);`);
const q = {
  issuedLatest: db.prepare(`SELECT service_id, count, ts FROM issued_log i WHERE day=? AND venue=? AND ts=(SELECT MAX(ts) FROM issued_log WHERE day=i.day AND venue=i.venue AND service_id=i.service_id)`),
  issuedInsert: db.prepare(`INSERT INTO issued_log (day, venue, service_id, count, device, ts) VALUES (?,?,?,?,?,?)`),
  issuedHistory: db.prepare(`SELECT service_id, count, ts FROM issued_log WHERE day=? AND venue=? ORDER BY ts`),
  callsDay: db.prepare(`SELECT * FROM calls WHERE day=? AND venue=? ORDER BY called_at, id`),
  callsPlace: db.prepare(`SELECT * FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=? ORDER BY called_at DESC, id DESC LIMIT ?`),
  callInsert: db.prepare(`INSERT INTO calls (day, venue, service_id, place_id, ticket, called_at, status, device) VALUES (?,?,?,?,?,?,'called',?)`),
  callGet: db.prepare(`SELECT * FROM calls WHERE id=?`),
  callStatus: db.prepare(`UPDATE calls SET status=?, status_at=? WHERE id=?`),
  callEnd: db.prepare(`UPDATE calls SET ended_at=? WHERE id=?`),
  callDelete: db.prepare(`DELETE FROM calls WHERE id=?`),
  openServed: db.prepare(`SELECT id FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=? AND status='served' AND ended_at IS NULL`),
  lastTicket: db.prepare(`SELECT MAX(ticket) t FROM calls WHERE day=? AND venue=? AND service_id=? AND place_id=?`),
  exportDay: db.prepare(`SELECT * FROM calls WHERE day=? ORDER BY venue, service_id, place_id, called_at`),
};

// ---- util ----
const send = (res, code, body, headers) => { const data = typeof body === 'string' ? body : JSON.stringify(body); res.writeHead(code, Object.assign({ 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {})); res.end(data); };
const err = (code, msg) => Object.assign(new Error(msg), { status: code });
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const clean = (s, n) => String(s == null ? '' : s).slice(0, n || 64).replace(/[^\w.@:\- ]/g, '');
const readJson = (req) => new Promise((resolve, reject) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 10000) { reject(err(413, 'corpo grande demais')); req.destroy(); } }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(err(400, 'JSON inválido')); } }); });
function cors(req, res) {
  const origin = req.headers.origin || '';
  const ok = !origin || ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === 'null';
  if (ok && origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pin'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
  return ok;
}
const role = (req) => { const pin = String(req.headers['x-pin'] || ''); return pin && pin === PIN_GE ? 'gestor' : pin && pin === PIN_OP ? 'operador' : null; };
const need = (req, roles) => { const r = role(req); if (!r || !roles.includes(r)) throw err(401, 'PIN inválido'); return r; };

// ---- handlers ----
function state(day, venue) {
  const issued = q.issuedLatest.all(day, venue); const calls = q.callsDay.all(day, venue);
  const stats = summarize(issued, calls, Date.now());
  return { day, venue, now: Date.now(), issued, stats };
}
const routes = {
  'GET /api/health': () => ({ ok: true, ts: Date.now() }),
  'GET /api/login': (req) => ({ role: need(req, ['operador', 'gestor']) }),
  'GET /api/state': (req, u) => { need(req, ['operador', 'gestor']); const day = u.searchParams.get('day'); const venue = clean(u.searchParams.get('venue'), 16); if (!isDay(day) || !venue) throw err(400, 'day/venue'); return state(day, venue); },
  'GET /api/queue': (req, u) => { need(req, ['operador', 'gestor']); const day = u.searchParams.get('day'); const venue = clean(u.searchParams.get('venue'), 16); const s = clean(u.searchParams.get('service'), 32); const p = clean(u.searchParams.get('place'), 32); if (!isDay(day) || !venue || !s || !p) throw err(400, 'parâmetros'); const open = q.openServed.all(day, venue, s, p); return { calls: q.callsPlace.all(day, venue, s, p, 30), open: open.map((x) => x.id), last_ticket: q.lastTicket.get(day, venue, s, p).t, issued: q.issuedLatest.all(day, venue).find((x) => x.service_id === s) || null }; },
  'GET /api/stats': (req, u) => { need(req, ['operador', 'gestor']); const day = u.searchParams.get('day'); const venue = clean(u.searchParams.get('venue'), 16); if (!isDay(day) || !venue) throw err(400, 'day/venue'); const st = state(day, venue); st.issued_history = q.issuedHistory.all(day, venue); return st; },
  'POST /api/issued': async (req) => { need(req, ['operador', 'gestor']); const b = await readJson(req); const count = Number(b.count); if (!isDay(b.day) || !clean(b.venue, 16) || !clean(b.service_id, 32) || !Number.isInteger(count) || count < 0 || count > 100000) throw err(400, 'dados'); const ts = Date.now(); q.issuedInsert.run(b.day, clean(b.venue, 16), clean(b.service_id, 32), count, clean(b.device, 40), ts); return { ok: true, ts }; },
  'POST /api/call': async (req) => {
    need(req, ['operador', 'gestor']); const b = await readJson(req);
    const day = b.day; const venue = clean(b.venue, 16); const s = clean(b.service_id, 32); const p = clean(b.place_id, 32); const ticket = b.ticket == null ? null : Number(b.ticket);
    if (!isDay(day) || !venue || !s || !p || (ticket != null && (!Number.isInteger(ticket) || ticket < 0 || ticket > 100000))) throw err(400, 'dados');
    const now = Date.now();
    // Chamar a próxima encerra o atendimento em curso nesta sala (quem entrou antes já saiu).
    for (const o of q.openServed.all(day, venue, s, p)) q.callEnd.run(now, o.id);
    const r = q.callInsert.run(day, venue, s, p, ticket, now, clean(b.device, 40));
    return { ok: true, id: Number(r.lastInsertRowid), called_at: now };
  },
  'POST /api/call/:id/status': async (req, u, id) => {
    need(req, ['operador', 'gestor']); const b = await readJson(req); const c = q.callGet.get(id); if (!c) throw err(404, 'chamada não encontrada');
    const now = Date.now();
    if (b.status === 'undo') { q.callDelete.run(id); return { ok: true, deleted: true }; }
    if (b.status === 'called') { q.callStatus.run('called', null, id); q.callEnd.run(null, id); return { ok: true }; }
    if (!['served', 'absent'].includes(b.status)) throw err(400, 'status');
    if (b.status === 'served') for (const o of q.openServed.all(c.day, c.venue, c.service_id, c.place_id)) if (o.id !== Number(id)) q.callEnd.run(now, o.id);
    q.callStatus.run(b.status, now, id); if (b.status === 'absent') q.callEnd.run(null, id);
    return { ok: true, status_at: now };
  },
  'POST /api/call/:id/end': async (req, u, id) => { need(req, ['operador', 'gestor']); const c = q.callGet.get(id); if (!c) throw err(404, 'chamada não encontrada'); const now = Date.now(); q.callEnd.run(now, id); return { ok: true, ended_at: now }; },
  'GET /api/export.csv': (req, u) => { need(req, ['gestor']); const day = u.searchParams.get('day'); if (!isDay(day)) throw err(400, 'day'); const rows = q.exportDay.all(day); const iso = (t) => (t ? new Date(t).toISOString() : ''); const csv = ['id;dia;local;servico;sala;senha;chamada_em;status;status_em;fim_em;aparelho'].concat(rows.map((r) => [r.id, r.day, r.venue, r.service_id, r.place_id, r.ticket ?? '', iso(r.called_at), r.status, iso(r.status_at), iso(r.ended_at), r.device || ''].join(';'))).join('\n'); return { __raw: '﻿' + csv, type: 'text/csv; charset=utf-8', name: `atendimentos-${day}.csv` }; },
};

const server = http.createServer(async (req, res) => {
  try {
    if (!cors(req, res)) return send(res, 403, { error: 'origem não permitida' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://x'); let p = u.pathname.replace(/\/+$/, '');
    if (p.startsWith('/tce-senhas')) p = p.slice('/tce-senhas'.length); // caso o proxy não remova o prefixo
    const m = p.match(/^\/api\/call\/(\d+)\/(status|end)$/);
    const keyR = m ? `${req.method} /api/call/:id/${m[2]}` : `${req.method} ${p}`;
    const h = routes[keyR]; if (!h) throw err(404, 'rota não encontrada');
    const out = await h(req, u, m ? Number(m[1]) : null);
    if (out && out.__raw != null) return send(res, 200, out.__raw, { 'Content-Type': out.type, 'Content-Disposition': `attachment; filename="${out.name}"` });
    send(res, 200, out);
  } catch (e) { send(res, e.status || 500, { error: e.message || 'erro' }); if (!e.status) console.error(e); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`tce-senhas na porta ${PORT} · banco ${DB_PATH}`));
