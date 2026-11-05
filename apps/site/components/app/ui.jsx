'use client';
/* Peças comuns do app do público: contexto, cartões, chips, busca. Mesmas classes CSS do site antigo (css/app.css). */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import Icon from '@/components/Icon';

const D = T.D;
export { T, D, M };
export const I = (name) => <Icon name={name} />;

export const VIEWS = {
  programacao: { label: 'Programação', icon: 'calendar' },
  busca: { label: 'Buscar', icon: 'search' },
  cursos: { label: 'Cursos', icon: 'graduation' },
  servicos: { label: 'Serviços', icon: 'handshake' },
  mapa: { label: 'Mapa', icon: 'map' },
  locais: { label: 'Locais', icon: 'pin', hidden: true },
};
export const SHEETS = { curso: 'cursos', servico: 'servicos', local: 'locais' };

/** Estado e ações compartilhados por todas as telas (equivale às variáveis do módulo antigo). */
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const hashOf = (view, p) => { const q = p && [...p.keys()].length ? `?${p.toString()}` : ''; return `#${view}${q}`; };
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const shiftColor = (k) => T.SHIFTS[k].color;
export const roomLabel = (x) => (x.room ? `${x.room} · ${D.venues[x.venue].short}` : D.venues[x.venue].name);
export const sessionsOf = (f) => T.allSessions().filter(f);

// ---------- helpers que dependem do relógio/estado ----------
export function useDomain() {
  const { clock, favs, prefs, kiosk } = useApp();
  const st = (x) => T.sessionState(x, clock);
  const focusDate = () => (clock.date < D.event.start ? D.event.start : clock.date > D.event.end ? D.event.end : clock.date);
  const nextOf = (c) => T.nextSession(c, clock) || T.allSessions().find((x) => x.course === c);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  const shiftState = (k, date) => { if (date < clock.date) return 'past'; if (date > clock.date) return 'later'; const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later'; };
  const dayWord = (d) => (d === clock.date ? 'hoje' : T.relDay(d, clock.date) === 'amanhã' ? 'amanhã' : T.fmtDate(d, 'wdlong'));
  const courseSort = {
    proximas: (a, b) => { const sa = T.courseState(a, clock) === 'past'; const sb = T.courseState(b, clock) === 'past'; if (sa !== sb) return sa ? 1 : -1; const na = nextOf(a); const nb = nextOf(b); return na.date.localeCompare(nb.date) || T.toMin(na.time) - T.toMin(nb.time) || T.title(a, true).localeCompare(T.title(b, true)); },
    az: (a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'),
    ch: (a, b) => b.hours - a.hours || courseSort.az(a, b),
  };
  const filterCourses = (p) => {
    const tt = T.searchTerms(p.get('q') || ''); const tag = p.get('tema'); const dia = p.get('dia'); const turno = p.get('turno'); const local = p.get('local'); const fav = p.get('fav');
    return D.courses.filter((c) => {
      if (tt.length && !T.searchMatch(T.searchableCourse(c), tt)) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (fav && !favs.has(c.id)) return false;
      return c.sessions.some((x) => (!dia || x.date === dia) && (!turno || T.shiftOf(x.time) === turno) && (!local || x.venue === local));
    });
  };
  const defaultMapVenue = () => { const l = kiosk ? kiosk.local : prefs.local; if (l && M.mapOf(l)) return l; const d = T.nextServiceDay(clock.date) || T.serviceDays()[0]; return d.venue; };
  return { st, focusDate, nextOf, shiftState, dayWord, courseSort, filterCourses, defaultMapVenue };
}
export const activeFilterCount = (p) => ['tema', 'dia', 'turno', 'local', 'fav'].filter((k) => p.get(k)).length;

// ---------- componentes ----------
export function StateBadge({ s, c }) {
  if (s === 'now') return <span className="badge now" style={{ '--c': c }}>agora</span>;
  if (s === 'today') return <span className="badge today">hoje</span>;
  if (s === 'past') return <span className="badge past">encerrada</span>;
  return null;
}
export function OnlyLabel({ it }) {
  const o = T.itemOnly(it); const w = T.itemWhenLabel(it);
  if (o) { const d = T.serviceDayOf(o); return <em className="only">{I('calendar')}só {T.fmtDate(o, 'wdm')} · {d ? d.place : ''}</em>; }
  return w ? <em className="only">{I('calendar')}{w}</em> : null;
}
export function ItemLi({ it, date, tags }) {
  const o = T.itemOnly(it); const sh = date ? T.itemShifts(it, date) : null; const off = date && ((o && o !== date) || (sh && !sh.length));
  return <li className={off ? 'off' : ''}><i></i><span>{T.itemText(it)}<OnlyLabel it={it} />{tags}</span></li>;
}
export function SvcDayCard({ d, on, onClick, sub }) {
  const { clock } = useApp(); const today = d.date === clock.date;
  return (
    <button className={`svc-day ${today ? 'today' : ''} ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="sd-date"><small>{today ? 'hoje' : T.fmtDate(d.date, 'wd').split(' ')[0]}</small><b>{d.date.slice(8)}/{d.date.slice(5, 7)}</b></span>
      <span className="sd-body"><b>{d.place}</b><small>{sub || 'Todos os serviços gratuitos · sem inscrição'}</small></span>{I('right')}
    </button>
  );
}
export function WhenBox({ sel }) {
  const { setParam } = useApp();
  return (
    <div className="when-box"><small>{I('calendar')}Quando e onde</small>
      <div className="svc-days">{T.serviceDays().map((d) => <SvcDayCard key={d.date} d={d} on={sel === d.date} onClick={() => setParam('dia', sel === d.date ? '' : d.date)} />)}</div>
      <p className="tiny muted">Sem inscrição, por ordem de chegada. Itens marcados com “só 07/11” acontecem apenas no sábado, na Escola Joaquim Nabuco.</p>
    </div>
  );
}
export function SessRow({ x, showDate }) {
  const { favs, openSheet } = useApp(); const { st } = useDomain();
  const s = st(x); const c = shiftColor(x.shift); const pl = T.courseRoomPlace(x);
  return (
    <button className={`sess ${s}`} style={{ '--c': c }} onClick={() => openSheet('curso', x.course.id)} aria-label={T.title(x.course)}>
      <span className="sess-time"><b>{T.fmtTime(x.time)}</b><small>{showDate ? T.fmtDate(x.date, 'wd') : `até ${T.fmtTime(T.sessionEnd(x))}`}</small></span>
      <span className="sess-body"><small className="room">{I('door')}{roomLabel(x)}{x.label ? ` · ${x.label}` : ''}{pl ? <em className={`room-tag ${pl.kind}`}>{I('map')}{M.placeLabel(pl)}</em> : null}</small><b>{T.title(x.course, true)}</b><small>Para: {x.course.audience}</small></span>
      <span className="sess-right"><StateBadge s={s} c={c} />{favs.has(x.course.id) ? <span className="cc-fav">{I('bookmark')}</span> : null}{I('right')}</span>
    </button>
  );
}
export function CourseCard({ c }) {
  const { clock, favs, openSheet } = useApp(); const { st, nextOf } = useDomain();
  const s = T.courseState(c, clock); const nx = nextOf(c); const col = shiftColor(nx.shift);
  const venues = [...new Set(c.sessions.map((x) => D.venues[x.venue].short))].join(' · ');
  return (
    <button className="card course-card" style={{ '--c': col }} onClick={() => openSheet('curso', c.id)}>
      <div className="cc-top"><span className="cc-tags">{c.tags.map((t) => <span key={t} className="tagc">{D.tags[t]}</span>)}{s === 'now' ? <span className="badge now" style={{ '--c': col }}>agora</span> : s === 'today' ? <span className="badge today">hoje</span> : s === 'past' ? <span className="badge past">encerrado</span> : null}</span>{favs.has(c.id) ? <span className="cc-fav" title="Nos meus cursos">{I('bookmark')}</span> : null}</div>
      <h3>{c.title}</h3>
      <p className="cc-aud"><b>Para:</b> {c.audience}</p>
      <div className="cc-meta"><span>{I('hourglass')}{c.hours}h</span><span>{I('users')}{c.seats} vagas</span><span>{I('pin')}{venues}</span></div>
      <div className="cc-dates">{T.allSessions().filter((x) => x.course === c).map((x, k) => <span key={k} className={`datec ${st(x)}`} style={{ '--c': shiftColor(x.shift) }}><i></i>{T.fmtDate(x.date, 'wd')} · {T.fmtTime(x.time)}{x.room ? ` · ${x.room}` : ''}</span>)}</div>
    </button>
  );
}
export function SvcCard({ s, hits, note }) {
  const { openSheet } = useApp();
  return (
    <button className="card svc-card" style={{ '--c': s.color }} onClick={() => openSheet('servico', s.id)}>
      <span className="svc-ico">{I(s.icon)}</span>
      <span><b>{s.num ? <em>{s.num}.</em> : null}{s.title}</b><small>{s.summary}</small>{note}{hits && hits.length ? <ul className="hits">{hits.map((h, k) => <li key={k}>{I('check')}<span>{T.itemText(h)}</span><OnlyLabel it={h} /></li>)}</ul> : null}</span>
      <span className="chev">{I('right')}</span>
    </button>
  );
}
/** Nota "N itens só em 07/11" usada nas listas de serviços filtradas por dia. */
export function OnlyNote({ s, date }) {
  const n = T.itemsOn(s, date).length; const hidden = s.items.length - n;
  return hidden ? <small className="only-note">{I('info')}{hidden} {hidden > 1 ? 'itens' : 'item'} só em 07/11 na Joaquim Nabuco</small> : null;
}
export function VenueCard({ v }) {
  const { openSheet } = useApp();
  const n = sessionsOf((x) => x.venue === v.id).length; const days = [...new Set(sessionsOf((x) => x.venue === v.id).map((x) => x.date))];
  return (
    <button className="card svc-card venue-card" style={{ '--c': '#60a5fa' }} onClick={() => openSheet('local', v.id)}>
      <span className="svc-ico">{I('building')}</span>
      <span><b>{v.name}</b><small>{v.city} · {n} aula{n === 1 ? '' : 's'} em {days.length} dia{days.length === 1 ? '' : 's'}</small>{v.rooms.length ? <span className="rooms">{v.rooms.map((r) => <span key={r}>{r}</span>)}</span> : null}</span>
      <span className="chev">{I('right')}</span>
    </button>
  );
}
export function Chip({ label, on, onClick, color, className, children }) {
  return <button className={`chip ${on ? 'on' : ''} ${color ? 'c' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} style={color ? { '--c': color } : undefined}>{color ? <i></i> : null}{children ?? label}</button>;
}
export function Empty({ icon, children }) { return <div className="empty">{I(icon)}<p>{children}</p></div>; }
export function RoomTags({ it, venue }) {
  return T.itemWhere(it, venue).map((id) => { const p = T.placeInfo(id); return p ? <span key={id} className={`room-tag ${p.kind}`}>{I(p.kind === 'tenda' ? 'tent' : 'door')}{M.placeLabel(p)}</span> : null; });
}
export function PlaceChip({ id, on, s }) {
  const { nav } = useApp(); const p = T.placeInfo(id); if (!p) return null;
  return (
    <button className={`place-chip ${p.kind} ${on ? 'on' : ''}`} onClick={() => nav(`mapa?local=${p.venue}&p=${p.id}${s ? `&s=${s}` : ''}`)}>
      <b>{p.num || '•'}</b><span>{p.kind === 'area' && !p.num ? p.name : `${M.placeLabel(p)} · ${p.name}`}</span><em className="go-map">{I('map')}mapa</em>
    </button>
  );
}
/** Campo de busca: digitação local com debounce; o valor vem da rota quando o campo não está em foco. */
export function SearchBox({ q, id = 'q', big, placeholder, autoFocus, debounce = 0, onInput, onClear }) {
  const { kiosk, showOsk } = useApp() || {};
  const [val, setVal] = useState(q || ''); const ref = useRef(null); const timer = useRef(null);
  useEffect(() => { if (document.activeElement !== ref.current) setVal(q || ''); }, [q]);
  useEffect(() => { if (autoFocus && ref.current) { const el = ref.current; el.focus({ preventScroll: true }); try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* */ } } }, [autoFocus]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className={`search ${big ? 'big' : ''}`}>{I('search')}<label className="sr-only" htmlFor={id}>Buscar</label>
      <input ref={ref} id={id} type="search" value={val} placeholder={placeholder || 'Buscar curso, serviço, sala…'} autoComplete="off" enterKeyHint="search" data-search inputMode={kiosk ? 'none' : undefined}
        onFocus={kiosk ? (e) => showOsk(e.currentTarget) : undefined} onPointerDown={kiosk ? (e) => showOsk(e.currentTarget) : undefined}
        onChange={(e) => { const v = e.target.value; setVal(v); clearTimeout(timer.current); if (debounce) timer.current = setTimeout(() => onInput(v.trim()), debounce); else onInput(v.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      {q ? <button className="icon-btn" onClick={() => { setVal(''); onClear(); }} aria-label="Limpar busca">{I('x')}</button> : null}
    </div>
  );
}
export function ServicesStrip() {
  const { nav, openSheet } = useApp();
  return (
    <section className="sec"><div className="sec-head"><span className="sec-ico">{I('handshake')}</span><h2>Serviços gratuitos <small>sem inscrição</small></h2><button className="link" onClick={() => nav('servicos')}>Todos {I('right')}</button></div>
      <div className="svc-days compact">{T.serviceDays().map((d) => <SvcDayCard key={d.date} d={d} onClick={() => nav(`servicos?dia=${d.date}`)} />)}</div>
      <div className="hscroll">{D.services.map((s) => <button key={s.id} className="pillar-mini" style={{ '--c': s.color }} onClick={() => openSheet('servico', s.id)}><i>{I(s.icon)}</i><b>{s.short || s.title}</b><small>{s.summary}</small></button>)}</div>
    </section>
  );
}
export function Footer() {
  const { kiosk } = useApp();
  return <footer className="foot">{D.event.organizer}<br />{D.event.edition} · {D.event.place} · {D.event.datesLabel}{kiosk ? null : <><br /><a href="tv.html">Modo TV</a></>}</footer>;
}
