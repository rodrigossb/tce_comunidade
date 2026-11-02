'use client';
/* Totem (quiosque vertical por toque). Porta React do js/totem.js do site antigo: mesmas telas, classes e
   rotas por hash (#inicio, #programacao, #cursos, #servicos, #mapa, #busca, #locais; painéis #curso/ID,
   #servico/ID, #local/ID). Sem memória entre pessoas; volta ao início e à tela de descanso sozinho. */
import { useEffect, useRef, useState, useCallback } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import Icon from '@/components/Icon';
import Qr from '@/components/Qr';
import PlanMap from '@/components/PlanMap';

const D = T.D;
const VIEWS = { inicio: ['Início', 'home'], programacao: ['Programação', 'calendar'], cursos: ['Cursos', 'graduation'], servicos: ['Serviços', 'handshake'], mapa: ['Mapa', 'map'] };
const HIDDEN_VIEWS = { locais: ['Locais', 'pin'] }; // continua acessível por link, fora da barra
const PANELS = { curso: 'cursos', servico: 'servicos', local: 'locais' };
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const col = (k) => T.SHIFTS[k].color;
const hashOf = (view, p) => { const q = p && [...p.keys()].length ? `?${p.toString()}` : ''; return `#${view}${q}`; };

/** Configuração lida da URL uma vez (só no cliente). */
function readConfig() {
  const P = T.params;
  const LOCAL = D.venues[P.get('local')] ? P.get('local') : 'jn';
  return {
    LOCAL, VENUE: D.venues[LOCAL],
    IDLE_MS: Math.max(20, Number(P.get('ocioso')) || 90) * 1000,
    ATTRACT: P.get('descanso') !== '0',
    ENTRANCE: P.get('entrada') || 'a1',
  };
}

/** Campo de busca controlado; o valor da URL (q) entra quando muda por chip/limpar. */
function SearchField({ q, placeholder, live, autoFocus, onInput }) {
  const [v, setV] = useState(q || '');
  useEffect(() => { setV((cur) => (cur.trim() === (q || '') ? cur : (q || ''))); }, [q]);
  return <div className={`tt-search ${live ? 'on' : ''}`}><Icon name="search" /><input id="q" type="search" value={v} placeholder={placeholder || 'Toque para buscar curso, serviço ou sala'} autoComplete="off" inputMode="none" data-search autoFocus={autoFocus} onChange={(e) => { setV(e.target.value); onInput(e.target.value); }} />{q ? <button className="clr" data-clear aria-label="Limpar"><Icon name="x" /></button> : null}</div>;
}

export default function Totem() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { setCfg(readConfig()); }, []);
  if (!cfg) return <div id="totem" className="tt"><div className="tt-loading">Carregando…</div></div>;
  return <TotemApp cfg={cfg} />;
}

function TotemApp({ cfg }) {
  const { LOCAL, VENUE, IDLE_MS, ATTRACT, ENTRANCE } = cfg;
  const [clock, setClock] = useState(() => T.now());
  const clockRef = useRef(clock); clockRef.current = clock;
  const routeRef = useRef({ view: 'inicio', p: new URLSearchParams(), panel: null, id: null });
  const lastBaseRef = useRef('inicio');
  const [route, setRouteState] = useState(routeRef.current);
  const [openShifts, setOpenShifts] = useState(() => new Set());
  const [closing, setClosing] = useState(false);
  const [osk, setOsk] = useState(false); // teclado na tela
  const [attract, setAttract] = useState(false); // tela de descanso
  const [attractHiding, setAttractHiding] = useState(false);
  const [heroIdx, setHeroIdx] = useState(-1);
  const attractRef = useRef(false); attractRef.current = attract;
  const inputRef = useRef(null); // input de busca com foco (alvo do teclado)
  const rootRef = useRef(null); const mainRef = useRef(null);
  const idleTimer = useRef(null);

  // ---------- rotas ----------
  const parse = useCallback(() => {
    const h = decodeURIComponent(location.hash.slice(1) || 'inicio');
    const [path, qs] = h.split('?'); const [view, id] = path.split('/'); const p = new URLSearchParams(qs || '');
    if (PANELS[view]) return { view: lastBaseRef.current, p: qs ? p : routeRef.current.p, panel: view, id };
    return { view: (VIEWS[view] || HIDDEN_VIEWS[view]) ? view : (view === 'busca' ? 'busca' : 'inicio'), p, panel: null, id: null };
  }, []);
  const onRoute = useCallback(() => {
    const prev = routeRef.current; const r = parse();
    if (!r.panel) lastBaseRef.current = r.view;
    routeRef.current = r; setRouteState(r); setClosing(false);
    const viewChanged = prev.view !== r.view;
    requestAnimationFrame(() => {
      const main = mainRef.current; if (!main) return;
      if (viewChanged && !r.panel) main.scrollTop = 0;
      // Ao traçar um caminho no início, leva o mapa para a vista.
      if (r.view === 'inicio' && r.p.get('p') && prev.p.get('p') !== r.p.get('p')) { const h = main.querySelector('.tt-maphero'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }, [parse]);
  const go = useCallback((hash, replace) => { if (replace) { history.replaceState(null, '', hash); onRoute(); } else location.hash = hash; }, [onRoute]);
  const setParam = useCallback((k, v) => { const r = routeRef.current; const p = new URLSearchParams(r.p); if (v == null || v === '') p.delete(k); else p.set(k, v); go(hashOf(r.view, p), true); }, [go]);
  const closePanel = useCallback(() => { setClosing(true); setTimeout(() => { const r = routeRef.current; go(hashOf(r.view, r.p), true); }, 180); }, [go]);
  useEffect(() => { onRoute(); window.addEventListener('hashchange', onRoute); return () => window.removeEventListener('hashchange', onRoute); }, [onRoute]);

  // ---------- teclado na tela ----------
  const hideKeyboard = useCallback(() => { setOsk(false); inputRef.current = null; }, []);
  const showKeyboard = useCallback((inp) => { inputRef.current = inp; setOsk(true); }, []);
  const reset = useCallback(() => {
    setOpenShifts(new Set()); hideKeyboard();
    if (location.hash && location.hash !== '#inicio') go('#inicio', true); else if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [go, hideKeyboard]);

  // ---------- tela de descanso e ociosidade ----------
  const showAttract = useCallback(() => { if (attractRef.current) return; reset(); if (!ATTRACT) return; setAttractHiding(false); setAttract(true); }, [reset, ATTRACT]);
  const hideAttract = useCallback(() => { if (!attractRef.current) return; attractRef.current = false; setAttractHiding(true); setTimeout(() => { setAttract(false); setAttractHiding(false); }, 250); reset(); }, [reset]);
  const touch = useCallback(() => { clearTimeout(idleTimer.current); idleTimer.current = setTimeout(showAttract, IDLE_MS); }, [showAttract, IDLE_MS]);
  useEffect(() => {
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true });
    touch(); if (ATTRACT) showAttract();
    return () => { clearTimeout(idleTimer.current); for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.removeEventListener(ev, touch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- relógio, recarga diária, teclas, bloqueios ----------
  useEffect(() => {
    const t1 = setInterval(() => { const c = T.now(); if (c.time !== clockRef.current.time) setClock(c); }, 1000);
    const t2 = setInterval(() => { const h = new Date().getHours(); if (h === 4 && new Date().getMinutes() < 2) location.reload(); }, 60000);
    const onKey = (e) => { if (e.key.toLowerCase() === 'f' && !e.target.closest('input')) { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); } };
    const onLink = (e) => { const a = e.target.closest('a[href]'); if (a) e.preventDefault(); };
    const onCtx = (e) => e.preventDefault();
    const onDown = (e) => { if (!e.target.closest('.osk') && !e.target.closest('.tt-search')) hideKeyboard(); };
    document.addEventListener('keydown', onKey); document.addEventListener('click', onLink, true); window.addEventListener('contextmenu', onCtx); document.addEventListener('pointerdown', onDown);
    return () => { clearInterval(t1); clearInterval(t2); document.removeEventListener('keydown', onKey); document.removeEventListener('click', onLink, true); window.removeEventListener('contextmenu', onCtx); document.removeEventListener('pointerdown', onDown); };
  }, [hideKeyboard]);

  // ---------- domínio ----------
  const st = (x) => T.sessionState(x, clock);
  const focusDate = () => (clock.date < D.event.start ? D.event.start : clock.date > D.event.end ? D.event.end : clock.date);
  const sessionsOf = (f) => T.allSessions().filter(f);
  const nextOf = (c) => T.nextSession(c, clock) || T.allSessions().find((x) => x.course === c);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  const shiftState = (k, date) => { if (date < clock.date) return 'past'; if (date > clock.date) return 'later'; const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later'; };
  const dayWord = (d) => (d === clock.date ? 'hoje' : T.relDay(d, clock.date) === 'amanhã' ? 'amanhã' : T.fmtDate(d, 'wdlong'));
  const roomLabel = (x) => (x.room ? `${x.room} · ${D.venues[x.venue].short}` : D.venues[x.venue].name);
  const byNext = (a, b) => { const sa = T.courseState(a, clock) === 'past'; const sb = T.courseState(b, clock) === 'past'; if (sa !== sb) return sa ? 1 : -1; const na = nextOf(a); const nb = nextOf(b); return na.date.localeCompare(nb.date) || T.toMin(na.time) - T.toMin(nb.time) || T.title(a, true).localeCompare(T.title(b, true)); };
  const defaultMapVenue = () => (M.mapOf(LOCAL) ? LOCAL : (T.nextServiceDay(clock.date) || T.serviceDays()[0]).venue);
  const courseRoomPlace = T.courseRoomPlace;
  const courseAlias = (x) => `${x.room} · ${T.title(x.course, true)}`;
  const canSpeak = typeof window !== 'undefined' && !!window.speechSynthesis;

  // ---------- eventos delegados (mesmos data-* do site antigo) ----------
  const onClick = (e) => {
    const el = (s) => e.target.closest(s); let b;
    if (el('.attract')) { e.preventDefault(); hideAttract(); return; }
    if ((b = el('[data-close]'))) { closePanel(); return; }
    if ((b = el('[data-panel]'))) { location.hash = `#${b.dataset.panel}/${b.dataset.id}`; return; }
    if ((b = el('[data-go]'))) { const [v, qs] = b.dataset.go.split('?'); go(`#${v}${qs ? `?${qs}` : ''}`, !!routeRef.current.panel); return; }
    if ((b = el('[data-scroll]'))) { const t = document.getElementById(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if ((b = el('[data-toggle-shift]'))) { const k = b.dataset.toggleShift; setOpenShifts((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }); return; }
    if ((b = el('[data-clear]'))) { setParam('q', ''); return; }
    if ((b = el('[data-speak]'))) { const p = routeRef.current.p; const venue = b.dataset.speakVenue || (M.mapOf(p.get('local')) ? p.get('local') : defaultMapVenue()); M.speak(M.route(venue, b.dataset.speak, ENTRANCE)); return; }
    if ((b = el('[data-param]'))) { setParam(b.dataset.param, b.dataset.value); return; }
  };
  const searchTimer = useRef(null);
  const onSearchInput = (value) => { clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setParam('q', value.trim()), 150); };
  const onFocusIn = (e) => { const inp = e.target.closest('[data-search]'); if (inp) showKeyboard(inp); };
  const onKey = (k) => {
    const input = inputRef.current; if (!input) return;
    if (k === 'done') { hideKeyboard(); input.blur(); return; }
    const v = k === 'clear' ? '' : k === '⌫' ? input.value.slice(0, -1) : input.value + k;
    // Atualiza o input controlado pelo React (setter nativo + evento input).
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  useEffect(() => { if (route.panel) hideKeyboard(); }, [route.panel, hideKeyboard]);
  useEffect(() => { if (route.view === 'inicio' && route.p.get('p')) { if (inputRef.current) inputRef.current.blur(); hideKeyboard(); } }, [route, hideKeyboard]);

  // ---------- componentes ----------
  const badge = (s, c) => (s === 'now' ? <span className="badge now" style={{ '--c': c }}>agora</span> : s === 'today' ? <span className="badge today">hoje</span> : s === 'past' ? <span className="badge">encerrada</span> : null);
  const onlyLabel = (it) => { const o = T.itemOnly(it); if (!o) return null; const d = T.serviceDayOf(o); return <em className="only"><Icon name="calendar" />só {T.fmtDate(o, 'wdm')} · {d ? d.place : ''}</em>; };
  const svcDayCard = (d, opts) => { const o = opts || {}; const today = d.date === clock.date; const attrs = o.attrs || { 'data-go': `servicos?dia=${d.date}` };
    return <button key={d.date} className={`tt-svcday ${today ? 'today' : ''} ${o.on ? 'on' : ''}`} {...attrs}><span className="sd-date"><small>{today ? 'hoje' : T.fmtDate(d.date, 'wd').split(' ')[0]}</small><b>{d.date.slice(8)}/{d.date.slice(5, 7)}</b></span><span className="sd-body"><b>{d.place}</b><small>{o.sub || 'Todos os serviços gratuitos · sem inscrição'}</small></span><Icon name="right" /></button>; };
  const roomTag = (x) => { const pl = courseRoomPlace(x); return pl ? <em className={`room-tag ${pl.kind}`}><Icon name="map" />{M.placeLabel(pl)} na planta</em> : null; };
  const row = (x, o) => { o = o || {}; const s = st(x); const c = col(x.shift);
    return <button key={`${x.course.id}-${x.date}-${x.time}-${x.room}`} className={`tt-row ${s}`} style={{ '--c': c }} data-panel="curso" data-id={x.course.id}><span className="tt-time"><b>{T.fmtTime(x.time)}</b><small>{o.date ? T.fmtDate(x.date, 'wd') : `até ${T.fmtTime(T.sessionEnd(x))}`}</small></span><span className="tt-body"><span className="room"><Icon name="door" />{roomLabel(x)}{x.label ? ` · ${x.label}` : ''}{roomTag(x)}</span><b>{T.title(x.course, true)}</b><small>Para: {x.course.audience}</small></span><span className="tt-right">{badge(s, c)}<Icon name="right" /></span></button>; };
  const courseRow = (c) => { const s = T.courseState(c, clock); const nx = nextOf(c); const cc = col(nx.shift);
    return <button key={c.id} className={`tt-row two ${s === 'now' ? 'now' : s === 'past' ? 'past' : ''}`} style={{ '--c': cc }} data-panel="curso" data-id={c.id}><span className="tt-body"><span className="room"><Icon name="tag" />{c.tags.map((t) => D.tags[t]).join(' · ')}</span><b>{c.title}</b><small>Para: {c.audience}</small><span className="tt-dates">{T.allSessions().filter((x) => x.course === c).map((x, i) => <span key={i} className={`tt-date ${st(x)}`} style={{ '--c': col(x.shift) }}><i></i>{T.fmtDate(x.date, 'wd')} · {T.fmtTime(x.time)}{x.room ? ` · ${x.room}` : ''}</span>)}</span></span><span className="tt-right">{badge(s, cc)}<Icon name="right" /></span></button>; };
  const svcCard = (s, hits, note) => <button key={s.id} className="tt-svc" style={{ '--c': s.color }} data-panel="servico" data-id={s.id}><i><Icon name={s.icon} /></i><span><b>{s.num ? <em>{s.num}.</em> : null}{s.title}</b><small>{s.summary}</small>{note}{hits && hits.length ? <ul className="hits">{hits.map((h, i) => <li key={i}><Icon name="check" /><span>{T.itemText(h)}</span>{onlyLabel(h)}</li>)}</ul> : null}</span><Icon name="right" /></button>;
  const hiddenNote = (s, d) => { const hidden = s.items.length - T.itemsOn(s, d).length; return hidden ? <small className="only-note"><Icon name="info" />{hidden} {hidden > 1 ? 'itens' : 'item'} só em 07/11 na Joaquim Nabuco</small> : null; };
  const venueCard = (v) => { const list = sessionsOf((x) => x.venue === v.id); const days = new Set(list.map((x) => x.date));
    return <button key={v.id} className="tt-svc" style={{ '--c': '#60a5fa' }} data-panel="local" data-id={v.id}><i><Icon name="building" /></i><span><b>{v.name}</b><small>{v.city} · {list.length} aula{list.length === 1 ? '' : 's'} em {days.size} dia{days.size === 1 ? '' : 's'}</small>{v.rooms.length ? <span className="tt-rooms">{v.rooms.map((r) => <span key={r}>{r}</span>)}</span> : null}</span><Icon name="right" /></button>; };
  const chip = (label, on, attrs, c, key) => <button key={key} className={`tt-chip ${on ? 'on' : ''} ${c ? 'c' : ''}`} style={c ? { '--c': c } : undefined} {...attrs}>{c ? <i></i> : null}{label}</button>;
  const empty = (icon, text, style) => <div className="tt-empty" style={style}><Icon name={icon} /><p>{text}</p></div>;
  const placeChipEl = (id, opts) => { const o = opts || {}; const p = T.placeInfo(id); if (!p) return null; return <button key={id} className={`place-chip ${p.kind} ${o.on ? 'on' : ''}`} data-go={`mapa?local=${p.venue}&p=${p.id}${o.s ? `&s=${o.s}` : ''}`}><b>{p.num || '•'}</b><span>{p.kind === 'area' && !p.num ? p.name : `${M.placeLabel(p)} · ${p.name}`}</span><em className="go-map"><Icon name="map" />mapa</em></button>; };
  const roomTags = (it, venue) => T.itemWhere(it, venue).map((id) => { const p = T.placeInfo(id); return p ? <span key={id} className={`room-tag ${p.kind}`}><Icon name={p.kind === 'tenda' ? 'tent' : 'door'} />{M.placeLabel(p)}</span> : null; });
  const secHead = (icon, title, extra, c) => <div className="tt-sec-head"><span className={`tt-sec-ico ${c ? 'c' : ''}`} style={c ? { '--c': c } : undefined}><Icon name={icon} /></span><h2>{title}</h2>{extra || null}</div>;
  const legendKeys = <><span><i style={{ background: '#e11d48' }}></i>Você está aqui</span><span><i style={{ background: '#0b1b3d' }}></i>Sala</span><span><i style={{ background: '#7e22ce' }}></i>Tenda</span><span><i style={{ background: '#0f766e' }}></i>Área</span><span><i style={{ background: '#fbbf24' }}></i>Destino</span></>;

  // ---------- telas ----------
  function ViewInicio() {
    const days = T.eventDays(); const idx = days.indexOf(clock.date); const diff = Math.round((Date.parse(D.event.start) - Date.parse(clock.date)) / 864e5);
    const tsd = T.serviceDayOf(clock.date);
    const status = idx >= 0 ? <><b>{cap(T.fmtDate(clock.date, 'wdlong'))}</b> · {idx + 1}º dia do evento{tsd ? <> · <b>dia de serviços gratuitos no {tsd.place}</b></> : null}</> : diff > 0 ? <>O evento <b>começa {diff === 1 ? 'amanhã' : `em ${diff} dias`}</b> · {D.event.datesLabel}</> : 'Evento encerrado · obrigado, Oiapoque!';
    const svcBanner = tsd && tsd.venue === LOCAL
      ? <button className="tt-banner" data-go={`servicos?dia=${tsd.date}`}><i><Icon name="handshake" /></i><span><small>Hoje, aqui</small><b>Serviços gratuitos · {tsd.place}</b><small>Saúde, documentos, justiça, feiras e muito mais. Sem inscrição, por ordem de chegada.</small></span><Icon name="right" /></button>
      : <button className="tt-banner soft" data-go="servicos"><i><Icon name="handshake" /></i><span><small>Serviços gratuitos · sem inscrição</small><b>{T.serviceDaysLabel()}</b></span><Icon name="right" /></button>;
    const date = focusDate(); const here = sessionsOf((x) => x.date === date && x.venue === LOCAL);
    const now = here.filter((x) => st(x) === 'now'); const up = here.filter((x) => st(x) === 'today');
    const list = now.length ? now : up.length ? up.filter((x) => x.shift === up[0].shift) : here.filter((x) => x.shift === (here[0] || {}).shift);
    const title = now.length ? 'Acontecendo agora' : up.length ? `A seguir · ${T.SHIFTS[up[0].shift].label} às ${T.fmtTime(T.SHIFTS[up[0].shift].start)}` : here.length ? `${cap(dayWord(date))} · ${T.SHIFTS[here[0].shift].label}` : '';
    const live = now.length ? <span className="live"><i></i>{now.length} agora</span> : null;
    const s1 = T.serviceById('pilar-1'); const s2 = T.serviceById('pilar-2');
    const mv = defaultMapVenue(); const mp = M.mapOf(mv);
    const q = route.p.get('q') || ''; const sid = route.p.get('s') || ''; const pid = route.p.get('p') || '';
    const svcSel = sid ? T.serviceById(sid) : null; const placeSel = pid ? T.placeInfo(pid) : null;
    const back = (extra) => `inicio${q ? `?q=${encodeURIComponent(q)}` : ''}${extra ? (q ? '&' : '?') + extra : ''}`;
    // Mapa vivo: estado escolhido (rota p / serviço s) > rodízio de serviços a cada 4 s.
    const rot = !pid && !svcSel && heroIdx >= 0 ? D.services[heroIdx % D.services.length] : null;
    const hlSvc = svcSel || rot;
    const heroCap = placeSel ? `Caminho até ${M.placeLabel(placeSel)} a partir de onde você está` : svcSel ? `${svcSel.short}: toque em uma sala para ver o caminho` : rot ? `${rot.short}: ${T.placesOf(rot, mv).slice(0, 4).map((id) => { const p = T.placeInfo(id); return p ? M.placeLabel(p) : ''; }).filter(Boolean).join(', ')}${T.placesOf(rot, mv).length > 4 ? '…' : ''}` : 'Toque em uma sala para ver o caminho a partir daqui';
    let heroBody = null;
    if (placeSel && mp) {
      const r = M.route(mv, pid, ENTRANCE); const hereSvcs = D.services.filter((s) => T.placesOf(s, mv).includes(pid));
      heroBody = <div className="tt-route"><div className="tt-route-head"><span className="tt-sec-ico" style={{ background: '#fbbf24', color: '#0b1b3d' }}><Icon name="flag" /></span><div><b>{M.placeLabel(placeSel)}{M.placeLabel(placeSel) !== placeSel.name ? ` · ${placeSel.name}` : ''}</b><small>{hereSvcs.length ? hereSvcs.map((s) => s.short).join(', ') + ' · ' : ''}siga a linha azul no mapa{r && r.steps && r.steps.length ? ` · ${r.steps[r.steps.length - 1].text}` : ''}</small></div></div>
        <div className="tt-actions"><button className="tt-btn primary" data-go={back(sid ? `s=${sid}` : '')}><Icon name="map" />Voltar ao mapa geral</button>{canSpeak ? <button className="tt-btn" data-speak={pid}><Icon name="megaphone" />Ouvir o caminho</button> : null}{hereSvcs[0] ? <button className="tt-btn" data-panel="servico" data-id={hereSvcs[0].id}><Icon name={hereSvcs[0].icon} />Ver {hereSvcs[0].short}</button> : null}</div></div>;
    }
    return <>
      <h1 className="tt-h1">Olá! <em>O que você procura?</em></h1>
      <p className="tt-status"><Icon name="sparkles" /><span>{status}</span></p>
      <SearchField q={q} placeholder="Digite: vacina, identidade, dentista, sala 11…" live={!!q} onInput={onSearchInput} />
      {q ? heroResults(q, mv) : <div className="tt-chips tt-sugg">{T.SUGGESTIONS.map((s) => chip(s, false, { 'data-param': 'q', 'data-value': s }, null, s))}</div>}
      {mp ? <section className={`tt-maphero ${placeSel ? 'routing' : ''}`}><div className="tt-maphero-head"><span className="tt-sec-ico"><Icon name="map" /></span><div><b>Mapa da escola · {mp.short}</b><small id="hero-cap">{heroCap}</small></div>{placeSel || svcSel ? <button className="tt-link" data-go={back()}><Icon name="x" />Ver tudo</button> : <button className="tt-link" data-go={`mapa?local=${mv}`}>Ampliar <Icon name="right" /></button>}</div>
        <div className={`tt-maphero-body ${placeSel ? 'has-route' : ''}`}><div className="tt-maphero-map">
          <PlanMap venue={mv} entrance={ENTRANCE} scale={1.5} place={pid || null} highlight={hlSvc ? T.placesOf(hlSvc, mv) : []} showAll={!hlSvc && !pid} onPick={(id) => go(`#${back(`p=${id}${hlSvc ? `&s=${hlSvc.id}` : ''}`)}`, true)} />
        </div>
          {heroBody}
          <ul className="tt-legend" id="hero-chips" aria-label="Serviços no mapa">{D.services.map((s) => { const n = T.placesOf(s, mv).length; return <li key={s.id}><button className={`${sid === s.id ? 'on' : ''} ${rot && rot.id === s.id ? 'live' : ''}`} data-hero={s.id} data-go={sid === s.id ? back() : back(`s=${s.id}`)} style={{ '--c': s.color }}><i><Icon name={s.icon} /></i><span><b>{s.short}</b><small>{n ? `${n} ${n === 1 ? 'local' : 'locais'}` : 'sem sala'}</small></span></button></li>; })}
            <li className="tt-legend-keys">{legendKeys}</li></ul></div></section> : null}
      {svcBanner}
      <div className="tt-tiles">
        <button className="tt-tile primary" style={{ '--c': D.event.shifts.manha.color }} data-go="programacao">{live}<i><Icon name="calendar" /></i><span><b>Programação de hoje</b><small>{here.length} curso{here.length === 1 ? '' : 's'} em {VENUE.short}</small></span></button>
        <button className="tt-tile" style={{ '--c': '#34d399' }} data-go="cursos"><i><Icon name="graduation" /></i><span><b>Cursos gratuitos</b><small>{D.courses.length} cursos com inscrição</small></span></button>
        <button className="tt-tile" style={{ '--c': s1.color }} data-panel="servico" data-id={s1.id}><i><Icon name={s1.icon} /></i><span><b>{s1.short}</b><small>{s1.summary}</small></span></button>
        <button className="tt-tile" style={{ '--c': s2.color }} data-panel="servico" data-id={s2.id}><i><Icon name={s2.icon} /></i><span><b>{s2.short}</b><small>{s2.summary}</small></span></button>
        <button className="tt-tile" style={{ '--c': D.event.shifts.manha.color }} data-go="servicos"><i><Icon name="handshake" /></i><span><b>Todos os serviços</b><small>{T.serviceDaysLabel('wd')}</small></span></button>
        <button className="tt-tile" style={{ '--c': '#c084fc' }} data-go="mapa"><i><Icon name="map" /></i><span><b>Mapa da escola</b><small>salas, tendas e o caminho até cada uma</small></span></button>
      </div>
      {list.length ? <section className="tt-sec">{secHead('clock', title, <button className="tt-link" data-go="programacao">Ver tudo <Icon name="right" /></button>)}<div className="tt-stack">{list.slice(0, 4).map((x) => row(x, { date: date !== clock.date }))}</div></section> : null}
    </>;
  }

  /** Resultados da busca no início: serviços (com salas clicáveis), salas pelo nome/número e cursos. */
  function heroResults(q, mv) {
    const R = T.search(q); const nq = T.norm(q); const mp = M.mapOf(mv);
    const back = (extra) => `inicio?q=${encodeURIComponent(q)}${extra ? '&' + extra : ''}`;
    const placeBtn = (id, sid) => { const p = T.placeInfo(id); return p ? <button key={id} className={`place-chip ${p.kind}`} data-go={back(`p=${id}${sid ? `&s=${sid}` : ''}`)}><b>{p.num || '•'}</b><span>{p.kind === 'area' && !p.num ? p.name : `${M.placeLabel(p)} · ${p.name}`}</span><Icon name="footprints" /></button> : null; };
    const places = mp ? mp.places.filter((p) => !p.hide && (T.norm(`${p.name} ${p.kind} ${p.num} sala ${p.num}`).includes(nq) || (nq.replace(/\D/g, '') && p.num === nq.replace(/\D/g, '').padStart(2, '0')))) : [];
    const svcs = R.services.length ? R.services.map((r) => { const ids = T.placesOf(r.s, mv); return <div key={r.s.id} className="tt-hit" style={{ '--c': r.s.color }}><div className="tt-hit-h"><i><Icon name={r.s.icon} /></i><div><b>{r.s.title}</b>{r.hits.length ? <small>{r.hits.map((h) => T.itemText(h)).join(' · ')}</small> : <small>{r.s.summary}</small>}</div><button className="tt-link" data-panel="servico" data-id={r.s.id}>Detalhes <Icon name="right" /></button></div>{ids.length ? <div className="place-chips">{ids.slice(0, 6).map((id) => placeBtn(id, r.s.id))}{ids.length > 6 ? <button className="tt-chip" data-go={back(`s=${r.s.id}`)}>+{ids.length - 6} no mapa</button> : null}</div> : <small className="muted">Sem sala definida neste local.</small>}</div>; }) : null;
    const rooms = places.length ? <div className="tt-hit" style={{ '--c': '#0b1b3d' }}><div className="tt-hit-h"><i><Icon name="door" /></i><div><b>Salas e tendas</b><small>toque para ver o caminho</small></div></div><div className="place-chips">{places.slice(0, 8).map((p) => placeBtn(p.id))}</div></div> : null;
    const courses = R.courses.length ? <div className="tt-hit" style={{ '--c': '#34d399' }}><div className="tt-hit-h"><i><Icon name="graduation" /></i><div><b>Cursos</b><small>{R.courses.length} encontrado{R.courses.length > 1 ? 's' : ''}</small></div><button className="tt-link" data-go={`cursos?q=${encodeURIComponent(q)}`}>Ver <Icon name="right" /></button></div><div className="tt-chips">{R.courses.slice(0, 4).map((c) => <button key={c.id} className="tt-chip" data-panel="curso" data-id={c.id}>{T.title(c, true)}</button>)}</div></div> : null;
    const numeric = /^\s*\d+\s*$/.test(q); // "11" = número da sala: salas primeiro, serviços só se não houver sala
    if (!svcs && !rooms && !courses) return <div className="tt-empty" style={{ padding: '1em' }}><Icon name="search" /><p>Nada encontrado para “{q}”. Tente “saúde”, “documento”, “dentista” ou o número da sala.</p></div>;
    return <div className="tt-results">{numeric ? <>{rooms}{rooms ? null : svcs}</> : <>{svcs}{rooms}</>}{courses}</div>;
  }

  function ViewProgramacao() {
    const days = T.eventDays(); const p = route.p; const d = days.includes(p.get('d')) ? p.get('d') : focusDate(); const all = p.get('todos') === '1';
    const list = sessionsOf((x) => x.date === d && (all || x.venue === LOCAL));
    let nowCard = null;
    if (d === clock.date) {
      const now = list.filter((x) => st(x) === 'now'); const up = list.filter((x) => st(x) === 'today');
      if (now.length) { const k = now[0].shift; nowCard = <button className="tt-now" style={{ '--c': col(k) }} data-scroll={`turno-${k}`}><i><Icon name="clock" /></i><span><b>Acontecendo agora · {T.SHIFTS[k].label} até {T.fmtTime(T.SHIFTS[k].end)}</b><small>{now.length} curso{now.length > 1 ? 's' : ''} em andamento</small></span><Icon name="down" /></button>; }
      else if (up.length) { const k = up[0].shift; const n = up.filter((x) => x.shift === k).length; nowCard = <button className="tt-now next" style={{ '--c': col(k) }} data-scroll={`turno-${k}`}><i><Icon name="next" /></i><span><b>A seguir · {T.SHIFTS[k].label} às {T.fmtTime(T.SHIFTS[k].start)}</b><small>{n} curso{n > 1 ? 's' : ''}</small></span><Icon name="down" /></button>; }
    }
    const sd = T.serviceDayOf(d);
    // Dia de serviços: os serviços são o destaque (sempre); os cursos vêm depois.
    const svcBlock = sd ? <><div className="tt-banner static"><i><Icon name="handshake" /></i><span><small>{d === clock.date ? 'Hoje' : cap(T.fmtDate(d, 'wdlong'))} é dia de</small><b>Serviços gratuitos · {sd.placeLong || sd.place}</b><small>Sem inscrição, por ordem de chegada. Toque em um bloco para ver tudo o que é oferecido.</small></span></div>
      <div className="tt-stack" style={{ marginBottom: '1.2em' }}>{D.services.map((s) => svcCard(s, null, hiddenNote(s, d)))}</div></> : null;
    const shifts = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
    const secs = shifts.map((k) => { const sh = T.SHIFTS[k]; const l = list.filter((x) => x.shift === k); const s = shiftState(k, d); const collapsed = s === 'past' && !openShifts.has(`${d}-${k}`);
      return <section key={k} className={`tt-shift ${s} ${collapsed ? 'collapsed' : ''}`} id={`turno-${k}`}><button data-toggle-shift={`${d}-${k}`}><span className="tt-sec-ico c" style={{ '--c': sh.color }}><Icon name={T.SHIFT_ICON[k]} /></span><h2>{sh.label} <small>{T.fmtTime(sh.start)} às {T.fmtTime(sh.end)}</small></h2>{s === 'now' ? <span className="badge now" style={{ '--c': sh.color }}>agora</span> : s === 'past' ? <span className="badge">encerrado</span> : null}<span className="muted tiny">{l.length} curso{l.length === 1 ? '' : 's'}</span>{collapsed ? <Icon name="down" /> : null}</button>{collapsed ? null : <div className="tt-stack">{l.map((x) => row(x))}</div>}</section>; });
    return <>
      <h1 className="tt-h1">Programação</h1>
      <div className="tt-days">{days.map((x) => { const n = sessionsOf((y) => y.date === x && (all || y.venue === LOCAL)).length; const xs = T.serviceDayOf(x); return <button key={x} className={`${x === d ? 'on' : ''} ${x === clock.date ? 'today' : ''} ${xs ? 'svc' : ''}`} data-param="d" data-value={x}><small>{x === clock.date ? 'hoje' : T.fmtDate(x, 'wd').split(' ')[0]}</small><b>{x.slice(8)}</b><em>{xs ? <><Icon name="handshake" />serviços</> : n ? `${n} curso${n > 1 ? 's' : ''}` : '—'}</em></button>; })}</div>
      <div className="tt-chips">{chip(<><Icon name="pin" />{VENUE.short}</>, !all, { 'data-param': 'todos', 'data-value': '' }, null, 'aqui')}{chip(<><Icon name="layers" />Todos os locais</>, all, { 'data-param': 'todos', 'data-value': '1' }, null, 'todos')}</div>
      <p className="tt-lead">{cap(T.fmtDate(d))}{d === clock.date ? ' · hoje' : ''} · {sd ? <><b>serviços gratuitos</b> em {sd.place}{list.length ? <> e <b>{list.length} curso{list.length === 1 ? '' : 's'}</b> {all ? 'em todos os locais' : `em ${VENUE.short}`}</> : null}</> : <><b>{list.length} curso{list.length === 1 ? '' : 's'}</b> {all ? 'em todos os locais' : `em ${VENUE.name}`}</>}</p>
      {svcBlock}
      {nowCard}
      {sd && shifts.length ? <div className="tt-sec-head"><span className="tt-sec-ico"><Icon name="graduation" /></span><h2>Cursos do dia <small>com inscrição</small></h2></div> : null}
      {shifts.length ? secs : (svcBlock ? null : empty('calendar', `Nenhum curso ${d === clock.date ? 'hoje' : 'neste dia'} ${all ? '' : `em ${VENUE.short}`}. Toque em outro dia ou em "Todos os locais".`))}
    </>;
  }

  function ViewCursos() {
    const p = route.p; const q = p.get('q') || ''; const tema = p.get('tema') || ''; const hoje = p.get('hoje') === '1';
    const R = T.search(q);
    const list = (R.terms.length ? R.courses : D.courses.slice()).filter((c) => (!tema || c.tags.includes(tema)) && (!hoje || c.sessions.some((x) => x.date === clock.date))).sort(byNext);
    return <>
      <h1 className="tt-h1">Cursos gratuitos</h1><p className="tt-lead">Com inscrição pelo celular (QR Code na página de cada curso). Toque no curso para ver dias, sala e público.</p>
      <SearchField q={q} placeholder="Buscar curso por nome, público ou tema" live={!!q} onInput={onSearchInput} />
      <div className="tt-chips">{chip(<><Icon name="clock" />Hoje</>, hoje, { 'data-param': 'hoje', 'data-value': hoje ? '' : '1' }, null, 'hoje')}{chip('Todos os temas', !tema, { 'data-param': 'tema', 'data-value': '' }, null, 'todos')}{Object.entries(D.tags).map(([k, v]) => chip(v, tema === k, { 'data-param': 'tema', 'data-value': k }, null, k))}</div>
      <p className="tt-lead"><b>{list.length}</b> de {D.courses.length} cursos</p>
      {list.length ? <div className="tt-stack">{list.map(courseRow)}</div> : empty('search', 'Nenhum curso encontrado. Tente outra palavra ou limpe os filtros.')}
    </>;
  }

  function ViewServicos() {
    const sel = T.serviceDayOf(route.p.get('dia')) ? route.p.get('dia') : '';
    return <>
      <h1 className="tt-h1">Serviços gratuitos</h1><p className="tt-lead">Atendimentos para toda a população, <b>sem inscrição</b>, por ordem de chegada, em dois dias:</p>
      <div className="tt-svcdays">{T.serviceDays().map((d) => svcDayCard(d, { on: sel === d.date, attrs: { 'data-param': 'dia', 'data-value': sel === d.date ? '' : d.date } }))}</div>
      <p className="tt-lead tiny">Itens marcados com “só 07/11” acontecem apenas no sábado, na Escola Joaquim Nabuco. Toque em um bloco para ver tudo o que é oferecido e quem atende.</p>
      <div className="tt-stack">{D.services.map((s) => svcCard(s, null, hiddenNote(s, sel)))}</div>
    </>;
  }
  function ViewLocais() {
    return <>
      <h1 className="tt-h1">Onde fica</h1><p className="tt-lead">Locais dos cursos em Oiapoque e no Distrito do Manga. Toque para ver a programação de cada um.</p>
      <div className="tt-stack">{Object.values(D.venues).map(venueCard)}</div>
    </>;
  }
  function ViewMapa() {
    const p = route.p; const venue = M.mapOf(p.get('local')) ? p.get('local') : defaultMapVenue(); const map = M.mapOf(venue);
    const placeId = p.get('p') && map.places.some((x) => x.id === p.get('p')) ? p.get('p') : ''; const sid = p.get('s') || '';
    const svc = sid ? T.serviceById(sid) : null; const day = T.serviceDays().find((d) => d.venue === venue);
    const hl = svc ? T.placesOf(svc, venue) : [];
    const place = placeId ? T.placeInfo(placeId) : null;
    const servicesHere = place ? D.services.filter((s) => T.placesOf(s, venue).includes(placeId)) : [];
    const others = Object.values(D.maps).filter((m) => m.venue !== venue);
    return <>
      <h1 className="tt-h1">Mapa <em>· {map.short}</em></h1>
      <p className="tt-lead">{day ? <>Serviços gratuitos em <b>{T.fmtDate(day.date, 'wdlong')}</b> · </> : null}toque em uma sala ou escolha um tipo de serviço: o caminho aparece desenhado no mapa.</p>
      <div className="tt-chips">{Object.values(D.maps).map((m) => chip(<><Icon name="map" />{m.short}</>, m.venue === venue, { 'data-go': `mapa?local=${m.venue}` }, null, m.venue))}</div>
      <div className="tt-chips">{chip('Todos', !sid && !placeId, { 'data-go': `mapa?local=${venue}` }, null, 'todos')}{D.services.map((s) => chip(<><Icon name={s.icon} />{s.short}</>, sid === s.id, { 'data-go': `mapa?local=${venue}${sid === s.id ? '' : `&s=${s.id}`}` }, s.color, s.id))}</div>
      <PlanMap venue={venue} entrance={ENTRANCE} scale={1.45} place={p.get('p') || null} highlight={hl} showAll={!svc && !p.get('p')} onPick={(id) => go(`#mapa?local=${venue}&p=${id}${sid ? `&s=${sid}` : ''}`, true)} />
      <div className="map-legend">{legendKeys}</div>
      {place ? <section className="tt-sec tt-dest"><div className="tt-sec-head"><span className="tt-sec-ico" style={{ background: '#fbbf24', color: '#0b1b3d' }}><Icon name="flag" /></span><h2>{M.placeLabel(place)} <small>{M.placeLabel(place) !== place.name ? `${place.name} · ` : ''}siga a linha azul</small></h2></div>
          {servicesHere.length ? <div className="tt-chips" style={{ margin: '.2em 0 .6em' }}>{servicesHere.map((s) => chip(<><Icon name={s.icon} />{s.short}</>, false, { 'data-panel': 'servico', 'data-id': s.id }, s.color, s.id))}</div> : null}
          <div className="tt-actions"><button className="tt-btn" data-go={`mapa?local=${venue}${sid ? `&s=${sid}` : ''}`}><Icon name="map" />Mapa geral</button>{canSpeak ? <button className="tt-btn" data-speak={placeId}><Icon name="megaphone" />Ouvir o caminho</button> : null}{svc ? <button className="tt-btn primary" data-panel="servico" data-id={svc.id}><Icon name={svc.icon} />Ver {svc.short}</button> : null}</div></section>
        : svc ? <section className="tt-sec"><div className="tt-sec-head"><span className="tt-sec-ico" style={{ '--c': svc.color }}><Icon name={svc.icon} /></span><h2>{svc.title} <small>{hl.length} local{hl.length === 1 ? '' : 'is'}</small></h2></div><p className="tt-lead">Toque em uma sala para ver o caminho.</p><div className="place-chips">{hl.map((id) => placeChipEl(id, { s: sid }))}</div></section>
        : <section className="tt-sec"><div className="tt-sec-head"><span className="tt-sec-ico"><Icon name="door" /></span><h2>Salas e tendas <small>{map.places.filter((x) => !x.hide).length}</small></h2></div><div className="place-chips">{map.places.filter((x) => !x.hide).map((x) => placeChipEl(x.id))}</div></section>}
      {others.length ? <p className="tt-lead tiny">Outro local: {others.map((m) => <button key={m.venue} className="tt-chip" data-go={`mapa?local=${m.venue}`} style={{ fontSize: '.8em' }}><Icon name="map" />{m.title}</button>)}</p> : null}
    </>;
  }
  function ViewBusca() {
    const q = route.p.get('q') || ''; const R = T.search(q);
    let body;
    if (!R.terms.length) body = <><section className="tt-sec">{secHead('sparkles', 'Sugestões')}<div className="tt-chips">{T.SUGGESTIONS.map((s) => chip(s, false, { 'data-param': 'q', 'data-value': s }, null, s))}</div></section>
      <section className="tt-sec">{secHead('tag', 'Cursos por tema')}<div className="tt-chips">{Object.entries(D.tags).map(([k, v]) => chip(v, false, { 'data-go': `cursos?tema=${k}` }, null, k))}</div></section></>;
    else if (!R.total) body = <>{empty('search', `Nada encontrado para “${q}”. Tente uma palavra mais simples, como “saúde”, “documento” ou “curso”.`)}<div className="tt-chips" style={{ justifyContent: 'center' }}>{T.SUGGESTIONS.slice(0, 6).map((s) => chip(s, false, { 'data-param': 'q', 'data-value': s }, null, s))}</div></>;
    else body = <><p className="tt-lead"><b>{R.total}</b> resultado{R.total > 1 ? 's' : ''} para “{q}”</p>
      {R.services.length ? <section className="tt-sec">{secHead('handshake', <>Serviços gratuitos <small>{R.services.length}</small></>)}<div className="tt-stack">{R.services.map((r) => svcCard(r.s, r.hits))}</div></section> : null}
      {R.courses.length ? <section className="tt-sec">{secHead('graduation', <>Cursos <small>{R.courses.length}</small></>)}<div className="tt-stack">{R.courses.slice().sort(byNext).map((c) => row(nextOf(c), { date: true }))}</div></section> : null}
      {R.venues.length ? <section className="tt-sec">{secHead('pin', <>Locais <small>{R.venues.length}</small></>)}<div className="tt-stack">{R.venues.map(venueCard)}</div></section> : null}</>;
    return <><h1 className="tt-h1">Buscar</h1><SearchField q={q} placeholder="Ex.: vacina, identidade, panificação…" live autoFocus onInput={onSearchInput} />{body}</>;
  }

  // ---------- painéis ----------
  function panelCurso(c) {
    const sessions = T.allSessions().filter((x) => x.course === c); const byDay = {}; sessions.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    const venues = [...new Set(sessions.map((x) => D.venues[x.venue].short))].join(' · '); const s = T.courseState(c, clock); const nx = nextOf(c);
    const nextLine = s === 'now' ? `Acontecendo agora · ${roomLabel(nx)} · até ${T.fmtTime(T.sessionEnd(nx))}` : s === 'past' ? 'Todas as aulas já aconteceram' : `${cap(dayWord(nx.date))} às ${T.fmtTime(nx.time)} · ${roomLabel(nx)}`;
    const seen = new Map(); for (const x of sessions) { const pl = courseRoomPlace(x); if (pl && !seen.has(pl.id)) seen.set(pl.id, { pl, x }); }
    let where = null;
    if (seen.size) {
      const sel = (route.p.get('sala') && seen.get(route.p.get('sala'))) || [...seen.values()].find(({ x }) => x === nx) || [...seen.values()][0];
      where = <>
        <h3><Icon name="map" />Onde fica · caminho até a sala</h3>
        {seen.size > 1 ? <div className="place-chips" style={{ marginBottom: '.6em' }}>{[...seen.values()].map(({ pl, x }) => <button key={pl.id} className={`place-chip ${pl.kind} ${pl.id === sel.pl.id ? 'on' : ''}`} data-go={`curso/${c.id}?sala=${pl.id}`}><b>{pl.num || '•'}</b><span>{x.room} = {M.placeLabel(pl)}</span></button>)}</div> : <p className="tt-lead tiny">{sel.x.room} da programação = <b>{M.placeLabel(sel.pl)}</b> na planta.</p>}
        <PlanMap venue={sel.pl.venue} entrance={ENTRANCE} scale={1.5} place={sel.pl.id} alias={courseAlias(sel.x)} onPick={(id) => go(`#inicio?p=${id}`)} />
        <div className="tt-actions">{canSpeak ? <button className="tt-btn" data-speak-venue={sel.pl.venue} data-speak={sel.pl.id}><Icon name="megaphone" />Ouvir o caminho</button> : null}<button className="tt-btn" data-go={`inicio?p=${sel.pl.id}`}><Icon name="map" />Abrir no mapa geral</button></div>
      </>;
    }
    return <>
      <div className="tt-panel-top"><button className="tt-back" data-close><Icon name="back" />Voltar</button><span className="tt-kicker"><Icon name="graduation" />Curso gratuito · Escola de Contas · TCE/AP</span></div>
      <div className="tt-panel-body"><h2>{c.title}</h2>
        <div className={`tt-next ${s}`} style={{ '--c': col(nx.shift) }}><Icon name={s === 'now' ? 'clock' : 'calendar'} /><span>{nextLine}</span></div>
        <div className="tt-tags">{c.tags.map((t) => <span key={t} className="tagc">{D.tags[t]}</span>)}</div>
        <div className="tt-meta"><div><small>Carga horária</small><b>{c.hours}h</b></div><div><small>Vagas</small><b>{c.seats}</b></div><div><small>Local</small><b>{venues}</b></div></div>
        <p><b>Para quem é:</b> {c.audience}</p>
        {c.note ? <p className="tt-note"><Icon name="info" /><span>{c.note}</span></p> : null}
        {where}
        <h3><Icon name="calendar" />Dias e horários ({sessions.length})</h3>
        {Object.keys(byDay).map((d) => <div key={d} className="tt-day"><small className={d === clock.date ? 'today' : ''}>{T.fmtDate(d)}{d === clock.date ? ' · hoje' : ''}</small>{byDay[d].map((x, i) => { const sx = st(x); const pl = courseRoomPlace(x); return <div key={i} className={`tt-sess ${sx}`} style={{ '--c': col(x.shift) }}><span className="tt-time"><b>{T.fmtTime(x.time)}</b><small>até {T.fmtTime(T.sessionEnd(x))}</small></span><span className="tt-body"><b>{x.room || D.venues[x.venue].short}{x.label ? ` · ${x.label}` : ''}{pl ? <em className={`room-tag ${pl.kind}`}><Icon name="map" />{M.placeLabel(pl)}</em> : null}</b><small>{D.venues[x.venue].name}</small></span><span className="tt-right">{badge(sx, col(x.shift))}</span></div>; })}</div>)}
        <div className="tt-qr"><Qr text={T.appUrl(`curso/${c.id}`)} margin={1} /><div><b><Icon name="phone" />Inscreva-se pelo celular</b><small>Aponte a câmera do celular para o QR Code. Abre esta página do curso com o botão de inscrição. <b>É gratuito.</b></small></div></div>
        <div className="tt-actions"><button className="tt-btn" data-go={`programacao?d=${nx.date}${nx.venue !== LOCAL ? '&todos=1' : ''}`}><Icon name="calendar" />Ver o dia</button><button className="tt-btn primary" data-close><Icon name="back" />Voltar</button></div>
      </div>
    </>;
  }
  function panelServico(s) {
    const ctx = (route.p.get('dia') && T.mapVenueOf(route.p.get('dia'))) || defaultMapVenue(); const ids = T.placesOf(s, ctx); const m = M.mapOf(ctx);
    const sel = route.p.get('dia');
    return <>
      <div className="tt-panel-top"><button className="tt-back" data-close><Icon name="back" />Voltar</button><span className="tt-kicker" style={{ color: `color-mix(in srgb,${s.color} 70%,var(--ink))` }}><Icon name={s.icon} />{s.num ? `Pilar ${s.num}` : 'Acolhida'} · Serviços gratuitos</span></div>
      <div className="tt-panel-body" style={{ '--c': s.color }}><h2>{s.title}</h2><p className="muted">{s.summary}</p>
        <div className="tt-svcdays" style={{ marginTop: '.8em' }}>{T.serviceDays().map((d) => svcDayCard(d, { attrs: { 'data-go': `programacao?d=${d.date}${d.venue !== LOCAL ? '&todos=1' : ''}` }, sub: T.itemsOn(s, d.date).length === s.items.length ? 'Todos os itens abaixo · sem inscrição' : `${T.itemsOn(s, d.date).length} de ${s.items.length} itens abaixo · sem inscrição` }))}</div>
        {ids.length ? <><h3><Icon name="map" />Onde fica · {m.short}</h3><button className="tt-btn map" data-go={`mapa?local=${ctx}&s=${s.id}`}><Icon name="map" /><span>Ver no mapa da escola<small>{ids.length} {ids.length === 1 ? 'local' : 'locais'} em destaque · toque em um e veja o caminho</small></span><Icon name="right" /></button><div className="place-chips">{ids.map((id) => placeChipEl(id, { s: s.id }))}</div></> : null}
        <h3><Icon name="check" />O que é oferecido</h3><ul className="tt-ul">{s.items.map((it, i) => { const o = T.itemOnly(it); const off = sel && o && o !== sel; return <li key={i} className={off ? 'off' : ''}><i></i><span>{T.itemText(it)}{roomTags(it, ctx)}{onlyLabel(it)}</span></li>; })}</ul>
        {s.detail ? <p className="tt-note"><Icon name="info" /><span>{s.detail}</span></p> : null}
        <h3><Icon name="users" />Quem atende</h3><div className="tt-partners">{s.partners.map((x) => <span key={x}>{x}</span>)}</div>
        {s.coursesLink ? <div className="tt-actions" style={{ marginTop: '1em' }}><button className="tt-btn primary" data-go="cursos"><Icon name="graduation" />Ver os {D.courses.length} cursos com inscrição</button></div> : null}
        <div className="tt-qr"><Qr text={T.appUrl(`servico/${s.id}`)} margin={1} /><div><b><Icon name="phone" />Leve no celular</b><small>Aponte a câmera para o QR Code e abra esta lista no seu celular.</small></div></div>
        <div className="tt-actions"><button className="tt-btn primary" data-close><Icon name="back" />Voltar</button></div>
      </div>
    </>;
  }
  function panelLocal(v) {
    const list = sessionsOf((x) => x.venue === v.id); const byDay = {}; list.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    const days = Object.keys(byDay);
    return <>
      <div className="tt-panel-top"><button className="tt-back" data-close><Icon name="back" />Voltar</button><span className="tt-kicker"><Icon name="pin" />Local · {v.city}</span></div>
      <div className="tt-panel-body"><h2>{v.name}</h2>{v.rooms.length ? <div className="tt-partners">{v.rooms.map((r) => <span key={r}>{r}</span>)}</div> : null}
        <h3><Icon name="calendar" />Cursos neste local ({list.length})</h3>
        {days.length ? days.map((d) => <div key={d} className="tt-day"><small className={d === clock.date ? 'today' : ''}>{T.fmtDate(d)}{d === clock.date ? ' · hoje' : ''}</small><div className="tt-stack">{byDay[d].map((x) => row(x))}</div></div>) : empty('calendar', 'Sem cursos cadastrados neste local.')}
        <div className="tt-actions"><button className="tt-btn primary" data-close><Icon name="back" />Voltar</button></div>
      </div>
    </>;
  }

  // ---------- mapa vivo do início: rodízio de serviços a cada 4 s ----------
  const heroActive = route.view === 'inicio' && !route.panel && !route.p.get('p') && !route.p.get('s') && !!M.mapOf(defaultMapVenue());
  useEffect(() => {
    if (!heroActive) return;
    const t = setInterval(() => setHeroIdx((i) => i + 1), 4000);
    return () => clearInterval(t);
  }, [heroActive]);

  // ---------- painel ----------
  let panel = null;
  if (route.panel === 'curso') { const c = T.courseById(route.id); if (c) panel = panelCurso(c); }
  if (route.panel === 'servico') { const s = T.serviceById(route.id); if (s) panel = panelServico(s); }
  if (route.panel === 'local') { const v = D.venues[route.id]; if (v) panel = panelLocal(v); }
  useEffect(() => { if (route.panel && !panel) closePanel(); }, [route.panel, panel, closePanel]);

  const tvUrl = () => { const P = T.params; const p = new URLSearchParams(); p.set('local', LOCAL); p.set('orientation', window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'); for (const k of ['t', 'd', 'theme', 'zoom']) if (P.get(k)) p.set(k, P.get(k)); if (P.get('app')) p.set('app', P.get('app')); return `tv.html?${p.toString()}`; };
  const View = { inicio: ViewInicio, programacao: ViewProgramacao, cursos: ViewCursos, servicos: ViewServicos, locais: ViewLocais, busca: ViewBusca, mapa: ViewMapa }[route.view] || ViewInicio;

  return (
    <div id="totem" ref={rootRef} className={`tt ${osk ? 'osk-open' : ''}`} onClick={onClick} onFocus={onFocusIn}>
      <header className="tt-head"><div className="tt-logo"><img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" /></div><div className="tt-title"><b>{D.event.name} · {D.event.edition}{T.isSimulated() ? <span className="tt-demo">demonstração</span> : null}</b><small><Icon name="pin" />{VENUE.name} · {D.event.datesLabel}</small></div><div className="tt-clock"><b id="clock-time">{clock.time}</b><small id="clock-date">{cap(T.fmtDate(clock.date, 'wdlong'))}</small></div></header>
      <nav className="tt-nav" id="nav">{Object.entries(VIEWS).map(([k, [label, icon]]) => <button key={k} className={route.view === k ? 'on' : ''} data-go={k}><Icon name={icon} />{label}</button>)}</nav>
      <main className="tt-main" id="main" ref={mainRef} key={route.view}>{View()}</main>
      <button className={`tt-fab ${route.view !== 'inicio' || route.panel ? 'show' : ''}`} id="fab" data-go="inicio" aria-label="Voltar ao mapa e à busca"><Icon name="map" /><span>Mapa e busca</span></button>
      <footer className="tt-foot"><div className="qr"><Qr text={T.appUrl(`programacao?local=${LOCAL}`)} margin={1} /></div><div><b><Icon name="phone" />Leve o app no celular</b><small>Aponte a câmera para o QR Code: programação completa, serviços e inscrições.</small></div><div className="org">{D.event.organizerShort}<br />{D.event.datesLabel}</div></footer>
      <div id="panel-holder">{panel ? <div className={`tt-panel ${closing ? 'closing' : ''}`} id="panel" role="dialog" aria-modal="true">{panel}</div> : null}</div>
      <div id="toast"></div>
      {osk ? (
        <div className="osk" role="group" aria-label="Teclado" onPointerDown={(e) => e.preventDefault()}>
          {ROWS.map((r, i) => <div key={i} className="osk-row">{[...r].map((k) => <button key={k} type="button" onClick={() => onKey(k)}>{k}</button>)}{i === ROWS.length - 1 ? <button type="button" className="wide" aria-label="Apagar" onClick={() => onKey('⌫')}><Icon name="back" /></button> : null}</div>)}
          <div className="osk-row"><button type="button" className="wide danger" onClick={() => onKey('clear')}>Limpar</button><button type="button" className="space" onClick={() => onKey(' ')}>espaço</button><button type="button" className="wide primary" onClick={() => onKey('done')}><Icon name="check" />Pronto</button></div>
        </div>
      ) : null}
      {attract ? (
        <div className={`attract ${attractHiding ? 'hiding' : ''}`}>
          <iframe src={tvUrl()} title="Programação do dia" tabIndex={-1} />
          <div className="attract-bar"><span className="attract-cta"><Icon name="phone" />Toque na tela para explorar</span></div>
          <button className="attract-tap" aria-label="Toque para começar"></button>
        </div>
      ) : null}
    </div>
  );
}
