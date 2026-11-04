// GET /tce-senhas/api/stats?local=jn&dia=AAAA-MM-DD → números do dia para o dashboard de resultados (público, só leitura,
// sem dados pessoais): totais e por serviço/sala (summarize do core), histórico de senhas entregues e a lista de chamadas
// do dia (horário, resultado, sala, serviço) para séries por hora e linha do tempo.
import * as db from '@/lib/db';

export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // America/Belem (UTC-3)

export function OPTIONS() { return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, H) }); }
export function GET(req) {
  const u = new URL(req.url); const venue = u.searchParams.get('local') || 'jn'; const day = u.searchParams.get('dia') || today();
  try {
    const st = db.stats(day, venue);
    const calls = db.callsOfDay(day, venue).map((c) => ({ id: c.id, service_id: c.service_id, place_id: c.place_id, ticket: c.ticket, status: c.status, called_at: c.called_at, status_at: c.status_at, ended_at: c.ended_at }));
    return Response.json({ day: st.day, venue: st.venue, now: st.now, total: st.stats.total, services: st.stats.services, per_hour: st.stats.per_hour, issued_history: st.issued_history, extras: st.extras || [], calls }, { headers: H });
  } catch (e) { return Response.json({ error: e.message || 'erro' }, { status: e.status || 500, headers: H }); }
}
