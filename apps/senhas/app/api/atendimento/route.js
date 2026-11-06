// GET /tce-senhas/api/atendimento → retrato público do atendimento por dia (sem dados pessoais nem contagens):
// para cada local e dia do evento com atendimento, as filas ativas definidas na triagem (salas fixas editadas, criadas,
// desativadas; dias desativados pela administração) e o que é oferecido naquele dia, por turno. O site público
// (mapa, serviços, programação) lê daqui; CORS liberado. Formato em @tce/core/atendimento.
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

export function OPTIONS() { return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, H) }); }
export function GET(req) {
  const u = new URL(req.url); const venue = u.searchParams.get('local') || '';
  try { return Response.json(db.atendimentoPublico(venue || null), { headers: H }); }
  catch (e) { return Response.json({ error: e.message || 'erro' }, { status: e.status || 500, headers: H }); }
}
