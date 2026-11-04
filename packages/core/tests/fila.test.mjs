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

test('queuePlan: chamada gravada como prioritária continua prioritária quando a triagem troca a lista (não vira comum)', () => {
  // Manga, sala 06: lista era "80-100"; chamaram 80(P),1,81(P),2,82(P),3,83(P); triagem trocou para "180-200" e chamou 180(P).
  const prio = parsePrioList('180-200').nums;
  const calls = [[80, 1], [1, 0], [81, 1], [2, 0], [82, 1], [3, 0], [83, 1], [180, 1]].map(([ticket, priority], i) => ({ id: i + 1, ticket, priority, called_at: i + 1 }));
  const p = queuePlan({ count: 200, prio, calls });
  assert.equal(p.normal.last, 3); assert.equal(p.normal.next, 4); // e não 84
  assert.equal(p.prio.last, 180); assert.equal(p.prio.next, 181);
  assert.deepEqual(p.next, { ticket: 4, priority: false, why: 'alternado' }); // última foi prioritária → agora comum
  // registros sem o campo (antigos): cai na lista atual
  const q = queuePlan({ count: 200, prio, calls: [{ ticket: 80, called_at: 1 }, { ticket: 1, called_at: 2 }] });
  assert.equal(q.normal.last, 80);
});

test('queuePlan: ajuste manual do número atual (from) recomeça a sequência e ignora chamadas anteriores ao ajuste', () => {
  const prio = parsePrioList('180-200').nums;
  const calls = [[83, 1, 10], [84, 0, 20], [181, 1, 30], [85, 0, 40]].map(([ticket, priority, called_at], i) => ({ id: i + 1, ticket, priority, called_at }));
  // porta informa: última comum 3, última prioritária 179 (ou seja, próxima prioridade 180), às 50
  let p = queuePlan({ count: 200, prio, calls, from: { normal: 3, prio: 179, ts: 50 } });
  assert.equal(p.normal.last, 3); assert.equal(p.normal.next, 4); assert.equal(p.prio.last, 179); assert.equal(p.prio.next, 180);
  // chamadas depois do ajuste voltam a contar
  p = queuePlan({ count: 200, prio, calls: calls.concat([{ id: 9, ticket: 180, priority: 1, called_at: 60 }]), from: { normal: 3, prio: 179, ts: 50 } });
  assert.equal(p.prio.last, 180); assert.deepEqual(p.next, { ticket: 4, priority: false, why: 'alternado' });
  // zerar: from { normal: 0, prio: 0 } → começa do 1
  p = queuePlan({ count: 200, prio, calls, from: { normal: 0, prio: 0, ts: 50 } });
  assert.equal(p.normal.last, null); assert.equal(p.normal.next, 1); assert.equal(p.prio.next, 180);
  // sem from: comportamento normal
  assert.equal(queuePlan({ count: 200, prio, calls }).normal.last, 85);
});
