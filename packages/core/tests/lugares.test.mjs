import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLugar, parseCoord, PLACE_KINDS } from '../src/lugares.js';

test('normalizeLugar aceita vírgula decimal, apara textos e rejeita o que não serve', () => {
  const l = normalizeLugar({ name: '  Pousada  do Rio ', kind: 'Hotel', address: 'Av. X, 10', lat: '3,8436', lng: '-51,8342', note: 'ok', phone: '96 9' });
  assert.deepEqual(l, { name: 'Pousada do Rio', kind: 'hotel', address: 'Av. X, 10', lat: 3.8436, lng: -51.8342, note: 'ok', phone: '96 9' });
  assert.equal(parseCoord('-51.8342'), -51.8342); assert.ok(Number.isNaN(parseCoord('abc'))); assert.ok(Number.isNaN(parseCoord('')));
  for (const b of [{ name: 'A', kind: 'hotel', lat: 3.8, lng: -51.8 }, { name: 'Ab', kind: 'x', lat: 3.8, lng: -51.8 }, { name: 'Ab', kind: 'hotel', lat: '', lng: -51.8 }, { name: 'Ab', kind: 'hotel', lat: 10, lng: -51.8 }, { id: 'z', name: 'Ab', kind: 'hotel', lat: 3.8, lng: -51.8 }]) assert.throws(() => normalizeLugar(b), (e) => e.status === 400);
  assert.equal(normalizeLugar({ id: '7', name: 'Ab', kind: 'outro', lat: 3.8, lng: -51.8 }).id, 7);
  assert.ok(Object.keys(PLACE_KINDS).includes('escola') && Object.keys(PLACE_KINDS).includes('restaurante') && Object.keys(PLACE_KINDS).includes('hotel'));
});
