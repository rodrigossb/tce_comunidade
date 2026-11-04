// Fila de senhas por sala com prioridades (puro, sem banco): a triagem informa as senhas prioritárias de cada sala
// como lista/intervalos ("5, 12, 100-120"); as demais senhas entregues (1..count) são comuns. A porta chama de forma
// INTERCALADA (uma prioritária, uma comum); quando um dos tipos não tem senha entregue ainda não chamada, chama só o outro.
// A "próxima" de cada tipo é o menor número daquele tipo acima do maior já chamado (pular números é permitido: "outro número").

const MAX_TICKET = 100000;
const MAX_RANGE = 5000; // um intervalo "1-100000" não faz sentido numa sala

/** "5, 12, 100-120" → { nums: [5, 12, 100, …, 120], spec: texto normalizado, error: string|null }. Aceita ";", espaços e "–". */
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
 * count: total de senhas entregues (1..count) ou null (triagem ainda não lançou) · prio: números prioritários ·
 * calls: chamadas da sala [{ ticket, called_at, priority? }] (qualquer ordem; `priority` gravado na chamada prevalece sobre a lista atual).
 * from: ajuste manual { normal, prio, ts } — última comum/prioritária informada na porta; chamadas até `ts` são ignoradas na sequência.
 * Devolve { normal: { last, next, left, total }, prio: { last, next, left, total }, has_prio,
 *           next: { ticket, priority, why } } — `why`: 'alternado' | 'so-normais' | 'so-prioridade' | 'sem-registro' (acabou o
 * que a triagem lançou: chama a comum seguinte mesmo assim, porque a contagem pode estar atrasada).
 */
export function queuePlan({ count, prio, calls, from }) {
  const total = Number.isInteger(count) && count >= 0 ? count : null;
  const pset = new Set((prio || []).filter((n) => Number.isInteger(n) && n > 0));
  const isP = (t) => pset.has(t);
  // Ajuste manual na porta ("o número atual é X"): a sequência recomeça do que foi informado e só as chamadas feitas
  // DEPOIS do ajuste contam para a sequência (as anteriores continuam no histórico/estatística).
  const base = from && (Number.isInteger(from.normal) || Number.isInteger(from.prio)) ? { normal: Math.max(0, from.normal | 0), prio: Math.max(0, from.prio | 0), ts: Number(from.ts) || 0 } : null;
  // Chamada antiga: vale como foi registrada na hora (priority 1/0). A lista da triagem pode mudar durante o dia
  // ("80-100" → "180-200") e as senhas já chamadas como prioridade não podem virar comuns — senão a próxima comum
  // "pula" para depois delas. Sem o campo gravado (registros antigos), cai na lista atual.
  const wasP = (c) => (c.priority != null ? !!Number(c.priority) : isP(c.ticket));
  const list = (calls || []).filter((c) => c && c.ticket != null && (!base || (c.called_at || 0) > base.ts));
  let lastN = base ? base.normal : 0; let lastP = base ? base.prio : 0; let lastCall = null;
  for (const c of list) {
    if (wasP(c)) lastP = Math.max(lastP, c.ticket); else lastN = Math.max(lastN, c.ticket);
    if (!lastCall || (c.called_at || 0) > (lastCall.called_at || 0) || ((c.called_at || 0) === (lastCall.called_at || 0) && (c.id || 0) > (lastCall.id || 0))) lastCall = c;
  }
  // próxima comum: menor número não prioritário acima de lastN (dentro do entregue, se a contagem existe)
  const nextNormalFrom = (from, limit) => { for (let n = from + 1; limit == null || n <= limit; n++) { if (!isP(n)) return n; if (n > from + MAX_RANGE + 1) break; } return null; };
  const nextN = nextNormalFrom(lastN, total);
  const prioIssued = [...pset].filter((n) => total == null || n <= total).sort((a, b) => a - b);
  const nextP = prioIssued.find((n) => n > lastP) || null;
  const leftP = prioIssued.filter((n) => n > lastP).length;
  const totalN = total == null ? null : Math.max(0, total - prioIssued.length);
  const leftN = total == null ? null : Math.max(0, totalN - [...Array(Math.max(0, Math.min(lastN, total))).keys()].filter((i) => !isP(i + 1)).length);
  let next = null;
  if (nextN != null && nextP != null) { const lastWasP = lastCall ? wasP(lastCall) : false; next = lastWasP ? { ticket: nextN, priority: false, why: 'alternado' } : { ticket: nextP, priority: true, why: 'alternado' }; }
  else if (nextP != null) next = { ticket: nextP, priority: true, why: 'so-prioridade' };
  else if (nextN != null) next = { ticket: nextN, priority: false, why: 'so-normais' };
  else next = { ticket: nextNormalFrom(lastN, null), priority: false, why: 'sem-registro' };
  return {
    has_prio: pset.size > 0,
    normal: { last: lastN || null, next: nextN, left: leftN, total: totalN },
    prio: { last: lastP || null, next: nextP, left: leftP, total: prioIssued.length },
    next,
  };
}

/** Texto curto do porquê da próxima (porta da sala). */
export function whyLabel(why) {
  return why === 'alternado' ? 'intercalando prioridade e comum' : why === 'so-prioridade' ? 'só restam prioritárias' : why === 'so-normais' ? 'só restam comuns' : why === 'sem-registro' ? 'além do que a triagem lançou' : '';
}
