// GET /tce-senhas/api/voz/manifest.json?local=jn&dia=AAAA-MM-DD → manifest dos áudios da TV: os prontos (public/voz) mais os
// nomes gerados no servidor; de quebra dispara a geração dos nomes das filas do dia/local que ainda não têm áudio (lib/voz-server).
import { TCE as T } from '@tce/core';
import { fullManifest, ensureClipsFor } from '@/lib/voz-server';

export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'no-store' };
export function GET(req) {
  const u = new URL(req.url); const venue = u.searchParams.get('local'); const dia = u.searchParams.get('dia');
  const m = fullManifest(); if (!m) return Response.json({ error: 'sem áudios prontos' }, { status: 404, headers: H });
  if (venue && T.D.maps && T.D.maps[venue]) { const day = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : (T.ticketDay(T.now().date, venue) || {}).date; if (day) m.pending = ensureClipsFor(day, venue); }
  return Response.json(m, { headers: H });
}
