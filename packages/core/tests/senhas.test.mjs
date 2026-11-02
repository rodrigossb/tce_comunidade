// Filas com senha (D.senhas): só pilares com atendimento por senha, sem áreas abertas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TCE as T } from '../src/shared.js';

test('ticketQueuesOf deixa só os pilares configurados e nenhuma área aberta', () => {
  for (const v of ['jn', 'manga']) {
    const qs = T.ticketQueuesOf(v); assert.ok(qs.length >= 3, v);
    for (const g of qs) { assert.ok(T.D.senhas.services.includes(g.service.id), `${v}: ${g.service.id}`); for (const p of g.places) assert.notEqual(p.kind, 'area', `${v}: ${p.id}`); }
    const ids = qs.flatMap((g) => g.places.map((p) => p.id));
    for (const bad of ['mg-r11', 'mg-r16', 'mg-r17', 'mg-t07', 'mg-t05', 'jn-r25', 'jn-t3', 'jn-t6', 'jn-r01', 'mg-r12']) assert.ok(!ids.includes(bad), `${v}: ${bad} não distribui senha`);
    assert.ok(ids.length < T.queuesOf(v).flatMap((g) => g.places).length);
  }
});
