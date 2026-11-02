// Leitura dos inscritos: cartões do painel (HTML/texto) e JSON da API pública, casados com as turmas do site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiCards, fromPanelCards, parseAny, panelInfoOf, groupsOf } from '../src/inscritos.js';
import { TCE_DATA as D } from '../src/data.js';

test('JSON da API: lista de objetos com título, período e inscritos vira cartões e casa com as turmas', () => {
  const json = { atualizado_em: '2026-11-02T14:40:00-03:00', acoes: [
    { id: 116, titulo: 'Manga - Formação de Cuidadores', periodo: 'De 3 a 6 de novembro', inscritos: 37, vagas: 50 },
    { id: 116, titulo: 'Formação de Cuidadores (Oiapoque)', data_inicio: '2026-11-03', data_fim: '2026-11-06', inscritos: 22 },
    { id: 145, titulo: 'Videomaker', data: '2026-11-05', quantidade_inscritos: 20, local: 'Oiapoque' },
  ] };
  const cards = apiCards(json);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards[1].days, [3, 4, 5, 6]); assert.equal(cards[1].id, '116'); assert.equal(cards[0].vagas, 50);
  assert.equal(cards[2].title, '(Oiapoque) Videomaker'); assert.deepEqual(cards[2].days, [5]);
  const r = fromPanelCards(cards);
  assert.equal(r.unmatched.length, 0, 'todos os cartões casam');
  const keys = Object.keys(r.byKey);
  assert.ok(keys.some((k) => k.startsWith('116@manga@')) && keys.some((k) => k.startsWith('116@jn@')), 'Cuidador: uma turma por local');
  assert.equal(r.byKey[keys.find((k) => k.startsWith('116@manga@'))].inscritos, 37);
  assert.equal(r.byKey[keys.find((k) => k.startsWith('116@manga@'))].vagas, 50);
  assert.equal(panelInfoOf(json), '02/11 14:40');
  assert.equal(Object.keys(parseAny(JSON.stringify(json))).length, 3, 'parseAny reconhece o JSON da API');
});
test('JSON da API com id da ESCON casa a turma certa mesmo com título diferente', () => {
  const c = D.courses.find((x) => x.id === 109); const g = groupsOf(c)[0];
  const r = fromPanelCards(apiCards([{ codigo: g.linkId, nome: 'Oficina lúdica', inscritos: 5 }]));
  assert.equal(Object.keys(r.byKey)[0], g.key);
});
test('objeto sem campo de inscritos não vira cartão', () => {
  assert.equal(apiCards({ cursos: [{ titulo: 'Qualquer', periodo: 'Dia 5 de novembro' }] }).length, 0);
});
