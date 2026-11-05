'use client';
/* Dashboard de resultados (16:9, mesmo formato da TV das senhas): números do dia de serviços para projetar no
   encerramento da ação ou acompanhar ao vivo. Telas que alternam sozinhas (ou ?tela= fixa):
     geral    → KPIs animados, resultado das chamadas (donut), movimento por hora e destaques
     servicos → um cartão por serviço (entregues, chamadas, atendidas, faltas, tempo médio, taxa de falta, curva por hora)
     salas    → ranking de salas/especialidades por atendimentos, mais rápidas e com mais faltas
     horas    → movimento por hora empilhado por serviço e linha do tempo (primeira chamada, pico, última)
   Parâmetros: ?local=jn|manga ?dia=AAAA-MM-DD ?tela=geral|servicos|salas|horas ?auto=0 ?zoom=1.1 ?t=&d= · tecla F = tela cheia.
   Dados: GET /api/stats (público, só leitura), a cada 30 s. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import Icon from '@/components/Icon';
import { hourSeries, hourByService, placeRows, serviceRows, highlights, defaultDay, arcPath, fmtT, fmtMin, pct, allEvents } from '@/lib/dash-stats';

const D = T.D;
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const SCREENS = ['geral', 'servicos', 'salas', 'horas'];
const TITLES = { geral: 'Resultados do dia', servicos: 'Por serviço', salas: 'Salas e especialidades', horas: 'Movimento por hora' };
const SCREEN_SECS = 15;
const POLL_MS = 30000;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const asScale = (v) => { const n = Number(v); return n > 0 ? (n > 5 ? n / 100 : n) : 0; };
const OK = '#22c55e'; const NO = '#f87171'; const PEND = '#94a3b8';

/** Número que "conta" até o valor quando ele muda (impacto na tela). */
function useCountUp(value, ms = 1100) {
  const [v, setV] = useState(0); const from = useRef(0); const raf = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0; const start = performance.now(); const a = from.current;
    cancelAnimationFrame(raf.current);
    const step = (t) => { const k = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - k, 3); const cur = a + (target - a) * e; setV(cur); if (k < 1) raf.current = requestAnimationFrame(step); else from.current = target; };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return v;
}
function Num({ value, dec = 0, suffix = '' }) { const v = useCountUp(value); return <>{value == null ? '—' : `${dec ? v.toFixed(dec).replace('.', ',') : Math.round(v)}${suffix}`}</>; }

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="tv tv-dark dash"><div className="tv-msg"><div className="spinner" /><p>Carregando os resultados…</p></div></div>;
  return <Dash />;
}

function Dash() {
  const sp = useMemo(() => new URLSearchParams(location.search), []);
  const [clock, setClock] = useState(() => T.now());
  useEffect(() => { const id = setInterval(() => setClock(T.now()), 1000); return () => clearInterval(id); }, []);
  // ?dia=AAAA-MM-DD e ?local= forçam; senão o dia de trabalho das senhas (dash-stats.defaultDay).
  const sd = useMemo(() => { const q = sp.get('dia'); const v = D.maps && D.maps[sp.get('local')] ? sp.get('local') : null; if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) { const base = T.serviceDayOf(q) || T.ticketDay(q, v) || { venue: v || 'jn', place: '' }; return Object.assign({}, base, { date: q, venue: v || base.venue }); } return defaultDay(clock.date, v); }, [sp, clock.date]);
  const venue = D.maps && D.maps[sp.get('local')] ? sp.get('local') : sd.venue; const day = sd.date;
  const venueName = D.venues[venue] ? D.venues[venue].name : venue;
  const fixed = SCREENS.includes(sp.get('tela')) ? sp.get('tela') : null;
  const auto = !fixed && sp.get('auto') !== '0';
  const [zoom, setZoom] = useState(() => Math.min(1.6, Math.max(0.6, asScale(sp.get('zoom')) || 1)));
  const live = day === clock.date;

  // ---- dados ----
  const [data, setData] = useState(null); const [offline, setOffline] = useState(false);
  const refresh = useCallback(async () => {
    try { const r = await fetch(`${BP}/api/stats?local=${encodeURIComponent(venue)}&dia=${day}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(String(r.status)); setData(await r.json()); setOffline(false); }
    catch { setOffline(true); }
  }, [venue, day]);
  useEffect(() => { refresh(); const id = setInterval(refresh, POLL_MS); return () => clearInterval(id); }, [refresh]);

  // ---- telas ----
  const [idx, setIdx] = useState(() => Math.max(0, SCREENS.indexOf(fixed || 'geral')));
  useEffect(() => { if (!auto) return undefined; const id = setInterval(() => setIdx((i) => (i + 1) % SCREENS.length), SCREEN_SECS * 1000); return () => clearInterval(id); }, [auto]);
  useEffect(() => {
    const fs = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'f') fs();
      if (e.key === 'ArrowRight' || e.key === ' ') setIdx((i) => (i + 1) % SCREENS.length);
      if (e.key === 'ArrowLeft') setIdx((i) => (i + SCREENS.length - 1) % SCREENS.length);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(1.6, Math.round((z + 0.05) * 100) / 100));
      if (e.key === '-') setZoom((z) => Math.max(0.6, Math.round((z - 0.05) * 100) / 100));
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', fs);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', fs); };
  }, []);
  const screen = fixed || SCREENS[idx];

  // ---- derivados ----
  const stats = data ? { total: data.total, services: data.services, per_hour: data.per_hour, extras: data.extras || [] } : null;
  // Chamadas reais + filas "só contagem" (cada senha entregue conta como atendimento no horário do lançamento).
  const calls = useMemo(() => (data ? allEvents(data.calls || [], data.issued_history || [], new Set(data.count_only || [])) : []), [data]);
  const countedTotal = useMemo(() => calls.filter((c) => c.counted).length, [calls]);
  const total = (data && data.total) || { issued: 0, called: 0, served: 0, absent: 0, pending_result: 0, in_service: 0, not_called: 0, avg_min: null, absent_rate: null };
  const series = useMemo(() => hourSeries(calls), [calls]);
  const hl = useMemo(() => (stats ? highlights(stats, calls) : null), [stats, calls]);
  const rows = useMemo(() => (stats ? placeRows(stats, stats.extras) : []), [stats]);
  const svcs = useMemo(() => (stats ? serviceRows(stats) : []), [stats]);
  const empty = data && !calls.length && !total.issued;

  const View = { geral: ViewGeral, servicos: ViewServicos, salas: ViewSalas, horas: ViewHoras }[screen];
  const viewProps = { total, series, hl, svcs, rows, calls, countedTotal };
  return (
    <div className={`tv tv-dark dash`} style={{ '--tv-zoom': zoom }}>
      <header className="tv-head">
        <div className="tv-brand"><span className="tv-mark"><img src={`${BP}/img/tce-mark.png`} alt="" /></span><div><b>TCE NA COMUNIDADE</b><small>{D.event.edition} · {venueName} · {cap(T.fmtDate(day, 'wdlong'))}{offline ? <span className="tv-live off"><i />sem conexão</span> : live ? <span className="tv-live"><i />ao vivo</span> : <span className="tv-live done"><i />resultado final</span>}</small></div></div>
        <div className="dash-nav" aria-label="Telas">{SCREENS.map((s, k) => <button key={s} className={s === screen ? 'on' : ''} onClick={() => setIdx(k)}>{TITLES[s]}</button>)}</div>
        <div className="tv-clock"><b>{clock.time}</b><small>{T.fmtDate(clock.date, 'wdlong')}</small></div>
      </header>
      <main className="dash-body" key={screen}>
        {!data ? <p className="cb-empty">{offline ? 'Sem conexão com o controle de senhas.' : 'Carregando…'}</p> : empty ? <p className="cb-empty">Ainda não há senhas registradas em {venueName} no dia {T.fmtDate(day, 'wd')}.</p> : <View {...viewProps} />}
      </main>
      {auto ? <div className="tv-progress" key={`p${idx}`} style={{ animationDuration: `${SCREEN_SECS}s` }} /> : null}
      <footer className="tv-foot"><span>{D.event.organizer} · {D.event.datesLabel}</span><span className="tv-foot-msg">Serviços gratuitos · {venueName} · {T.fmtDate(day, 'wd')}{data ? ` · atualizado ${fmtT(data.now)}` : ''}</span><span className="dash-dots">{SCREENS.map((s, k) => <i key={s} className={k === SCREENS.indexOf(screen) ? 'on' : ''} />)}</span></footer>
    </div>
  );
}

// ---------- peças ----------
function Kpi({ label, value, dec, suffix, sub, color, icon }) {
  return <div className="kpi" style={color ? { '--c': color } : undefined}><small>{icon ? <Icon name={icon} /> : null}{label}</small><b><Num value={value} dec={dec} suffix={suffix} /></b>{sub ? <em>{sub}</em> : null}</div>;
}
function Donut({ served, absent, pending, size = 100 }) {
  const tot = served + absent + pending; const r = 40; const parts = [[served, OK], [absent, NO], [pending, PEND]];
  let a = 0; const arcs = parts.filter(([n]) => n > 0).map(([n, c], k) => { const span = tot ? (360 * n) / tot : 0; const d = arcPath(50, 50, r, a + 0.6, Math.max(a + 0.6, a + span - 0.6)); a += span; return <path key={k} d={d} stroke={c} />; });
  return <svg viewBox="0 0 100 100" className="donut" style={{ width: `${size}%` }}>{tot ? (arcs.length === 1 ? <circle cx="50" cy="50" r={r} stroke={parts.find(([n]) => n > 0)[1]} /> : arcs) : <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,.12)" />}<text x="50" y="47" className="dn-big">{pct(served, tot)}%</text><text x="50" y="60" className="dn-small">entraram</text></svg>;
}
function HourBars({ series, byService }) {
  // Barras em HTML (não em SVG esticado): texto nunca deforma; alturas em % do máximo.
  const max = Math.max(1, ...series.map((x) => x.called));
  return (
    <div className="hbars">
      {series.map((x) => {
        const parts = byService ? Object.entries(byService[x.hour] || {}).sort((a, b) => b[1] - a[1]) : null;
        return (
          <div className="hb" key={x.hour}>
            <div className="hb-col" style={{ '--h': `${(100 * x.called) / max}%` }}>
              {x.called ? <b className="hb-val">{x.called}</b> : null}
              <div className="hb-stack" style={{ height: `${(100 * x.called) / max}%` }}>
                {parts ? parts.map(([sid, n]) => { const s = D.services.find((q) => q.id === sid); return <i key={sid} style={{ flex: n, background: s ? s.color : PEND }} title={`${s ? s.short : sid}: ${n}`} />; })
                  : <><i style={{ flex: x.served, background: OK }} /><i style={{ flex: Math.max(0, x.called - x.served), background: 'rgba(255,255,255,.16)' }} /></>}
              </div>
            </div>
            <small className="hb-ax">{x.hour}h</small>
          </div>
        );
      })}
    </div>
  );
}
function Spark({ per_hour, color }) {
  const hs = Object.keys(per_hour).map(Number); if (!hs.length) return <svg viewBox="0 0 100 30" className="spark" />;
  const from = Math.min(8, ...hs); const to = Math.max(17, ...hs); const pts = []; const max = Math.max(1, ...Object.values(per_hour));
  for (let h = from; h <= to; h++) pts.push([((h - from) / Math.max(1, to - from)) * 100, 28 - (26 * (per_hour[h] || 0)) / max]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return <svg viewBox="0 0 100 30" className="spark" preserveAspectRatio="none"><path d={`${d} L100 30 L0 30 Z`} fill={color} opacity=".18" /><path d={d} stroke={color} fill="none" strokeWidth=".9" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }} /></svg>;
}
function Rank({ title, icon, items, valueOf, labelOf, max, color }) {
  return (
    <section className="rank">
      <h3><Icon name={icon} />{title}</h3>
      <ol>{items.map((r, k) => { const v = valueOf(r); const w = max ? Math.max(2, (100 * v) / max) : 0; return (
        <li key={r.key || k} style={{ '--c': r.service ? r.service.color : color || '#60a5fa' }}><span className="pos">{k + 1}</span><span className="who"><b>{r.name}</b><small>{r.room}{r.service ? ` · ${r.service.short}` : ''}</small></span><span className="bar"><i style={{ width: `${w}%` }} /></span><span className="val">{labelOf(r)}</span></li>
      ); })}</ol>
      {!items.length ? <p className="sq-none">Sem dados suficientes.</p> : null}
    </section>
  );
}
function Highlight({ icon, label, value, sub, color }) { return <div className="hi" style={{ '--c': color || 'var(--accent)' }}><i><Icon name={icon} /></i><div><small>{label}</small><b>{value}</b>{sub ? <em>{sub}</em> : null}</div></div>; }

// ---------- telas ----------
const CountTag = ({ n }) => <span className="tag-count" title="Só contagem: senhas entregues contam como atendimentos">{I2('list')}contagem{n != null ? ` ${n}` : ''}</span>;
const I2 = (name) => <Icon name={name} />;
function ViewGeral({ total, series, hl, svcs, countedTotal }) {
  const tot = total.served + total.absent + total.pending_result;
  return (
    <div className="g-geral">
      <div className="kpis">
        <Kpi icon="ticket" label="Senhas entregues" value={total.issued} sub={`${svcs.length} serviços · ${hl ? hl.activeRooms : 0} salas ativas`} />
        <Kpi icon="megaphone" label="Chamadas" value={total.called} sub={[hl && hl.perHour ? `${hl.perHour} por hora` : '', countedTotal ? `${countedTotal} por contagem` : ''].filter(Boolean).join(' · ')} />
        <Kpi icon="check" label="Atendidas" value={total.served} color={OK} sub={[tot ? `${pct(total.served, tot)}% das chamadas` : '', countedTotal ? `${countedTotal} por contagem` : ''].filter(Boolean).join(' · ')} />
        <Kpi icon="x" label="Não compareceram" value={total.absent} color={NO} sub={total.absent_rate != null ? `${String(total.absent_rate).replace('.', ',')}% de falta` : ''} />
        <Kpi icon="hourglass" label="Tempo médio de atendimento" value={total.avg_min} dec={total.avg_min != null && total.avg_min < 10 ? 1 : 0} suffix=" min" sub={total.samples ? `em ${total.samples} atendimentos medidos` : 'sem medições'} />
        <Kpi icon="users" label="Ainda na fila" value={total.not_called} sub={total.in_service ? `${total.in_service} em atendimento agora` : 'entregues e não chamadas'} />
      </div>
      <div className="panel donut-panel"><h3><Icon name="layers" />Resultado das chamadas</h3><div className="donut-wrap"><Donut served={total.served} absent={total.absent} pending={total.pending_result} /><ul className="legend"><li><i style={{ background: OK }} />Entraram <b>{total.served}</b></li><li><i style={{ background: NO }} />Não compareceram <b>{total.absent}</b></li><li><i style={{ background: PEND }} />Sem registro <b>{total.pending_result}</b></li></ul></div></div>
      <div className="panel hours-panel"><h3><Icon name="clock" />Movimento por hora <small>chamadas{countedTotal ? ' (incl. contagem)' : ''} · <i className="lg ok" />entraram</small></h3>{series.length ? <HourBars series={series} /> : <p className="sq-none">Sem chamadas.</p>}</div>
      <div className="his">
        {hl && hl.peak ? <Highlight icon="arrowup" label="Pico de movimento" value={`${hl.peak.hour}h`} sub={`${hl.peak.called} chamadas na hora`} /> : null}
        {hl && hl.busiest ? <Highlight icon="star" label="Sala mais movimentada" value={hl.busiest.name} sub={`${hl.busiest.room} · ${hl.busiest.served} atendidas${hl.busiest.count_only ? ' (contagem)' : ''}`} color={hl.busiest.service.color} /> : null}
        {hl && hl.fastest ? <Highlight icon="sparkles" label="Atendimento mais rápido" value={fmtMin(hl.fastest.avg_min)} sub={`${hl.fastest.name} · ${hl.fastest.room}`} color={OK} /> : null}
        {hl && hl.first ? <Highlight icon="flag" label="Duração da ação" value={fmtMin(hl.spanMin)} sub={`${fmtT(hl.first.called_at)} → ${fmtT(hl.last.called_at)}`} color="#60a5fa" /> : null}
      </div>
    </div>
  );
}
function ViewServicos({ svcs }) {
  const n = svcs.length; const cols = n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
  return (
    <div className="g-servicos" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {svcs.map((s) => (
        <div className="svc" key={s.service.id} style={{ '--c': s.service.color }}>
          <div className="svc-h"><i><Icon name={s.service.icon} /></i><b>{s.service.title}</b><small>{s.active_rooms} de {s.rooms} salas com {s.count_rooms === s.rooms && s.rooms ? 'registro' : 'chamadas'}{s.count_rooms ? <> · <CountTag n={s.counted} /></> : null}</small></div>
          <div className="svc-big"><b><Num value={s.served} /></b><small>atendidas</small><span className="svc-rate" style={{ '--p': `${pct(s.served, s.called)}%` }}><i /><em>{s.count_rooms === s.rooms && s.rooms ? 'por contagem de senhas' : `${pct(s.served, s.called)}% das chamadas`}</em></span></div>
          <div className="svc-grid"><div><small>Entregues</small><b>{s.issued}</b></div><div><small>Chamadas</small><b>{s.called}</b></div><div><small>Faltas</small><b style={{ color: s.absent ? NO : undefined }}>{s.absent}</b></div><div><small>Tempo médio</small><b>{fmtMin(s.avg_min)}</b></div><div><small>Taxa de falta</small><b>{s.absent_rate != null ? `${String(s.absent_rate).replace('.', ',')}%` : '—'}</b></div><div><small>Na fila</small><b>{Math.max(0, s.issued - s.called)}</b></div></div>
          <Spark per_hour={s.per_hour} color={s.service.color} />
        </div>
      ))}
    </div>
  );
}
function ViewSalas({ rows, hl }) {
  const byServed = rows.filter((r) => r.called > 0).sort((a, b) => b.served - a.served || b.called - a.called).slice(0, 10);
  const fastest = rows.filter((r) => r.avg_min != null && r.samples >= 3).sort((a, b) => a.avg_min - b.avg_min).slice(0, 6);
  const absent = rows.filter((r) => r.called >= 5 && r.absent > 0).sort((a, b) => (b.absent_rate || 0) - (a.absent_rate || 0)).slice(0, 6);
  return (
    <div className="g-salas">
      <Rank title="Mais atendimentos" icon="star" items={byServed} max={byServed[0] ? byServed[0].served : 0} valueOf={(r) => r.served} labelOf={(r) => (r.count_only ? <><b>{r.served}</b><small> <CountTag /></small></> : <><b>{r.served}</b><small> de {r.called}</small></>)} />
      <div className="col2">
        <Rank title="Atendimento mais rápido" icon="sparkles" items={fastest} max={fastest.length ? Math.max(...fastest.map((r) => r.avg_min)) : 0} valueOf={(r) => r.avg_min} labelOf={(r) => <b>{fmtMin(r.avg_min)}</b>} />
        <Rank title="Mais faltas" icon="x" items={absent} max={100} valueOf={(r) => r.absent_rate || 0} labelOf={(r) => <><b>{r.absent_rate}%</b><small> · {r.absent}</small></>} />
        {hl && hl.slowest && hl.slowest.key !== (hl.fastest && hl.fastest.key) ? <p className="note"><Icon name="info" />Atendimento mais demorado: <b>{hl.slowest.name}</b> ({hl.slowest.room}), média de {fmtMin(hl.slowest.avg_min)}.</p> : null}
      </div>
    </div>
  );
}
function ViewHoras({ series, calls, hl, svcs }) {
  const byService = useMemo(() => hourByService(calls), [calls]);
  const first = hl && hl.first ? hl.first.called_at : null; const last = hl && hl.last ? hl.last.called_at : null;
  const span = first && last && last > first ? last - first : 1;
  const posOf = (t) => `${Math.min(100, Math.max(0, (100 * (t - first)) / span))}%`;
  const peakAt = hl && hl.peak ? calls.filter((c) => Math.floor(((c.called_at / 3600000) - 3) % 24) === hl.peak.hour)[0] : null;
  return (
    <div className="g-horas">
      <div className="panel big-hours"><h3><Icon name="clock" />Chamadas por hora, por serviço</h3>{series.length ? <HourBars series={series} byService={byService} /> : <p className="sq-none">Sem chamadas.</p>}<ul className="legend row">{svcs.map((s) => <li key={s.service.id}><i style={{ background: s.service.color }} />{s.service.short} <b>{s.called}</b></li>)}</ul></div>
      <div className="panel timeline"><h3><Icon name="flag" />Linha do tempo</h3>
        {first ? <div className="tl"><div className="tl-track"><i className="tl-line" />{calls.map((c) => <i key={c.id} className={`tl-dot ${c.status}`} style={{ left: posOf(c.called_at) }} />)}
          <div className="tl-mark start" style={{ left: posOf(first) }}><b>{fmtT(first)}</b><small>primeira chamada</small></div>
          {peakAt ? <div className="tl-mark peak" style={{ left: posOf(peakAt.called_at) }}><b>{hl.peak.hour}h</b><small>pico · {hl.peak.called} chamadas</small></div> : null}
          <div className="tl-mark end" style={{ left: posOf(last) }}><b>{fmtT(last)}</b><small>última chamada</small></div>
        </div></div> : <p className="sq-none">Sem chamadas.</p>}
        <div className="tl-kpis"><div><small>Duração</small><b>{hl ? fmtMin(hl.spanMin) : '—'}</b></div><div><small>Ritmo</small><b>{hl ? hl.perHour : 0}<small> chamadas/h</small></b></div><div><small>Hora mais calma</small><b>{series.length ? `${series.filter((x) => x.called > 0).sort((a, b) => a.called - b.called)[0]?.hour ?? '—'}h` : '—'}</b></div></div>
      </div>
    </div>
  );
}
