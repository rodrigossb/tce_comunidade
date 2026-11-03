// Lugares do mapa de locais (site: mapa-eventos.html), além dos locais fixos do evento.
//   GET    → { updatedAt, lugares: [...] } (público, CORS liberado: o site estático lê daqui)
//   POST   → cria/atualiza { id?, name, kind, address, lat, lng, note, phone } com X-Pin = PIN de gestor ou de operador
//   DELETE → ?id=N com o mesmo X-Pin. Validação compartilhada em @tce/core/lugares.
import { roleOfPin } from '@/lib/auth';
import { lugares, saveLugar, deleteLugar, ApiError } from '@/lib/db';

export const dynamic = 'force-dynamic';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Pin', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store' };
const json = (body, status = 200) => Response.json(body, { status, headers: CORS });
const fail = (e) => json({ error: e instanceof ApiError ? e.message : 'erro interno' }, e instanceof ApiError ? e.status : 500);
const authed = (req) => !!roleOfPin(req.headers.get('x-pin'));

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
export function GET() { try { return json({ updatedAt: Date.now(), lugares: lugares() }); } catch (e) { return fail(e); } }
export async function POST(req) {
  if (!authed(req)) return json({ error: 'PIN inválido' }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  try { const r = saveLugar(b); return json(Object.assign(r, { lugares: lugares() })); } catch (e) { return fail(e); }
}
export async function DELETE(req) {
  if (!authed(req)) return json({ error: 'PIN inválido' }, 401);
  try { const id = new URL(req.url).searchParams.get('id'); const r = deleteLugar(id); return json(Object.assign(r, { lugares: lugares() })); } catch (e) { return fail(e); }
}
