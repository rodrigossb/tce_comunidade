// GET /tce-senhas/api/voz/<arquivo>.mp3 → áudio pronto (public/voz) ou gerado no servidor (data/voz).
import fs from 'node:fs';
import { clipPath } from '@/lib/voz-server';

export const dynamic = 'force-dynamic';
export async function GET(_req, ctx) {
  const { file } = await ctx.params; const c = clipPath(file);
  if (!c) return new Response('não encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const buf = fs.readFileSync(c.file);
  return new Response(buf, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buf.length), 'Cache-Control': c.dynamic ? 'public, max-age=300' : 'public, max-age=86400, immutable' } });
}
