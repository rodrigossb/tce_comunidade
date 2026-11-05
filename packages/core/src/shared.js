/* Utilitários comuns a todas as telas: relógio no fuso do evento (com simulação ?t=&d=), datas e turnos, sessões, QR, .ics, serviços, filas e busca.
   Módulo ES (pacote @tce/core); roda no navegador, no Next e em Node (testes). */
import { TCE_DATA as D } from './data.js';
import { TCE_COURSE_ROOMS } from './salas-cursos.js';
import { icon, SHIFT_ICON } from './icons.js';
import qrcode from '../vendor/qrcode.cjs';
const TZ = D.event.timezone;
const SHIFTS = D.event.shifts;
const SHIFT_ORDER = ['manha', 'tarde', 'noite'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- relógio no fuso do evento, com simulação por URL (?t=HH:MM&d=AAAA-MM-DD) ----
// Lido sob demanda: no Next o módulo também é avaliado no servidor, onde não há location.
const search_ = () => (typeof location !== 'undefined' ? location.search : '');
const params = { get: (k) => new URLSearchParams(search_()).get(k), has: (k) => new URLSearchParams(search_()).has(k), toString: () => new URLSearchParams(search_()).toString() };
let simOffset = null; // ms a somar ao Date.now()
let simReady = false;
function initSim() {
  if (simReady) return; simReady = true;
  const t = params.get('t'); const d = params.get('d');
  if (!t && !d) return;
  const real = partsOf(new Date());
  const date = d || real.date; const time = t || real.time;
  // Constrói o instante simulado no fuso do evento e calcula o desvio.
  const target = zonedToUtc(date, time);
  simOffset = target - Date.now();
}
function zonedToUtc(date, time) {
  // Busca o instante UTC cujo horário em TZ é date+time (duas iterações bastam para fusos fixos).
  let guess = Date.parse(`${date}T${time}:00Z`);
  for (let i = 0; i < 2; i++) {
    const p = partsOf(new Date(guess));
    const diff = Date.parse(`${p.date}T${p.time}:${pad(p.seconds)}Z`) - Date.parse(`${date}T${time}:00Z`);
    guess -= diff;
  }
  return guess;
}
function partsOf(dt) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
  const o = {}; for (const p of f.formatToParts(dt)) o[p.type] = p.value;
  const hour = o.hour === '24' ? '00' : o.hour;
  const date = `${o.year}-${o.month}-${o.day}`;
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, time: `${hour}:${o.minute}`, seconds: Number(o.second), weekdayNum: wd, weekday: WEEKDAYS[wd], day: Number(o.day), month: MONTHS[Number(o.month) - 1], min: toMin(`${hour}:${o.minute}`) };
}
const now = () => { initSim(); return partsOf(new Date(Date.now() + (simOffset || 0))); };
const isSimulated = () => { initSim(); return simOffset != null; };

// ---- datas / turnos ----
const fmtDate = (iso, mode) => {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (mode === 'short') return `${pad(d)}/${pad(m)}`;
  if (mode === 'wd') return `${WEEKDAYS_SHORT[wd]} ${pad(d)}`;
  if (mode === 'wdm') return `${WEEKDAYS_SHORT[wd]} ${pad(d)}/${pad(m)}`;
  if (mode === 'wdlong') return `${WEEKDAYS[wd].replace('-feira', '')}, ${pad(d)}/${pad(m)}`;
  if (mode === 'day') return `${d} de ${MONTHS[m - 1]}`;
  return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]}`;
};
const weekdayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const shiftOf = (time) => { const h = toMin(time) / 60; return h < 13 ? 'manha' : h < 18 ? 'tarde' : 'noite'; };
const fmtTime = (t) => { const [h, m] = t.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
const eventDays = () => {
  const out = []; const [y, m, d0] = D.event.start.split('-').map(Number); const [, , d1] = D.event.end.split('-').map(Number);
  for (let d = d0; d <= d1; d++) out.push(`${y}-${pad(m)}-${pad(d)}`);
  return out;
};
const relDay = (iso, today) => {
  const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 864e5);
  return diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff === -1 ? 'ontem' : diff > 1 ? `em ${diff} dias` : '';
};

// ---- sessões ----
const sessionEnd = (sess) => sess.end || SHIFTS[shiftOf(sess.time)].end;
/** Estado da sessão frente ao relógio: past | now | next (próxima de hoje) | today | future. */
function sessionState(sess, clock) {
  if (sess.date < clock.date) return 'past';
  if (sess.date > clock.date) return 'future';
  const a = toMin(sess.time); const b = toMin(sessionEnd(sess));
  if (clock.min >= b) return 'past';
  if (clock.min >= a) return 'now';
  return 'today';
}
const venueLabel = (sess, opts) => {
  const v = D.venues[sess.venue]; const name = opts && opts.long ? v.name : v.short;
  return sess.room ? `${sess.room} · ${name}` : name;
};
/** Todas as sessões com referência ao curso, ordenadas por data e hora. */
let _all = null;
function allSessions() {
  if (_all) return _all;
  _all = [];
  for (const c of D.courses) for (const sess of c.sessions) _all.push(Object.assign({ course: c, shift: shiftOf(sess.time), link: sess.link || c.link }, sess));
  _all.sort((x, y) => x.date.localeCompare(y.date) || toMin(x.time) - toMin(y.time) || String(x.room).localeCompare(String(y.room)));
  return _all;
}
const courseById = (id) => D.courses.find((c) => String(c.id) === String(id));
const serviceById = (id) => D.services.find((x) => x.id === id);
const title = (c, short) => (short && c.short) || c.title;
/** Próxima sessão (a partir de agora) de um curso; null se todas passaram. */
const nextSession = (c, clock) => allSessions().filter((x) => x.course === c && sessionState(x, clock) !== 'past')[0] || null;
const courseState = (c, clock) => {
  const st = c.sessions.map((x) => sessionState(x, clock));
  return st.includes('now') ? 'now' : st.includes('today') ? 'today' : st.every((x) => x === 'past') ? 'past' : 'future';
};

// ---- QR ----
/** Módulos do QR como caminho SVG: { size, path, dark, light } (para componentes React desenharem o <svg> direto). */
function qrPath(text, opts) {
  const o = Object.assign({ margin: 2, dark: '#0b1b3a', light: '#ffffff' }, opts || {});
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); const size = n + o.margin * 2;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c + o.margin} ${r + o.margin}h1v1h-1z`;
  return { size, path, dark: o.dark, light: o.light };
}
function qrSvg(text, opts) {
  const o = Object.assign({ cell: 4, margin: 2, dark: '#0b1b3a', light: '#ffffff' }, opts || {});
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); const size = n + o.margin * 2;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c + o.margin} ${r + o.margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${size}" height="${size}" fill="${o.light}"/><path d="${path}" fill="${o.dark}"/></svg>`;
}
/** URL pública do app: ?app= na URL > event.appUrl (endereço institucional) > a própria pasta. */
function appUrl(hash) {
  const base = params.get('app') || D.event.appUrl || (typeof location !== 'undefined' ? new URL('./', location.href).href : './');
  return base + (hash ? `#${hash}` : '');
}

// ---- .ics ----
function icsFor(course, sessions) {
  const list = sessions || course.sessions;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TCE na Comunidade//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const fold = (s) => s.replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
  list.forEach((sess, i) => {
    const dt = (iso, t) => `${iso.replace(/-/g, '')}T${t.replace(':', '')}00`;
    lines.push('BEGIN:VEVENT', `UID:tce-comunidade-${course.id}-${i}@tce.ap.gov.br`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${dt(sess.date, sess.time)}`, `DTEND;TZID=${TZ}:${dt(sess.date, sessionEnd(sess))}`,
      `SUMMARY:${fold(title(course))}`, `LOCATION:${fold(venueLabel(sess, { long: true }))}`,
      `DESCRIPTION:${fold(`${D.event.name} · ${D.event.edition}\nPúblico: ${course.audience}\nCarga horária: ${course.hours}h\nInscrição: ${sess.link || course.link}`)}`,
      `URL:${sess.link || course.link}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ---- serviços: itens (texto ou { t, only }) e dias de serviços ----
const itemText = (it) => (typeof it === 'string' ? it : it.t);
const itemOnly = (it) => (typeof it === 'string' ? null : it.only || null);
/** `when` de um item: { 'AAAA-MM-DD': true | ['manha', 'tarde'] } (em que dias/turnos acontece); null = sempre. */
const itemWhen = (it) => (typeof it === 'string' ? null : it.when || null);
/** Turnos do item numa data: null = o dia todo (ou sem restrição); [] = não acontece nesse dia. */
const itemShifts = (it, date) => { const w = itemWhen(it); if (!w) return null; const v = w[date]; return v === true ? null : Array.isArray(v) ? v : []; };
const SHIFT_AT = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' };
const shiftsLabel = (list) => { const a = SHIFT_ORDER.filter((k) => list.includes(k)); return !a.length ? '' : a.length === 1 ? SHIFT_AT[a[0]] : a.map((k) => SHIFTS[k].short.toLowerCase()).join(' e '); };
/** "qui 05/11 à tarde · sex 06/11 manhã e tarde · sáb 07/11" a partir de um `when`. */
const whenLabel = (w) => (!w ? '' : Object.keys(w).sort().map((d) => `${fmtDate(d, 'wdm')}${w[d] === true ? '' : ` ${shiftsLabel(w[d])}`}`).join(' · '));
const itemWhenLabel = (it) => whenLabel(itemWhen(it));
const serviceDays = () => D.event.serviceDays || [];
const serviceDayOf = (date) => serviceDays().find((d) => d.date === date) || null;
/** Próximo dia de serviços a partir de hoje (inclusive); null se todos já passaram. */
const nextServiceDay = (today) => serviceDays().find((d) => d.date >= today) || null;
/** "qua 04/11 no Manga e sáb 07/11 na Joaquim Nabuco" */
const serviceDaysLabel = (mode) => serviceDays().map((d) => `${fmtDate(d.date, mode || 'wdm')} · ${d.place}`).join(' e ');
/** Itens de um serviço disponíveis em um dia (todos, se date for nulo). */
/** Itens de um serviço numa data (e turno, se informado): respeita `only` (só naquele dia) e `when` (dias/turnos). */
const itemsOn = (s, date, shift) => s.items.filter((it) => { if (!date) return true; const o = itemOnly(it); if (o && o !== date) return false; const sh = itemShifts(it, date); return sh === null || (sh.length > 0 && (!shift || sh.includes(shift))); });
/** Local (jn|manga) com mapa para uma data de serviços; null se não for dia de serviços. */
const mapVenueOf = (date) => { const d = serviceDayOf(date); return d && D.maps && D.maps[d.venue] ? d.venue : null; };
/** Salas/tendas de um serviço num local (ids); itens com `where` entram primeiro, depois a lista do serviço. */
const placesOf = (s, venue) => { const out = []; const push = (id) => { if (id && !out.includes(id)) out.push(id); }; (s.places && s.places[venue] || []).forEach(push); for (const it of s.items) if (typeof it === 'object' && it.where && it.where[venue]) it.where[venue].forEach(push); return out; };
const itemWhere = (it, venue) => (typeof it === 'object' && it.where && it.where[venue]) || [];
const placeInfo = (id) => { for (const m of Object.values(D.maps || {})) { const p = m.places.find((x) => x.id === id); if (p) return Object.assign({ venue: m.venue }, p); } return null; };
/** Filas de senhas de um local: uma por sala/tenda/área usada por algum serviço, agrupadas pelo primeiro pilar que a usa. */
/** Filas que distribuem senha no local (configuração D.senhas): usado pela triagem, pela porta da sala e pela TV. */
function ticketQueuesOf(venue) {
  const cfg = D.senhas || {}; const allow = cfg.services ? new Set(cfg.services) : null; const deny = new Set(cfg.excludePlaces || []);
  const denyKinds = new Set((cfg.excludeKinds && cfg.excludeKinds[venue]) || []);
  const out = [];
  for (const g of queuesOf(venue)) {
    if (allow && !allow.has(g.service.id)) continue;
    const places = g.places.filter((p) => p.kind !== 'area' && !deny.has(p.id) && !denyKinds.has(p.kind));
    if (places.length) out.push({ service: g.service, places });
  }
  return out;
}
function queuesOf(venue) {
  const seen = new Set(); const groups = [];
  for (const s of D.services) {
    const items = [];
    for (const id of placesOf(s, venue)) { if (seen.has(id)) continue; const p = placeInfo(id); if (!p || p.hide || (p.svc && p.svc !== s.id)) continue; seen.add(id); items.push(Object.assign({ service_id: s.id }, p)); }
    if (items.length) groups.push({ service: s, places: items });
  }
  return groups;
}
/** Ambiente da planta da sala de uma aula (DE → PARA em js/salas-cursos.js); null se não mapeado. */
const courseRoomPlace = (x) => { const map = TCE_COURSE_ROOMS || {}; const id = map[x.venue] && map[x.venue][x.room]; return id ? placeInfo(id) : null; };
/** O que há numa sala/tenda da planta no dia de serviços do local: serviços (pilares) com os itens oferecidos ali e as aulas de cursos.
 *  → { place, venue, day, services: [{ service, items, specific }], sessions } ou null se o ambiente não existir.
 *  Os itens vêm do `where` de cada item (filtrados pelo dia de serviços do local); se o serviço só lista o ambiente em `places`, sem item
 *  apontando para ele, entra com items: [] e specific: false (a tela mostra o resumo do pilar). O serviço dono da sala (`svc`) vem primeiro. */
function offeringsAt(placeId, venue) {
  const place = placeInfo(placeId); if (!place) return null;
  const v = venue || place.venue;
  const day = serviceDays().find((d) => d.venue === v) || null;
  const services = [];
  for (const s of D.services) {
    const items = itemsOn(s, day ? day.date : null).filter((it) => itemWhere(it, v).includes(placeId));
    const listed = (s.places && s.places[v] || []).includes(placeId);
    if (items.length || listed) services.push({ service: s, items, specific: items.length > 0 });
  }
  if (place.svc) services.sort((a, b) => (b.service.id === place.svc) - (a.service.id === place.svc));
  const sessions = allSessions().filter((x) => { const pl = courseRoomPlace(x); return pl && pl.id === placeId; });
  return { place, venue: v, day, services, sessions };
}
/** O que um serviço oferece numa data; se algum item aponta para a sala (`where`), só esses. [{ text, shifts }] — shifts null = o dia todo. */
function offerOn(s, date, placeId, venue) {
  const all = itemsOn(s, date);
  const here = placeId ? all.filter((it) => itemWhere(it, venue).includes(placeId)) : [];
  return (here.length ? here : all).map((it) => ({ text: itemText(it), shifts: date ? itemShifts(it, date) : null }));
}
/** Dia e local de trabalho do controle de senhas. Dia de serviços de hoje → ele. Outro dia do evento → hoje mesmo (as filas
    são as criadas na triagem), no local pedido ou no do próximo dia de serviços. Fora do evento → o próximo dia de serviços
    (ou o último, do local pedido quando houver). Devolve { date, venue, place, placeLong, service_day }. */
function ticketDay(today, venue) {
  const days = serviceDays(); const sd = serviceDayOf(today);
  const asDay = (d) => (d ? Object.assign({ service_day: true }, d) : null);
  if (sd && (!venue || sd.venue === venue)) return asDay(sd);
  const fallback = nextServiceDay(today) || days[days.length - 1] || null;
  if (eventDays().includes(today)) { const v = venue || (fallback ? fallback.venue : 'jn'); const vn = D.venues[v]; return { date: today, venue: v, place: vn ? vn.short : v, placeLong: vn ? vn.name : v, service_day: false }; }
  if (venue && fallback && fallback.venue !== venue) { const alt = days.filter((d) => d.venue === venue).pop(); if (alt) return asDay(alt); }
  return asDay(fallback);
}
const SHIFT_IDX = { manha: 0, tarde: 1, noite: 2 };
/** Agenda do que é oferecido: itens [{ t, when }] × dias × turnos → [{ date, shift, items: [texto], now, past }] (só com itens).
    Item sem `when` vale sempre; com `when`, só nos dias/turnos marcados (ver itemShifts). */
function offerSlots(items, days, nowDate, nowShift, shifts) {
  const sh = shifts || ['manha', 'tarde']; const out = [];
  for (const date of days || []) for (const shift of sh) {
    const list = (items || []).filter((it) => { const s = itemShifts(it, date); return s === null || s.includes(shift); }).map(itemText);
    if (!list.length) continue;
    const past = date < nowDate || (date === nowDate && (SHIFT_IDX[shift] ?? 0) < (SHIFT_IDX[nowShift] ?? 0));
    out.push({ date, shift, items: list, now: date === nowDate && shift === nowShift, past });
  }
  return out;
}
const SHIFT_SHORT = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };
/** Agrupa slots (offerSlots) consecutivos com os mesmos itens → [{ items, slots, label, now, past }]. `days` = todos os dias
    considerados (para "todos os dias" significar isso mesmo). Rótulo consolidado:
    "todos os dias", "qui 05 a sáb 07", "sex 06 e sáb 07", "hoje tarde", "sex 06 manhã · sáb 07". */
function slotGroups(slots, nowDate, days, shifts) {
  const all = slots || []; const dates = days && days.length ? days.slice() : [...new Set(all.map((s) => s.date))]; const sh = shifts || ['manha', 'tarde'];
  const shiftsOf = (date, list) => list.filter((s) => s.date === date).map((s) => s.shift);
  const dayName = (d) => (d === nowDate ? 'hoje' : fmtDate(d, 'wd'));
  // Dia "inteiro": todos os turnos; hoje, todos os que ainda restam na lista (os passados já saíram).
  const fullDay = (d, gs) => shiftsOf(d, gs).length === (d === nowDate ? shiftsOf(d, all).length : sh.length);
  const label = (gs) => {
    const ds = [...new Set(gs.map((s) => s.date))];
    const full = ds.every((d) => fullDay(d, gs));
    if (full) {
      if (ds.length === dates.length && ds.length > 1) return 'todos os dias';
      const idx = ds.map((d) => dates.indexOf(d)); const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
      if (ds.length >= 3 && consecutive) return `${dayName(ds[0])} a ${dayName(ds[ds.length - 1])}`;
      return ds.map(dayName).join(ds.length === 2 ? ' e ' : ', ');
    }
    return ds.map((d) => { const x = shiftsOf(d, gs); return fullDay(d, gs) ? dayName(d) : `${dayName(d)} ${x.map((k) => SHIFT_SHORT[k] || k).join(' e ')}`; }).join(' · ');
  };
  const groups = [];
  for (const s of all) { const g = groups[groups.length - 1]; const key = s.items.join('\u0001'); if (g && g.key === key) g.slots.push(s); else groups.push({ key, items: s.items, slots: [s] }); }
  return groups.map((g) => ({ items: g.items, slots: g.slots, label: label(g.slots), now: g.slots.some((x) => x.now), past: g.slots.every((x) => x.past) }));
}
const queueLabel = (p) => (p.kind === 'area' && !p.num ? p.name : `${p.name} · ${p.kind === 'sala' ? 'Sala' : p.kind === 'tenda' ? 'Tenda' : 'Ambiente'} ${p.num}`);

// ---- busca única (cursos, serviços e locais), sem acentos, com sinônimos do dia a dia ----
const SYNONYMS = { rg: 'identidade', cin: 'identidade', remedio: 'farmacia', remedios: 'farmacia', dentista: 'odontologico', medico: 'consultas', medica: 'consultas', cachorro: 'caes', cachorros: 'caes', gato: 'gatos', advogado: 'juridico', advogada: 'juridico', justica: 'juridico', computador: 'tecnologia', celular: 'tecnologia', emprego: 'profissional', escola: 'escolares', professor: 'professores', professora: 'professores', crianca: 'criancas', idoso: 'idosos', animal: 'animais', pet: 'caes', veterinario: 'antirrabica', vacina: 'vacinacao', vacinas: 'vacinacao', titulo: 'eleitorais', eleitor: 'eleitorais', habilitacao: 'cnh', pai: 'pai presente', pensao: 'pensoes', aposentadoria: 'aposentadorias', inss: 'previdenciarios', mulher: 'mulheres', comida: 'alimentos', pao: 'panificacao', paes: 'panificacao', costura: 'textil', camisa: 'camisas', natal: 'natalino', presente: 'presentes', venda: 'vender', ia: 'inteligencia artificial', video: 'videomaker', rio: 'rios', madeira: 'madeireiros', socorro: 'socorros', castracao: 'castra', castrar: 'castra', luz: 'energia', equatorial: 'energia', conta: 'energia', oculos: 'oftalmologista', olho: 'oftalmologista', olhos: 'oftalmologista', dente: 'dentista', dentes: 'dentista', psicologo: 'psicologo', psicologa: 'psicologo', fisioterapia: 'fisioterapeuta', casar: 'casamento', procon: 'procon', terra: 'fundiaria', terreno: 'fundiaria', agricultor: 'agricultura', feira: 'feira', cinema: 'cinema', teatro: 'teatro', bazar: 'bazar', roupa: 'bazar', henna: 'henna', sobrancelha: 'sobrancelhas', massagem: 'massagens', exame: 'exames', sangue: 'laboratoriais', pezinho: 'pezinho', pressao: 'pressao', diabetes: 'glicemia', glicose: 'glicemia', autismo: 'autismo', tea: 'autismo', tdah: 'tdah', barco: 'embarcacoes', embarcacao: 'embarcacoes', carro: 'veiculos', moto: 'veiculos', cnh: 'cnh', sus: 'sus', leishmaniose: 'leishmaniose', raiva: 'antirrabica' };
const searchTerms = (q) => norm(q).split(/\s+/).filter((w) => w.length > 1).map((w) => (SYNONYMS[w] ? [w, SYNONYMS[w]] : [w]));
const searchMatch = (text, tt) => tt.every((alts) => alts.some((w) => text.includes(w)));
const searchableCourse = (c) => norm([c.title, c.short, c.audience, c.tags.map((t) => D.tags[t]).join(' '), c.sessions.map((x) => `${D.venues[x.venue].name} ${D.venues[x.venue].short} ${x.room} ${fmtDate(x.date, 'wd')}`).join(' '), String(c.id), 'curso'].join(' '));
const searchableService = (s) => norm([s.title, s.short, s.summary, s.items.map(itemText).join(' '), s.detail || '', s.partners.join(' '), 'servico gratuito'].join(' '));
const searchableVenue = (v) => norm([v.name, v.short, v.city, v.rooms.join(' '), 'local'].join(' '));
/** Resultado agrupado: { terms, courses, services:[{s,hits}], venues, total }. */
function search(q) {
  const tt = searchTerms(q || '');
  if (!tt.length) return { terms: tt, courses: [], services: [], venues: [], total: 0 };
  const courses = D.courses.filter((c) => searchMatch(searchableCourse(c), tt));
  const services = D.services.map((s) => ({ s, hits: s.items.filter((it) => searchMatch(norm(itemText(it)), tt)).slice(0, 3) })).filter((r) => r.hits.length || searchMatch(searchableService(r.s), tt));
  const venues = Object.values(D.venues).filter((v) => searchMatch(searchableVenue(v), tt));
  return { terms: tt, courses, services, venues, total: courses.length + services.length + venues.length };
}
const SUGGESTIONS = ['Saúde', 'Vacina', 'Identidade', 'Dentista', 'Castração', 'Casamento', 'Corte de cabelo', 'Energia', 'Mulheres', 'Crianças', 'Empreendedorismo', 'Feira'];

export { D, TZ, SHIFTS, SHIFT_ORDER, pad, toMin, norm, esc, now, isSimulated, partsOf, fmtDate, fmtTime, weekdayOf, shiftOf, eventDays, relDay, sessionEnd, sessionState, venueLabel, allSessions, courseById, serviceById, title, nextSession, courseState, qrSvg, qrPath, appUrl, icsFor, params, searchTerms, searchMatch, searchableCourse, SUGGESTIONS, itemText, itemOnly, itemWhen, itemShifts, whenLabel, itemWhenLabel, offerOn, offerSlots, slotGroups, ticketDay, serviceDays, serviceDayOf, nextServiceDay, serviceDaysLabel, itemsOn, mapVenueOf, placesOf, itemWhere, placeInfo, queuesOf, ticketQueuesOf, queueLabel, courseRoomPlace, offeringsAt, icon, SHIFT_ICON };
/** Mesmo objeto `TCE` do site antigo (T.fmtDate, T.icon…), para portar as telas sem reescrever cada chamada. */
export const TCE = { D, TZ, SHIFTS, SHIFT_ORDER, pad, toMin, norm, esc, now, isSimulated, partsOf, fmtDate, fmtTime, weekdayOf, shiftOf, eventDays, relDay, sessionEnd, sessionState, venueLabel, allSessions, courseById, serviceById, title, nextSession, courseState, qrSvg, qrPath, appUrl, icsFor, params, search, searchTerms, searchMatch, searchableCourse, SUGGESTIONS, itemText, itemOnly, itemWhen, itemShifts, whenLabel, itemWhenLabel, offerOn, offerSlots, slotGroups, ticketDay, serviceDays, serviceDayOf, nextServiceDay, serviceDaysLabel, itemsOn, mapVenueOf, placesOf, itemWhere, placeInfo, queuesOf, ticketQueuesOf, queueLabel, courseRoomPlace, offeringsAt, icon, SHIFT_ICON };
export default TCE;
