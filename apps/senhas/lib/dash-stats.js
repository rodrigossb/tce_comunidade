// Cálculos puros do dashboard de resultados (sem banco, sem DOM): séries por hora, resultados, rankings e destaques.
// Entrada: `stats` (summarize() do core: total, services[].places[]) e `calls` (chamadas do dia). Usado pela tela e pelos testes.
import { TCE as T } from '@tce/core';
import { summarize } from '@tce/core/stats';

const D = T.D;
const HOUR = 3600000;
/** Hora local do evento (America/Belem, UTC-3), como em packages/core/src/stats.js. */
export const hourOf = (ms) => ((Math.floor(ms / HOUR) - 3) % 24 + 24) % 24;
export const fmtT = (ms) => (ms ? T.partsOf(new Date(ms)).time : '');
export const fmtMin = (m) => (m == null ? '—' : m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`);
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

/** Filas em modo "só contagem": cada senha entregue vira um evento de atendimento no horário em que a triagem lançou.
    issuedHistory = linhas de issued_log (service_id, place_id, kind, count, ts) em ordem; countOnly = Set de place_id.
    Devolve pseudo-chamadas { id, service_id, place_id, status: 'served', called_at, counted: true } (uma por senha); uma
    correção para baixo tira as últimas lançadas. */
export function countEvents(issuedHistory, countOnly) {
  if (!countOnly || !countOnly.size) return [];
  const byKey = {}; const out = [];
  for (const r of (issuedHistory || []).slice().sort((a, b) => a.ts - b.ts)) {
    if (!countOnly.has(r.place_id)) continue;
    const k = `${r.place_id}|${r.kind || 'n'}`; const st = (byKey[k] = byKey[k] || { prev: 0, events: [] });
    const d = Number(r.count) - st.prev; st.prev = Number(r.count);
    if (d > 0) for (let i = 0; i < d; i++) st.events.push({ id: `c|${k}|${r.ts}|${i}`, service_id: r.service_id, place_id: r.place_id, ticket: null, status: 'served', called_at: r.ts, status_at: r.ts, ended_at: r.ts, counted: true });
    else if (d < 0) st.events.splice(d);
  }
  for (const st of Object.values(byKey)) out.push(...st.events);
  return out.sort((a, b) => a.called_at - b.called_at);
}
/** Chamadas reais + eventos de contagem, em ordem de horário (entrada das séries por hora e da linha do tempo). */
export const allEvents = (calls, issuedHistory, countOnly) => (calls || []).concat(countEvents(issuedHistory, countOnly)).sort((a, b) => a.called_at - b.called_at);

/** Turno de uma hora do evento: manhã (< 13h), tarde (13–17h) ou noite. */
export const shiftOfHour = (h) => (h < 13 ? 'manha' : h < 18 ? 'tarde' : 'noite');
export const SHIFT_FILTERS = [{ id: 'all', label: 'Dia todo' }, { id: 'manha', label: 'Manhã' }, { id: 'tarde', label: 'Tarde' }, { id: 'noite', label: 'Noite' }];
const SHIFT_RANK = { manha: 0, tarde: 1, noite: 2 };

/** Normaliza os filtros: { svcs: Set|null, places: Set|null, shift: 'all'|'manha'|'tarde'|'noite' }. */
export function normFilters(f) {
  const set = (v) => { const a = v instanceof Set ? [...v] : Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,; ]+/) : []; const s = new Set(a.map((x) => String(x || '').trim()).filter(Boolean)); return s.size ? s : null; };
  const shift = f && SHIFT_RANK[f.shift] != null ? f.shift : 'all';
  return { svcs: set(f && f.svcs), places: set(f && f.places), shift };
}
export const hasFilters = (f) => { const n = normFilters(f); return !!(n.svcs || n.places || n.shift !== 'all'); };

/**
 * Aplica filtros (serviços, salas, turno) aos dados do dia (formato do GET /api/stats ou do getStats do app:
 * { total|stats.total, services, per_hour, calls, issued_history, count_only, now }) e devolve
 * { stats: { total, services, per_hour }, events, countOnly, countedTotal, filtered }.
 *  - events: chamadas reais + pseudo-chamadas das filas "só contagem", já filtradas (séries por hora, linha do tempo);
 *  - sem filtro, devolve os números do servidor como vieram; com filtro, recalcula com summarize() do core:
 *    senhas entregues no turno = contagem ao fim do turno − contagem antes do turno (por sala e série).
 */
export function filterData(data, filters) {
  const f = normFilters(filters); const base = (data && data.stats) || data || {};
  const countOnly = new Set((data && data.count_only) || []);
  const svcOk = (sid) => !f.svcs || f.svcs.has(sid); const placeOk = (pid) => !f.places || f.places.has(pid);
  const shiftOk = (ms) => f.shift === 'all' || shiftOfHour(hourOf(ms)) === f.shift;
  const keep = (c) => svcOk(c.service_id) && placeOk(c.place_id) && shiftOk(c.called_at);
  const events = allEvents((data && data.calls) || [], (data && data.issued_history) || [], countOnly).filter(keep);
  const countedTotal = events.filter((c) => c.counted).length;
  if (!f.svcs && !f.places && f.shift === 'all') return { stats: { total: base.total, services: base.services || [], per_hour: base.per_hour || {} }, events, countOnly, countedTotal, filtered: false };
  // entregues por sala no recorte: última contagem até o fim do turno − última contagem antes do turno (por série)
  const last = {}; const before = {};
  for (const r of ((data && data.issued_history) || []).slice().sort((a, b) => a.ts - b.ts)) {
    if (!svcOk(r.service_id) || !placeOk(r.place_id)) continue;
    const k = `${r.service_id}|${r.place_id}|${r.kind || 'n'}`; const rank = SHIFT_RANK[shiftOfHour(hourOf(r.ts))];
    if (f.shift === 'all' || rank <= SHIFT_RANK[f.shift]) last[k] = r;
    if (f.shift !== 'all' && rank < SHIFT_RANK[f.shift]) before[k] = r;
  }
  const agg = {};
  for (const [k, r] of Object.entries(last)) { const n = Math.max(0, Number(r.count) - (before[k] ? Number(before[k].count) : 0)); const pk = `${r.service_id}|${r.place_id}`; const o = (agg[pk] = agg[pk] || { service_id: r.service_id, place_id: r.place_id, count: 0, ts: 0 }); o.count += n; o.ts = Math.max(o.ts, r.ts); }
  const calls = ((data && data.calls) || []).filter(keep);
  const stats = summarize(Object.values(agg), calls, (data && data.now) || Date.now(), countOnly);
  return { stats, events, countOnly, countedTotal, filtered: true };
}

/** Dias para o filtro de data: dias do evento + dias com registros (data_days do servidor), em ordem; cada um com
    { date, venue (dia de serviços), service_day, has_data, venues (com registros) }. */
export function filterDays(dataDays, venue, daysOff) {
  const by = {}; const add = (d) => (by[d] = by[d] || { date: d, service_day: false, has_data: false, off: false, venues: [] });
  for (const d of T.eventDays()) add(d);
  for (const sd of T.serviceDays()) { const o = add(sd.date); if (!venue || sd.venue === venue) { o.service_day = true; o.venue = sd.venue; } }
  for (const r of dataDays || []) { if (!r || !r.day) continue; const o = add(r.day); if (!o.venues.includes(r.venue)) o.venues.push(r.venue); if (!venue || r.venue === venue) o.has_data = true; }
  // dias desativados pela administração (strings = dias deste local; objetos { day, venue } = de qualquer local)
  for (const x of daysOff || []) { const d = typeof x === 'string' ? x : x && x.day; if (!d || !by[d]) continue; if (typeof x === 'string' || !venue || x.venue === venue) by[d].off = true; }
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}

/** Por hora: chamadas, atendidas (entrou), faltas e "por contagem", do primeiro ao último horário com movimento (mín. 8h–17h). */
export function hourSeries(calls) {
  const by = {};
  for (const c of calls || []) { const h = hourOf(c.called_at); const o = (by[h] = by[h] || { hour: h, called: 0, served: 0, absent: 0, pending: 0, counted: 0 }); o.called++; if (c.counted) o.counted++; if (c.status === 'served') o.served++; else if (c.status === 'absent') o.absent++; else o.pending++; }
  const hs = Object.keys(by).map(Number);
  if (!hs.length) return [];
  const from = Math.min(8, ...hs); const to = Math.max(17, ...hs);
  const out = []; for (let h = from; h <= to; h++) out.push(by[h] || { hour: h, called: 0, served: 0, absent: 0, pending: 0, counted: 0 });
  return out;
}

/** Por hora e por serviço (para a barra empilhada colorida). */
export function hourByService(calls) {
  const by = {};
  for (const c of calls || []) { const h = hourOf(c.called_at); (by[h] = by[h] || {})[c.service_id] = ((by[h] || {})[c.service_id] || 0) + 1; }
  return by;
}

const infoOf = (pid, extras) => (extras || []).find((e) => e.id === pid) || T.placeInfo(pid); // o que a triagem editou/criou vence a planta
const nameOf = (pid, extras) => { const p = infoOf(pid, extras); return p ? p.name : pid; };
const roomOf = (pid, extras) => { const p = infoOf(pid, extras); return p ? (p.num ? `${p.kind === 'sala' ? 'Sala' : p.kind === 'tenda' ? 'Tenda' : 'Ambiente'} ${p.num}` : p.kind) : ''; };
const svcOf = (sid) => D.services.find((s) => s.id === sid) || { id: sid, short: sid, title: sid, color: '#94a3b8', icon: 'ticket' };

/** Linhas do ranking de salas/especialidades, com serviço, nome e sala. */
export function placeRows(stats, extras) {
  const rows = [];
  for (const s of (stats && stats.services) || []) for (const p of s.places || []) rows.push({ key: `${s.service_id}|${p.place_id}`, service: svcOf(s.service_id), place_id: p.place_id, name: nameOf(p.place_id, extras), room: roomOf(p.place_id, extras), issued: p.issued || 0, called: p.called || 0, served: p.served || 0, absent: p.absent || 0, pending: p.pending_result || 0, avg_min: p.avg_min, median_min: p.median_min, samples: p.samples || 0, absent_rate: p.called && !p.count_only ? Math.round((100 * p.absent) / p.called) : null, count_only: !!p.count_only });
  return rows;
}
export function serviceRows(stats) {
  return ((stats && stats.services) || []).map((s) => ({ service: svcOf(s.service_id), issued: s.issued || 0, called: s.called || 0, served: s.served || 0, absent: s.absent || 0, pending: s.pending_result || 0, avg_min: s.avg_min, median_min: s.median_min, absent_rate: s.absent_rate, rooms: (s.places || []).length, active_rooms: (s.places || []).filter((p) => p.called > 0).length, count_rooms: (s.places || []).filter((p) => p.count_only).length, counted: (s.places || []).filter((p) => p.count_only).reduce((a, p) => a + (p.served || 0), 0), per_hour: s.per_hour || {} }))
    .sort((a, b) => b.served - a.served || b.called - a.called);
}

/** Destaques do dia: pico, sala mais movimentada, atendimento mais rápido, maior fila, primeira/última chamada, duração da ação. */
export function highlights(stats, calls) {
  const list = (calls || []).slice().sort((a, b) => a.called_at - b.called_at);
  const first = list[0] || null; const last = list[list.length - 1] || null;
  const series = hourSeries(list); const peak = series.reduce((b, x) => (!b || x.called > b.called ? x : b), null);
  const rows = placeRows(stats, stats && stats.extras);
  const busiest = rows.slice().sort((a, b) => b.served - a.served || b.called - a.called)[0] || null;
  const fastest = rows.filter((r) => r.avg_min != null && r.samples >= 3).sort((a, b) => a.avg_min - b.avg_min)[0] || null;
  const slowest = rows.filter((r) => r.avg_min != null && r.samples >= 3).sort((a, b) => b.avg_min - a.avg_min)[0] || null;
  const svcs = serviceRows(stats); const topService = svcs[0] || null;
  const mostAbsent = rows.filter((r) => r.called >= 5 && !r.count_only).sort((a, b) => (b.absent_rate || 0) - (a.absent_rate || 0))[0] || null;
  const total = (stats && stats.total) || {};
  const spanMin = first && last ? Math.round((last.called_at - first.called_at) / 60000) : 0;
  // ritmo só com pelo menos 10 min de ação (senão um lote lançado de uma vez viraria "200 por hora")
  const perHour = spanMin >= 10 ? Math.round((total.called || 0) / (spanMin / 60)) : null;
  return { first, last, peak: peak && peak.called ? peak : null, busiest, fastest, slowest, topService, mostAbsent, spanMin, perHour, activeRooms: rows.filter((r) => r.called > 0).length, rooms: rows.length };
}

/** Dia mostrado por padrão: o dia de trabalho das senhas (dia de serviços de hoje; outro dia do evento → hoje; depois do
    evento → o último dia de serviços; antes → o primeiro). `venue` força o local. */
export function defaultDay(today, venue) {
  const days = T.serviceDays();
  if (today > days[days.length - 1].date) { const past = days.filter((d) => !venue || d.venue === venue); return past[past.length - 1] || days[days.length - 1]; }
  return T.ticketDay(today, venue) || days[0];
}

/** Caminho SVG de um arco de donut (ângulos em graus, 0 = topo, sentido horário). */
export function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)); const y0 = cy + r * Math.sin(rad(a0)); const x1 = cx + r * Math.cos(rad(a1)); const y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
