// Consistência dos dados (node --test tests/). Roda sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.location = { search: '', href: 'http://localhost/tv.html' };
require('../js/data.js'); require('../js/shared.js'); require('../js/icons.js');
const T = globalThis.TCE; const D = T.D;

test('cursos têm campos obrigatórios e ids únicos', () => {
  const ids = new Set();
  for (const c of D.courses) {
    assert.ok(c.id && c.title && c.hours > 0 && c.audience && c.seats > 0 && /^https:\/\//.test(c.link), `curso ${c.id}`);
    assert.ok(!ids.has(c.id), `id repetido ${c.id}`); ids.add(c.id);
    assert.ok(c.sessions.length > 0, `curso ${c.id} sem sessões`);
    for (const t of c.tags) assert.ok(D.tags[t], `tag desconhecida ${t}`);
  }
});

test('sessões dentro do período, em locais e salas cadastrados, com turno coerente', () => {
  for (const x of T.allSessions()) {
    assert.ok(x.date >= D.event.start && x.date <= D.event.end, `${x.course.id} fora do período: ${x.date}`);
    const v = D.venues[x.venue]; assert.ok(v, `local desconhecido ${x.venue}`);
    if (x.room) assert.ok(v.rooms.includes(x.room), `sala ${x.room} não cadastrada em ${v.name}`);
    assert.ok(['08:00', '14:00', '18:00'].includes(x.time), `horário fora dos turnos: ${x.time}`);
    assert.equal(x.shift, T.shiftOf(x.time));
  }
});

test('estado das sessões segue o relógio', () => {
  const sess = T.allSessions().find((x) => x.date === '2026-11-05' && x.time === '08:00');
  assert.equal(T.sessionState(sess, { date: '2026-11-04', min: 600 }), 'future');
  assert.equal(T.sessionState(sess, { date: '2026-11-05', min: 7 * 60 }), 'today');
  assert.equal(T.sessionState(sess, { date: '2026-11-05', min: 9 * 60 }), 'now');
  assert.equal(T.sessionState(sess, { date: '2026-11-05', min: 13 * 60 }), 'past');
  assert.equal(T.sessionState(sess, { date: '2026-11-06', min: 0 }), 'past');
});

test('serviços: acolhida + 8 pilares com itens e parceiros', () => {
  assert.equal(D.services.length, 9);
  for (const s of D.services) assert.ok(s.title && s.summary && s.items.length && s.partners.length && s.icon && s.color, s.id);
});

test('ics e QR geram saída válida', () => {
  const ics = T.icsFor(T.courseById(116));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 8);
  globalThis.qrcode = require('../vendor/qrcode.js');
  const svg = T.qrSvg('https://example.org/#curso/116');
  assert.ok(svg.startsWith('<svg') && svg.includes('<path'));
});

test('conflitos de sala são conhecidos (mesma sala, dia e horário)', () => {
  const seen = new Map(); const conflicts = [];
  for (const x of T.allSessions()) { if (!x.room) continue; const k = `${x.date} ${x.time} ${x.venue} ${x.room}`; if (seen.has(k)) conflicts.push(`${k}: ${seen.get(k)} × ${x.course.id}`); else seen.set(k, x.course.id); }
  // Conflito presente na tabela oficial: Laboratório I – Joaquim Nabuco, 05/11 às 14h (cursos 125 e 145).
  assert.deepEqual(conflicts, ['2026-11-05 14:00 jn Laboratório I: 125 × 145']);
});
