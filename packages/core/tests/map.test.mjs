// Rotas na planta: toda sala/tenda cadastrada é alcançável a partir de cada acesso.
// (O DE→PARA pode listar salas a mais do que a programação usa; só se exige que o ambiente exista na planta.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCEMap as M } from '../src/map.js';
import { TCE_COURSE_ROOMS } from '../src/salas-cursos.js';

test('rota existe de cada acesso até cada ambiente, com passos de início e fim', () => {
  for (const [venue, map] of Object.entries(M.maps)) for (const e of map.entrances) for (const p of map.places) {
    const r = M.route(venue, p.id, e.id);
    assert.ok(r && r.points.length >= 2, `${venue} ${e.id}→${p.id}`);
    assert.equal(r.steps[0].kind, 'start'); assert.equal(r.steps[r.steps.length - 1].kind, 'end');
  }
});
test('salas dos cursos apontam para ambientes existentes na planta', () => {
  for (const [venue, rooms] of Object.entries(TCE_COURSE_ROOMS)) for (const [room, id] of Object.entries(rooms)) {
    assert.ok(M.maps[venue].places.some((p) => p.id === id), `${venue}: ambiente ${id} não existe na planta`);
  }
});
test('origem da rota pode ser um acesso, um ambiente (totem em frente a ele) ou coordenadas x,y', () => {
  const map = M.maps.jn;
  assert.equal(M.entranceOf(map, 'a2').id, 'a2');
  assert.equal(M.entranceOf(map, 'nada').id, 'a1'); // padrão
  const byPlace = M.entranceOf(map, 'jn-r11'); assert.ok(byPlace.custom); assert.match(byPlace.short, /Totem/);
  const byXy = M.entranceOf(map, '900,1100'); assert.ok(byXy.custom); assert.equal(byXy.x, 900);
  assert.equal(M.entranceOf(map, '99999,5').id, 'a1'); // fora da planta: padrão
  for (const ent of ['jn-r11', '900,1100']) for (const p of map.places) { const r = M.route('jn', p.id, ent); assert.ok(r && r.points.length >= 2, `${ent}→${p.id}`); assert.match(r.steps[0].text, /totem/i); }
});

test('Manga: origem padrão no Espaço de abertura e rota ao bloco 13–15 volta pelo passeio principal (sem diagonal do hexágono)', () => {
  const map = M.mapOf('manga');
  assert.equal(M.entranceOf(map, null).id, 'abertura');
  for (const id of ['mg-r13', 'mg-r14', 'mg-r15', 'mg-t10']) {
    const r = M.route('manga', id, 'abertura');
    const ys = r.points.map((p) => p[1]);
    assert.ok(Math.max(...ys) >= 890, `${id}: deve descer até o passeio das tendas da triagem (y≈900)`);
    assert.ok(r.points.some((p) => Math.abs(p[0] - 600) < 2 && p[1] <= 545), `${id}: sobe pela lateral da sala 12 (x=600)`);
    assert.ok(!r.points.some((p) => Math.abs(p[0] - 850) < 5 && Math.abs(p[1] - 490) < 5), `${id}: não usa a diagonal do hexágono`);
  }
  const r6 = M.route('manga', 'mg-r06', 'abertura');
  assert.ok(r6.points.some((p) => Math.abs(p[1] - 690) < 2), 'sai do hexágono pela frente (y=690)');
});
