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
