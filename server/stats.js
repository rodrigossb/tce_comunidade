// Agregações do controle de senhas (puro, sem banco): usado pela API e pelos testes.
'use strict';

const MIN = 60000;
const median = (arr) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const avg = (arr) => (arr.length ? arr.reduce((n, x) => n + x, 0) / arr.length : null);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
// Hora local do evento (America/Belem, UTC-3, sem horário de verão), independente do fuso do servidor.
const hourOf = (ms) => ((Math.floor(ms / 3600000) - 3) % 24 + 24) % 24;

/**
 * issued: [{ service_id, count, ts }] (última contagem por serviço já filtrada)
 * calls:  [{ id, service_id, place_id, ticket, called_at, status, status_at, ended_at }]
 * nowMs:  relógio (ms) para "em atendimento há"
 */
function summarize(issued, calls, nowMs) {
  const now = nowMs || Date.now();
  const byService = {};
  const svc = (id) => (byService[id] = byService[id] || { service_id: id, issued: 0, issued_at: null, called: 0, served: 0, absent: 0, pending_result: 0, in_service: 0, durations: [], places: {}, per_hour: {}, last_ticket: null });
  const issuedByPlace = {};
  for (const i of issued) { const s = svc(i.service_id); if (i.place_id) { issuedByPlace[i.place_id] = i; s.issued += i.count; } else s.issued += i.count; if (!s.issued_at || i.ts > s.issued_at) s.issued_at = i.ts; }
  // Duração de atendimento: do "entrou" até o fim explícito ou até o próximo "entrou" na mesma sala.
  const byPlace = {};
  for (const c of calls) (byPlace[`${c.service_id}|${c.place_id}`] = byPlace[`${c.service_id}|${c.place_id}`] || []).push(c);
  for (const list of Object.values(byPlace)) {
    list.sort((a, b) => a.called_at - b.called_at || a.id - b.id);
    const served = list.filter((c) => c.status === 'served');
    served.forEach((c, k) => {
      const end = c.ended_at || (served[k + 1] ? served[k + 1].status_at : null);
      c._dur = end ? Math.max(0, end - c.status_at) : null;
      c._active = !end;
    });
  }
  for (const c of calls) {
    const s = svc(c.service_id);
    const p = (s.places[c.place_id] = s.places[c.place_id] || { place_id: c.place_id, issued: issuedByPlace[c.place_id] ? issuedByPlace[c.place_id].count : 0, called: 0, served: 0, absent: 0, pending_result: 0, in_service: 0, durations: [], current: null, last_call_at: null });
    s.called++; p.called++;
    if (c.ticket != null && (s.last_ticket == null || c.ticket > s.last_ticket)) s.last_ticket = c.ticket;
    const hour = hourOf(c.called_at); s.per_hour[hour] = (s.per_hour[hour] || 0) + 1;
    if (c.status === 'served') { s.served++; p.served++; if (c._dur != null) { s.durations.push(c._dur); p.durations.push(c._dur); } if (c._active) { s.in_service++; p.in_service++; } }
    else if (c.status === 'absent') { s.absent++; p.absent++; }
    else { s.pending_result++; p.pending_result++; }
    if (!p.last_call_at || c.called_at >= p.last_call_at) { p.last_call_at = c.called_at; p.current = { id: c.id, ticket: c.ticket, status: c.status, called_at: c.called_at, status_at: c.status_at, in_service_min: c._active && c.status_at ? round1((now - c.status_at) / MIN) : null }; }
  }
  const finish = (o) => {
    o.avg_min = round1(avg(o.durations) / MIN || null); o.median_min = round1(median(o.durations) / MIN || null);
    if (!o.durations.length) { o.avg_min = null; o.median_min = null; }
    o.samples = o.durations.length; delete o.durations;
    return o;
  };
  // Salas com senhas entregues mas ainda sem chamada também aparecem.
  for (const i of issued) if (i.place_id) { const s = svc(i.service_id); if (!s.places[i.place_id]) s.places[i.place_id] = { place_id: i.place_id, issued: i.count, called: 0, served: 0, absent: 0, pending_result: 0, in_service: 0, durations: [], current: null, last_call_at: null }; }
  const services = Object.values(byService).map((s) => {
    s.places = Object.values(s.places).map(finish).map((p) => { p.not_called = Math.max(0, (p.issued || 0) - p.called); p.est_wait_min = p.avg_min != null ? round1(p.not_called * p.avg_min) : null; return p; });
    s.not_called = Math.max(0, (s.issued || 0) - (s.called || 0));
    s.absent_rate = s.called ? round1((100 * s.absent) / s.called) : null;
    // Estimativa de espera: senhas ainda não chamadas × tempo médio ÷ salas ativas.
    const rooms = Math.max(1, s.places.filter((p) => p.served > 0).length);
    s.est_wait_min = s.avg_min == null && !s.samples ? null : null;
    finish(s);
    s.est_wait_min = s.avg_min != null ? round1((s.not_called * s.avg_min) / rooms) : null;
    return s;
  });
  const total = { issued: 0, called: 0, served: 0, absent: 0, pending_result: 0, in_service: 0, not_called: 0, avg_min: null, samples: 0 };
  const allDur = [];
  for (const c of calls) if (c._dur != null) allDur.push(c._dur);
  for (const s of services) for (const k of ['issued', 'called', 'served', 'absent', 'pending_result', 'in_service', 'not_called']) total[k] += s[k] || 0;
  total.avg_min = round1(avg(allDur) / MIN || null); if (!allDur.length) total.avg_min = null; total.samples = allDur.length;
  total.absent_rate = total.called ? round1((100 * total.absent) / total.called) : null;
  const per_hour = {}; for (const c of calls) { const h = hourOf(c.called_at); per_hour[h] = (per_hour[h] || 0) + 1; }
  return { total, services, per_hour };
}

module.exports = { summarize, median, avg };
