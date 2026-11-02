export const dynamic = 'force-dynamic';
export function GET() { return Response.json({ ok: true, ts: Date.now() }, { headers: { 'Cache-Control': 'no-store' } }); }
