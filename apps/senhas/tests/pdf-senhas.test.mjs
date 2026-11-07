// PDF das senhas para recortar: estrutura válida (xref com deslocamentos certos), uma página por folha, textos no conteúdo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf, pageOps, textWidth, winAnsi, fitLines, A4, GRID } from '../lib/pdf-senhas.js';
import { ticketsOf, pagesOf } from '../lib/impressao.js';

const place = { name: 'Consulta médica', n: 50, p: 10, from: { n: 1, p: 1 }, labels: { n: 'N', p: 'P' } };
const pages = pagesOf(place).map((tickets) => ({ name: place.name, room: 'Sala 08', tickets }));

test('buildPdf: cabeçalho, 3 páginas A4, xref aponta para cada objeto, textos em WinAnsi', () => {
  const buf = buildPdf(pages, { title: 'Senhas · teste' }); const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n')); assert.ok(s.endsWith('%%EOF\n'));
  assert.equal((s.match(/\/Type \/Page\b/g) || []).length, 3); assert.match(s, /\/Count 3/); assert.match(s, /MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(s, /\(CONSULTA M\xC9DICA\) Tj/); assert.match(s, /\(SALA 08\) Tj/); assert.match(s, /\(PRIORIDADE\) Tj/); assert.match(s, /\(P10\) Tj/); assert.match(s, /\(01\) Tj/);
  // xref: cada entrada "n" aponta para "<i> 0 obj"
  const start = Number(s.match(/startxref\n(\d+)\n/)[1]); assert.equal(s.slice(start, start + 4), 'xref');
  const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  entries.forEach((off, i) => assert.equal(s.slice(off, off + String(i + 1).length + 6), `${i + 1} 0 obj`));
  // as três folhas: 24 + 24 + 12 senhas → grade de 6, 6 e 3 linhas
  assert.equal((pageOps(pages[2]).match(/ re S Q/g) || []).length, 10, 'folha 3: as 10 prioritárias levam borda cheia');
});

test('medidas: 4 × 6 de 42 mm cabem em A4 (e em Carta); larguras e quebra de nome', () => {
  assert.ok(GRID.rows * GRID.rowH + 2 * GRID.margin < 279 * 72 / 25.4, 'cabe até em Carta se a impressora ignorar o A4');
  assert.ok(A4.h > GRID.rows * GRID.rowH + 2 * GRID.margin);
  assert.equal(textWidth('AB', true, 10), (722 + 722) / 100); assert.equal(textWidth('É', false, 10), 6.67); assert.equal(textWidth('12', false, 10, 2), 11.12 + 2);
  assert.equal(winAnsi('Sala (08) – ok\\'), 'Sala \\(08\\) \x96 ok\\\\'); assert.equal(winAnsi('Ação'), 'A\xE7\xE3o');
  const f = fitLines('LABORATÓRIO (EXAMES) E FARMÁCIA', 120, true, 9.5, 1.1, 2, 6.5); assert.ok(f.lines.length <= 2 && f.size >= 6.5);
  assert.deepEqual(fitLines('PEDIATRA', 120, true, 9.5, 1.1, 2, 6.5), { size: 9.5, lines: ['PEDIATRA'] });
  assert.equal(ticketsOf(place).length, 60);
});
