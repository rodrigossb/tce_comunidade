// Fila de senhas por sala com DUAS SÉRIES independentes (puro, sem banco): comuns "N" (N 1, N 2, …) e prioritárias "P"
// (P 1, P 2, …). A triagem configura cada série (prefixo, número inicial, total possível) e a ORDEM de chamada
// (intercalar 1 P : 1 N, 1 P : 2 N, 1 P : 3 N, ou todas as P primeiro) e vai informando quantas de cada já entregou.
// A porta chama a próxima sugerida pela ordem, mas pode chamar explicitamente a próxima N ou a próxima P (exceções:
// duas prioridades seguidas), outro número, ou "ajustar o número atual" quando avançou errado.

const MAX_TICKET = 100000;
const MAX_RANGE = 5000; // um intervalo "1-100000" não faz sentido numa sala

/** Ordens de chamada disponíveis na triagem: id → { p, n } = a cada p prioritárias, n comuns (p-first: todas as P antes). */
export const PATTERNS = [
  { id: '1:1', label: '1 prioridade, 1 comum', short: '1P : 1N', p: 1, n: 1 },
  { id: '1:2', label: '1 prioridade, 2 comuns', short: '1P : 2N', p: 1, n: 2 },
  { id: '1:3', label: '1 prioridade, 3 comuns', short: '1P : 3N', p: 1, n: 3 },
  { id: '2:1', label: '2 prioridades, 1 comum', short: '2P : 1N', p: 2, n: 1 },
  { id: 'p-first', label: 'todas as prioridades primeiro', short: 'P antes', p: Infinity, n: 0 },
];
export const DEFAULT_PATTERN = '1:1';
export const patternOf = (id) => PATTERNS.find((x) => x.id === id) || PATTERNS[0];
export const patternLabel = (id) => patternOf(id).label;

/** Configuração padrão de uma fila (a triagem pode mudar por sala ou para todas). */
/** Modo da fila no dia: 'chamada' (senhas chamadas na porta; aparece na TV e na porta) ou 'contagem' (só a quantidade entregue
    conta como atendimentos nas estatísticas; não aparece na TV nem na porta). */
export const MODES = [{ id: 'chamada', label: 'Chamada na porta', short: 'Chamada' }, { id: 'contagem', label: 'Só contagem (sem chamada)', short: 'Contagem' }];
export const DEFAULT_CFG = { n_prefix: 'N', p_prefix: 'P', n_from: 1, p_from: 1, n_total: 100, p_total: 20, pattern: DEFAULT_PATTERN, mode: 'chamada' };

/** Normaliza/valida uma configuração parcial sobre a padrão → { cfg, error }. Prefixo: 0–3 letras/dígitos. */
export function normalizeCfg(raw) {
  const c = Object.assign({}, DEFAULT_CFG, raw || {});
  const out = {}; const bad = [];
  for (const k of ['n_prefix', 'p_prefix']) { const v = String(c[k] == null ? '' : c[k]).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); out[k] = v; }
  if (out.n_prefix && out.n_prefix === out.p_prefix) bad.push('os prefixos N e P precisam ser diferentes');
  for (const k of ['n_from', 'p_from']) { const v = Number(c[k]); if (!Number.isInteger(v) || v < 1 || v > MAX_TICKET) bad.push(`${k === 'n_from' ? 'início das comuns' : 'início das prioritárias'} inválido`); out[k] = v; }
  for (const k of ['n_total', 'p_total']) { const v = c[k] === '' || c[k] == null ? 0 : Number(c[k]); if (!Number.isInteger(v) || v < 0 || v > MAX_TICKET) bad.push(`${k === 'n_total' ? 'total de comuns' : 'total de prioritárias'} inválido`); out[k] = v; }
  out.pattern = PATTERNS.some((x) => x.id === c.pattern) ? c.pattern : DEFAULT_PATTERN;
  out.mode = c.mode === 'contagem' ? 'contagem' : 'chamada';
  return { cfg: out, error: bad.length ? bad.join('; ') : null };
}

/** Rótulo de uma senha: prefixo + número ("N 12", "P 3"; sem prefixo, só o número). */
export const ticketLabel = (ticket, priority, cfg) => { const pre = (cfg || DEFAULT_CFG)[priority ? 'p_prefix' : 'n_prefix']; return ticket == null ? '—' : pre ? `${pre} ${ticket}` : String(ticket); };

/** "5, 12, 100-120" → { nums, spec, error } (mantido para dados antigos e utilidades). Aceita ";", espaços e "–". */
export function parsePrioList(text) {
  const src = String(text == null ? '' : text).replace(/[–—]/g, '-');
  const parts = src.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const set = new Set(); const bad = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) { bad.push(p); continue; }
    let a = Number(m[1]); let b = m[2] != null ? Number(m[2]) : a;
    if (b < a) [a, b] = [b, a];
    if (a < 1 || b > MAX_TICKET || b - a + 1 > MAX_RANGE) { bad.push(p); continue; }
    for (let n = a; n <= b; n++) set.add(n);
  }
  const nums = [...set].sort((x, y) => x - y);
  return { nums, spec: formatPrioList(nums), error: bad.length ? `não entendi: ${bad.join(', ')}` : null };
}
/** [5, 12, 100, 101, …, 120] → "5, 12, 100-120" */
export function formatPrioList(nums) {
  const a = [...new Set((nums || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j - i >= 2 ? `${a[i]}-${a[j]}` : j === i ? `${a[i]}` : `${a[i]}, ${a[j]}`); i = j + 1; }
  return out.join(', ');
}

/**
 * Plano da fila de uma sala.
 *  cfg:    configuração da triagem (normalizeCfg): prefixos, n_from/p_from (primeiro número), n_total/p_total (possíveis), pattern.
 *  issued: { n, p } quantas de cada série a triagem já entregou (null/0 = não informado → vale o total configurado).
 *  calls:  chamadas da sala [{ id, ticket, priority, called_at }] (qualquer ordem; `priority` = série P).
 *  from:   ajuste manual { normal, prio, ts } — última N/P informada na porta; chamadas até `ts` saem da sequência.
 * Devolve { normal: { last, next, left, issued, total, from }, prio: {…}, has_prio, pattern,
 *           next: { ticket, priority, why } } — why: 'alternado' | 'so-normais' | 'so-prioridade' | 'sem-registro'
 * (acabou o que a triagem lançou: sugere a comum seguinte mesmo assim, porque a contagem pode estar atrasada).
 */
export function queuePlan({ cfg: rawCfg, issued, calls, from }) {
  const cfg = normalizeCfg(rawCfg).cfg;
  const pat = patternOf(cfg.pattern);
  const base = from && (Number.isInteger(from.normal) || Number.isInteger(from.prio)) ? { normal: Math.max(0, from.normal | 0), prio: Math.max(0, from.prio | 0), ts: Number(from.ts) || 0 } : null;
  const list = (calls || []).filter((c) => c && c.ticket != null && (!base || (c.called_at || 0) > base.ts)).slice()
    .sort((a, b) => (a.called_at || 0) - (b.called_at || 0) || (a.id || 0) - (b.id || 0));
  const isP = (c) => !!Number(c.priority);
  // Ajuste manual abaixo do número inicial (ex.: 0 = "nenhuma") vale como "antes da primeira".
  let lastN = Math.max(cfg.n_from - 1, base ? base.normal : 0); let lastP = Math.max(cfg.p_from - 1, base ? base.prio : 0);
  for (const c of list) { if (isP(c)) lastP = Math.max(lastP, c.ticket); else lastN = Math.max(lastN, c.ticket); }
  // Limite de cada série: o que a triagem já entregou (contado a partir do número inicial); sem lançamento, o total possível.
  const issuedN = issued && issued.n > 0 ? issued.n : 0; const issuedP = issued && issued.p > 0 ? issued.p : 0;
  const limitN = cfg.n_from - 1 + (issuedN || cfg.n_total || 0); const limitP = cfg.p_from - 1 + (issuedP || cfg.p_total || 0);
  const nextN = lastN + 1 <= limitN ? lastN + 1 : null;
  const nextP = lastP + 1 <= limitP ? lastP + 1 : null;
  const leftN = Math.max(0, limitN - lastN); const leftP = Math.max(0, limitP - lastP);
  // Ordem: conta a "rodada" atual desde a última troca de série (ex.: 1P:2N → depois de uma P, duas N; depois, P).
  let runP = 0; let runN = 0;
  for (let i = list.length - 1; i >= 0; i--) { const p = isP(list[i]); if (runP === 0 && runN === 0) { if (p) runP = 1; else runN = 1; continue; } if (p && runP && !runN) runP++; else if (!p && runN && !runP) runN++; else break; }
  let next = null;
  if (nextN != null && nextP != null) {
    const wantP = pat.n === 0 ? true : runP ? runP >= pat.p ? false : true : runN ? runN >= pat.n : true; // sem chamadas: começa pela prioridade
    next = wantP ? { ticket: nextP, priority: true, why: 'alternado' } : { ticket: nextN, priority: false, why: 'alternado' };
  } else if (nextP != null) next = { ticket: nextP, priority: true, why: 'so-prioridade' };
  else if (nextN != null) next = { ticket: nextN, priority: false, why: 'so-normais' };
  else next = { ticket: lastN + 1, priority: false, why: 'sem-registro' };
  const has_prio = cfg.p_total > 0 || issuedP > 0 || lastP >= cfg.p_from;
  return {
    cfg, pattern: cfg.pattern, has_prio,
    // over: a seguinte da série mesmo além do lançado/total (a porta pode chamar explicitamente; a contagem pode estar atrasada)
    normal: { last: lastN >= cfg.n_from ? lastN : null, next: nextN, over: lastN + 1, left: leftN, issued: issuedN, total: cfg.n_total, from: cfg.n_from, label: cfg.n_prefix },
    prio: { last: lastP >= cfg.p_from ? lastP : null, next: nextP, over: lastP + 1, left: leftP, issued: issuedP, total: cfg.p_total, from: cfg.p_from, label: cfg.p_prefix },
    next,
  };
}

/** Texto curto do porquê da próxima (porta da sala). */
export function whyLabel(why) {
  return why === 'alternado' ? 'pela ordem configurada' : why === 'so-prioridade' ? 'só restam prioritárias' : why === 'so-normais' ? 'só restam comuns' : why === 'sem-registro' ? 'além do que a triagem lançou' : '';
}
