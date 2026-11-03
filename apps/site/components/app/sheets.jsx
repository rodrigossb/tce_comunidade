'use client';
/* Folhas (detalhe) do app: curso, serviço, local, mapa ampliado. Porta de sheetCurso/sheetServico/sheetLocal. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PlanMap from '@/components/PlanMap';
import Qr from '@/components/Qr';
import { T, D, M, I, useApp, useDomain, cap, shiftColor, roomLabel, sessionsOf, StateBadge, SessRow, SvcDayCard, ItemLi, RoomTags, PlaceChip, Empty } from './ui';
import { useMapParams } from './views';

/** Moldura da folha: fundo escuro, animação de fechar, arraste para baixo fecha (celular). */
export function Sheet({ onClose, closing, children }) {
  const rootRef = useRef(null);
  useEffect(() => {
    let drag = null;
    const down = (e) => { const grab = e.target.closest('.sheet-head, .sheet-grab'); if (!grab || e.target.closest('button,a') || !rootRef.current || !rootRef.current.contains(grab)) return; drag = { y: e.clientY, sheet: grab.closest('.sheet') }; };
    const move = (e) => { if (!drag) return; const dy = Math.max(0, e.clientY - drag.y); drag.sheet.style.transform = `translateY(${dy}px)`; drag.dy = dy; };
    const up = () => { if (!drag) return; if (drag.dy > 90) onClose(); else drag.sheet.style.transform = ''; drag = null; };
    document.addEventListener('pointerdown', down); document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  }, [onClose]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  return (
    <div ref={rootRef} className={`sheet-root ${closing ? 'closing' : ''}`} id="sheet-root" role="dialog" aria-modal="true" onClick={(e) => { if (!e.target.closest('.sheet')) onClose(); }}>
      <div className="sheet"><div className="sheet-grab"></div>{children}</div>
    </div>
  );
}
const Head = ({ kicker, style, onClose }) => <div className="sheet-head"><span className="kicker" style={style}>{kicker}</span><button className="icon-btn" onClick={onClose} aria-label="Fechar">{I('x')}</button></div>;
export function NotFound({ msg, onClose }) { return <><Head kicker="Ops" onClose={onClose} /><div className="sheet-body"><Empty icon="alert">{msg}</Empty></div></>; }

export function SheetCurso({ c, onClose }) {
  const { clock, favs, kiosk, toggleFav, nav, share, download, toast } = useApp(); const { st, nextOf, dayWord } = useDomain();
  const qrRef = useRef(null);
  const sessions = T.allSessions().filter((x) => x.course === c);
  const byDay = {}; sessions.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
  const venues = [...new Set(sessions.map((x) => D.venues[x.venue].short))].join(' · ');
  const fav = favs.has(c.id); const s = T.courseState(c, clock); const nx = nextOf(c);
  const links = [...new Set(sessions.map((x) => x.link))];
  const nextLine = s === 'now' ? `Acontecendo agora · ${roomLabel(nx)} · até ${T.fmtTime(T.sessionEnd(nx))}` : s === 'past' ? 'Todas as aulas já aconteceram' : `${cap(dayWord(nx.date))} às ${T.fmtTime(nx.time)} · ${roomLabel(nx)}`;
  const seen = new Map(); for (const x of sessions) { const pl = T.courseRoomPlace(x); if (pl && !seen.has(pl.id)) seen.set(pl.id, { pl, x }); }
  const first = seen.size ? [...seen.values()][0] : null;
  const onIcs = () => { download(`curso-${c.id}.ics`, T.icsFor(c), 'text/calendar'); toast('Lembrete gerado: abra o arquivo para salvar na agenda'); };
  const onShare = () => share(T.title(c), `${T.title(c)} · ${T.fmtDate(nx.date, 'wdlong')} às ${T.fmtTime(nx.time)} · ${roomLabel(nx)} · ${D.event.name}`, T.appUrl(`curso/${c.id}`));
  return (
    <>
      <Head kicker={<>{I('graduation')}Curso gratuito · Escola de Contas · TCE/AP</>} onClose={onClose} />
      <div className="sheet-body"><h2>{c.title}</h2>
        <div className={`next-line ${s}`} style={{ '--c': shiftColor(nx.shift) }}>{I(s === 'now' ? 'clock' : 'calendar')}<span>{nextLine}</span></div>
        <div className="chips" style={{ marginTop: '.4em' }}>{c.tags.map((t) => <span key={t} className="tagc">{D.tags[t]}</span>)}</div>
        <div className="meta-grid"><div><small>Carga horária</small><b>{c.hours}h</b></div><div><small>Vagas</small><b>{c.seats}</b></div><div><small>Local</small><b>{venues}</b></div></div>
        <p><b>Para quem é:</b> {c.audience}</p>
        {c.note ? <p className="note" style={{ marginTop: '.6em' }}>{I('info')}<span>{c.note}</span></p> : null}
        {first ? (
          <>
            <h3>{I('map')}Onde fica na escola</h3>
            <button className="btn btn-map" onClick={() => nav(`mapa?local=${first.pl.venue}&p=${first.pl.id}&curso=${c.id}`)}>{I('map')}<span>Ver o caminho no mapa<small>{M.placeLabel(first.pl)} · {D.venues[first.x.venue].short}</small></span>{I('right')}</button>
            <div className="place-chips">{[...seen.values()].map(({ pl, x }) => <button key={pl.id} className={`place-chip ${pl.kind}`} onClick={() => nav(`mapa?local=${pl.venue}&p=${pl.id}&curso=${c.id}`)}><b>{pl.num || '•'}</b><span>{x.room} = {M.placeLabel(pl)} · {D.venues[x.venue].short}</span><em className="go-map">{I('map')}caminho</em></button>)}</div>
          </>
        ) : null}
        <h3>{I('calendar')}Dias e horários ({sessions.length})</h3>
        {Object.keys(byDay).map((d) => (
          <div key={d} className="day-group"><small className={d === clock.date ? 'today' : ''}>{T.fmtDate(d)}{d === clock.date ? ' · hoje' : ''}</small>
            {byDay[d].map((x, k) => { const sx = st(x); const pl = T.courseRoomPlace(x); return (
              <div key={k} className={`sess-static ${sx}`} style={{ '--c': shiftColor(x.shift) }}><span className="sess-time"><b>{T.fmtTime(x.time)}</b><small>até {T.fmtTime(T.sessionEnd(x))}</small></span><span className="sess-body"><b>{x.room || D.venues[x.venue].short}{x.label ? ` · ${x.label}` : ''}{pl && M.placeLabel(pl) !== x.room ? <em className={`room-tag ${pl.kind}`}>{I('map')}{M.placeLabel(pl)}</em> : null}</b><small>{D.venues[x.venue].name}</small></span><span className="sess-right"><StateBadge s={sx} c={shiftColor(x.shift)} /></span>{!kiosk && links.length > 1 && x.link !== c.link ? <a className="sess-link link" href={x.link} target="_blank" rel="noopener">Inscrição {x.label || ''} {I('external')}</a> : null}</div>
            ); })}
          </div>
        ))}
        {kiosk ? (
          <>
            <div className="actions">
              <button className="btn btn-primary" onClick={() => qrRef.current && qrRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{I('qr')}Inscrever-se pelo celular</button>
              <button className="btn btn-ghost" onClick={() => nav(`programacao?d=${nx.date}&local=${nx.venue}`)}>{I('calendar')}Ver o dia</button>
            </div>
            <div className="qr-box kiosk" ref={qrRef}><Qr text={T.appUrl(`curso/${c.id}`)} margin={1} /><small><b>Aponte a câmera do celular</b> para este QR Code: abre esta página do curso com o botão de inscrição (gratuita, pelo site da Escola de Contas).</small></div>
          </>
        ) : (
          <>
            <div className="actions">
              <a className="btn btn-primary" href={c.link} target="_blank" rel="noopener">{I('external')}Fazer inscrição{links.length > 1 ? ` (${sessions.find((x) => x.link === c.link)?.label || 'Turma I'})` : ''}</a>
              <button className={`btn btn-ghost ${fav ? 'on' : ''}`} onClick={() => toggleFav(c.id)}>{I('bookmark')}{fav ? 'Salvo' : 'Salvar'}</button>
              <button className="btn btn-ghost" onClick={onIcs}>{I('calendarplus')}Lembrar</button>
              <button className="btn btn-ghost" onClick={onShare}>{I('share')}Compartilhar</button>
              <button className="btn btn-ghost" onClick={() => nav(`programacao?d=${nx.date}&local=${nx.venue}`)}>{I('calendar')}Ver o dia</button>
            </div>
            <p className="tiny muted">A inscrição é feita no site da Escola de Contas (ESCON). É gratuita.{c.linkNote ? ' Se o link não abrir, procure o curso pelo nome na página de cursos da Escola de Contas.' : ''}</p>
            <div className="qr-box"><Qr text={T.appUrl(`curso/${c.id}`)} margin={1} /><small><b>Mostre para alguém:</b> este QR Code abre esta página do curso no celular.</small></div>
          </>
        )}
      </div>
    </>
  );
}

export function SheetServico({ s, onClose }) {
  const { route, nav, share, kiosk } = useApp(); const { defaultMapVenue } = useDomain();
  const dia = route.p.get('dia'); const ctx = (dia && T.mapVenueOf(dia)) || defaultMapVenue(); const ids = T.placesOf(s, ctx); const m = M.mapOf(ctx);
  return (
    <>
      <Head kicker={<>{I(s.icon)}{s.num ? `Pilar ${s.num}` : 'Acolhida'} · Serviços gratuitos</>} style={{ color: `color-mix(in srgb,${s.color} 70%,var(--ink))` }} onClose={onClose} />
      <div className="sheet-body" style={{ '--c': s.color }}><h2>{s.title}</h2><p className="muted">{s.summary}</p>
        <div className="when-box" style={{ marginTop: '.7em' }}><small>{I('calendar')}Quando e onde · sem inscrição, por ordem de chegada</small><div className="svc-days compact">{T.serviceDays().map((d) => <SvcDayCard key={d.date} d={d} onClick={() => nav(`programacao?d=${d.date}&local=${d.venue}`)} sub={T.itemsOn(s, d.date).length === s.items.length ? 'Todos os itens abaixo' : `${T.itemsOn(s, d.date).length} de ${s.items.length} itens abaixo`} />)}</div></div>
        {ids.length ? <><h3>{I('map')}Onde fica · {m.short}</h3><button className="btn btn-map" onClick={() => nav(`mapa?local=${ctx}&s=${s.id}`)}>{I('map')}<span>Ver no mapa da escola<small>{ids.length} {ids.length === 1 ? 'local' : 'locais'} em destaque · toque e veja o caminho</small></span>{I('right')}</button><div className="place-chips">{ids.map((id) => <PlaceChip key={id} id={id} s={s.id} />)}</div></> : null}
        <h3>{I('check')}O que é oferecido</h3><ul className="ul">{s.items.map((it, k) => <ItemLi key={k} it={it} date={dia} tags={<RoomTags it={it} venue={ctx} />} />)}</ul>
        {s.detail ? <p className="note">{I('info')}<span>{s.detail}</span></p> : null}
        <h3>{I('users')}Quem atende</h3><div className="partners">{s.partners.map((p) => <span key={p}>{p}</span>)}</div>
        {s.coursesLink ? <div className="actions"><button className="btn btn-primary" onClick={() => nav('cursos')}>{I('graduation')}Ver os {D.courses.length} cursos com inscrição</button></div> : null}
        {kiosk ? <div className="qr-box kiosk"><Qr text={T.appUrl(`servico/${s.id}`)} margin={1} /><small><b>Aponte a câmera do celular</b> para levar este serviço, com salas e horários, no seu aparelho.</small></div> : <div className="share-row"><button className="btn btn-ghost" onClick={() => share(s.title, `${s.title}: ${s.summary} · ${D.event.name} · ${D.event.datesLabel}`, T.appUrl(`servico/${s.id}`))}>{I('share')}Compartilhar</button></div>}
      </div>
    </>
  );
}

export function SheetLocal({ v, onClose }) {
  const { clock, nav } = useApp();
  const list = sessionsOf((x) => x.venue === v.id); const byDay = {}; list.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
  const days = Object.keys(byDay);
  return (
    <>
      <Head kicker={<>{I('pin')}Local · {v.city}</>} onClose={onClose} />
      <div className="sheet-body"><h2>{v.name}</h2>{v.rooms.length ? <div className="partners">{v.rooms.map((r) => <span key={r}>{r}</span>)}</div> : null}
        <div className="actions" style={{ margin: '.9em 0' }}>{D.maps[v.id] ? <button className="btn btn-map" onClick={() => nav(`mapa?local=${v.id}`)}>{I('map')}<span>Mapa da escola<small>salas, tendas e o caminho até cada uma</small></span>{I('right')}</button> : null}<button className="btn btn-primary" onClick={() => nav(`programacao?local=${v.id}`)}>{I('calendar')}Abrir a programação deste local</button>{(D.geo || []).some((g) => g.venues.includes(v.id)) ? <a className="btn btn-map" href={`mapa-eventos.html?local=${(D.geo.find((g) => g.venues.includes(v.id)) || {}).id}`} target="_blank" rel="noopener noreferrer">{I('compass')}<span>Como chegar<small>rota pelo Google Maps ou Waze</small></span>{I('external')}</a> : null}</div>
        <h3>{I('calendar')}Cursos neste local ({list.length})</h3>
        {days.length ? days.map((d) => <div key={d} className="day-group"><small className={d === clock.date ? 'today' : ''}>{T.fmtDate(d)}{d === clock.date ? ' · hoje' : ''}</small><div className="stack">{byDay[d].map((x, k) => <SessRow key={k} x={x} />)}</div></div>) : <Empty icon="calendar">Sem cursos cadastrados neste local.</Empty>}
      </div>
    </>
  );
}

/** Mapa ampliado (rola com o dedo), aberto pelo botão "Ampliar". Não entra no histórico. */
export function SheetMapaFull({ venue, onClose }) {
  const { go } = useApp(); const { p, ent, svc, hl } = useMapParams();
  const [x3, setX3] = useState(false); const zoomRef = useRef(null);
  const m = M.mapOf(venue); const place = p.get('p') ? m.places.find((x) => x.id === p.get('p')) : null;
  useLayoutEffect(() => {
    const z = zoomRef.current; if (!z) return; const f = z.querySelector('.tcemap-frame'); if (!f) return;
    const e = M.entranceOf(m, ent); const fx = (place ? place.x : e.x) / m.w; const fy = (place ? place.y : e.y) / m.h;
    requestAnimationFrame(() => { z.scrollLeft = fx * f.clientWidth - z.clientWidth / 2; z.scrollTop = fy * f.clientHeight - z.clientHeight / 2; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Head kicker={<>{I('map')}{m.title}</>} onClose={onClose} />
      <div className="sheet-body"><p className="tiny muted" style={{ margin: '0 0 .5em' }}>Arraste para mover. Toque em uma sala para ver o caminho.</p>
        <div ref={zoomRef} className={`map-zoom ${x3 ? 'x3' : ''}`} id="map-zoom">
          <PlanMap venue={venue} entrance={ent} scale={1.1} place={p.get('p') || null} highlight={hl} showAll={!svc && !p.get('p')} onPick={(id) => { onClose(true); go(`#mapa?local=${venue}&p=${id}&entrada=${ent}${p.get('s') ? `&s=${p.get('s')}` : ''}`); }} />
        </div>
        <div className="map-actions"><button className="btn btn-ghost" onClick={() => setX3((v) => !v)}>{I('zoomin')}{x3 ? 'Menos zoom' : 'Mais zoom'}</button></div>
      </div>
    </>
  );
}
