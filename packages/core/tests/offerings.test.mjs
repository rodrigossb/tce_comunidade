// offeringsAt: o que há em cada sala/tenda da planta (serviços com itens ali + aulas de cursos), usado pelo painel do mapa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCE as T } from '../src/shared.js';
import { TCE_DATA as D } from '../src/data.js';

test('Manga · sala 06 (Documentação e cidadania): só itens do pilar Documentos apontados para mg-r06, sem os "só 07/11"', () => {
  const o = T.offeringsAt('mg-r06');
  assert.equal(o.venue, 'manga'); assert.equal(o.day.date, '2026-11-04'); assert.equal(o.place.name, 'Documentação e cidadania');
  assert.deepEqual(o.services.map((x) => x.service.id), ['pilar-2']);
  const [doc] = o.services; assert.ok(doc.specific);
  assert.ok(doc.items.some((it) => /Carteira de Identidade Nacional/.test(T.itemText(it))));
  for (const it of doc.items) { assert.ok(T.itemWhere(it, 'manga').includes('mg-r06')); assert.ok(!T.itemOnly(it) || T.itemOnly(it) === '2026-11-04'); }
  assert.equal(o.sessions.length, 0);
});
test('Joaquim Nabuco · itens "só 07/11" aparecem na sala deles; sala de curso lista as aulas com horário', () => {
  const cerpis = T.offeringsAt('jn-r24');
  assert.equal(cerpis.day.date, '2026-11-07');
  assert.ok(cerpis.services.some((x) => x.service.id === 'pilar-1' && x.items.some((it) => T.itemOnly(it) === '2026-11-07')));
  const lab = T.offeringsAt('jn-r01');
  assert.ok(lab.sessions.length > 0);
  for (const x of lab.sessions) { assert.equal(x.venue, 'jn'); assert.equal(x.room, 'Laboratório I'); assert.match(x.time, /^\d{2}:\d{2}$/); assert.ok(x.course); }
  // Sem item apontando para o laboratório: o pilar Cursos entra como resumo (specific: false), sem itens genéricos.
  const cursos = lab.services.find((x) => x.service.id === 'pilar-4'); assert.ok(cursos); assert.equal(cursos.specific, false); assert.deepEqual(cursos.items, []);
});
test('serviço dono da sala (svc) vem primeiro; ambiente desconhecido → null; venue explícito prevalece', () => {
  const quadra = T.offeringsAt('jn-r25');
  assert.equal(quadra.services[0].service.id, 'pilar-8'); assert.ok(quadra.services.length > 1);
  assert.equal(T.offeringsAt('nao-existe'), null);
  assert.equal(T.offeringsAt('mg-r06', 'manga').venue, 'manga');
});
test('toda sala/tenda visível da planta tem pelo menos um serviço ou uma aula', () => {
  for (const m of Object.values(D.maps)) for (const p of m.places.filter((x) => !x.hide)) {
    const o = T.offeringsAt(p.id);
    assert.ok(o.services.length || o.sessions.length, `${p.id} (${p.name}) sem serviço nem aula`);
    for (const { service, items } of o.services) for (const it of items) assert.ok(T.itemsOn(service, o.day.date).includes(it), `${p.id}: item fora do dia`);
  }
});
