// GET /tce-senhas/api/voz/frase.mp3?t=<frase> → áudio da frase gerado no servidor (piper), em cache por texto em data/voz.
// Usado pela TV para qualquer parte sem áudio pronto (sala renomeada/criada, senha acima de 300), na MESMA voz dos prontos.
// Sem gerador configurado (PIPER/MODEL/FFMPEG no .env): 404, e a TV fala a chamada inteira por síntese do navegador.
import fs from 'node:fs';
import { ensurePhraseClip } from '@/lib/voz-server';

export const dynamic = 'force-dynamic';
export async function GET(req) {
  const t = String(new URL(req.url).searchParams.get('t') || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160);
  if (!t) return Response.json({ error: 'frase vazia' }, { status: 400 });
  const file = await ensurePhraseClip(t);
  if (!file) return Response.json({ error: 'sem gerador de voz neste servidor' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const buf = fs.readFileSync(file);
  return new Response(buf, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buf.length), 'Cache-Control': 'public, max-age=86400' } });
}
