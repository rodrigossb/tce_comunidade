'use client';
/* Telas principais do app (porta de viewProgramacao/viewBusca/viewCursos/viewMapa/viewServicos/viewLocais). */
import { useEffect, useRef } from 'react';
import PlanMap from '@/components/PlanMap';
import { T, D, M, A, I, useApp, useDomain, activeFilterCount, cap, shiftColor, sessionsOf, StateBadge, SessRow, ItemLi, CourseCard, SvcCard, OnlyNote, LiveNote, LiveItemLi, QueueChip, VenueCard, Chip, Empty, PlaceChip, SearchBox, ServicesStrip, Footer, SvcDayCard, WhenBox, hashOf } from './ui';

export function ViewProgramacao() {
  const { clock, live, route, favs, setParam, nav, go, openShifts, toggleShift } = useApp();
  const { st, focusDate, nextOf, shiftState, attDayOf, nextAttDay } = useDomain();
  const days = T.eventDays(); const p = route.p;
  const d = days.includes(p.get('d')) ? p.get('d') : focusDate(); const local = D.venues[p.get('local')] ? p.get('local') : '';
  const list = sessionsOf((x) => x.date === d && (!local || x.venue === local));
  const idx = days.indexOf(clock.date); const diff = Math.round((Date.parse(D.event.start) - Date.parse(clock.date)) / 864e5);
  const tsd = attDayOf(clock.date);
  const status = tsd ? <>Hoje: <b>serviços gratuitos</b> no {tsd.place}</> : idx >= 0 ? <>Hoje é o <b>{idx + 1}º dia</b> do evento</> : diff > 0 ? (diff === 1 ? <>O evento <b>começa amanhã</b></> : <>O evento <b>começa em {diff} dias</b></>) : 'Evento encerrado · obrigado, Oiapoque!';
  const scrollTo = (id) => { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  let nowCard = null;
  if (d === clock.date) {
    const now = list.filter((x) => st(x) === 'now'); const up = list.filter((x) => st(x) === 'today');
    if (now.length) { const k = now[0].shift; nowCard = <button className="now-card" style={{ '--c': shiftColor(k) }} onClick={() => scrollTo(`turno-${k}`)}><span className="nc-ico">{I('clock')}</span><span><b><i></i>Acontecendo agora · {T.SHIFTS[k].label} até {T.fmtTime(T.SHIFTS[k].end)}</b><small>{now.length} curso{now.length > 1 ? 's' : ''} em andamento{local ? ` · ${D.venues[local].short}` : ''}</small></span>{I('down')}</button>; }
    else if (up.length) { const k = up[0].shift; const n = up.filter((x) => x.shift === k).length; nowCard = <button className="now-card next" style={{ '--c': shiftColor(k) }} onClick={() => scrollTo(`turno-${k}`)}><span className="nc-ico">{I('next')}</span><span><b>A seguir · {T.SHIFTS[k].label} às {T.fmtTime(T.SHIFTS[k].start)}</b><small>{n} curso{n > 1 ? 's' : ''}{local ? ` · ${D.venues[local].short}` : ''}</small></span>{I('down')}</button>; }
    else if (list.length) nowCard = <div className="now-card done"><span className="nc-ico">{I('check')}</span><span><b>Cursos de hoje encerrados</b><small>Veja amanhã nas abas acima ou os serviços gratuitos abaixo</small></span></div>;
  }
  const shifts = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
  const sections = shifts.map((k) => {
    const sh = T.SHIFTS[k]; const l = list.filter((x) => x.shift === k); const s = shiftState(k, d);
    const collapsed = s === 'past' && !openShifts.has(`${d}-${k}`);
    return (
      <section key={k} className={`sec shift-sec ${s} ${collapsed ? 'collapsed' : ''}`} id={`turno-${k}`}>
        <button className="sec-head" onClick={() => toggleShift(`${d}-${k}`)} aria-expanded={!collapsed}><span className="sec-ico c" style={{ '--c': sh.color }}>{I(T.SHIFT_ICON[k])}</span><h2>{sh.label} <small>{T.fmtTime(sh.start)} às {T.fmtTime(sh.end)}</small></h2>{s === 'now' ? <span className="badge now" style={{ '--c': sh.color }}>agora</span> : s === 'past' ? <span className="badge past">encerrado</span> : null}<span className="muted tiny">{l.length} curso{l.length === 1 ? '' : 's'}</span>{collapsed ? I('down') : null}</button>
        {collapsed ? null : <div className="stack cols">{l.map((x, i) => <SessRow key={`${x.course.id}-${i}`} x={x} />)}</div>}
      </section>
    );
  });
  const favList = D.courses.filter((c) => favs.has(c.id));
  const sd = attDayOf(d); const nsd = nextAttDay();
  // Dia com retrato da triagem: só os serviços que têm sala nesse dia, com as salas; sem retrato, todos os pilares da programação.
  const liveSvcs = sd && sd.live ? A.dayServices(live, sd.venue, d) : [];
  const svcSection = sd ? (
    <section className="sec svc-focus" style={{ '--c': D.event.shifts.manha.color }}>
      <div className="svc-banner static"><span className="sb-ico">{I('handshake')}</span><span><small>{d === clock.date ? 'Hoje' : cap(T.fmtDate(d, 'wdlong'))} é dia de</small><b>Serviços gratuitos · {sd.placeLong || sd.place}</b><small>Sem inscrição, por ordem de chegada. Toque em um bloco para ver tudo o que é oferecido.{sd.live ? ' Salas e atendimentos conforme a equipe de triagem.' : ''}</small>{M.mapOf(sd.venue) ? <button className="btn btn-ghost" style={{ marginTop: '.7em', justifySelf: 'start' }} onClick={() => nav(`mapa?local=${sd.venue}&dia=${d}`)}>{I('map')}Ver o mapa da escola</button> : null}</span></div>
      <div className="stack cols">{(liveSvcs.length ? liveSvcs : D.services).map((s) => <SvcCard key={s.id} s={s} note={sd.live ? <LiveNote s={s} venue={sd.venue} date={d} /> : <OnlyNote s={s} date={d} />} />)}</div>
    </section>
  ) : (nsd && d === clock.date ? <button className="svc-note" onClick={() => nav('servicos')}><span>{I('handshake')}</span><span>Serviços gratuitos (saúde, documentos, justiça…): <b>{T.serviceDaysLabel()}</b></span>{I('right')}</button> : null);
  return (
    <>
      <SearchBox q="" id="q0" big placeholder="Buscar curso, serviço, sala ou assunto…" onInput={(q) => { const np = new URLSearchParams(); if (q) np.set('q', q); go(hashOf('busca', np)); }} onClear={() => {}} />
      <p className="status-line">{I('sparkles')}<span>{status} · {D.event.placeShort}</span></p>
      <div className="tabs" role="tablist" aria-label="Dia">{days.map((x) => { const n = sessionsOf((y) => y.date === x && (!local || y.venue === local)).length; const xs = attDayOf(x); return <button key={x} role="tab" aria-selected={x === d} className={`${x === d ? 'on' : ''} ${x === clock.date ? 'today' : ''} ${x < clock.date ? 'past' : ''} ${xs ? 'svc' : ''}`} onClick={() => setParam('d', x, true)}><small>{x === clock.date ? 'hoje' : T.fmtDate(x, 'wd').split(' ')[0]}</small><b>{x.slice(8)}</b><em>{xs ? <>{I('handshake')}serviços</> : n ? `${n} curso${n > 1 ? 's' : ''}` : '—'}</em></button>; })}</div>
      <div className="chips scroll" aria-label="Local"><Chip on={!local} onClick={() => setParam('local', 'todos', true)}>{I('pin')}Todos os locais</Chip>{Object.values(D.venues).map((v) => <Chip key={v.id} label={v.short} on={local === v.id} onClick={() => setParam('local', v.id, true)} />)}</div>
      <p className="page-lead">{cap(T.fmtDate(d))}{d === clock.date ? ' · hoje' : T.relDay(d, clock.date) === 'amanhã' ? ' · amanhã' : ''} · {sd ? <><b>serviços gratuitos</b> em {sd.place}{list.length ? <> e <b>{list.length} curso{list.length === 1 ? '' : 's'}</b>{local ? ` em ${D.venues[local].short}` : ''}</> : null}</> : <><b>{list.length} curso{list.length === 1 ? '' : 's'}</b>{local ? ` em ${D.venues[local].name}` : ' em todos os locais'}</>}</p>
      {svcSection}
      {nowCard}
      {sd && shifts.length ? <div className="sec-head" style={{ marginTop: '1.4em' }}><span className="sec-ico">{I('graduation')}</span><h2>Cursos do dia <small>com inscrição</small></h2></div> : null}
      {shifts.length ? sections : (sd ? null : <Empty icon="calendar">Nenhum curso {d === clock.date ? 'hoje' : 'neste dia'}{local ? ` em ${D.venues[local].short}` : ''}. Toque em outro dia ou local acima, ou veja os serviços gratuitos.</Empty>)}
      {favList.length ? <section className="sec"><div className="sec-head"><span className="sec-ico">{I('bookmark')}</span><h2>Meus cursos <small>{favList.length}</small></h2><button className="link" onClick={() => nav('cursos?fav=1')}>Ver {I('right')}</button></div><div className="stack cols">{favList.slice(0, 4).map((c) => <SessRow key={c.id} x={nextOf(c)} showDate />)}</div></section> : null}
      <ServicesStrip />
      <Footer />
    </>
  );
}

export function ViewBusca() {
  const { clock, route, setParam, nav } = useApp(); const { nextOf, courseSort } = useDomain();
  const q = route.p.get('q') || ''; const R = T.search(q); const SUGGESTIONS = T.SUGGESTIONS;
  let body;
  if (!R.terms.length) {
    body = (
      <>
        <section className="sec"><div className="sec-head"><span className="sec-ico">{I('sparkles')}</span><h2>O que você procura?</h2></div>
          <div className="chips">{SUGGESTIONS.map((s) => <Chip key={s} label={s} onClick={() => setParam('q', s)} />)}</div></section>
        <section className="sec"><div className="sec-head"><span className="sec-ico">{I('pin')}</span><h2>Por local</h2></div><div className="chips">{Object.values(D.venues).map((v) => <Chip key={v.id} label={v.short} onClick={() => nav(`programacao?local=${v.id}`)} />)}</div></section>
        <section className="sec"><div className="sec-head"><span className="sec-ico">{I('calendar')}</span><h2>Por dia</h2></div><div className="chips">{T.eventDays().map((d) => <Chip key={d} label={d === clock.date ? 'Hoje' : cap(T.fmtDate(d, 'wd'))} onClick={() => nav(`programacao?d=${d}`)} />)}</div></section>
        <section className="sec"><div className="sec-head"><span className="sec-ico">{I('tag')}</span><h2>Cursos por tema</h2></div><div className="chips">{Object.entries(D.tags).map(([k, v]) => <Chip key={k} label={v} onClick={() => nav(`cursos?tema=${k}`)} />)}</div></section>
      </>
    );
  } else {
    const courses = R.courses.sort(courseSort.proximas); const services = R.services; const venues = R.venues; const total = R.total;
    body = total ? (
      <>
        <p className="result-line"><span><b>{total}</b> resultado{total > 1 ? 's' : ''} para “{q}”</span></p>
        {services.length ? <section className="sec"><div className="sec-head"><span className="sec-ico">{I('handshake')}</span><h2>Serviços gratuitos <small>{services.length}</small></h2></div><div className="stack">{services.map((r) => <SvcCard key={r.s.id} s={r.s} hits={r.hits} />)}</div></section> : null}
        {courses.length ? <section className="sec"><div className="sec-head"><span className="sec-ico">{I('graduation')}</span><h2>Cursos <small>{courses.length}</small></h2>{courses.length > 3 ? <button className="link" onClick={() => nav(`cursos?q=${encodeURIComponent(q)}`)}>Filtrar {I('right')}</button> : null}</div><div className="stack cols">{courses.map((c) => <SessRow key={c.id} x={nextOf(c)} showDate />)}</div></section> : null}
        {venues.length ? <section className="sec"><div className="sec-head"><span className="sec-ico">{I('pin')}</span><h2>Locais <small>{venues.length}</small></h2></div><div className="stack">{venues.map((v) => <VenueCard key={v.id} v={v} />)}</div></section> : null}
      </>
    ) : (
      <>
        <Empty icon="search">Nada encontrado para “{q}”. Tente uma palavra mais simples, como “saúde”, “documento” ou “curso”.</Empty>
        <div className="chips" style={{ justifyContent: 'center' }}>{SUGGESTIONS.slice(0, 6).map((s) => <Chip key={s} label={s} onClick={() => setParam('q', s)} />)}</div>
      </>
    );
  }
  return (
    <>
      <div className="page-head"><span className="page-ico">{I('search')}</span><h1>Buscar</h1></div>
      <SearchBox q={q} id="q" big autoFocus placeholder="Ex.: vacina, identidade, panificação…" debounce={150} onInput={(v) => setParam('q', v)} onClear={() => setParam('q', '')} />
      {body}
    </>
  );
}

export function ViewCursos() {
  const { clock, route, prefs, favs, kiosk, setParam, go, filtersOpen, setFiltersOpen } = useApp(); const { courseSort, filterCourses } = useDomain();
  const p = route.p; const q = p.get('q') || ''; const sort = p.get('ord') || 'proximas';
  const list = filterCourses(p).sort(courseSort[sort] || courseSort.proximas);
  const n = activeFilterCount(p); const days = T.eventDays();
  const P = (k, v) => () => setParam(k, v);
  return (
    <>
      <div className="page-head"><span className="page-ico">{I('graduation')}</span><h1>Cursos <span className="count">{D.courses.length}</span></h1></div>
      <p className="page-lead">Gratuitos, com inscrição pelo site da Escola de Contas. Toque no curso para ver horários, sala e inscrição.</p>
      <div className="filter-bar"><SearchBox q={q} placeholder="Buscar por nome, público, tema…" debounce={180} onInput={(v) => setParam('q', v)} onClear={() => setParam('q', '')} /><button className={`icon-btn ${filtersOpen || n ? 'on' : ''}`} onClick={() => setFiltersOpen((f) => !f)} aria-label="Filtros" aria-expanded={filtersOpen}>{I('sliders')}{n ? <em>{n}</em> : null}</button></div>
      <div className="chips scroll"><Chip on={p.get('dia') === clock.date} onClick={P('dia', p.get('dia') === clock.date ? '' : clock.date)}>{I('clock')}Hoje</Chip>{prefs.local && D.venues[prefs.local] ? <Chip on={p.get('local') === prefs.local} onClick={P('local', p.get('local') === prefs.local ? '' : prefs.local)}>{I('pin')}{D.venues[prefs.local].short}</Chip> : null}{kiosk ? null : <Chip on={!!p.get('fav')} onClick={P('fav', p.get('fav') ? '' : '1')}>{I('bookmark')}Meus cursos{favs.size ? ` (${favs.size})` : ''}</Chip>}</div>
      {filtersOpen || n ? (
        <div className="filters">
          <div className="f-group"><small>Tema</small><div className="chips"><Chip label="Todos" on={!p.get('tema')} onClick={P('tema', '')} />{Object.entries(D.tags).map(([k, v]) => <Chip key={k} label={v} on={p.get('tema') === k} onClick={P('tema', k)} />)}</div></div>
          <div className="f-group"><small>Dia</small><div className="chips"><Chip label="Todos" on={!p.get('dia')} onClick={P('dia', '')} />{days.map((d) => <Chip key={d} label={T.fmtDate(d, 'wd')} on={p.get('dia') === d} onClick={P('dia', d)} />)}</div></div>
          <div className="f-group"><small>Turno</small><div className="chips"><Chip label="Todos" on={!p.get('turno')} onClick={P('turno', '')} />{T.SHIFT_ORDER.map((k) => <Chip key={k} label={`${T.SHIFTS[k].label} ${T.fmtTime(T.SHIFTS[k].start)}`} on={p.get('turno') === k} onClick={P('turno', k)} color={T.SHIFTS[k].color} />)}</div></div>
          <div className="f-group"><small>Local</small><div className="chips"><Chip label="Todos" on={!p.get('local')} onClick={P('local', '')} />{Object.values(D.venues).map((v) => <Chip key={v.id} label={v.short} on={p.get('local') === v.id} onClick={P('local', v.id)} />)}</div></div>
          {n ? <div className="f-group"><div className="chips"><Chip className="clear" onClick={() => { const np = new URLSearchParams(); if (p.get('q')) np.set('q', p.get('q')); setFiltersOpen(false); go(hashOf('cursos', np), true); }}>{I('x')}Limpar filtros</Chip></div></div> : null}
        </div>
      ) : null}
      <div className="result-line"><span>{list.length} de {D.courses.length} cursos</span><label>Ordenar <select value={sort} onChange={(e) => setParam('ord', e.target.value)}><option value="proximas">Próximas datas</option><option value="az">A–Z</option><option value="ch">Carga horária</option></select></label></div>
      {list.length ? <div className="stack cols">{list.map((c) => <CourseCard key={c.id} c={c} />)}</div> : <Empty icon="search">Nenhum curso encontrado. Tente outra palavra ou limpe os filtros.</Empty>}
    </>
  );
}

/** Lê os parâmetros do mapa da rota (local, dia, sala, serviço, acesso, curso). Compartilhado pela tela e pelo mapa ampliado.
    `day` = dia de atendimento mostrado (?dia=, ou hoje/próximo dia do local); `days` = dias de atendimento do local;
    `liveDay` = há retrato da triagem para esse dia (então salas, serviços e oferta vêm dele). */
export function useMapParams() {
  const { clock, live, route, kiosk } = useApp(); const { defaultMapVenue } = useDomain();
  const p = route.p; const venue = M.mapOf(p.get('local')) ? p.get('local') : defaultMapVenue(); const map = M.mapOf(venue);
  const days = A.venueDays(live, venue); const day = days.includes(p.get('dia')) ? p.get('dia') : A.defaultDay(live, venue, clock.date);
  const dayQs = day ? A.dayQueues(live, venue, day) : []; const liveDay = dayQs.some((q) => !q.plant);
  // No totem a origem é fixa: onde o totem está (?entrada= da URL do totem), no mapa do próprio local.
  const fixedEnt = kiosk && venue === kiosk.local ? kiosk.entrada : null;
  const placeId = p.get('p') && map.places.some((x) => x.id === p.get('p')) ? p.get('p') : ''; const sid = p.get('s') || ''; const ent = M.entranceOf(map, fixedEnt || p.get('entrada')).id;
  const svc = sid ? T.serviceById(sid) : null;
  const course = p.get('curso') ? T.courseById(p.get('curso')) : null; const cx = course ? T.allSessions().find((x) => x.course === course && T.courseRoomPlace(x) && T.courseRoomPlace(x).id === placeId) : null;
  const alias = cx ? `${cx.room} · ${T.title(course, true)}` : '';
  const hl = svc ? (dayQs.length ? A.servicePlaceIds(live, sid, venue, day) : T.placesOf(svc, venue)) : [];
  const muted = day ? A.inactivePlaceIds(live, venue, day) : [];
  return { p, venue, map, day, days, dayQs, liveDay, placeId, sid, ent, fixed: !!fixedEnt, svc, course, cx, alias, hl, muted };
}

/** Painel da sala/tenda escolhida no mapa: o que atende ali no dia (filas da triagem, com nome, serviço e o que é oferecido
    por turno) e as aulas de cursos. Sem retrato da triagem para o dia, a programação fixa (T.offeringsAt). */
function PlaceOfferings({ placeId, venue, day, liveDay }) {
  const { clock, live, openSheet, setParam } = useApp(); const { st, dayWord } = useDomain();
  const o = T.offeringsAt(placeId, venue); if (!o) return null;
  const qs = liveDay ? A.placeQueues(live, placeId, venue, day) : [];
  const otherDays = liveDay ? A.placeDays(live, placeId, venue).filter((d) => d !== day) : [];
  if (!liveDay && !o.services.length && !o.sessions.length) return <p className="muted tiny" style={{ margin: '.2em 0 .6em' }}>Sem atendimentos cadastrados neste ambiente.</p>;
  const byDay = {}; o.sessions.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
  const dayLabel = (d) => (d === clock.date ? 'hoje' : T.fmtDate(d, 'wd'));
  return (
    <>
      {liveDay ? (
        <>
          <p className="dest-when">{I('handshake')}<span>Serviços gratuitos · <b>{cap(dayWord(day))}</b> · sem inscrição, por ordem de chegada <span className="live-tag">{I('check')}triagem</span></span></p>
          {qs.length ? qs.map((q, k) => (
            <div key={`${q.place.id}-${k}`} className="offer" style={{ '--c': q.service.color }}>
              <button className="offer-head" onClick={() => openSheet('servico', q.service.id)} aria-label={`${q.service.title}: ver o serviço completo`}><span className="sec-ico c">{I(q.service.icon)}</span><span><b>{q.place.name}</b><small>{[A.hasNum(q.place) ? A.placeTitle(q.place) : '', q.service.short || q.service.title, q.service.partners && q.service.partners.length ? q.service.partners.slice(0, 2).join(', ') : ''].filter(Boolean).join(' · ')}</small></span>{I('right')}</button>
              {q.items.length ? <ul className="ul">{q.items.map((it, j) => <LiveItemLi key={j} it={it} />)}</ul> : <p className="offer-sum">{q.service.summary}</p>}
            </div>
          )) : <p className="muted" style={{ margin: '.2em 0 .6em' }}>{I('info')} Sem atendimento neste ambiente {dayWord(day)}.{otherDays.length ? <> Atende {otherDays.map((d, k) => <button key={d} className="link" onClick={() => setParam('dia', d)}>{k ? ' e ' : ' '}{dayLabel(d)}</button>)}.</> : ''}</p>}
        </>
      ) : (
        <>
          {o.services.length ? <p className="dest-when">{I('handshake')}<span>Serviços gratuitos{o.day ? <> · <b>{T.fmtDate(o.day.date, 'wdlong')}</b></> : null} · sem inscrição, por ordem de chegada</span></p> : null}
          {o.services.map(({ service: s, items, specific }) => (
            <div key={s.id} className="offer" style={{ '--c': s.color }}>
              <button className="offer-head" onClick={() => openSheet('servico', s.id)} aria-label={`${s.title}: ver o serviço completo`}><span className="sec-ico c">{I(s.icon)}</span><span><b>{s.title}</b><small>{s.num ? `Pilar ${s.num}` : s.kicker || 'Acolhida'} · {s.partners.join(', ')}</small></span>{I('right')}</button>
              {specific ? <ul className="ul">{items.map((it, k) => <ItemLi key={k} it={it} />)}</ul> : <p className="offer-sum">{s.summary}</p>}
            </div>
          ))}
        </>
      )}
      {o.sessions.length ? (
        <div className="offer courses" style={{ '--c': '#34d399' }}>
          <div className="offer-head"><span className="sec-ico c">{I('graduation')}</span><span><b>Cursos nesta sala</b><small>{o.sessions.length} aula{o.sessions.length === 1 ? '' : 's'} · com inscrição · toque para ver o curso</small></span></div>
          {Object.keys(byDay).map((d) => <div key={d} className="day-group"><small className={d === clock.date ? 'today' : ''}>{T.fmtDate(d)}{d === clock.date ? ' · hoje' : ''}</small><div className="stack">{byDay[d].map((x, k) => { const sx = st(x); const c = shiftColor(x.shift); return (
            <button key={k} className={`sess ${sx}`} style={{ '--c': c }} onClick={() => openSheet('curso', x.course.id)} aria-label={T.title(x.course)}>
              <span className="sess-time"><b>{T.fmtTime(x.time)}</b><small>até {T.fmtTime(T.sessionEnd(x))}</small></span>
              <span className="sess-body"><b>{T.title(x.course, true)}{x.label ? ` · ${x.label}` : ''}</b><small>Para: {x.course.audience}</small></span>
              <span className="sess-right"><StateBadge s={sx} c={c} />{I('right')}</span>
            </button>); })}</div></div>)}
        </div>
      ) : null}
    </>
  );
}

export function ViewMapa() {
  const { clock, live, nav, go, openSheet, setParam, toast, setFullMap } = useApp(); const { dayWord } = useDomain();
  const { p, venue, map, day, days, dayQs, liveDay, placeId, sid, ent, fixed, svc, course, cx, alias, hl, muted } = useMapParams();
  const here = M.entranceOf(map, ent);
  const qsDay = p.get('dia') ? `&dia=${p.get('dia')}` : ''; // mantém o dia escolhido nos links do mapa
  const dayInfo = day ? A.attendanceDayOf(live, day, venue) : null;
  const svcList = liveDay ? A.dayServices(live, venue, day) : D.services;
  const kindOrder = { sala: 0, tenda: 1, area: 2 }; const numOf = (x) => (x.num && Number(x.num) ? Number(x.num) : 999);
  const sortedQs = dayQs.slice().sort((a, b) => (kindOrder[a.place.kind] ?? 3) - (kindOrder[b.place.kind] ?? 3) || numOf(a.place) - numOf(b.place) || a.place.name.localeCompare(b.place.name, 'pt-BR'));
  const svcQs = svc ? sortedQs.filter((q) => q.service.id === svc.id) : [];
  const place = placeId ? T.placeInfo(placeId) : null;
  // Ao escolher outra sala (pino, chip ou mapa ampliado) o painel dela entra na tela; na abertura com ?p= (vindo de um curso) fica o mapa com o caminho.
  const destRef = useRef(null); const prevPlace = useRef(placeId);
  useEffect(() => {
    if (prevPlace.current === placeId) return; prevPlace.current = placeId;
    const el = destRef.current; if (!placeId || !el) return;
    const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [placeId]);
  const speak = () => { if (!M.speak(M.route(venue, placeId, ent))) toast('Este navegador não tem leitura em voz alta', 'info'); };
  return (
    <>
      <div className="page-head"><span className="page-ico">{I('map')}</span><h1>Mapa</h1></div>
      <div className="map-bar"><div className="seg">{Object.values(D.maps).map((m) => <button key={m.venue} className={m.venue === venue ? 'on' : ''} onClick={() => nav(`mapa?local=${m.venue}`)}>{m.short}</button>)}</div>
        {fixed ? <span className="here fixed">{I('pin')}<span>Você está aqui</span><b>{here.short}</b></span> : <label className="here">{I('pin')}<span>Você está</span><select value={ent} onChange={(e) => setParam('entrada', e.target.value)} aria-label="Onde você está">{map.entrances.map((e) => <option key={e.id} value={e.id}>{e.short}</option>)}</select></label>}</div>
      {days.length > 1 ? <div className="chips scroll day-chips" role="tablist" aria-label="Dia de atendimento">{days.map((d) => <Chip key={d} on={d === day} onClick={() => setParam('dia', d)}>{I('calendar')}{d === clock.date ? 'Hoje' : cap(T.fmtDate(d, 'wd'))}</Chip>)}</div> : null}
      <div className="chips types"><Chip label="Todos" on={!sid && !placeId} onClick={() => nav(`mapa?local=${venue}&entrada=${ent}${qsDay}`)} />{svcList.map((s) => <Chip key={s.id} on={sid === s.id} color={s.color} onClick={() => nav(`mapa?local=${venue}&entrada=${ent}${qsDay}${sid === s.id ? '' : `&s=${s.id}`}`)}>{I(s.icon)}{s.short}</Chip>)}</div>
      <PlanMap venue={venue} entrance={ent} scale={1.15} place={p.get('p') || null} alias={alias} highlight={hl} muted={muted} showAll={!svc && !p.get('p')}
        onPick={(id) => go(`#mapa?local=${venue}&p=${id}&entrada=${ent}${qsDay}${sid ? `&s=${sid}` : ''}`)}
        onEntrance={fixed ? undefined : (eid) => go(`#mapa?local=${venue}&entrada=${eid}${qsDay}${p.get('p') ? `&p=${p.get('p')}` : ''}${sid ? `&s=${sid}` : ''}${p.get('curso') ? `&curso=${p.get('curso')}` : ''}`, true)} />
      <div className="map-foot"><div className="map-legend"><span><i style={{ background: '#e11d48' }}></i>Você</span><span><i style={{ background: '#0b1b3d' }}></i>Sala</span><span><i style={{ background: '#7e22ce' }}></i>Tenda</span><span><i style={{ background: '#0f766e' }}></i>Área</span><span><i style={{ background: '#fbbf24' }}></i>Destino</span></div><button className="btn btn-ghost sm" onClick={() => setFullMap(venue)}>{I('zoomin')}Ampliar</button></div>
      {place ? (
        <section ref={destRef} className="sec dest"><div className="sec-head"><span className="sec-ico" style={{ background: '#fbbf24', color: '#0b1b3d' }}>{I('flag')}</span><h2>{M.placeLabel(place)} {alias || M.placeLabel(place) !== place.name ? <small>{alias || place.name}</small> : null}</h2>{typeof window !== 'undefined' && window.speechSynthesis ? <button className="icon-btn" onClick={speak} aria-label="Ouvir o caminho" title="Ouvir o caminho">{I('megaphone')}</button> : null}</div>
          {cx ? <p className="page-lead" style={{ margin: '0 0 .5em' }}>{T.title(course)} · {T.fmtDate(cx.date, 'wdlong')} às {T.fmtTime(cx.time)}</p> : null}
          <PlaceOfferings placeId={placeId} venue={venue} day={day} liveDay={liveDay} />
          <div className="actions"><button className="btn btn-ghost" onClick={() => { const el = document.querySelector('.app-main .tcemap'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{I('pin')}Ver o caminho</button><button className="btn btn-ghost" onClick={() => nav(`mapa?local=${venue}&entrada=${ent}${qsDay}${sid ? `&s=${sid}` : ''}`)}>{I('map')}Mapa geral</button>{course ? <button className="btn btn-primary" onClick={() => openSheet('curso', course.id)}>{I('graduation')}Voltar ao curso</button> : svc ? <button className="btn btn-primary" onClick={() => openSheet('servico', svc.id)}>{I(svc.icon)}{svc.short}</button> : null}</div></section>
      ) : null}
      {!place && svc ? <section className="sec"><div className="sec-head"><span className="sec-ico c" style={{ '--c': svc.color }}>{I(svc.icon)}</span><h2>{svc.title} <small>{liveDay ? `${svcQs.length} ${svcQs.length === 1 ? 'sala' : 'salas'}` : `${hl.length} local${hl.length === 1 ? '' : 'is'}`}</small></h2><button className="icon-btn" onClick={() => openSheet('servico', svc.id)} aria-label="Detalhes do serviço">{I('info')}</button></div><p className="page-lead" style={{ margin: '0 0 .5em' }}>{day ? `${cap(dayWord(day))} · ` : ''}{liveDay && !svcQs.length ? 'sem atendimento deste serviço neste dia.' : 'toque em uma sala para ver o caminho.'}</p><div className="place-chips">{liveDay ? svcQs.map((q, k) => <QueueChip key={`${q.place.id}-${k}`} q={q} venue={venue} date={p.get('dia') || ''} s={sid} />) : hl.map((id) => <PlaceChip key={id} id={id} s={sid} />)}</div></section> : null}
      {!place && !svc ? <section className="sec"><div className="sec-head"><span className="sec-ico">{I('door')}</span><h2>Salas e tendas <small>{liveDay ? `${sortedQs.length} atendendo` : map.places.filter((x) => !x.hide).length}</small></h2></div><p className="page-lead" style={{ margin: '0 0 .5em' }}>{day ? <>Serviços gratuitos <b>{dayWord(day)}</b>{dayInfo && dayInfo.live ? <> · salas e atendimentos <b>conforme a equipe de triagem</b></> : null}. </> : null}Toque em uma sala, no mapa ou na lista, para ver o caminho.</p>
        {liveDay ? (
          <>
            <div className="place-chips">{sortedQs.map((q, k) => <QueueChip key={`${q.place.id}-${k}`} q={q} venue={venue} date={p.get('dia') || ''} />)}</div>
            {muted.length ? <details className="inactive-places"><summary>{I('info')} Sem atendimento {dayWord(day)}: {muted.length} {muted.length === 1 ? 'ambiente' : 'ambientes'} da planta</summary><div className="place-chips">{muted.map((id) => <PlaceChip key={id} id={id} />)}</div></details> : null}
          </>
        ) : <div className="place-chips">{map.places.filter((x) => !x.hide).map((x) => <PlaceChip key={x.id} id={x.id} />)}</div>}
        <div className="sec-head" style={{ marginTop: '1.2em' }}><span className="sec-ico">{I('pin')}</span><h2>Programação por local</h2></div><div className="chips">{Object.values(D.venues).map((v) => <Chip key={v.id} label={v.short} onClick={() => nav(`programacao?local=${v.id}`)} />)}</div></section> : null}
    </>
  );
}

export function ViewServicos() {
  const { route, live, setParam } = useApp(); const { attDayOf } = useDomain();
  const selDay = attDayOf(route.p.get('dia')); const sel = selDay ? route.p.get('dia') : '';
  // Dia com retrato da triagem: só os serviços com sala nesse dia (e quais salas); senão todos os pilares da programação.
  const liveSvcs = selDay && selDay.live ? A.dayServices(live, selDay.venue, sel) : [];
  return (
    <>
      <div className="page-head"><span className="page-ico">{I('handshake')}</span><h1>Serviços gratuitos</h1></div>
      <p className="page-lead">Atendimentos para toda a população, <b>sem inscrição</b>, em dois dias: {T.serviceDaysLabel()}. Toque em um bloco para ver tudo o que é oferecido e quem atende.</p>
      <WhenBox sel={sel} />
      {selDay ? <p className="result-line"><span>Mostrando o que há em <b>{T.fmtDate(sel, 'wdlong')} · {selDay.place}</b>{selDay.live ? <> <span className="live-tag">{I('check')}triagem</span></> : null}</span><button className="link" onClick={() => setParam('dia', '')}>Ver tudo {I('x')}</button></p> : null}
      <div className="stack cols">{(liveSvcs.length ? liveSvcs : D.services).map((s) => <SvcCard key={s.id} s={s} note={selDay && selDay.live ? <LiveNote s={s} venue={selDay.venue} date={sel} /> : <OnlyNote s={s} date={sel} />} />)}</div>
    </>
  );
}

export function ViewLocais() {
  const { nav } = useApp();
  return (
    <>
      <div className="page-head"><span className="page-ico">{I('pin')}</span><h1>Locais</h1></div>
      <div className="quick" style={{ marginTop: 0 }}>{Object.values(D.maps).map((m) => <button key={m.venue} onClick={() => nav(`mapa?local=${m.venue}`)}><span className="q-ico">{I('map')}</span><span><b>Mapa · {m.short}</b><small>salas dos serviços e caminho</small></span></button>)}</div>
      <p className="page-lead">Onde acontecem os cursos. Toque para ver a programação de cada local.</p>
      <div className="stack cols">{Object.values(D.venues).map((v) => <VenueCard key={v.id} v={v} />)}</div>
    </>
  );
}
export { StateBadge, SvcDayCard };
