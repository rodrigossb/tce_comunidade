// GET /tce-senhas/impressao/pdf?<mesmos filtros da página> → PDF A4 das senhas para recortar (lib/pdf-senhas.js), gerado no
// servidor: o tamanho da folha e a grade não dependem do navegador nem do driver da impressora. Mesmo acesso da página (PIN
// de administração ou equipe, cookie).
import { TCE as T } from '@tce/core';
import * as db from '@/lib/db';
import { currentRole } from '@/lib/auth';
import { can } from '@/lib/roles';
import { parseParams, previsao, pagesOf, rangeText } from '@/lib/impressao';
import { buildPdf } from '@/lib/pdf-senhas';

export const dynamic = 'force-dynamic';
const KIND = { sala: 'Sala', tenda: 'Tenda', area: 'Ambiente' };

export async function GET(req) {
  const role = await currentRole();
  if (!can(role, 'painel')) return new Response('Entre com o PIN da administração ou da equipe no app de atendimento e tente de novo.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = parseParams(sp, T.now().date);
  let state; try { state = db.state(f.day, f.venue); } catch (e) { return new Response(`Não foi possível ler o banco: ${e.message || e}`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  const r = previsao(state, f); const range = { serie: f.serie, de: f.de, ate: f.ate };
  const pages = [];
  for (const g of r.groups) for (const p of g.places) {
    if (p.mode === 'contagem') continue;
    const room = Number(p.num) > 0 ? `${KIND[p.kind] || 'Ambiente'} ${p.num}` : '';
    for (const tickets of pagesOf(p, undefined, range)) pages.push({ name: p.name, room, tickets });
  }
  if (!pages.length) return new Response(`Nenhuma senha para ${T.fmtDate(f.day, 'wdlong')} com esses filtros${rangeText(f) ? ` (faixa: ${rangeText(f)})` : ''}.`, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const venue = T.D.venues[f.venue] || { short: f.venue };
  const pdf = buildPdf(pages, { title: `Senhas · ${venue.short || venue.name} · ${T.fmtDate(f.day, 'wdlong')}` });
  const name = `senhas-${f.venue}-${f.day}${f.salas.length === 1 ? '-' + f.salas[0] : ''}.pdf`;
  return new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Content-Length': String(pdf.length), 'Cache-Control': 'no-store' } });
}
