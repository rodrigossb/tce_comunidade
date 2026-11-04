// Filas extras (criadas na triagem no dia) somadas às filas fixas da planta. Puro, sem banco: usado pela triagem,
// pela porta, pela TV, pelo painel e pelos testes. Uma fila extra tem o formato de um ambiente da planta
// ({ id, kind, num, name }) mais `service_id` (pilar escolhido) e `extra: true`; o id é `<local>-x<n>`.
import { TCE as T } from '@tce/core';

const D = T.D;
/** Serviço (pilar) de uma fila; se o id não existir mais na programação, um genérico. */
export const serviceOf = (sid) => D.services.find((s) => s.id === sid) || { id: sid, short: 'Outros', title: 'Outros atendimentos', color: '#64748b', icon: 'ticket' };
/** groups = T.ticketQueuesOf(venue) ([{ service, places }]); devolve a mesma lista com as extras no pilar de cada uma. */
export function mergeExtras(groups, extras) {
  const out = (groups || []).map((g) => ({ service: g.service, places: g.places.slice() }));
  for (const e of extras || []) {
    if (!e || !e.id) continue;
    let g = out.find((x) => x.service.id === e.service_id);
    if (!g) { g = { service: serviceOf(e.service_id), places: [] }; out.push(g); }
    if (!g.places.some((p) => p.id === e.id)) g.places.push(e);
  }
  return out;
}
/** Ambiente por id: da planta ou das extras. */
export const placeOf = (id, extras) => T.placeInfo(id) || (extras || []).find((e) => e.id === id) || null;
/** Lista plana [{ service, place }] das extras (formato das filas da TV), filtrada por serviços quando há filtro. */
export const extraQueues = (extras, serviceIds) => (extras || []).filter((e) => !serviceIds || !serviceIds.size || serviceIds.has(e.service_id)).map((e) => ({ service: serviceOf(e.service_id), place: e }));
/** Tira das filas (formato [{ service, places }]) as desativadas na triagem; grupos vazios somem. */
export function withoutDisabled(groups, disabled) {
  const off = new Set(disabled || []); if (!off.size) return groups || [];
  return (groups || []).map((g) => ({ service: g.service, places: g.places.filter((p) => !off.has(p.id)) })).filter((g) => g.places.length);
}
/** Filas ativas de um local: fixas + extras − desativadas. */
export const activeQueues = (groups, extras, disabled) => withoutDisabled(mergeExtras(groups, extras), disabled);
