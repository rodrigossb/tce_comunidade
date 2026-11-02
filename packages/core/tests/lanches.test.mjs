// Lanches por local, dia e turno: um lanche por aluno em cada turno; sem dado do painel, as vagas (estimado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lanchesBoard, lanchesOfSession, withMargin } from '../src/lanches.js';
import { allSessions, SHIFT_ORDER } from '../src/shared.js';
import { groupsOf, numbersOf } from '../src/inscritos.js';
import { TCE_DATA as D } from '../src/data.js';

const cuidadorManga = () => allSessions().find((s) => s.course.id === 116 && s.venue === 'manga' && s.date === '2026-11-03');

test('numbersOf: inscritos da turma, vagas do site; sem dado, só vagas', () => {
  const c = D.courses.find((x) => x.id === 116); const g = groupsOf(c).find((x) => x.venue === 'manga');
  assert.deepEqual(numbersOf({}, c, [g]), { has: false, vagas: 50, inscritos: null, restantes: null, over: 0, pct: null });
  const i = numbersOf({ [g.key]: { inscritos: 49 } }, c, [g]);
  assert.equal(i.inscritos, 49); assert.equal(i.restantes, 1); assert.equal(i.pct, 98);
  assert.equal(numbersOf({ [g.key]: { inscritos: 53 } }, c, [g]).over, 3, 'acima das vagas vira excedente');
});

test('aula com dado do painel conta os inscritos; sem dado conta as vagas e fica marcada como estimada', () => {
  const sess = cuidadorManga(); const key = groupsOf(sess.course).find((g) => g.venue === 'manga').key;
  const com = lanchesOfSession({ [key]: { inscritos: 49 } }, sess, 0);
  assert.equal(com.lanches, 49); assert.equal(com.estimado, false);
  const sem = lanchesOfSession({}, sess, 0);
  assert.equal(sem.lanches, sess.course.seats); assert.equal(sem.estimado, true);
  assert.equal(withMargin(49, 10), 54, 'margem arredonda para cima');
  assert.equal(lanchesOfSession({ [key]: { inscritos: 49 } }, sess, 10).comMargem, 54);
});

test('quadro: célula local × dia × turno soma as turmas; totais por dia, local e turno batem com o total geral', () => {
  const sess = cuidadorManga(); const key = groupsOf(sess.course).find((g) => g.venue === 'manga').key;
  const b = lanchesBoard({ byId: { [key]: { inscritos: 49 } }, margem: 10 });
  const cell = b.cellOf('manga', '2026-11-03', 'manha');
  assert.ok(cell && cell.rows.some((r) => r.course.id === 116), 'Cuidador no Manga, 03/11 de manhã');
  assert.equal(cell.start, '08:00');
  assert.equal(cell.lanches, cell.rows.reduce((a, r) => a + r.lanches, 0));
  assert.equal(cell.estimadas, cell.turmas - 1, 'só a turma com dado não é estimada');
  const sumDays = b.days.reduce((a, d) => a + b.byDay[d].lanches, 0);
  const sumVenues = b.venues.reduce((a, v) => a + b.byVenue[v].lanches, 0);
  const sumShifts = SHIFT_ORDER.reduce((a, s) => a + b.byShift[s].lanches, 0);
  assert.equal(sumDays, b.total.lanches); assert.equal(sumVenues, b.total.lanches); assert.equal(sumShifts, b.total.lanches);
  assert.equal(b.byVenueDay['manga|2026-11-03'].shifts.manha.lanches, cell.lanches);
  assert.ok(b.total.comMargem >= b.total.lanches);
  assert.deepEqual(b.days, [...new Set(allSessions().map((s) => s.date))].sort());
});

test('a mesma turma duas vezes no mesmo turno conta uma vez; filtro de sessões restringe o quadro', () => {
  const sess = cuidadorManga();
  const twice = [sess, Object.assign({}, sess, { time: '10:00' })];
  const b = lanchesBoard({ byId: {}, sessions: twice });
  assert.equal(b.total.turmas, 1); assert.equal(b.total.lanches, sess.course.seats);
  assert.deepEqual(b.venues, ['manga']); assert.deepEqual(b.days, ['2026-11-03']); assert.deepEqual(b.shifts, ['manha']);
});
