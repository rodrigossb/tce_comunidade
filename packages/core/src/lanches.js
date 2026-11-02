/* Lanches: quantidade de alunos por local, dia e turno, para a fornecedora de alimentação.
   Regra: um lanche por aluno em cada turno em que ele tem aula. Cada turma (curso@local@idESCON) conta uma vez por
   turno/dia com os inscritos do painel da ESCON; turma ainda sem dado no painel entra com as vagas (teto), marcada
   como estimada. Cursos de vários encontros contam em cada dia. `margem` (%) acrescenta uma folga arredondada para cima. */
import { TCE_DATA as D } from './data.js';
import { allSessions, SHIFT_ORDER, toMin } from './shared.js';
import { groupKey, groupsOf, numbersOf } from './inscritos.js';

const VENUE_ORDER = ['jn', 'manga', 'sebrae', 'auditorio', 'iaparra'];
const withMargin = (n, margem) => Math.ceil(n * (1 + (Number(margem) || 0) / 100));
const emptyTot = () => ({ lanches: 0, comMargem: 0, inscritos: 0, vagas: 0, turmas: 0, estimadas: 0 });
const addTo = (t, c) => { t.lanches += c.lanches; t.comMargem += c.comMargem; t.inscritos += c.inscritos; t.vagas += c.vagas; t.turmas += c.turmas; t.estimadas += c.estimadas; return t; };
const shiftsTot = () => Object.fromEntries(SHIFT_ORDER.map((s) => [s, emptyTot()]));

/** Lanches de uma turma numa aula: inscritos quando há dado, senão as vagas. */
function lanchesOfSession(byId, sess, margem) {
  const c = sess.course; const g = groupsOf(c).find((x) => x.key === groupKey(c, sess));
  const i = numbersOf(byId, c, g ? [g] : []);
  const lanches = i.has ? i.inscritos : i.vagas;
  return { key: g ? g.key : String(c.id), sess, course: c, i, lanches, comMargem: withMargin(lanches, margem), estimado: !i.has };
}

/** Quadro completo. `sessions` (opcional) limita as aulas (ex.: filtro por local/dia); sem ele, todas as do evento. */
function lanchesBoard({ byId, sessions, margem = 0 } = {}) {
  const list = sessions || allSessions();
  const cells = new Map(); // `${venue}|${date}|${shift}`
  for (const sess of list) {
    const k = `${sess.venue}|${sess.date}|${sess.shift}`;
    if (!cells.has(k)) cells.set(k, { venue: sess.venue, date: sess.date, shift: sess.shift, rows: [], start: null, end: null, ...emptyTot() });
    const cell = cells.get(k); const row = lanchesOfSession(byId, sess, margem);
    if (cell.rows.some((r) => r.key === row.key)) continue; // mesma turma duas vezes no mesmo turno: conta uma vez
    cell.rows.push(row);
    cell.lanches += row.lanches; cell.comMargem += row.comMargem; cell.inscritos += row.i.has ? row.i.inscritos : 0; cell.vagas += row.i.vagas; cell.turmas++; if (row.estimado) cell.estimadas++;
    const a = sess.time; const b = sess.end || null;
    if (!cell.start || toMin(a) < toMin(cell.start)) cell.start = a;
    if (b && (!cell.end || toMin(b) > toMin(cell.end))) cell.end = b;
  }
  for (const cell of cells.values()) cell.rows.sort((x, y) => toMin(x.sess.time) - toMin(y.sess.time) || String(x.sess.room).localeCompare(String(y.sess.room), 'pt-BR'));
  const days = [...new Set(list.map((s) => s.date))].sort();
  const venues = VENUE_ORDER.filter((v) => list.some((s) => s.venue === v));
  const byVenueDay = {}; const byDay = {}; const byVenue = {}; const byShift = shiftsTot(); const total = emptyTot();
  for (const cell of cells.values()) {
    const vd = (byVenueDay[`${cell.venue}|${cell.date}`] ||= { venue: cell.venue, date: cell.date, shifts: shiftsTot(), ...emptyTot() });
    addTo(vd.shifts[cell.shift], cell); addTo(vd, cell);
    const d = (byDay[cell.date] ||= { date: cell.date, shifts: shiftsTot(), ...emptyTot() }); addTo(d.shifts[cell.shift], cell); addTo(d, cell);
    const v = (byVenue[cell.venue] ||= { venue: cell.venue, shifts: shiftsTot(), ...emptyTot() }); addTo(v.shifts[cell.shift], cell); addTo(v, cell);
    addTo(byShift[cell.shift], cell); addTo(total, cell);
  }
  const shifts = SHIFT_ORDER.filter((s) => byShift[s].turmas);
  const cellOf = (venue, date, shift) => cells.get(`${venue}|${date}|${shift}`) || null;
  return { days, venues, shifts, cells, cellOf, byVenueDay, byDay, byVenue, byShift, total, margem: Number(margem) || 0 };
}

export { VENUE_ORDER, lanchesOfSession, lanchesBoard, withMargin };
export const venueName = (v) => (D.venues[v] ? D.venues[v].name : v);
