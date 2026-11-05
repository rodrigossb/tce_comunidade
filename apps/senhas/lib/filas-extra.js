// Filas extras (criadas na triagem no dia) somadas às filas fixas da planta. Puro, sem banco: usado pela triagem,
// pela porta, pela TV, pelo painel e pelos testes. Uma fila extra tem o formato de um ambiente da planta
// ({ id, kind, num, name }) mais `service_id` (pilar escolhido) e `extra: true`; o id é `<local>-x<n>`.
import { TCE as T } from '@tce/core';

const D = T.D;
/** Serviço (pilar) de uma fila; se o id não existir mais na programação, um genérico. */
export const serviceOf = (sid) => D.services.find((s) => s.id === sid) || { id: sid, short: 'Outros', title: 'Outros atendimentos', color: '#64748b', icon: 'ticket' };
/** groups = T.ticketQueuesOf(venue) ([{ service, places }]); devolve a mesma lista com as extras no pilar de cada uma. */
export function mergeExtras(groups, extras) {
  const out = (groups || []).map((g) => ({ service: g.service, places: g.places.map((p) => Object.assign({}, p)) }));
  const PATCH = ['name', 'kind', 'num', 'offer'];
  for (const e of extras || []) {
    if (!e || !e.id) continue;
    // Sala fixa editada na triagem (override): só atualiza nome/sala/oferta da fila já existente, nunca cria fila.
    if (e.override) { for (const g of out) for (const p of g.places) if (p.id === e.id) { for (const k of PATCH) if (e[k] != null) p[k] = e[k]; } continue; }
    let g = out.find((x) => x.service.id === e.service_id);
    if (!g) { g = { service: serviceOf(e.service_id), places: [] }; out.push(g); }
    if (!g.places.some((p) => p.id === e.id)) g.places.push(e);
  }
  return out;
}
/** Filas fixas da planta (D.senhas) de um local num dia: só no dia de serviços daquele local; nos outros dias do evento
    valem só as filas criadas na triagem (extras). Sem `day`, todas (compatibilidade/testes). */
export const fixedQueues = (venue, day) => { if (!day) return T.ticketQueuesOf(venue); const sd = T.serviceDayOf(day); return sd && sd.venue === venue ? T.ticketQueuesOf(venue) : []; };
/** Ambiente por id: o que o dia tem (extra criada ou sala fixa editada na triagem) e, senão, a planta. */
export const placeOf = (id, extras) => { const e = (extras || []).find((x) => x.id === id); const p = T.placeInfo(id); return e && p ? Object.assign({}, p, e, { id }) : e || p || null; };
/** Lista plana [{ service, place }] das extras (formato das filas da TV), filtrada por serviços quando há filtro. */
export const extraQueues = (extras, serviceIds) => (extras || []).filter((e) => e.extra && !e.override && (!serviceIds || !serviceIds.size || serviceIds.has(e.service_id))).map((e) => ({ service: serviceOf(e.service_id), place: e }));
/** Tira das filas (formato [{ service, places }]) as desativadas na triagem; grupos vazios somem. */
export function withoutDisabled(groups, disabled) {
  const off = new Set(disabled || []); if (!off.size) return groups || [];
  return (groups || []).map((g) => ({ service: g.service, places: g.places.filter((p) => !off.has(p.id)) })).filter((g) => g.places.length);
}
/** Filas ativas de um local: fixas + extras − desativadas. */
export const activeQueues = (groups, extras, disabled) => withoutDisabled(mergeExtras(groups, extras), disabled);
