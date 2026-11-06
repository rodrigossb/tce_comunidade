// Módulo de impressão: previsão de senhas de um dia/local (puro, sem Next: testável). Lê o estado do banco (db.state) e
// monta, por serviço (pilar), as salas com a quantidade de senhas PREVISTAS — comuns (N) e prioritárias (P) — para o dia
// ("senhas por dia" da triagem, fila_cfg.n_total/p_total; não são as senhas entregues, que ficam em issued_log), com
// subtotais e total. Filtros: dia, local, categorias (serviços/pilares), atendimentos (salas), faixa de senhas (série e
// intervalo de números — só nas senhas para recortar), "só salas com previsão" e incluir desativadas.
import { TCE as T } from '@tce/core';
import { DEFAULT_CFG, patternOf } from '@tce/core/fila';
import { fixedQueues, mergeExtras } from './filas-extra.js';

const D = T.D;
export const PREVISAO = [{ id: 'com', label: 'Só salas com previsão de senhas' }, { id: 'todas', label: 'Todas as salas (sem previsão = padrão do app)' }];
export const SERIES = [{ id: 'np', label: 'Comuns e prioritárias' }, { id: 'n', label: 'Só comuns' }, { id: 'p', label: 'Só prioritárias' }];
const PLACE_ID = /^[a-z0-9]{1,10}-[a-z]{1,3}\d{1,4}$/i; // jn-r09, jn-x8, mg-t2…

/** Parâmetros da URL → filtros normalizados. sp: objeto { local, dia, servicos|svc, salas|sala, serie, de, ate, previsao,
    inativas, formato } (strings). Faixa: serie np (padrão) | n | p; de/ate = números impressos (inclusive), vazios = sem limite. */
export function parseParams(sp, today) {
  const g = (k) => { const v = sp && sp[k]; return Array.isArray(v) ? v[0] : v; };
  const venue = D.maps && D.maps[g('local')] ? g('local') : (T.serviceDays()[0] || {}).venue || 'jn';
  const dia = g('dia'); const td = T.ticketDay(today || T.now().date, venue);
  const day = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : (td && td.date) || today;
  // serviços: ?servicos=a,b (links) e/ou ?svc=a&svc=b (caixas do formulário)
  const raw = String(g('servicos') || '').split(',').concat(sp && sp.svc != null ? [].concat(sp.svc) : []);
  const svcs = [...new Set(raw.map((s) => String(s).trim()).filter((s) => D.services.some((x) => x.id === s)))];
  // atendimentos (salas): ?salas=jn-r09,jn-x8 (links) e/ou ?sala=… (caixas); ids de salas da planta ou criadas na triagem
  const rawR = String(g('salas') || '').split(',').concat(sp && sp.sala != null ? [].concat(sp.sala) : []);
  const salas = [...new Set(rawR.map((s) => String(s).trim()).filter((s) => PLACE_ID.test(s)))];
  const previsao = g('previsao') === 'todas' ? 'todas' : 'com';
  const inativas = g('inativas') === '1';
  const formato = g('formato') === 'lista' ? 'lista' : 'senhas';
  const serie = g('serie') === 'n' || g('serie') === 'p' ? g('serie') : 'np';
  const int = (k) => { const v = parseInt(g(k), 10); return Number.isFinite(v) && v > 0 ? v : null; };
  let de = int('de'); let ate = int('ate'); if (de && ate && ate < de) [de, ate] = [ate, de];
  return { day, venue, svcs, salas, previsao, inativas, formato, serie, de, ate };
}

/** Faixa escolhida em palavras ("só comuns · do nº 25 ao 48"); vazio quando é tudo. */
export function rangeText(f) {
  const out = []; const s = SERIES.find((x) => x.id === (f.serie || 'np'));
  if (s && s.id !== 'np') out.push(s.label.toLowerCase());
  if (f.de && f.ate) out.push(f.de === f.ate ? `só o nº ${f.de}` : `do nº ${f.de} ao ${f.ate}`); else if (f.de) out.push(`a partir do nº ${f.de}`); else if (f.ate) out.push(`até o nº ${f.ate}`);
  return out.join(' · ');
}

/** Linhas da previsão a partir do estado do dia (db.state(day, venue)) e dos filtros de parseParams. Uma sala marcada em
    `salas` entra sempre (mesmo sem previsão ou desativada): foi um pedido explícito. `rooms` lista todas as salas do
    local (para as caixas do filtro), com serviço, previsão e situação. */
export function previsao(state, f) {
  const filters = Object.assign({ svcs: [], salas: [], previsao: 'com', inativas: false }, f || {});
  const cfgs = {}; for (const c of state.configs || []) cfgs[c.place_id] = c;
  const off = new Set(state.disabled || []); const sel = filters.svcs.length ? new Set(filters.svcs) : null;
  const selR = filters.salas && filters.salas.length ? new Set(filters.salas) : null;
  const groups = []; const total = { n: 0, p: 0, total: 0, count: 0 }; const rooms = [];
  const merged = mergeExtras(fixedQueues(state.venue, state.day), state.extras || []);
  for (const g of merged) for (const p of g.places) {
    const c = cfgs[p.id]; const has = !!c && (Number(c.n_total) > 0 || Number(c.p_total) > 0);
    rooms.push({ id: p.id, name: p.name, kind: p.kind, num: p.num, service_id: g.service.id, extra: !!p.extra, disabled: off.has(p.id), has, n: has ? Number(c.n_total) : 0, p: has ? Number(c.p_total) : 0 });
  }
  for (const g of merged) {
    if (sel && !sel.has(g.service.id)) continue;
    const places = [];
    for (const p of g.places) {
      const picked = !!selR && selR.has(p.id); if (selR && !picked) continue;
      const disabled = off.has(p.id); if (disabled && !filters.inativas && !picked) continue;
      const c = cfgs[p.id]; const has = !!c && (Number(c.n_total) > 0 || Number(c.p_total) > 0);
      if (filters.previsao === 'com' && !has && !picked) continue;
      const cfg = c || DEFAULT_CFG; const n = has ? Number(c.n_total) : c ? 0 : Number(cfg.n_total); const p_ = has ? Number(c.p_total) : c ? 0 : Number(cfg.p_total);
      places.push({ id: p.id, name: p.name, kind: p.kind, num: p.num, extra: !!p.extra, disabled, has, zero: !!c && !has, default: !c, n, p: p_, total: n + p_, pattern: patternOf(cfg.pattern).short, mode: cfg.mode === 'contagem' ? 'contagem' : 'chamada', labels: { n: cfg.n_prefix, p: cfg.p_prefix }, from: { n: Number(cfg.n_from) || 1, p: Number(cfg.p_from) || 1 } });
    }
    if (!places.length) continue;
    const sub = places.reduce((a, x) => ({ n: a.n + x.n, p: a.p + x.p, total: a.total + x.total, count: a.count + 1 }), { n: 0, p: 0, total: 0, count: 0 });
    total.n += sub.n; total.p += sub.p; total.total += sub.total; total.count += sub.count;
    groups.push({ service: g.service, places, sub });
  }
  // serviços disponíveis para o filtro: os que têm fila neste local (fixa ou criada na triagem)
  const services = merged.map((g) => g.service);
  return { day: state.day, venue: state.venue, groups, total, services, rooms, filters };
}

/** Query string dos filtros (para links e para o formulário manter o estado). */
export function paramsOf(f) {
  const q = new URLSearchParams(); q.set('local', f.venue); q.set('dia', f.day);
  if (f.svcs && f.svcs.length) q.set('servicos', f.svcs.join(','));
  if (f.salas && f.salas.length) q.set('salas', f.salas.join(','));
  if (f.serie && f.serie !== 'np') q.set('serie', f.serie);
  if (f.de) q.set('de', String(f.de));
  if (f.ate) q.set('ate', String(f.ate));
  if (f.previsao === 'todas') q.set('previsao', 'todas');
  if (f.inativas) q.set('inativas', '1');
  if (f.formato === 'lista') q.set('formato', 'lista');
  return q.toString();
}

export const FORMATOS = [{ id: 'senhas', label: 'Senhas para recortar (24 por folha A4)' }, { id: 'lista', label: 'Lista resumo (tabela por serviço)' }];
export const PER_PAGE = 24; // 4 colunas × 6 linhas em A4 retrato

/** Número da senha como impresso: dois dígitos no mínimo ("01", "12", "100"). */
export const padTicket = (n) => String(n).padStart(2, '0');
/** O número impresso está na faixa { serie, de, ate }? (de/ate inclusivos; vazios = sem limite). */
export const inRange = (num, range) => !range || ((!range.de || num >= range.de) && (!range.ate || num <= range.ate));
/** Senhas de uma sala da previsão, na ordem de impressão: comuns (só o número, a partir de n_from) e depois prioritárias
    (prefixo P + número, a partir de p_from) — o padrão do modelo: "01 … 50" e "P01 … P10". `range` (opcional) limita a
    série (np | n | p) e o intervalo de números de cada série. → [{ label, prio, num }] */
export function ticketsOf(place, range) {
  const out = []; const from = place.from || { n: 1, p: 1 }; const pp = (place.labels && place.labels.p) || 'P'; const serie = (range && range.serie) || 'np';
  if (serie !== 'p') for (let i = 0; i < (place.n || 0); i++) { const num = from.n + i; if (inRange(num, range)) out.push({ num, prio: false, label: padTicket(num) }); }
  if (serie !== 'n') for (let i = 0; i < (place.p || 0); i++) { const num = from.p + i; if (inRange(num, range)) out.push({ num, prio: true, label: `${pp}${padTicket(num)}` }); }
  return out;
}
/** Divide as senhas de uma sala em folhas de PER_PAGE (cada sala começa em folha nova, para recortar e separar por sala). */
export function pagesOf(place, per, range) { const t = ticketsOf(place, range); const n = per || PER_PAGE; const pages = []; for (let i = 0; i < t.length; i += n) pages.push(t.slice(i, i + n)); return pages; }
/** Atalhos de faixa: uma folha de PER_PAGE senhas cada ("1–24", "25–48"…), para reimprimir só a folha que faltou. */
export const PRESETS = [1, 2, 3, 4].map((i) => ({ de: (i - 1) * PER_PAGE + 1, ate: i * PER_PAGE, label: `${(i - 1) * PER_PAGE + 1}–${i * PER_PAGE}`, folha: i }));
