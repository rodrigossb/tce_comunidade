import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrioList, formatPrioList, queuePlan } from '../src/fila.js';

test('parsePrioList: números, intervalos, separadores e erros', () => {
  const r = parsePrioList(' 5, 12; 100-103 7 '); assert.deepEqual(r.nums, [5, 7, 12, 100, 101, 102, 103]); assert.equal(r.spec, '5, 7, 12, 100-103'); assert.equal(r.error, null);
  assert.deepEqual(parsePrioList('20-18').nums, [18, 19, 20]);
  assert.deepEqual(parsePrioList('').nums, []);
  const e = parsePrioList('3, abc, 0-2'); assert.deepEqual(e.nums, [3]); assert.match(e.error, /abc/);
  assert.equal(formatPrioList([1, 2, 3, 5, 8, 9]), '1-3, 5, 8, 9');
});

test('queuePlan: intercala prioridade e comum; só um tipo quando o outro acabou; além da triagem', () => {
  const prio = [3, 10, 11, 12];
  let p = queuePlan({ count: 12, prio, calls: [] });
  assert.equal(p.has_prio, true); assert.deepEqual(p.next, { ticket: 3, priority: true, why: 'alternado' }, 'começa pela prioritária');
  assert.equal(p.normal.next, 1); assert.equal(p.normal.total, 8); assert.equal(p.normal.left, 8); assert.equal(p.prio.left, 4);
  p = queuePlan({ count: 12, prio, calls: [{ ticket: 3, called_at: 1 }] });
  assert.deepEqual(p.next, { ticket: 1, priority: false, why: 'alternado' });
  p = queuePlan({ count: 12, prio, calls: [{ ticket: 3, called_at: 1 }, { ticket: 1, called_at: 2 }] });
  assert.equal(p.next.ticket, 10); assert.equal(p.prio.last, 3); assert.equal(p.normal.last, 1);
  // pulou a comum 2 → próxima comum é a 4 (não prioritária acima da 2)... aqui: última comum 5 → próxima 6
  p = queuePlan({ count: 12, prio, calls: [{ ticket: 3, called_at: 1 }, { ticket: 5, called_at: 2 }] });
  assert.equal(p.normal.next, 6); assert.equal(p.normal.left, 4);
  // prioritárias acabaram → só comuns
  p = queuePlan({ count: 12, prio, calls: [{ ticket: 12, called_at: 1 }, { ticket: 1, called_at: 2 }] });
  assert.deepEqual(p.next, { ticket: 2, priority: false, why: 'so-normais' }); assert.equal(p.prio.left, 0);
  // comuns acabaram → só prioritárias
  p = queuePlan({ count: 12, prio, calls: [{ ticket: 9, called_at: 1 }] });
  assert.deepEqual(p.next, { ticket: 3, priority: true, why: 'so-prioridade' });
  // tudo chamado → segue além do lançado (contagem pode estar atrasada)
  p = queuePlan({ count: 12, prio, calls: [{ ticket: 9, called_at: 1 }, { ticket: 12, called_at: 2 }] });
  assert.deepEqual(p.next, { ticket: 13, priority: false, why: 'sem-registro' });
  // sem contagem da triagem: comuns ilimitadas, prioritárias as da lista
  p = queuePlan({ count: null, prio: [50], calls: [{ ticket: 50, called_at: 1 }] });
  assert.deepEqual(p.next, { ticket: 1, priority: false, why: 'so-normais' }); assert.equal(p.normal.total, null);
  // sem prioridades: comportamento antigo (próxima = última + 1)
  p = queuePlan({ count: null, prio: [], calls: [{ ticket: 7, called_at: 1 }] });
  assert.equal(p.has_prio, false); assert.equal(p.next.ticket, 8);
});
