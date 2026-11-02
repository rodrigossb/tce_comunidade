// O banco avisa o barramento a cada gravação de senha; é isso que empurra o quadro para a TV por SSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'tce-bus-')), 'senhas.db');
const db = await import('../lib/db.js');
const { bus } = await import('../lib/bus.js');

test('emitir, chamar, entrou, não compareceu e encerrar avisam o barramento com dia e local', () => {
  const got = []; const on = (e) => got.push(e); bus.on('change', on);
  try {
    db.issued({ day: '2026-11-04', venue: 'manga', service_id: 'pilar-1', place_id: 'mg-r02', count: 5, device: 't' });
    const c = db.call({ day: '2026-11-04', venue: 'manga', service_id: 'pilar-1', place_id: 'mg-r02', ticket: 1, device: 't' });
    db.setStatus(c.id, 'served'); db.setStatus(c.id, 'absent'); db.endCall(c.id);
  } finally { bus.off('change', on); db.close(); }
  assert.equal(got.length, 5);
  for (const e of got) { assert.equal(e.day, '2026-11-04'); assert.equal(e.venue, 'manga'); }
});
