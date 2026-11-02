// GET /tce-senhas/api/tv/stream?local=jn&dia=AAAA-MM-DD → Server-Sent Events: manda o quadro da TV ao conectar e a cada
// mudança nas senhas (na hora, via lib/bus.js), mais um batimento a cada 15 s (o nginx corta conexões caladas por 30 s).
// Público e só leitura, como /api/tv. O navegador (EventSource) reconecta sozinho se cair.
import * as db from '@/lib/db';
import { bus } from '@/lib/bus';

export const dynamic = 'force-dynamic';
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // America/Belem (UTC-3)

export function GET(req) {
  const u = new URL(req.url); const venue = u.searchParams.get('local') || 'jn'; const day = u.searchParams.get('dia') || today();
  const enc = new TextEncoder();
  let timer = null; let beat = null; let onChange = null; let closed = false;
  const stream = new ReadableStream({
    start(ctl) {
      const send = (ev, data) => { if (closed) return; try { ctl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; } };
      const push = () => { try { send('board', db.tvBoard(day, venue)); } catch (e) { send('error', { error: e.message || 'erro' }); } };
      push();
      // Várias gravações seguidas (ex.: emitir + chamar) viram um só envio.
      onChange = (ev) => { if (ev && ev.day === day && ev.venue === venue) { clearTimeout(timer); timer = setTimeout(push, 120); } };
      bus.on('change', onChange);
      beat = setInterval(() => send('ping', { t: Date.now() }), 15000);
    },
    cancel() { closed = true; clearTimeout(timer); clearInterval(beat); if (onChange) bus.off('change', onChange); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' } });
}
