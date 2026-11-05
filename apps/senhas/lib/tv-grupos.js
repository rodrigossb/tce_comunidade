// Seleção das filas (sala/tenda/área + serviço) que cada TV mostra. Puro, sem banco: usado pela TV e pelos testes.
//
// Cada TV abre /tce-senhas/tv com parâmetros:
//   ?local=jn|manga                      local (padrão: o local com serviços gratuitos no dia; senão jn)
//   ?salas=jn-r03,jn-r04 | 03,04,t2      ids da planta ou só o número (03 → jn-r03; t2 → jn-t2)
//   ?servicos=pilar-1,pilar-2            só as filas desses serviços (pilares)
//   ?grupo=entrada|fundos|<nome>         agrupamento por localização (abaixo)
// `salas` e `grupo` somam (união de salas); `servicos` filtra o resultado. Sem nada: todas as filas do local.
//
// GRUPOS POR LOCALIZAÇÃO — como foram deduzidos: a planta tem o acesso principal (a1) na borda de baixo
// (Joaquim Nabuco: a1 em x=467, y=1170 numa planta de 1208 px de altura; Manga: a1 em y=1340 de 1484).
// Então "entrada" = ambientes na metade de baixo da planta (y maior que a metade da altura), que é a parte mais
// perto de quem chega; "fundos" = metade de cima. Na Joaquim Nabuco isso dá:
//   entrada: salas 01–05 (bloco junto ao acesso), 07–12 (bloco do meio), tenda 6 e a quadra (25);
//   fundos:  salas 13–24, triagem, escovódromo, tendas 2, 3, 4 e 5.
// Para ajustar, edite CUSTOM abaixo (lista explícita de ids vence a dedução automática) ou mude Y_SPLIT.
import { TCE as T } from '@tce/core';
import { fixedQueues } from './filas-extra.js';

const D = T.D;
/** Fração da altura da planta que separa "entrada" (abaixo) de "fundos" (acima). */
export const Y_SPLIT = 0.5;
/** Grupos explícitos por local: { jn: { nome: { label, places: [ids] } } }. Vazio = só os automáticos. */
export const CUSTOM = {
  jn: {
    // Exemplo de grupo por tema (descomente para usar ?grupo=saude):
    // saude: { label: 'Saúde', places: ['jn-r03', 'jn-r04', 'jn-r05', 'jn-r08', 'jn-r09', 'jn-r10', 'jn-r11', 'jn-r12', 'jn-r24', 'jn-escov'] },
  },
  manga: {},
};

/** Filas com senha do local (uma por ambiente de atendimento), na ordem de número da sala. Com `day`, só no dia de
    serviços do local (nos outros dias do evento a TV mostra só as filas criadas na triagem, que vêm da API). */
export function queuesFor(venue, day) {
  const list = [];
  for (const g of fixedQueues(venue, day)) for (const p of g.places) list.push({ service: g.service, place: p }); // só filas com senha (D.senhas)
  const numOf = (p) => (p.num ? Number(p.num) || 0 : 999);
  const kindOrder = { sala: 0, tenda: 1, area: 2 };
  return list.sort((a, b) => (kindOrder[a.place.kind] ?? 3) - (kindOrder[b.place.kind] ?? 3) || numOf(a.place) - numOf(b.place) || String(a.place.name).localeCompare(String(b.place.name), 'pt-BR'));
}

/** Grupos disponíveis no local: automáticos (entrada/fundos pela planta) + CUSTOM. */
export function groupsOf(venue) {
  const map = D.maps && D.maps[venue]; const out = {};
  if (map) {
    const split = map.h * Y_SPLIT; const entrance = map.entrances.find((e) => e.default) || map.entrances[0];
    // Se o acesso principal estiver na metade de cima da planta, inverte: "entrada" passa a ser a metade de cima.
    const entranceBelow = !entrance || entrance.y >= split;
    const below = map.places.filter((p) => !p.hide && p.y >= split).map((p) => p.id);
    const above = map.places.filter((p) => !p.hide && p.y < split).map((p) => p.id);
    out.entrada = { label: 'Entrada', places: entranceBelow ? below : above, auto: true };
    out.fundos = { label: 'Fundos', places: entranceBelow ? above : below, auto: true };
  }
  for (const [k, g] of Object.entries(CUSTOM[venue] || {})) out[k] = { label: g.label || k, places: g.places || [] };
  return out;
}

const norm = (s) => String(s || '').trim().toLowerCase();
const splitList = (s) => String(s || '').split(/[,;+ ]+/).map((x) => x.trim()).filter(Boolean);
/** "03" → "jn-r03", "t2" → "jn-t2", "jn-r03" → "jn-r03". */
export function placeIdOf(venue, raw, mapOverride) {
  const map = mapOverride || (D.maps && D.maps[venue]); const s = norm(raw); if (!s || !map) return null;
  if (map.places.some((p) => p.id === s)) return s;
  const prefix = map.places[0] ? map.places[0].id.split('-')[0] : venue;
  const m = s.match(/^(t|r|s|sala|tenda)?\s*0*(\d+)$/);
  if (m) { const n = m[2]; const kind = m[1] === 't' || m[1] === 'tenda' ? 'tenda' : 'sala'; const hit = map.places.find((p) => p.kind === kind && Number(p.num) === Number(n)); if (hit) return hit.id; const alt = map.places.find((p) => Number(p.num) === Number(n)); if (alt) return alt.id; }
  const byName = map.places.find((p) => norm(p.name).includes(s) || norm(p.id).endsWith(`-${s}`));
  return byName ? byName.id : null;
}

/** Local padrão da TV: o do dia de trabalho das senhas (dia de serviços de hoje; outro dia do evento → local do próximo). */
export function defaultVenue(today) {
  const d = T.ticketDay(today || T.now().date);
  return d && D.maps && D.maps[d.venue] ? d.venue : 'jn';
}

/**
 * Lê os parâmetros (objeto ou URLSearchParams) e devolve { venue, queues, title, group, unknown }.
 * `today` (AAAA-MM-DD) decide o local padrão.
 */
export function selectQueues(params, today) {
  const get = (k) => (params && typeof params.get === 'function' ? params.get(k) : params ? params[k] : null) || '';
  const venue = D.venues[get('local')] && D.maps && D.maps[get('local')] ? get('local') : defaultVenue(today);
  const all = queuesFor(venue, today); const groups = groupsOf(venue); const unknown = [];
  const places = new Set(); let group = null;
  for (const g of splitList(get('grupo'))) { const k = norm(g); if (groups[k]) { group = group || { key: k, label: groups[k].label }; groups[k].places.forEach((id) => places.add(id)); } else unknown.push(`grupo ${g}`); }
  for (const s of splitList(get('salas'))) { const id = placeIdOf(venue, s); if (id) places.add(id); else unknown.push(`sala ${s}`); }
  const svcs = new Set(); for (const s of splitList(get('servicos'))) { const id = norm(s); if (D.services.some((x) => x.id === id)) svcs.add(id); else unknown.push(`serviço ${s}`); }
  let queues = all;
  if (places.size) queues = queues.filter((q) => places.has(q.place.id));
  if (svcs.size) queues = queues.filter((q) => svcs.has(q.service.id));
  const parts = [];
  if (group) parts.push(group.label);
  if (svcs.size) parts.push([...svcs].map((id) => D.services.find((x) => x.id === id).short).join(', '));
  if (places.size && !group) parts.push(`${places.size} ${places.size === 1 ? 'sala' : 'salas'}`);
  return { venue, queues, group, title: parts.join(' · '), unknown, groups: Object.keys(groups) };
}
