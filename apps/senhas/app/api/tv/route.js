// GET /tce-senhas/api/tv?local=jn&dia=AAAA-MM-DD → quadro da TV (público, só leitura, sem dados pessoais):
// senha atual por sala, quantas aguardam e as últimas chamadas do dia. A TV consulta a cada poucos segundos.
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
const today = () => { const d = new Date(Date.now() - 3 * 3600000); return d.toISOString().slice(0, 10); }; // America/Belem (UTC-3)

export function OPTIONS() { return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, H) }); }
export function GET(req) {
  const u = new URL(req.url); const venue = u.searchParams.get('local') || 'jn'; const day = u.searchParams.get('dia') || today();
  try { return Response.json(db.tvBoard(day, venue), { headers: H }); }
  catch (e) { return Response.json({ error: e.message || 'erro' }, { status: e.status || 500, headers: H }); }
}
