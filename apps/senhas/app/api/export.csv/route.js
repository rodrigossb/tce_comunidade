// Download do CSV do dia (gestão). Route handler porque server action não serve arquivo; autentica pelo cookie do PIN.
import { currentRole } from '@/lib/auth';
import { exportCsv } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  try {
    if ((await currentRole()) !== 'gestor') return Response.json({ error: 'PIN inválido' }, { status: 401 });
    const { csv, name } = exportCsv(new URL(req.url).searchParams.get('day'));
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch (e) { return Response.json({ error: e.message || 'erro' }, { status: e.status || 500 }); }
}
