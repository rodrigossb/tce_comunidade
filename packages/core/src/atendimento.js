/* Atendimento público por dia: cruza o que a triagem do controle de senhas definiu (salas ativas, nomes, o que é oferecido
   em cada dia e turno) com a planta e a programação. Puro, sem rede: o site recebe o retrato da API
   (GET /tce-senhas/api/atendimento, ou atendimento.json publicado) e usa estas funções no mapa, nos serviços e na programação.
   Sem retrato (null), tudo cai na programação fixa: dias de serviços de D.event.serviceDays e salas da planta.

   Retrato: { updatedAt, days: [{ date, venue, source: 'triagem' | 'programacao',
              queues: [{ service_id, place_id, name, kind, num, extra, items: [{ t, shifts: null | ['manha', 'tarde'] }] }] }] } */
import { TCE_DATA as D } from './data.js';
import { TCE as T } from './shared.js';
import { TCE_COURSE_ROOMS } from './salas-cursos.js';
/** Ids dos ambientes da planta usados como sala de curso num local (DE → PARA de salas-cursos.js). */
const courseRoomIds = (venue) => Object.values((TCE_COURSE_ROOMS && TCE_COURSE_ROOMS[venue]) || {});

const SHIFT_ORDER = ['manha', 'tarde', 'noite'];
const SHIFT_AT = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' };
const SHIFT_SHORT = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };
const DEFAULT_SHIFTS = ['manha', 'tarde'];

/** Dias do retrato de um local (ou de todos), em ordem. */
const liveDays = (data, venue) => ((data && Array.isArray(data.days)) ? data.days : []).filter((d) => d && d.date && d.venue && (!venue || d.venue === venue)).slice().sort((a, b) => a.date.localeCompare(b.date));
const liveDay = (data, venue, date) => liveDays(data, venue).find((d) => d.date === date) || null;

/** Dias com atendimento ao público: os da programação (D.event.serviceDays) mais os que a triagem configurou. Mesmo formato
    de T.serviceDays() ({ date, venue, place, placeLong }) com `live` (há retrato da triagem) e `official` (dia de serviços
    da programação), em ordem de data. */
export function attendanceDays(data) {
  const out = T.serviceDays().map((d) => Object.assign({}, d, { live: !!liveDay(data, d.venue, d.date), official: true }));
  for (const d of liveDays(data)) {
    if (out.some((x) => x.date === d.date && x.venue === d.venue)) continue;
    const v = D.venues[d.venue]; if (!v) continue;
    out.push({ date: d.date, venue: d.venue, place: v.short, placeLong: v.name, live: true, official: false });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue));
}
/** Dia de atendimento numa data (no local, se informado) ou null. */
export const attendanceDayOf = (data, date, venue) => attendanceDays(data).find((d) => d.date === date && (!venue || d.venue === venue)) || null;
/** Datas com atendimento num local. */
export const venueDays = (data, venue) => attendanceDays(data).filter((d) => d.venue === venue).map((d) => d.date);
/** Dia a mostrar por padrão no mapa de um local: hoje se atende hoje; senão o próximo dia; senão o último. */
export function defaultDay(data, venue, today) {
  const days = venueDays(data, venue); if (!days.length) return null;
  return days.includes(today) ? today : days.find((d) => d > today) || days[days.length - 1];
}

const numKey = (n) => { const s = String(n == null ? '' : n).trim(); const d = s.replace(/^0+(?=\d)/, ''); return d; };
/** Ambiente da planta onde a fila fica: o próprio, se existir e não tiver mudado de número; senão o ambiente da planta com o
    mesmo tipo e número (a triagem "moveu" a fila ou criou uma sala com número da planta); senão null (sem pino). */
export function mapPlaceIdOf(venue, q) {
  const map = D.maps && D.maps[venue]; if (!map) return null;
  const own = map.places.find((p) => p.id === q.place_id) || null;
  const n = numKey(q.num);
  if (own && (!n || numKey(own.num) === n)) return own.id;
  if (n && q.kind !== 'area') { const hit = map.places.find((p) => !p.hide && p.kind === (q.kind || 'sala') && numKey(p.num) === n); if (hit) return hit.id; }
  return own ? own.id : null;
}
const toItem = (x) => ({ t: x.t != null ? x.t : x.text, shifts: Array.isArray(x.shifts) && x.shifts.length ? x.shifts.filter((k) => SHIFT_ORDER.includes(k)) : null });
const fromPlant = (service, place, venue, date) => ({ service, place: { id: place.id, kind: place.kind, num: place.num || '', name: place.name, extra: false, mapId: place.id }, items: T.offerOn(service, date, place.id, venue).map(toItem), plant: true });
const serviceOf = (id) => D.services.find((s) => s.id === id) || { id, short: 'Outros', title: 'Outros atendimentos', color: '#64748b', icon: 'ticket', summary: '', partners: [] };

/** Filas de um local num dia → [{ service, place: { id, kind, num, name, extra, mapId }, items: [{ t, shifts }], plant }].
    Com retrato da triagem para o dia: as filas dela (e, se for dia de serviços da programação, os ambientes da planta que não
    distribuem senha — acolhida, áreas, cursos — com a oferta da programação). Sem retrato: num dia de serviços da programação,
    toda a planta; nos demais dias, nada. */
/** Ambientes da planta que entram pela programação num dia oficial: fora os que já têm fila da triagem (`used`: id ou pino),
    fora as filas com senha quando há retrato da triagem (`skipTicket`) e fora as salas de curso (laboratórios etc.) sem aula
    nesse dia — num dia só de ação social elas não aparecem. */
function plantQueues(venue, date, used, skipTicket) {
  const ticket = skipTicket ? new Set(T.ticketQueuesOf(venue).flatMap((g) => g.places.map((p) => p.id))) : new Set();
  const courseRooms = new Set(courseRoomIds(venue));
  const withClass = new Set(T.allSessions().filter((x) => x.date === date && x.venue === venue).map((x) => { const pl = T.courseRoomPlace(x); return pl ? pl.id : null; }).filter(Boolean));
  const out = [];
  for (const g of T.queuesOf(venue)) for (const p of g.places) {
    if (ticket.has(p.id) || used.has(p.id)) continue;
    // sala de curso sem aula no dia: só fica se um serviço aponta um item para ela (ex.: Espaço da Beleza na sala 20);
    // a que entra apenas pela lista genérica de "cursos e oficinas" (laboratórios) sai
    if (courseRooms.has(p.id) && !withClass.has(p.id) && !T.itemsOn(g.service, date).some((it) => T.itemWhere(it, venue).includes(p.id))) continue;
    out.push(fromPlant(g.service, p, venue, date));
  }
  return out;
}
export function dayQueues(data, venue, date) {
  const sd = T.serviceDayOf(date); const official = !!(sd && sd.venue === venue);
  const live = liveDay(data, venue, date);
  if (!live) return official ? plantQueues(venue, date, new Set(), false) : [];
  const out = [];
  for (const q of Array.isArray(live.queues) ? live.queues : []) {
    if (!q || !q.place_id) continue;
    const service = serviceOf(q.service_id);
    out.push({ service, place: { id: q.place_id, kind: q.kind || 'sala', num: q.num == null ? '' : String(q.num), name: q.name || '', extra: !!q.extra, mapId: mapPlaceIdOf(venue, q) }, items: (Array.isArray(q.items) ? q.items : []).map(toItem), plant: false });
  }
  // pino já ocupado por uma fila da triagem (pelo id ou porque a fila foi movida para lá): a triagem manda, a planta não repete
  if (official) out.push(...plantQueues(venue, date, new Set(out.flatMap((q) => [q.place.id, q.place.mapId].filter(Boolean))), true));
  // Duas filas iguais no mesmo pino (mesmo serviço, nome e sala — ex.: salas 21 e 22 viradas "Castramóvel · 22") viram uma só para o público.
  const seen = new Set();
  return out.filter((q) => { const k = `${q.service.id}|${q.place.mapId || q.place.id}|${q.place.name.toLowerCase()}|${numKey(q.place.num)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
/** Filas que ficam num ambiente da planta (pino) ou têm esse id, no dia. */
export const placeQueues = (data, placeId, venue, date) => dayQueues(data, venue, date).filter((q) => (q.place.mapId ? q.place.mapId === placeId : q.place.id === placeId));
/** Ambientes da planta (ids, sem repetir) onde um serviço atende no dia. */
export const servicePlaceIds = (data, serviceId, venue, date) => [...new Set(dayQueues(data, venue, date).filter((q) => q.service.id === serviceId && q.place.mapId).map((q) => q.place.mapId))];
/** Serviços (pilares) com alguma fila no dia, na ordem de D.services. */
export function dayServices(data, venue, date) {
  const ids = new Set(dayQueues(data, venue, date).map((q) => q.service.id));
  return D.services.filter((s) => ids.has(s.id)).concat([...ids].filter((id) => !D.services.some((s) => s.id === id)).map(serviceOf));
}
/** Ambientes da planta sem nenhuma fila no dia (para esmaecer os pinos). Vazio quando não há retrato do dia. */
export function inactivePlaceIds(data, venue, date) {
  const map = D.maps && D.maps[venue]; if (!map || !liveDay(data, venue, date)) return [];
  const on = new Set(dayQueues(data, venue, date).map((q) => q.place.mapId).filter(Boolean));
  return map.places.filter((p) => !p.hide && !on.has(p.id)).map((p) => p.id);
}
/** Dias (do local) em que um ambiente da planta tem alguma fila. */
export const placeDays = (data, placeId, venue) => venueDays(data, venue).filter((d) => placeQueues(data, placeId, venue, d).length > 0);
/** Dias (do local) em que um serviço tem alguma fila. */
export const serviceDays = (data, serviceId, venue) => venueDays(data, venue).filter((d) => dayQueues(data, venue, d).some((q) => q.service.id === serviceId));

/** "de manhã" · "à tarde" · "manhã e tarde" (vazio = o dia todo). */
export function shiftsText(shifts) {
  const a = SHIFT_ORDER.filter((k) => (shifts || []).includes(k));
  if (!a.length || a.length >= DEFAULT_SHIFTS.length && DEFAULT_SHIFTS.every((k) => a.includes(k))) return '';
  return a.length === 1 ? SHIFT_AT[a[0]] : a.map((k) => SHIFT_SHORT[k]).join(' e ');
}
/** "Sala 08" · "Tenda 4" · "Ambiente 3"; sem número ("" ou "0") → o nome do atendimento. */
export const hasNum = (p) => !!(p && p.num && String(p.num).trim() && String(p.num).trim() !== '0');
export const placeTitle = (p) => (!hasNum(p) ? p.name : p.kind === 'sala' ? `Sala ${p.num}` : p.kind === 'tenda' ? `Tenda ${p.num}` : `Ambiente ${p.num}`);
/** Rótulo completo do chip: "Sala 08 · Pediatra" ou só o nome quando não há número. */
export const queueLabel = (p) => (hasNum(p) ? `${placeTitle(p)} · ${p.name}` : p.name);
/** Itens de uma fila com o que vale num turno (null = qualquer turno). */
export const itemsAt = (q, shift) => (q.items || []).filter((it) => !shift || !it.shifts || it.shifts.includes(shift));

export const Atendimento = { hasNum, queueLabel, attendanceDays, attendanceDayOf, venueDays, defaultDay, mapPlaceIdOf, dayQueues, placeQueues, servicePlaceIds, dayServices, inactivePlaceIds, placeDays, serviceDays, shiftsText, placeTitle, itemsAt };
export default Atendimento;
