// Cálculos puros do dashboard de resultados (sem banco, sem DOM): séries por hora, resultados, rankings e destaques.
// Entrada: `stats` (summarize() do core: total, services[].places[]) e `calls` (chamadas do dia). Usado pela tela e pelos testes.
import { TCE as T } from '@tce/core';

const D = T.D;
const HOUR = 3600000;
/** Hora local do evento (America/Belem, UTC-3), como em packages/core/src/stats.js. */
export const hourOf = (ms) => ((Math.floor(ms / HOUR) - 3) % 24 + 24) % 24;
export const fmtT = (ms) => (ms ? T.partsOf(new Date(ms)).time : '');
export const fmtMin = (m) => (m == null ? '—' : m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`);
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

/** Por hora: chamadas, atendidas (entrou) e faltas, do primeiro ao último horário com movimento (mín. 8h–17h quando há dados). */
export function hourSeries(calls) {
  const by = {};
  for (const c of calls || []) { const h = hourOf(c.called_at); const o = (by[h] = by[h] || { hour: h, called: 0, served: 0, absent: 0, pending: 0 }); o.called++; if (c.status === 'served') o.served++; else if (c.status === 'absent') o.absent++; else o.pending++; }
  const hs = Object.keys(by).map(Number);
  if (!hs.length) return [];
  const from = Math.min(8, ...hs); const to = Math.max(17, ...hs);
  const out = []; for (let h = from; h <= to; h++) out.push(by[h] || { hour: h, called: 0, served: 0, absent: 0, pending: 0 });
  return out;
}

/** Por hora e por serviço (para a barra empilhada colorida). */
export function hourByService(calls) {
  const by = {};
  for (const c of calls || []) { const h = hourOf(c.called_at); (by[h] = by[h] || {})[c.service_id] = ((by[h] || {})[c.service_id] || 0) + 1; }
  return by;
}

const nameOf = (pid, extras) => { const p = T.placeInfo(pid) || (extras || []).find((e) => e.id === pid); return p ? p.name : pid; };
const roomOf = (pid, extras) => { const p = T.placeInfo(pid) || (extras || []).find((e) => e.id === pid); return p ? (p.num ? `${p.kind === 'sala' ? 'Sala' : p.kind === 'tenda' ? 'Tenda' : 'Ambiente'} ${p.num}` : p.kind) : ''; };
const svcOf = (sid) => D.services.find((s) => s.id === sid) || { id: sid, short: sid, title: sid, color: '#94a3b8', icon: 'ticket' };

/** Linhas do ranking de salas/especialidades, com serviço, nome e sala. */
export function placeRows(stats, extras) {
  const rows = [];
  for (const s of (stats && stats.services) || []) for (const p of s.places || []) rows.push({ key: `${s.service_id}|${p.place_id}`, service: svcOf(s.service_id), place_id: p.place_id, name: nameOf(p.place_id, extras), room: roomOf(p.place_id, extras), issued: p.issued || 0, called: p.called || 0, served: p.served || 0, absent: p.absent || 0, pending: p.pending_result || 0, avg_min: p.avg_min, median_min: p.median_min, samples: p.samples || 0, absent_rate: p.called ? Math.round((100 * p.absent) / p.called) : null });
  return rows;
}
export function serviceRows(stats) {
  return ((stats && stats.services) || []).map((s) => ({ service: svcOf(s.service_id), issued: s.issued || 0, called: s.called || 0, served: s.served || 0, absent: s.absent || 0, pending: s.pending_result || 0, avg_min: s.avg_min, median_min: s.median_min, absent_rate: s.absent_rate, rooms: (s.places || []).length, active_rooms: (s.places || []).filter((p) => p.called > 0).length, per_hour: s.per_hour || {} }))
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
  const mostAbsent = rows.filter((r) => r.called >= 5).sort((a, b) => (b.absent_rate || 0) - (a.absent_rate || 0))[0] || null;
  const total = (stats && stats.total) || {};
  const spanMin = first && last ? Math.round((last.called_at - first.called_at) / 60000) : 0;
  const perHour = spanMin > 0 ? Math.round((total.called || 0) / Math.max(1, spanMin / 60)) : total.called || 0;
  return { first, last, peak: peak && peak.called ? peak : null, busiest, fastest, slowest, topService, mostAbsent, spanMin, perHour, activeRooms: rows.filter((r) => r.called > 0).length, rooms: rows.length };
}

/** Dia mostrado por padrão: dia de serviços de hoje; senão o último já ocorrido; senão o próximo. */
export function defaultDay(today) {
  const days = T.serviceDays(); const td = days.find((d) => d.date === today); if (td) return td;
  const past = days.filter((d) => d.date < today); if (past.length) return past[past.length - 1];
  return days[0];
}

/** Caminho SVG de um arco de donut (ângulos em graus, 0 = topo, sentido horário). */
export function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)); const y0 = cy + r * Math.sin(rad(a0)); const x1 = cx + r * Math.cos(rad(a1)); const y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
