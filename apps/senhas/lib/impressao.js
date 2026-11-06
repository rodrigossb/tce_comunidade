// Módulo de impressão: previsão de senhas de um dia/local (puro, sem Next: testável). Lê o estado do banco (db.state) e
// monta, por serviço (pilar), as salas com a quantidade de senhas PREVISTAS — comuns (N) e prioritárias (P) — para o dia
// ("senhas por dia" da triagem, fila_cfg.n_total/p_total; não são as senhas entregues, que ficam em issued_log), com
// subtotais e total. Filtros: dia, local, serviços, "só salas com previsão" e incluir desativadas.
import { TCE as T } from '@tce/core';
import { DEFAULT_CFG, patternOf } from '@tce/core/fila';
import { fixedQueues, mergeExtras } from './filas-extra.js';

const D = T.D;
export const PREVISAO = [{ id: 'com', label: 'Só salas com previsão de senhas' }, { id: 'todas', label: 'Todas as salas (sem previsão = padrão do app)' }];

/** Parâmetros da URL → filtros normalizados. sp: objeto { local, dia, servicos, previsao, inativas } (strings). */
export function parseParams(sp, today) {
  const g = (k) => { const v = sp && sp[k]; return Array.isArray(v) ? v[0] : v; };
  const venue = D.maps && D.maps[g('local')] ? g('local') : (T.serviceDays()[0] || {}).venue || 'jn';
  const dia = g('dia'); const td = T.ticketDay(today || T.now().date, venue);
  const day = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : (td && td.date) || today;
  // serviços: ?servicos=a,b (links) e/ou ?svc=a&svc=b (caixas do formulário)
  const raw = String(g('servicos') || '').split(',').concat(sp && sp.svc != null ? [].concat(sp.svc) : []);
  const svcs = [...new Set(raw.map((s) => String(s).trim()).filter((s) => D.services.some((x) => x.id === s)))];
  const previsao = g('previsao') === 'todas' ? 'todas' : 'com';
  const inativas = g('inativas') === '1';
  return { day, venue, svcs, previsao, inativas };
}

/** Linhas da previsão a partir do estado do dia (db.state(day, venue)) e dos filtros de parseParams. */
export function previsao(state, f) {
  const filters = Object.assign({ svcs: [], previsao: 'com', inativas: false }, f || {});
  const cfgs = {}; for (const c of state.configs || []) cfgs[c.place_id] = c;
  const off = new Set(state.disabled || []); const sel = filters.svcs.length ? new Set(filters.svcs) : null;
  const groups = []; const total = { n: 0, p: 0, total: 0, count: 0 };
  for (const g of mergeExtras(fixedQueues(state.venue, state.day), state.extras || [])) {
    if (sel && !sel.has(g.service.id)) continue;
    const places = [];
    for (const p of g.places) {
      const disabled = off.has(p.id); if (disabled && !filters.inativas) continue;
      const c = cfgs[p.id]; const has = !!c && (Number(c.n_total) > 0 || Number(c.p_total) > 0);
      if (filters.previsao === 'com' && !has) continue;
      const cfg = c || DEFAULT_CFG; const n = has ? Number(c.n_total) : c ? 0 : Number(cfg.n_total); const p_ = has ? Number(c.p_total) : c ? 0 : Number(cfg.p_total);
      places.push({ id: p.id, name: p.name, kind: p.kind, num: p.num, extra: !!p.extra, disabled, has, zero: !!c && !has, default: !c, n, p: p_, total: n + p_, pattern: patternOf(cfg.pattern).short, mode: cfg.mode === 'contagem' ? 'contagem' : 'chamada', labels: { n: cfg.n_prefix, p: cfg.p_prefix } });
    }
    if (!places.length) continue;
    const sub = places.reduce((a, x) => ({ n: a.n + x.n, p: a.p + x.p, total: a.total + x.total, count: a.count + 1 }), { n: 0, p: 0, total: 0, count: 0 });
    total.n += sub.n; total.p += sub.p; total.total += sub.total; total.count += sub.count;
    groups.push({ service: g.service, places, sub });
  }
  // serviços disponíveis para o filtro: os que têm fila neste local (fixa ou criada na triagem)
  const services = mergeExtras(fixedQueues(state.venue, state.day), state.extras || []).map((g) => g.service);
  return { day: state.day, venue: state.venue, groups, total, services, filters };
}

/** Query string dos filtros (para links e para o formulário manter o estado). */
export function paramsOf(f) {
  const q = new URLSearchParams(); q.set('local', f.venue); q.set('dia', f.day);
  if (f.svcs && f.svcs.length) q.set('servicos', f.svcs.join(','));
  if (f.previsao === 'todas') q.set('previsao', 'todas');
  if (f.inativas) q.set('inativas', '1');
  return q.toString();
}
