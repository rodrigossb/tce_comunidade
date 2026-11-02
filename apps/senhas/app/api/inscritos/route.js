// Inscritos por turma, vindos do painel da ESCON.
//   GET  → último retrato { updatedAt, painelInfo, source, byId } (público, CORS liberado: a página resumo-cursos lê daqui)
//   POST → recebe do coletor (bookmarklet/userscript no navegador dentro da rede do TCE, ou script Node) com X-Token =
//          INSCRITOS_TOKEN do .env. Corpo JSON: { html } (página salva), { text } (texto copiado), { json } (resposta da API
//          pública do painel, objeto ou string) ou { cards: [{title,date,inscritos}] },
//          mais painelInfo opcional. O servidor casa os cartões com as turmas (packages/core/src/inscritos.js).
import { panelCards, apiCards, panelInfoOf, fromPanelCards, parseAny, htmlToText } from '@tce/core/inscritos';
import { saveInscritos, latestInscritos } from '@/lib/db';

export const dynamic = 'force-dynamic';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Token', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store' };
const json = (body, status = 200) => Response.json(body, { status, headers: CORS });

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
export function GET() { return json(latestInscritos() || { updatedAt: 0, painelInfo: '', source: 'nenhum', byId: {} }); }

const MES = { janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
const infoOf = (plain) => { const m = String(plain || '').match(/N[úu]meros de (\d{1,2}) de (\w+),? [àa]s (\d{1,2}:\d{2})/i); return m ? `${m[1].padStart(2, '0')}/${MES[m[2].toLowerCase()] || m[2]} ${m[3]}` : ''; };

export async function POST(req) {
  const token = String(process.env.INSCRITOS_TOKEN || '');
  if (!token || req.headers.get('x-token') !== token) return json({ error: 'token inválido' }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const raw = typeof b.html === 'string' ? b.html : typeof b.text === 'string' ? b.text : '';
  if (raw.length > 2_000_000) return json({ error: 'conteúdo grande demais' }, 413);
  let cards = Array.isArray(b.cards) ? b.cards.filter((c) => c && typeof c.title === 'string').map((c) => ({ title: String(c.title).slice(0, 300), date: String(c.date || '').slice(0, 60), inscritos: Number(c.inscritos) || 0 })) : [];
  // JSON da API pública do painel: em b.json (objeto ou string) ou no próprio raw (coletor Node manda o corpo como veio).
  let apiJson = null;
  if (b.json != null) { try { apiJson = typeof b.json === 'string' ? JSON.parse(b.json) : b.json; } catch { return json({ error: 'json inválido' }, 400); } }
  else if (raw && /^\s*[[{]/.test(raw)) { try { apiJson = JSON.parse(raw); } catch { /* não é JSON */ } }
  if (!cards.length && apiJson) cards = apiCards(apiJson);
  if (!cards.length && raw) cards = panelCards(raw);
  let byId, unmatched = [];
  if (cards.length) { const r = fromPanelCards(cards); byId = r.byKey; unmatched = r.unmatched.map((c) => c.title); } else byId = parseAny(raw);
  if (!Object.keys(byId).length) return json({ error: 'nenhum curso reconhecido' }, 422);
  const painelInfo = String(b.painelInfo || (apiJson ? panelInfoOf(apiJson) : '') || infoOf(raw ? (/<\w+[\s>]/.test(raw) ? htmlToText(raw) : raw) : '')).slice(0, 40);
  const saved = saveInscritos({ byId, painelInfo, source: String(b.source || 'coletor').slice(0, 24) });
  return json({ ok: true, updatedAt: saved.updatedAt, cursos: saved.cursos, total: saved.total, cartoes: cards.length, semCorrespondencia: unmatched, painelInfo });
}
