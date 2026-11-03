import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCE as T } from '../src/shared.js';

test('todo local com cursos ou serviços tem um pino no mapa de locais (D.geo)', () => {
  const covered = new Set(T.D.geo.flatMap((g) => g.venues));
  const used = new Set([...T.allSessions().map((x) => x.venue), ...T.serviceDays().map((d) => d.venue)]);
  for (const v of used) assert.ok(covered.has(v), `local sem geolocalização: ${v}`);
  for (const g of T.D.geo) {
    assert.ok(g.lat > 3.5 && g.lat < 4.0 && g.lng < -51.5 && g.lng > -52.0, `coordenada fora de Oiapoque: ${g.id}`);
    assert.ok(g.address && g.name && g.city, `pino incompleto: ${g.id}`);
    for (const v of g.venues) assert.ok(T.D.venues[v], `pino ${g.id} aponta para local inexistente: ${v}`);
  }
});
