'use client';
/* Modo TV: a programação do dia inteira em uma tela (sala → curso → para quem),
   dois destaques do momento e QR Code para o app. Sem rodízio de telas: quem olha vê tudo de uma vez.
   Porta de js/tv.js do site antigo: mesmas classes/DOM (css/tv.css) e o mesmo comportamento. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import Icon from '@/components/Icon';
import QrSvg from '@/components/tv/QrSvg';

const D = T.D;
const LS = 'tce_tv_prefs';
const ZOOM = [0.6, 1.6];
const HL_SECS = 14; // troca dos destaques
const HL_COUNT = 2; // destaques visíveis
const clamp = (z) => Math.min(ZOOM[1], Math.max(ZOOM[0], z));
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* sem storage */ } };
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
/** Sala como a pessoa a encontra na escola: número da porta na planta (DE → PARA validado em salas-cursos.js)
    + nome usado na programação/inscrição ("Sala IV"). Sem planta (SEBRAE, auditório): só o nome. */
const roomInfo = (x) => {
  const pl = T.courseRoomPlace(x); const v = D.venues[x.venue];
  if (pl && pl.num) { const kind = pl.kind === 'sala' ? 'Sala' : pl.kind === 'tenda' ? 'Tenda' : 'Ambiente'; return { num: pl.num, kind, name: x.room, label: `${kind} ${pl.num}` }; }
  return { num: '', kind: '', name: x.room || v.short, label: x.room || v.short };
};
/** Horário da aula só quando foge do padrão do turno (o cabeçalho da coluna já diz "8h às 12h"). */
const oddTime = (x) => { const sh = T.SHIFTS[x.shift]; return T.toMin(x.time) !== T.toMin(sh.start) || T.toMin(T.sessionEnd(x)) !== T.toMin(sh.end); };

export default function Tv() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) {
    return <div id="tv" className="tv tv-dark landscape"><div className="tv-msg"><div className="spinner" /><p>Carregando o painel…</p></div></div>;
  }
  return <TvLive />;
}

function TvLive() {
  const root = useRef(null);
  // Local da TV: ?local=jn|manga|sebrae|auditorio|todos (padrão: Escola Joaquim Nabuco).
  const { venueSel, venueName } = useMemo(() => {
    const localParam = T.params.get('local') || 'jn';
    const sel = localParam === 'todos' ? null : (D.venues[localParam] ? localParam : 'jn');
    return { venueSel: sel, venueName: sel ? D.venues[sel].name : D.event.place };
  }, []);

  // ---------- relógio ----------
  const [clock, setClock] = useState(() => T.now());
  useEffect(() => { const id = setInterval(() => setClock(T.now()), 1000); return () => clearInterval(id); }, []);

  // ---------- preferências (zoom, tema) e orientação ----------
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (fn) => setPrefsState((p) => { const n = Object.assign({}, p); fn(n); savePrefs(n); return n; });
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const zoom = clamp(Number(T.params.get('zoom')) || prefs.zoom || 1);
  const theme = T.params.get('theme') || prefs.theme || 'dark';
  const orientation = T.params.get('orientation') || (viewport.h > viewport.w ? 'portrait' : 'landscape');
  const light = theme === 'light';
  useEffect(() => {
    let rs; const on = () => { clearTimeout(rs); rs = setTimeout(() => setViewport({ w: window.innerWidth, h: window.innerHeight }), 200); };
    window.addEventListener('resize', on); return () => { window.removeEventListener('resize', on); clearTimeout(rs); };
  }, []);

  // ---------- consultas ----------
  const atVenue = (x) => !venueSel || x.venue === venueSel;
  const sessionsAt = (date) => T.allSessions().filter((x) => x.date === date && atVenue(x));
  const st = (x) => T.sessionState(x, clock);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  const shiftState = (k, date) => {
    if (date < clock.date) return 'past'; if (date > clock.date) return 'later';
    const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later';
  };
  /** Dia de serviços neste local (04/11 Manga, 07/11 Joaquim Nabuco)? */
  const svcDayAt = (date) => { const d = T.serviceDayOf(date); return d && (!venueSel || d.venue === venueSel) ? d : null; };
  const hasProgram = (date) => sessionsAt(date).length > 0 || !!svcDayAt(date);
  /** Dia mostrado no quadro: hoje; se hoje não tem (ou já acabou) neste local, o próximo dia com cursos. */
  function boardDate() {
    const days = T.eventDays();
    const base = clock.date < D.event.start ? D.event.start : clock.date;
    const todayList = sessionsAt(base);
    const over = base === clock.date && !svcDayAt(base) && todayList.length && todayList.every((x) => st(x) === 'past');
    if (hasProgram(base) && !over) return base;
    return days.find((d) => d > base && hasProgram(d)) || (hasProgram(base) ? base : days.filter((d) => hasProgram(d)).pop() || base);
  }
  const roomIdx = (x) => { const k = D.venues[x.venue].rooms.indexOf(x.room); return k < 0 ? 99 : k; };
  const vIdx = (x) => Object.keys(D.venues).indexOf(x.venue);
  const byRoom = (a, b) => T.toMin(a.time) - T.toMin(b.time) || vIdx(a) - vIdx(b) || roomIdx(a) - roomIdx(b) || String(a.room).localeCompare(String(b.room));
  const dayWord = (date) => (date === clock.date ? 'hoje' : T.relDay(date, clock.date) === 'amanhã' ? 'amanhã' : T.fmtDate(date, 'wdlong'));
  const whenOf = (date) => (date === clock.date ? 'Hoje' : T.relDay(date, clock.date) === 'amanhã' ? 'Amanhã' : cap(T.fmtDate(date, 'wdlong')));

  const date = boardDate();
  // O quadro só é remontado quando muda o dia, o minuto, a orientação, o zoom ou o tema (como no site antigo).
  const boardKey = `${date}|${clock.time}|${orientation}|${zoom}|${light}`;
  const lastTick = useRef(Date.now());
  useEffect(() => { lastTick.current = Date.now(); }, [boardKey]);

  // ---------- destaques ----------
  /** Candidatos, nesta ordem: em andamento agora, depois os próximos de hoje; em outro dia, todos os do dia. */
  const pool = useMemo(() => {
    const sd = svcDayAt(date);
    if (sd) return { label: `Serviços gratuitos · ${sd.place}`, items: D.services.map((s) => ({ service: s, date })) };
    const list = sessionsAt(date).sort(byRoom);
    const now = list.filter((x) => st(x) === 'now');
    const up = list.filter((x) => st(x) === 'today' || st(x) === 'future');
    const items = now.concat(up);
    const label = now.length ? 'Agora e a seguir' : `Destaques de ${dayWord(date)}`;
    return { label, items };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey]);
  const poolRef = useRef(pool); poolRef.current = pool;
  const poolKey = pool.label + pool.items.map((x) => (x.service ? `svc:${x.service.id}` : `${x.course.id}@${x.date}${x.time}`)).join(',');
  const [hl, setHl] = useState({ page: 0, shown: 0, fading: false, cycle: 0 });
  // Pool novo: volta à primeira página sem animação e reinicia o rodízio.
  useEffect(() => { setHl((h) => ({ page: 0, shown: 0, fading: false, cycle: h.cycle + 1 })); }, [poolKey]);
  const turn = (delta) => setHl((h) => { let page = h.page + delta; if (page < 0) page = 1e6; return { ...h, page, fading: true, cycle: h.cycle + 1 }; });
  useEffect(() => {
    if (!hl.fading) return;
    const id = setTimeout(() => setHl((h) => ({ ...h, shown: h.page, fading: false })), 400);
    return () => clearTimeout(id);
  }, [hl.fading, hl.page]);
  useEffect(() => {
    if (pool.items.length <= HL_COUNT) return;
    const id = setInterval(() => turn(1), HL_SECS * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey, hl.cycle]);

  // ---------- ajuste do quadro à tela ----------
  /** Reduz a escala até caber sem rolagem; se ainda não couber, esconde a linha "Para:". */
  const [fitTick, setFitTick] = useState(0);
  useLayoutEffect(() => {
    const b = root.current && root.current.querySelector('#board'); if (!b) return;
    const lists = [...b.querySelectorAll('.col-list, .svc-card ul')];
    const overflow = () => lists.some((l) => l.scrollHeight > l.clientHeight + 1) || b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1;
    let fs = 1; b.style.setProperty('--fs', fs); b.classList.remove('compact');
    while (overflow() && fs > 0.74) { fs = Math.round((fs - 0.04) * 100) / 100; b.style.setProperty('--fs', fs); }
    if (overflow()) { b.classList.add('compact'); fs = 1; b.style.setProperty('--fs', fs); while (overflow() && fs > 0.7) { fs = Math.round((fs - 0.04) * 100) / 100; b.style.setProperty('--fs', fs); } }
  }, [boardKey, viewport, fitTick]);
  useEffect(() => { if (document.fonts) document.fonts.ready.then(() => setFitTick((n) => n + 1)); }, []);

  // ---------- teclas, tela cheia, recarga ----------
  useEffect(() => {
    const fullscreen = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
    const keys = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'f') fullscreen();
      else if (k === 'l') setPrefs((p) => { p.theme = (root.current && root.current.classList.contains('tv-light')) ? 'dark' : 'light'; });
      else if (e.key === '+' || e.key === '=' || e.key === '-') setPrefs((p) => { p.zoom = Math.round(clamp((p.zoom || 1) + (e.key === '-' ? -0.05 : 0.05)) * 100) / 100; });
      else if (e.key === '0') setPrefs((p) => { delete p.zoom; });
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (poolRef.current.items.length > HL_COUNT) turn(e.key === 'ArrowRight' ? 1 : -1); }
      else if (e.key === 'Escape') setPrefs((p) => { for (const k2 in p) delete p[k2]; });
    };
    window.addEventListener('keydown', keys);
    window.addEventListener('pointerdown', fullscreen); // TVs com navegador exigem gesto para tela cheia
    const id = setInterval(() => {
      const h = new Date().getHours(); const m = new Date().getMinutes();
      if (h === 4 && m < 2) location.reload();                           // recarga diária (pega versões novas)
      if (Date.now() - lastTick.current > 10 * 60 * 1000) location.reload(); // watchdog anti-travamento
    }, 60000);
    return () => { window.removeEventListener('keydown', keys); window.removeEventListener('pointerdown', fullscreen); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- casca ----------
  const url = T.appUrl(venueSel ? `programacao?local=${venueSel}` : '');
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/#.*$/, '').replace(/\/$/, '');
  const ticker = [`Serviços gratuitos, sem inscrição: ${T.serviceDaysLabel()}`].concat(D.services.map((s) => `${s.title}: ${s.summary.replace(/\.$/, '')}`)).concat(['Programação completa, serviços e inscrições no celular: aponte a câmera para o QR Code']).join('   ✦   ') + '   ✦   ';
  const n = pool.items.length;
  const hlItems = []; if (n) { const start = (hl.shown * HL_COUNT) % n; for (let k = 0; k < Math.min(HL_COUNT, n); k++) hlItems.push(pool.items[(start + k) % n]); }

  return (
    <div id="tv" ref={root} className={`tv ${light ? 'tv-light' : 'tv-dark'} ${orientation === 'portrait' ? 'portrait' : 'landscape'}`} style={{ '--tv-zoom': zoom }}>
      <header className="tv-head">
        <div className="tv-logo"><img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" /></div>
        <div className="tv-title"><b>{D.event.name} · {D.event.edition}</b><small><Icon name="pin" />{venueName} · {D.event.datesLabel} {T.isSimulated() ? <span className="tv-live demo"><i />demonstração</span> : <span className="tv-live"><i />ao vivo</span>}</small></div>
        <div className="tv-clock"><div className="date"><b id="clock-wd">{clock.weekday.replace('-feira', '')}</b><small id="clock-date">{clock.day} de {clock.month}</small></div><div className="time" id="clock-time">{clock.time}</div></div>
      </header>
      <div className="tv-body">
        <div id="board-wrap" className="board-wrap">
          <Board key={boardKey} date={date} clock={clock} venueSel={venueSel} venueName={venueName} q={{ sessionsAt, svcDayAt, st, shiftState, shiftWin, byRoom, whenOf }} />
        </div>
        <aside className="tv-side">
          <div className="side-title" id="hl-title"><Icon name="star" />{pool.label}{n > HL_COUNT ? ` · ${n} ${pool.items[0] && pool.items[0].service ? 'blocos' : 'cursos'}` : ''}</div>
          <div className={`hl-wrap${hl.fading ? ' fading' : ''}`} id="hl">
            {!n ? <div className="hl-empty"><Icon name="handshake" /><span>Sem cursos neste momento.<br />Os serviços gratuitos continuam: veja a faixa abaixo.</span></div>
              : hlItems.map((x, k) => <HlCard key={k} x={x} clock={clock} venueSel={venueSel} st={st} dayWord={dayWord} />)}
          </div>
          <div className="tv-qr"><QrSvg text={url} margin={1} /><div><b><Icon name="phone" />Aponte a câmera do celular</b><p>Veja toda a programação, os serviços gratuitos e faça sua inscrição.</p><code>{shortUrl}</code></div></div>
        </aside>
      </div>
      <div className="tv-ticker"><span className="tv-ticker-label"><Icon name="megaphone" />Serviços · {T.serviceDays().map((d) => d.date.slice(8) + '/11').join(' e ')}</span><div className="tv-ticker-track"><span>{ticker}</span><span aria-hidden="true">{ticker}</span></div></div>
      <footer className="tv-foot"><span>{D.event.organizer} · {D.event.tagline}</span><span>Cursos gratuitos com inscrição pelo QR Code · número da sala conforme a placa na porta</span></footer>
    </div>
  );
}

/** Etiqueta "Agora"/"Encerrado" de uma aula. */
const EvTag = ({ s }) => (s === 'now' ? <span className="ev-tag">Agora</span> : s === 'past' ? <span className="ev-tag">Encerrado</span> : null);

/** Bloco da sala no cartão: número da porta grande ("08"), tipo em cima e nome da programação embaixo. */
function RoomBox({ x, venueSel }) {
  const r = roomInfo(x); const v = D.venues[x.venue];
  return (
    <div className={`ev-room${r.num ? ' num' : ''}`}>
      {r.num ? <><small className="k">{r.kind}</small><b>{r.num}</b><small>{r.name}</small></> : <b>{r.name}</b>}
      {!venueSel ? <small className="where">{v.short}</small> : null}
    </div>
  );
}

const BoardPill = ({ date, clock }) => {
  const isToday = date === clock.date; const dayIdx = T.eventDays().indexOf(date);
  return <span className={`board-pill ${isToday ? 'today' : ''}`}><Icon name={isToday ? 'sun' : 'calendar'} />{T.fmtDate(date)}{dayIdx >= 0 ? ` · ${dayIdx + 1}º dia` : ''}</span>;
};

/** Quadro do dia: colunas por turno (dias de cursos) ou 9 pilares + faixa de cursos (dias de serviços). */
function Board({ date, clock, venueSel, venueName, q }) {
  const { sessionsAt, svcDayAt, st, shiftState, shiftWin, byRoom, whenOf } = q;
  const sd = svcDayAt(date);
  const list = sessionsAt(date).sort(byRoom);
  const isToday = date === clock.date;
  const when = whenOf(date);
  if (sd) {
    const MAX = 4;
    return (
      <section className="board svc-mode" id="board">
        <div className="board-head"><div><h1><Icon name="handshake" />{when}: <em>serviços gratuitos</em></h1><div className="where"><Icon name="pin" />{sd.placeLong || sd.place} · sem inscrição, por ordem de chegada</div></div><BoardPill date={date} clock={clock} /></div>
        <div className="svc-grid">
          {D.services.map((s) => { const items = T.itemsOn(s, date); const extra = items.length - MAX; return (
            <div key={s.id} className="svc-card" style={{ '--c': s.color }}><div className="svc-card-h"><i><Icon name={s.icon} /></i><b>{s.short || s.title}</b></div>
              <ul>{items.slice(0, MAX).map((it, k) => <li key={k}>{T.itemText(it)}</li>)}</ul>
              {extra > 0 ? <small>+{extra} {extra > 1 ? 'atendimentos' : 'atendimento'} · veja no celular</small> : null}</div>); })}
        </div>
        {list.length ? (
          <div className="ev-strip"><div className="ev-strip-h"><b><Icon name="graduation" />Cursos {isToday ? 'de hoje' : 'do dia'}</b><small>com inscrição pelo QR Code</small></div>
            <div className="ev-row">{list.map((x, k) => { const sx = st(x); const sh = T.SHIFTS[x.shift]; return (
              <div key={k} className={`ev ${sx}`} style={{ '--c': sh.color }}><RoomBox x={x} venueSel={venueSel} /><div className="ev-main"><b>{T.title(x.course, true)}</b><small className="ev-time">{T.fmtTime(x.time)} às {T.fmtTime(T.sessionEnd(x))}</small><small><b>Para:</b> {x.course.audience}</small></div><EvTag s={sx} /></div>); })}</div></div>
        ) : null}
      </section>
    );
  }
  const cols = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
  const states = cols.map((k) => shiftState(k, date));
  // Largura de cada turno proporcional ao número de cursos (o turno em andamento ganha um pouco mais).
  const counts = cols.map((k) => list.filter((x) => x.shift === k).length);
  // Turno em andamento ganha espaço; turno encerrado vira uma coluna estreita só de referência.
  const widths = cols.map((k, j) => { const w = (1 + 0.4 * (Math.min(counts[j], 10) - 1)) * (states[j] === 'now' ? 1.35 : states[j] === 'past' ? 0.5 : 1); return states[j] === 'past' ? `minmax(14em,${w.toFixed(2)}fr)` : `minmax(19em,${w.toFixed(2)}fr)`; });
  const nextCol = cols.find((k, j) => states[j] === 'later' && (j === 0 || states[j - 1] !== 'later'));
  return (
    <section className="board" id="board">
      <div className="board-head"><div><h1><Icon name="calendar" />Programação de <em>{when.toLowerCase()}</em></h1><div className="where"><Icon name="pin" />{venueName}{venueSel ? '' : ' · todos os locais'}</div></div><BoardPill date={date} clock={clock} /></div>
      {!cols.length ? <div className="col-empty">Sem cursos programados neste local. Veja os serviços gratuitos na faixa abaixo.</div> : (
        <div className="cols" style={{ '--cols': widths.join(' ') }}>
          {cols.map((k, j) => {
            const sh = T.SHIFTS[k]; const s = states[j]; const [a, b] = shiftWin(k);
            const items = list.filter((x) => x.shift === k);
            const pct = s === 'now' ? Math.min(1, Math.max(0, (clock.min - a) / (b - a))) : s === 'past' ? 1 : 0;
            const tag = s === 'now' ? <em className="live">Agora</em> : s === 'past' ? <em>Encerrado</em> : k === nextCol && isToday ? <em>Começa às {T.fmtTime(sh.start)}</em> : null;
            return (
              <div key={k} className={`col ${s}${items.length <= 3 ? ' few' : ''}`} style={{ '--c': sh.color }}>
                <div className="col-h"><b><Icon name={T.SHIFT_ICON[k]} />{sh.label}</b><span>{T.fmtTime(sh.start)} às {T.fmtTime(sh.end)}</span>{tag}</div>
                {s !== 'later' ? <div className="col-bar"><i style={{ width: `${(pct * 100).toFixed(1)}%` }} /></div> : null}
                <div className="col-list">
                  {items.map((x, i) => { const sx = st(x); return (
                    <div key={i} className={`ev ${sx}`} style={{ '--c': sh.color }}>
                      <RoomBox x={x} venueSel={venueSel} />
                      <div className="ev-main"><b>{T.title(x.course, true)}{x.label ? ` · ${x.label}` : ''}</b>{oddTime(x) ? <small className="ev-time">{T.fmtTime(x.time)} às {T.fmtTime(T.sessionEnd(x))}</small> : null}<small><b>Para:</b> {x.course.audience}</small></div>
                      <EvTag s={sx} />
                    </div>); })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Cartão de destaque: um pilar de serviços (dia de serviços) ou uma aula. */
function HlCard({ x, clock, venueSel, st, dayWord }) {
  if (x.service) {
    const s = x.service; const items = T.itemsOn(s, x.date); const extra = items.length - 5;
    return (
      <div className="hl svc" style={{ '--c': s.color }}><span className="hl-tag" style={{ '--c': s.color }}>{x.date === clock.date ? 'Hoje' : T.fmtDate(x.date, 'wdm')} · sem inscrição</span>
        <div className="hl-room"><Icon name={s.icon} />{s.short || s.title}</div>
        <ul className="hl-items">{items.slice(0, 5).map((it, k) => <li key={k}>{T.itemText(it)}</li>)}</ul>
        {extra > 0 ? <div className="hl-foot"><Icon name="info" />+{extra} {extra > 1 ? 'atendimentos' : 'atendimento'} · veja no celular</div> : null}</div>
    );
  }
  const s = st(x); const sh = T.SHIFTS[x.shift]; const v = D.venues[x.venue]; const r = roomInfo(x);
  const tag = s === 'now' ? <span className="hl-tag live" style={{ '--c': sh.color }}><i />Agora · até {T.fmtTime(T.sessionEnd(x))}</span>
    : s === 'today' ? <span className="hl-tag" style={{ '--c': sh.color }}>Hoje às {T.fmtTime(x.time)}</span>
      : s === 'past' ? <span className="hl-tag" style={{ '--c': '#94a3b8' }}>Encerrado</span>
        : <span className="hl-tag" style={{ '--c': sh.color }}>{dayWord(x.date)} às {T.fmtTime(x.time)}</span>;
  return (
    <div className="hl" style={{ '--c': sh.color }}>{tag}
      <div className="hl-room">{r.num ? <>{r.kind} {r.num}<small>{r.name}</small></> : r.name}{x.room && !venueSel ? <small>{v.short}</small> : null}</div>
      <div className="hl-title">{T.title(x.course, true)}</div>
      <div className="hl-aud"><b>Para:</b> {x.course.audience}</div>
      <div className="hl-foot"><Icon name="pin" />{v.name} · {x.course.hours}h · {x.course.seats} vagas</div></div>
  );
}
