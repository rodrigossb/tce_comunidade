import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrioList, formatPrioList, queuePlan, normalizeCfg, ticketLabel, PATTERNS } from '../src/fila.js';

const C = (id, ticket, priority, at) => ({ id, ticket, priority, called_at: at });

test('parsePrioList/formatPrioList (utilidade mantida)', () => {
  assert.deepEqual(parsePrioList('12-10, 3').spec, '3, 10-12');
  assert.ok(parsePrioList('3, x').error);
  assert.equal(formatPrioList([1, 2, 3, 7]), '1-3, 7');
});

test('normalizeCfg: padrão N/P, valida prefixos, inícios e totais', () => {
  const d = normalizeCfg(null); assert.equal(d.error, null); assert.deepEqual(d.cfg, { n_prefix: 'N', p_prefix: 'P', n_from: 1, p_from: 1, n_total: 100, p_total: 20, pattern: '1:1', mode: 'chamada' });
  assert.equal(normalizeCfg({ mode: 'contagem' }).cfg.mode, 'contagem'); assert.equal(normalizeCfg({ mode: 'x' }).cfg.mode, 'chamada');
  assert.equal(normalizeCfg({ n_prefix: ' a ', p_prefix: 'b', n_total: '150', p_total: '', pattern: '1:2' }).cfg.n_prefix, 'A');
  assert.equal(normalizeCfg({ n_total: '150', p_total: '' }).cfg.p_total, 0);
  assert.match(normalizeCfg({ n_prefix: 'X', p_prefix: 'X' }).error, /diferentes/);
  assert.match(normalizeCfg({ n_from: 0 }).error, /início das comuns/);
  assert.match(normalizeCfg({ p_total: -1 }).error, /total de prioritárias/);
  assert.equal(normalizeCfg({ pattern: 'zzz' }).cfg.pattern, '1:1');
  assert.equal(ticketLabel(12, 0), 'N 12'); assert.equal(ticketLabel(3, 1), 'P 3'); assert.equal(ticketLabel(5, 0, { n_prefix: '' }), '5'); assert.equal(ticketLabel(null, 0), '—');
  assert.ok(PATTERNS.some((p) => p.id === 'p-first'));
});

test('queuePlan: duas séries, intercala 1P:1N começando pela prioridade; só um tipo quando o outro acabou; além da triagem', () => {
  const cfg = { n_total: 10, p_total: 2 };
  let p = queuePlan({ cfg, issued: { n: 0, p: 0 }, calls: [] });
  assert.deepEqual(p.next, { ticket: 1, priority: true, why: 'alternado' });
  assert.equal(p.normal.next, 1); assert.equal(p.prio.next, 1); assert.equal(p.normal.left, 10); assert.equal(p.prio.left, 2); assert.equal(p.has_prio, true);
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1)] }); assert.deepEqual(p.next, { ticket: 1, priority: false, why: 'alternado' }); assert.equal(p.prio.last, 1); assert.equal(p.normal.last, null);
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1), C(2, 1, 0, 2)] }); assert.deepEqual(p.next, { ticket: 2, priority: true, why: 'alternado' });
  // P acabou (p_total 2): só comuns
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1), C(2, 1, 0, 2), C(3, 2, 1, 3)] }); assert.deepEqual(p.next, { ticket: 2, priority: false, why: 'so-normais' });
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1), C(2, 1, 0, 2), C(3, 2, 1, 3), C(4, 2, 0, 4)] }); assert.deepEqual(p.next, { ticket: 3, priority: false, why: 'so-normais' }); assert.equal(p.prio.left, 0);
  // tudo chamado: sugere a comum seguinte mesmo assim
  const all = []; let t = 1; for (let i = 1; i <= 10; i++) all.push(C(t, i, 0, t++)); for (let i = 1; i <= 2; i++) all.push(C(t, i, 1, t++));
  p = queuePlan({ cfg, issued: null, calls: all }); assert.deepEqual(p.next, { ticket: 11, priority: false, why: 'sem-registro' });
  // a mesma numeração nas duas séries não se confunde: N 1 e P 1 são senhas diferentes
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 0, 1)] }); assert.equal(p.normal.last, 1); assert.equal(p.prio.last, null); assert.equal(p.prio.next, 1);
});

test('queuePlan: entregues limita cada série (quando informado); sem entregues vale o total; sem prioritárias has_prio=false', () => {
  const cfg = { n_total: 100, p_total: 20 };
  let p = queuePlan({ cfg, issued: { n: 3, p: 1 }, calls: [C(1, 1, 1, 1), C(2, 1, 0, 2), C(3, 2, 0, 3), C(4, 3, 0, 4)] });
  assert.equal(p.normal.left, 0); assert.equal(p.normal.next, null); assert.equal(p.prio.left, 0);
  assert.deepEqual(p.next, { ticket: 4, priority: false, why: 'sem-registro' });
  p = queuePlan({ cfg, issued: { n: 5, p: 1 }, calls: [C(1, 1, 1, 1)] }); assert.deepEqual(p.next, { ticket: 1, priority: false, why: 'so-normais' }); assert.equal(p.normal.left, 5);
  const q = queuePlan({ cfg: { n_total: 50, p_total: 0 }, issued: null, calls: [] }); assert.equal(q.has_prio, false); assert.deepEqual(q.next, { ticket: 1, priority: false, why: 'so-normais' });
});

test('queuePlan: ordens 1P:2N, 2P:1N e todas as P primeiro', () => {
  const cfg = { n_total: 100, p_total: 20, pattern: '1:2' };
  let p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1)] }); assert.equal(p.next.priority, false);
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1), C(2, 1, 0, 2)] }); assert.equal(p.next.priority, false, 'segunda comum da rodada');
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1), C(2, 1, 0, 2), C(3, 2, 0, 3)] }); assert.equal(p.next.priority, true, 'depois de 2 comuns, prioridade');
  // exceção da porta: duas P seguidas; a ordem continua a partir dali (rodada de P já cumprida → comuns)
  p = queuePlan({ cfg, issued: null, calls: [C(1, 1, 1, 1), C(2, 2, 1, 2)] }); assert.equal(p.next.priority, false); assert.equal(p.next.ticket, 1);
  const two = { n_total: 100, p_total: 20, pattern: '2:1' };
  p = queuePlan({ cfg: two, issued: null, calls: [C(1, 1, 1, 1)] }); assert.equal(p.next.priority, true, '2P:1N: segunda prioridade');
  p = queuePlan({ cfg: two, issued: null, calls: [C(1, 1, 1, 1), C(2, 2, 1, 2)] }); assert.equal(p.next.priority, false);
  const pf = { n_total: 100, p_total: 3, pattern: 'p-first' };
  p = queuePlan({ cfg: pf, issued: null, calls: [C(1, 1, 1, 1), C(2, 2, 1, 2)] }); assert.deepEqual(p.next, { ticket: 3, priority: true, why: 'alternado' });
  p = queuePlan({ cfg: pf, issued: null, calls: [C(1, 1, 1, 1), C(2, 2, 1, 2), C(3, 3, 1, 3)] }); assert.deepEqual(p.next, { ticket: 1, priority: false, why: 'so-normais' });
});

test('queuePlan: número inicial por série (senhas já impressas 1-79 comuns e 80-100 prioritárias)', () => {
  const cfg = { n_from: 1, n_total: 79, p_from: 80, p_total: 21 };
  let p = queuePlan({ cfg, issued: null, calls: [] });
  assert.deepEqual(p.next, { ticket: 80, priority: true, why: 'alternado' }); assert.equal(p.prio.last, null); assert.equal(p.prio.left, 21);
  p = queuePlan({ cfg, issued: null, calls: [C(1, 80, 1, 1)] }); assert.deepEqual(p.next, { ticket: 1, priority: false, why: 'alternado' }); assert.equal(p.prio.last, 80);
  p = queuePlan({ cfg, issued: { n: 10, p: 2 }, calls: [C(1, 80, 1, 1), C(2, 1, 0, 2), C(3, 81, 1, 3)] }); assert.equal(p.prio.next, null); assert.equal(p.prio.left, 0); assert.equal(p.normal.left, 9);
});

test('queuePlan: ajuste manual (from) recomeça a sequência e ignora chamadas anteriores ao ajuste', () => {
  const cfg = { n_total: 200, p_total: 21, p_from: 180 };
  const calls = [C(1, 83, 0, 10), C(2, 84, 0, 20), C(3, 181, 1, 30), C(4, 85, 0, 40)];
  let p = queuePlan({ cfg, issued: null, calls, from: { normal: 3, prio: 179, ts: 50 } });
  assert.equal(p.normal.last, 3); assert.equal(p.normal.next, 4); assert.equal(p.prio.last, null); assert.equal(p.prio.next, 180);
  p = queuePlan({ cfg, issued: null, calls: calls.concat([C(9, 180, 1, 60)]), from: { normal: 3, prio: 179, ts: 50 } });
  assert.equal(p.prio.last, 180); assert.deepEqual(p.next, { ticket: 4, priority: false, why: 'alternado' });
  p = queuePlan({ cfg, issued: null, calls, from: { normal: 0, prio: 0, ts: 50 } });
  assert.equal(p.normal.last, null); assert.equal(p.normal.next, 1); assert.equal(p.prio.next, 180);
  assert.equal(queuePlan({ cfg, issued: null, calls }).normal.last, 85);
});
