'use client';
/* TV das senhas (16:9, lida a distância). Mesmo esqueleto da TV "pátio" do Painel Escolar Digital
   (cabeçalho com marca + relógio, quadro fixo em tela cheia no visual do "horários full", QR e rodapé),
   mas o quadro é de SALAS × SENHAS: um cartão por sala com a senha atual em destaque máximo, o serviço,
   o estado (chamando / em atendimento) e quantas pessoas aguardam; à direita, as últimas chamadas.
   Nova chamada: sobreposição grande por alguns segundos (+ voz com ?voz=1).
   Parâmetros: ?local=jn ?dia=AAAA-MM-DD ?grupo=entrada|fundos ?salas=03,04 ?servicos=pilar-1 ?voz=1 ?zoom=1.1 ?pagina=10 ?t=&d=
   Dia mostrado = o do app de atendimento (dia de serviços de hoje, senão o próximo). Atualização em tempo real por SSE.
   Teclas: F tela cheia · +/-/0 escala. Recarrega às 4h e se ficar sem resposta por muito tempo. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import Icon from '@/components/Icon';
import { selectQueues } from '@/lib/tv-grupos';

const D = T.D;
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const POLL_MS = 4000;
const FLASH_MS = 9000;
const PAGE_SECS_DEFAULT = 10;
const MAX_PER_PAGE = { landscape: 16, portrait: 8 };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtT = (ms) => (ms ? T.partsOf(new Date(ms)).time : '');
const asScale = (v) => { const n = Number(v); return n > 0 ? (n > 5 ? n / 100 : n) : 0; };
const roomWord = (p) => (p.kind === 'sala' ? 'Sala' : p.kind === 'tenda' ? 'Tenda' : p.num ? 'Ambiente' : '');
const roomBig = (p) => (p.num ? `${roomWord(p)} ${p.num}` : p.name);
const speakable = (p) => (p.num ? `${roomWord(p).toLowerCase()} ${Number(p.num)}` : p.name);

export default function TvSenhas() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="tv tv-dark"><div className="tv-msg"><div className="spinner" /><p>Carregando o painel…</p></div></div>;
  return <Board />;
}

function Board() {
  const sp = useMemo(() => new URLSearchParams(location.search), []);
  const [clock, setClock] = useState(() => T.now());
  useEffect(() => { const id = setInterval(() => setClock(T.now()), 1000); return () => clearInterval(id); }, []);
  // Dia mostrado = o mesmo do app de atendimento: o dia de serviços de hoje; senão o próximo (?dia= força outro).
  const day = useMemo(() => { const q = sp.get('dia'); if (q && T.serviceDayOf(q)) return q; const d = T.serviceDayOf(clock.date) || T.nextServiceDay(clock.date) || T.serviceDays()[T.serviceDays().length - 1]; return d ? d.date : clock.date; }, [sp, clock.date]);
  const sel = useMemo(() => selectQueues(sp, day), [sp, day]);
  const venue = sel.venue; const venueName = D.venues[venue] ? D.venues[venue].name : venue;
  const voice = sp.get('voz') === '1';
  const [zoom, setZoom] = useState(() => Math.min(1.6, Math.max(0.6, asScale(sp.get('zoom')) || 1)));
  const pageSecs = Math.min(60, Math.max(4, Number(sp.get('pagina')) || PAGE_SECS_DEFAULT));
  const [portrait, setPortrait] = useState(false);
  useEffect(() => { const m = () => setPortrait(window.innerHeight > window.innerWidth); m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m); }, []);

  // ---- dados: polling leve do quadro público ----
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const lastOk = useRef(Date.now());
  const take = useCallback((j) => { lastOk.current = Date.now(); setOffline(false); setData((prev) => (prev && JSON.stringify(prev.places) === JSON.stringify(j.places) && JSON.stringify(prev.recent) === JSON.stringify(j.recent) ? Object.assign(prev, { now: j.now }) : j)); }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BP}/api/tv?local=${encodeURIComponent(venue)}&dia=${day}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(String(r.status));
      take(await r.json());
    } catch { setOffline(true); }
  }, [venue, day, take]);
  // Tempo real: SSE empurra o quadro a cada mudança; o polling fica como rede de segurança (e cobre proxies sem SSE).
  useEffect(() => {
    refresh(); const id = setInterval(refresh, POLL_MS);
    let es = null;
    try {
      es = new EventSource(`${BP}/api/tv/stream?local=${encodeURIComponent(venue)}&dia=${day}`);
      es.addEventListener('board', (e) => { try { take(JSON.parse(e.data)); } catch { /* ignora */ } });
      es.addEventListener('ping', () => { lastOk.current = Date.now(); });
    } catch { /* navegador sem EventSource: só polling */ }
    return () => { clearInterval(id); if (es) es.close(); };
  }, [refresh, take, venue, day]);

  // ---- vigília: recarga de madrugada, travamento, teclas ----
  useEffect(() => {
    const wd = setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() < 2) location.reload(); if (Date.now() - lastOk.current > 15 * 60 * 1000) location.reload(); }, 60000);
    const fs = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'f') fs();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(1.6, Math.round((z + 0.05) * 100) / 100));
      if (e.key === '-') setZoom((z) => Math.max(0.6, Math.round((z - 0.05) * 100) / 100));
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', fs);
    return () => { clearInterval(wd); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', fs); };
  }, []);

  // ---- linhas do quadro: cada fila selecionada com a situação vinda do banco ----
  const rows = useMemo(() => {
    const byPlace = new Map();
    for (const p of (data && data.places) || []) { const cur = byPlace.get(p.place_id); if (!cur || ((p.current && p.current.called_at) || 0) > ((cur.current && cur.current.called_at) || 0)) byPlace.set(p.place_id, Object.assign({}, p, { waiting: (cur ? cur.waiting : 0) + p.waiting })); }
    return sel.queues.map((q) => ({ key: q.place.id, place: q.place, service: q.service, stat: byPlace.get(q.place.id) || null }));
  }, [sel, data]);
  const selected = useMemo(() => new Set(rows.map((r) => r.key)), [rows]);
  const recent = useMemo(() => ((data && data.recent) || []).filter((c) => selected.has(c.place_id)), [data, selected]);
  const waitingTotal = rows.reduce((n, r) => n + (r.stat ? r.stat.waiting : 0), 0);
  const inService = rows.filter((r) => r.stat && r.stat.current && r.stat.current.status === 'served' && r.stat.in_service > 0).length;

  // ---- nova chamada: sobreposição + voz ----
  const [flash, setFlash] = useState(null);
  const seen = useRef(null);
  useEffect(() => {
    if (!recent.length) return;
    const top = recent[0];
    if (seen.current == null) { seen.current = top.id; return; } // primeira carga: não anuncia o passado
    if (top.id <= seen.current) return;
    seen.current = top.id;
    if (top.ticket == null || Date.now() - top.called_at > 60000) return; // chamada antiga (ex.: recarga) não pisca
    const p = T.placeInfo(top.place_id); const s = D.services.find((x) => x.id === top.service_id);
    setFlash({ id: top.id, ticket: top.ticket, place: p, service: s, until: Date.now() + FLASH_MS });
    if (voice && window.speechSynthesis && p) {
      try { const u = new SpeechSynthesisUtterance(`Senha ${top.ticket}. ${speakable(p)}${s ? `, ${s.short}` : ''}.`); u.lang = 'pt-BR'; u.rate = 0.95; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch { /* sem voz */ }
    }
  }, [recent, voice]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now())); return () => clearTimeout(id); }, [flash]);

  // ---- páginas (quando há mais salas do que cabe) ----
  const per = MAX_PER_PAGE[portrait ? 'portrait' : 'landscape'];
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const [cycle, setCycle] = useState(0);
  useEffect(() => { if (pages <= 1) { setCycle(0); return; } const id = setInterval(() => setCycle((c) => c + 1), pageSecs * 1000); return () => clearInterval(id); }, [pages, pageSecs]);
  const page = pages > 1 ? cycle % pages : 0;
  const shown = rows.slice(page * per, page * per + per);
  const n = shown.length;
  const cols = portrait ? (n <= 1 ? 1 : 2) : n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rowsN = Math.max(1, Math.ceil(n / cols));
  // Escala do texto dos cartões pelo número de linhas (o número da senha cresce com a altura do cartão, via cqh no CSS).
  const fs = Math.round(Math.min(1.5, Math.max(0.9, 2.8 / rowsN)) * 100) / 100;

  const sd = T.serviceDayOf(clock.date);
  const subtitle = [D.event.edition, venueName, sd ? 'Serviços gratuitos · hoje' : day !== clock.date ? `Serviços gratuitos · ${T.fmtDate(day, 'wd')}` : 'Serviços gratuitos'].join(' · ');
  const qr = useMemo(() => T.qrSvg(T.appUrl(`servicos?dia=${day}`), { margin: 1 }), [day]);
  const stateOf = (r) => {
    const c = r.stat && r.stat.current; if (!c || c.ticket == null) return { k: 'idle', label: r.stat && r.stat.called ? 'sem senha' : 'aguardando início' };
    if (c.status === 'called') return { k: 'calling', label: 'chamando' };
    if (c.status === 'served') return r.stat.in_service > 0 ? { k: 'serving', label: 'em atendimento' } : { k: 'done', label: 'atendida' };
    if (c.status === 'absent') return { k: 'absent', label: 'não compareceu' };
    return { k: 'idle', label: '' };
  };
  const latestId = recent[0] ? recent[0].id : null;

  return (
    <div className={`tv tv-dark sq ${portrait ? 'portrait' : 'landscape'}`} style={{ '--tv-zoom': zoom }}>
      <header className="tv-head">
        <div className="tv-brand"><span className="tv-mark"><img src={`${BP}/img/tce-mark.png`} alt="" /></span><div><b>TCE NA COMUNIDADE</b><small>{subtitle}{offline ? <span className="tv-live off"><i />sem conexão</span> : T.isSimulated() ? <span className="tv-live demo"><i />demonstração</span> : <span className="tv-live"><i />ao vivo</span>}</small></div></div>
        <div className="tv-clock"><b>{clock.time}</b><small>{T.fmtDate(clock.date, 'wdlong')}</small></div>
      </header>

      <div className="tv-body">
        <main className="sq-board">
          <div className="mb-head">
            <span className="cb-grade"><b>Senhas</b><small><Icon name="ticket" />{sel.title || 'Todas as salas'}{sel.unknown.length ? ` · ignorado: ${sel.unknown.join(', ')}` : ''}</small></span>
            <span className="cb-head-right">
              {inService ? <span className="cb-period">{inService} em atendimento</span> : null}
              {waitingTotal ? <span className="cb-period">{waitingTotal} aguardando</span> : null}
              {pages > 1 ? <span className="cb-page" aria-label={`Página ${page + 1} de ${pages}`}>{Array.from({ length: pages }, (_, k) => <i key={k} className={k === page ? 'on' : ''}>{k + 1}</i>)}</span> : null}
            </span>
          </div>
          {!rows.length ? <p className="cb-empty">{data ? 'Nenhuma sala selecionada para esta TV. Confira os parâmetros ?salas=, ?servicos= ou ?grupo=.' : offline ? 'Sem conexão com o controle de senhas.' : 'Carregando…'}</p> : (
            <div className="sq-grid" key={page} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowsN}, minmax(0, 1fr))`, '--fs': fs }}>
              {shown.map((r) => { const st = stateOf(r); const c = r.stat && r.stat.current; const isLatest = c && latestId != null && c.id === latestId && Date.now() - c.called_at < 60000;
                return (
                  <div key={r.key} className={`sq-card ${st.k} ${isLatest ? 'latest' : ''}`} style={{ '--c': r.service.color }}>
                    <div className="sq-top"><b className="sq-roomname">{roomBig(r.place)}</b><span className="sq-svc" title={r.service.short}><Icon name={r.service.icon} /><span>{r.service.short}</span></span></div>
                    <div className="sq-mid"><b className="sq-num">{c && c.ticket != null ? c.ticket : '—'}</b></div>
                    <div className="sq-bot"><div className="sq-line"><small className="sq-place">{r.place.num ? r.place.name : roomWord(r.place)}</small>{r.stat && r.stat.issued ? <span className="sq-wait">{r.stat.waiting} aguardando</span> : null}</div><span className={`sq-state ${st.k}`}>{st.k === 'calling' ? <Icon name="megaphone" /> : st.k === 'serving' ? <Icon name="check" /> : null}{st.label}{c && st.k !== 'idle' ? <em> · {fmtT(c.status_at || c.called_at)}</em> : null}</span></div>
                  </div>
                ); })}
            </div>
          )}
          {pages > 1 ? <div className="tv-progress" key={`p${page}`} style={{ animationDuration: `${pageSecs}s` }} /> : null}
        </main>

        <aside className="sq-side">
          <div className="sq-recent">
            <span className="mb-title"><Icon name="list" />Chamadas anteriores</span>
            {recent.length > 1 ? <ol>{recent.slice(1, portrait ? 4 : 6).map((c) => { const p = T.placeInfo(c.place_id); const s = D.services.find((x) => x.id === c.service_id); return (
              <li key={c.id} className={c.status} style={{ '--c': s ? s.color : '#94a3b8' }}><b>{c.ticket ?? '—'}</b><span><strong>{p ? roomBig(p) : c.place_id}</strong><small>{s ? s.short : ''}</small></span><em>{fmtT(c.called_at)}</em></li>
            ); })}</ol> : <p className="sq-none">{recent.length ? 'Só uma chamada até agora.' : 'Nenhuma chamada ainda hoje.'}</p>}
          </div>
          {(() => {
            const c = recent[0]; if (!c) return <div className="sq-now idle"><small className="sq-now-k"><Icon name="ticket" />Senha atual</small><b className="sq-now-num">—</b><div className="sq-now-room"><b>Aguardando</b><span>a primeira chamada do dia</span></div></div>;
            const p = T.placeInfo(c.place_id); const s = D.services.find((x) => x.id === c.service_id);
            const k = c.status === 'called' ? 'calling' : c.status === 'served' ? 'serving' : c.status === 'absent' ? 'absent' : 'done';
            const label = k === 'calling' ? 'chamando' : k === 'serving' ? 'em atendimento' : k === 'absent' ? 'não compareceu' : 'atendida';
            return (
              <div className={`sq-now ${k}`} style={{ '--c': s ? s.color : '#fbbf24' }}>
                <small className="sq-now-k"><Icon name={k === 'calling' ? 'megaphone' : 'ticket'} />Senha atual · <em>{label}</em></small>
                <b className="sq-now-num">{c.ticket ?? '—'}</b>
                <div className="sq-now-room"><b>{p ? roomBig(p) : c.place_id}</b><span>{p && p.num ? p.name : ''}</span></div>
                <div className="sq-now-svc">{s ? <><Icon name={s.icon} />{s.short}</> : null}<em>{fmtT(c.called_at)}</em></div>
              </div>
            );
          })()}
        </aside>
      </div>

      <footer className="tv-foot"><span>{D.event.organizer} · {D.event.datesLabel}</span><span className="tv-foot-msg">Fique atento ao número da sua senha e à sala · atendimento por ordem de chegada</span><span className="tv-qr mini"><span className="tv-qr-svg" dangerouslySetInnerHTML={{ __html: qr }} /><p><Icon name="phone" />Serviços, salas e mapa<br />no celular</p></span></footer>

      {flash ? (
        <div className="sq-flash" role="alert" key={flash.id} style={{ '--c': flash.service ? flash.service.color : '#fbbf24' }}>
          <div className="sq-flash-box">
            <small><Icon name="megaphone" />Chamando agora{flash.service ? ` · ${flash.service.short}` : ''}</small>
            <div className="sq-flash-row"><span className="sq-flash-num"><em>senha</em><b>{flash.ticket}</b></span><Icon name="right" className="sq-flash-arrow" /><span className="sq-flash-room"><b>{flash.place ? roomBig(flash.place) : flash.place_id}</b><small>{flash.place && flash.place.num ? flash.place.name : ''}</small></span></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
