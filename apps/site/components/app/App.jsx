'use client';
/* App do público (celular/desktop) e, com a prop `kiosk`, o totem (quiosque por toque, mesmo visual do celular).
   Abre direto na programação do dia e do local usados por último (guardados no aparelho, sem cadastro), com busca
   única para cursos, serviços e locais. Rotas por hash; detalhe em folha; favoritos; lembrete (.ics); compartilhar.
   Modo quiosque (`kiosk = { local, entrada, idleMs, attract, zoom }`): layout do celular em qualquer largura (sem
   menu lateral), sem memória entre pessoas, volta ao início sozinho, tela de descanso, teclado na tela, links
   externos viram QR Code, origem das rotas do mapa fixa na posição do totem. */
import '@tce/core/css/map.css';
import '@tce/core/css/app.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClock, useHash } from '@/lib/hooks';
import { useAtendimento } from '@/lib/useAtendimento';
import Qr from '@/components/Qr';
import { T, D, I, VIEWS, SHEETS, AppCtx, hashOf, cap } from '@/components/app/ui';
import { ViewProgramacao, ViewBusca, ViewCursos, ViewMapa, ViewServicos, ViewLocais } from '@/components/app/views';
import { Sheet, SheetCurso, SheetServico, SheetLocal, SheetMapaFull, NotFound } from '@/components/app/sheets';

const LS_FAV = 'tce_favs';
const LS_PREFS = 'tce_prefs';
const LS_BASE = 'tce_base';
const OSK_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm'];
const readJson = (store, k, fb) => { try { return JSON.parse(store.getItem(k)) || fb; } catch { return fb; } };

export default function App({ kiosk = null }) {
  const clock = useClock(); const clockRef = useRef(clock); clockRef.current = clock;
  const live = useAtendimento(); // retrato do atendimento por dia definido na triagem (mapa, serviços, programação)
  const home = kiosk ? `programacao?local=${kiosk.local}` : 'programacao';
  const [hash, go] = useHash(home);
  const [ready, setReady] = useState(false);
  const [favs, setFavs] = useState(() => new Set());
  const [prefs, setPrefs] = useState({}); const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const [route, setRoute] = useState(null); const routeRef = useRef(route); routeRef.current = route;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openShifts, setOpenShifts] = useState(() => new Set());
  const [closing, setClosing] = useState(false);
  const [fullMap, setFullMap] = useState(null); const fullMapRef = useRef(fullMap); fullMapRef.current = fullMap;
  const [toastMsg, setToastMsg] = useState(null);
  const [oskEl, setOskEl] = useState(null); // input alvo do teclado na tela (só no quiosque)
  const [attract, setAttract] = useState(false); const attractRef = useRef(false); attractRef.current = attract;
  const baseRef = useRef({ view: 'programacao', p: new URLSearchParams() }); // tela por trás da folha
  const sheetPushed = useRef(false);
  const toastTimer = useRef(null);
  const idleTimer = useRef(null);

  // ---------- início: estado guardado no aparelho (não no quiosque, que é compartilhado) ----------
  useEffect(() => {
    if (!kiosk) {
      setFavs(new Set(readJson(localStorage, LS_FAV, [])));
      const pr = readJson(localStorage, LS_PREFS, {}); setPrefs(pr); prefsRef.current = pr;
      let base = null; try { base = sessionStorage.getItem(LS_BASE); } catch { /* */ }
      baseRef.current = { view: base && VIEWS[base] ? base : 'programacao', p: new URLSearchParams() };
    } else baseRef.current = { view: 'programacao', p: new URLSearchParams(`local=${kiosk.local}`) };
    setReady(true);
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }, [kiosk]);

  // ---------- rotas ----------
  useEffect(() => {
    if (!ready) return;
    const h = hash || home; const [path, qs] = h.split('?'); let [view, id] = path.split('/');
    if (view === 'inicio' || view === '') view = 'programacao';
    let p = new URLSearchParams(qs || '');
    if (SHEETS[view]) { setRoute({ view: baseRef.current.view, sheet: view, id, p: baseRef.current.p }); return; } // a folha abre por cima: a tela de trás não muda
    view = VIEWS[view] ? view : 'programacao';
    const c = clockRef.current; const pr = prefsRef.current;
    if (view === 'programacao') {
      const np = new URLSearchParams(p);
      if (kiosk) {
        // Quiosque: sem parâmetros, mostra o local do totem (não há memória de pessoa para pessoa).
        if (!np.has('local')) np.set('local', kiosk.local);
      } else {
        // Programação sem parâmetros: aplica a última escolha de local/dia guardada no aparelho.
        if (!np.has('local') && 'local' in pr && (pr.local === '' || D.venues[pr.local])) { if (pr.local) np.set('local', pr.local); }
        if (!np.has('d') && pr.d && pr.dOn === c.date && T.eventDays().includes(pr.d) && pr.d >= c.date) np.set('d', pr.d);
      }
      if (np.toString() !== p.toString()) { p = np; history.replaceState(null, '', hashOf('programacao', p)); }
      if (!kiosk) {
        // Guarda local/dia escolhidos.
        const local = p.get('local') || ''; const d = p.get('d');
        if (!(local && local !== 'todos' && !D.venues[local])) {
          const next = Object.assign({}, pr); let changed = false;
          if (next.local !== local) { next.local = local; changed = true; }
          if (d && (next.d !== d || next.dOn !== c.date)) { next.d = d; next.dOn = c.date; changed = true; }
          if (changed) { prefsRef.current = next; setPrefs(next); try { localStorage.setItem(LS_PREFS, JSON.stringify(next)); } catch { /* */ } }
        }
      }
    }
    baseRef.current = { view, p }; if (!kiosk) { try { sessionStorage.setItem(LS_BASE, view); } catch { /* */ } }
    setRoute({ view, sheet: null, id: null, p });
    setClosing(false);
  }, [hash, ready, kiosk, home]);
  // Rolagem ao topo quando muda de tela (não ao mudar só os parâmetros).
  const view = route ? route.view : null;
  useEffect(() => { if (view) window.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    if (!route) return;
    const base = `TCE na Comunidade · Oiapoque 2026${kiosk ? ' · Totem' : ''}`; let t = `${VIEWS[route.view].label} · ${base}`;
    if (route.sheet === 'curso') { const c = T.courseById(route.id); t = c ? `${T.title(c, true)} · ${base}` : base; }
    if (route.sheet === 'servico') { const s = T.serviceById(route.id); t = s ? `${s.title} · ${base}` : base; }
    document.title = t;
  }, [route, kiosk]);

  // ---------- ações ----------
  const setParam = useCallback((k, v, push) => { const r = routeRef.current; const p = new URLSearchParams(r.p); if (v == null || v === '') p.delete(k); else p.set(k, v); go(hashOf(r.view, p), !push); }, [go]);
  const nav = useCallback((target) => { const [v, qs] = target.split('?'); if (routeRef.current && routeRef.current.sheet) sheetPushed.current = false; go(`#${v}${qs ? `?${qs}` : ''}`); }, [go]);
  const openSheet = useCallback((kind, id) => { sheetPushed.current = true; location.hash = `#${kind}/${id}`; }, []);
  const closeSheet = useCallback(() => {
    if (fullMapRef.current) { setFullMap(null); return; }
    setClosing(true);
    setTimeout(() => { const r = routeRef.current; if (sheetPushed.current && history.length > 1) history.back(); else go(hashOf(r.view, r.p), true); sheetPushed.current = false; }, 150);
  }, [go]);
  const closeFullMap = useCallback(() => setFullMap(null), []);
  const toast = useCallback((msg, icon) => { setToastMsg({ msg, icon: icon || 'check' }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(null), 2600); }, []);
  const toggleFav = useCallback((id) => {
    setFavs((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id); toast('Removido dos meus cursos', 'bookmark'); } else { n.add(id); toast('Salvo em "Meus cursos"', 'bookmark'); } if (!kiosk) { try { localStorage.setItem(LS_FAV, JSON.stringify([...n])); } catch { /* */ } } return n; });
  }, [toast, kiosk]);
  const toggleShift = useCallback((k) => setOpenShifts((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);
  const share = useCallback(async (title, text, url) => {
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Link copiado para a área de transferência'); } catch { toast('Copie o endereço da barra do navegador', 'info'); }
  }, [toast]);
  const download = useCallback((name, content, type) => {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (fullMapRef.current) setFullMap(null); else if (routeRef.current && routeRef.current.sheet) closeSheet(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [closeSheet]);

  // ---------- quiosque: teclado na tela ----------
  const showOsk = useCallback((el) => { if (kiosk) setOskEl(el); }, [kiosk]);
  const hideOsk = useCallback(() => setOskEl((cur) => { if (cur && document.activeElement === cur) cur.blur(); return null; }), []);
  const oskKey = (k) => {
    const input = oskEl; if (!input) return;
    if (k === 'done') { hideOsk(); return; }
    const v = k === 'clear' ? '' : k === '⌫' ? input.value.slice(0, -1) : input.value + k;
    // Atualiza o input controlado pelo React (setter nativo + evento input).
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  useEffect(() => { if (kiosk && route && (route.sheet || fullMap)) hideOsk(); }, [kiosk, route, fullMap, hideOsk]);
  useEffect(() => { if (kiosk) hideOsk(); }, [kiosk, view, hideOsk]);

  // ---------- quiosque: volta ao início sozinho, tela de descanso, bloqueios ----------
  const resetKiosk = useCallback(() => {
    setFullMap(null); setFiltersOpen(false); setOpenShifts(new Set()); setFavs(new Set()); hideOsk();
    sheetPushed.current = false; setClosing(false);
    go(`#${kiosk.local ? `programacao?local=${kiosk.local}` : 'programacao'}`, true);
    window.scrollTo({ top: 0 });
  }, [kiosk, go, hideOsk]);
  const wake = useCallback(() => { if (!attractRef.current) return; attractRef.current = false; setAttract(false); resetKiosk(); }, [resetKiosk]);
  useEffect(() => {
    if (!kiosk) return undefined;
    const idle = () => { if (attractRef.current) return; resetKiosk(); if (kiosk.attract) setAttract(true); };
    const touch = () => { clearTimeout(idleTimer.current); idleTimer.current = setTimeout(idle, kiosk.idleMs); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    for (const ev of evs) window.addEventListener(ev, touch, { passive: true, capture: true });
    touch();
    const onKey = (e) => { if (e.key.toLowerCase() === 'f' && !e.target.closest('input')) { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); } };
    // Links que saem do app (inscrição na ESCON, TV…) não abrem no totem: a pessoa leva pelo QR Code.
    const onLink = (e) => { const a = e.target.closest('a[href]'); if (!a) return; const href = a.getAttribute('href') || ''; if (href.startsWith('#')) return; e.preventDefault(); e.stopPropagation(); toast('No totem este link não abre. Aponte a câmera do celular para o QR Code.', 'qr'); };
    const onCtx = (e) => e.preventDefault();
    const onDown = (e) => { if (!e.target.closest('.osk') && !e.target.closest('.search')) hideOsk(); };
    const reload = setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() < 2) location.reload(); }, 60000);
    document.addEventListener('keydown', onKey); document.addEventListener('click', onLink, true); window.addEventListener('contextmenu', onCtx); document.addEventListener('pointerdown', onDown);
    return () => { clearTimeout(idleTimer.current); clearInterval(reload); for (const ev of evs) window.removeEventListener(ev, touch, { capture: true }); document.removeEventListener('keydown', onKey); document.removeEventListener('click', onLink, true); window.removeEventListener('contextmenu', onCtx); document.removeEventListener('pointerdown', onDown); };
  }, [kiosk, resetKiosk, hideOsk, toast]);

  const ctx = useMemo(() => ({ clock, live, route, favs, prefs, kiosk, filtersOpen, setFiltersOpen, openShifts, toggleShift, go, setParam, nav, openSheet, closeSheet, toggleFav, share, download, toast, setFullMap, showOsk, hideOsk }),
    [clock, live, route, favs, prefs, kiosk, filtersOpen, openShifts, toggleShift, go, setParam, nav, openSheet, closeSheet, toggleFav, share, download, toast, showOsk, hideOsk]);

  if (!ready || !route) return <div id="app" className={`app ${kiosk ? 'kiosk' : ''}`}><div className="app-loading">Carregando…</div></div>;

  const Main = { programacao: ViewProgramacao, busca: ViewBusca, cursos: ViewCursos, servicos: ViewServicos, locais: ViewLocais, mapa: ViewMapa }[route.view];
  const navBtns = Object.entries(VIEWS).filter(([, v]) => !v.hidden).map(([k, v]) => <button key={k} className={route.view === k ? 'on' : ''} onClick={() => nav(k)} aria-label={v.label}><span className="nav-ico">{I(v.icon)}</span>{v.label}</button>);
  let sheet = null;
  if (route.sheet === 'curso') { const c = T.courseById(route.id); sheet = c ? <SheetCurso key={`c${c.id}`} c={c} onClose={closeSheet} /> : <NotFound msg="Curso não encontrado." onClose={closeSheet} />; }
  if (route.sheet === 'servico') { const s = T.serviceById(route.id); sheet = s ? <SheetServico key={`s${s.id}`} s={s} onClose={closeSheet} /> : <NotFound msg="Serviço não encontrado." onClose={closeSheet} />; }
  if (route.sheet === 'local') { const v = D.venues[route.id]; sheet = v ? <SheetLocal key={`l${v.id}`} v={v} onClose={closeSheet} /> : <NotFound msg="Local não encontrado." onClose={closeSheet} />; }
  // QR do quiosque: abre no celular a mesma tela que está no totem (curso, serviço, mapa…).
  const qrHash = route.sheet ? `${route.sheet}/${route.id}` : hashOf(route.view, route.p).slice(1);
  const venue = kiosk ? D.venues[kiosk.local] : null;

  return (
    <AppCtx.Provider value={ctx}>
      <div id="app" className={`app ${kiosk ? 'kiosk' : ''} ${oskEl ? 'osk-open' : ''}`} style={kiosk && kiosk.zoom !== 1 ? { fontSize: `${Math.round(16 * kiosk.zoom * 10) / 10}px` } : undefined}>
        <header className="app-head"><button className="app-brand" onClick={() => nav(home)}><span className="logo-chip"><img src="img/tce-mark.png" alt="" /></span><span><b>{D.event.name}</b><small>{D.event.edition} · {kiosk && venue ? venue.short : D.event.placeShort}</small></span></button><div className="app-head-right">{T.isSimulated() ? <span className="demo-pill">demo</span> : null}{kiosk ? <div className="kiosk-qr" aria-label="Abrir esta tela no celular"><Qr text={T.appUrl(qrHash)} margin={1} /><small>{I('phone')}Leve no<br />celular</small></div> : null}<div className="app-clock" id="clock">{clock.time}<small>{T.fmtDate(clock.date, 'wdlong')}</small></div><button className="icon-btn head-search" onClick={() => nav('busca')} aria-label="Buscar">{I('search')}</button></div></header>
        <div className="app-body">{kiosk ? null : <nav className="side-nav" id="side-nav">{navBtns}<div className="sn-foot">{D.event.organizerShort}<br />{D.event.datesLabel}<br /><a href="tv.html">Modo TV</a></div></nav>}<main className="app-main" id="main"><Main key={route.view} /></main></div>
        <nav className="bottom-nav" id="bottom-nav">{navBtns}</nav>
        <div id="sheet">
          {sheet ? <Sheet key={`${route.sheet}/${route.id}`} onClose={closeSheet} closing={closing}>{sheet}</Sheet> : null}
          {fullMap ? <Sheet key="mapfull" onClose={closeFullMap}><SheetMapaFull venue={fullMap} onClose={closeFullMap} /></Sheet> : null}
        </div>
        <div id="toast">{toastMsg ? <div className="toast">{I(toastMsg.icon)}{toastMsg.msg}</div> : null}</div>
        {kiosk && oskEl ? (
          <div className="osk" role="group" aria-label="Teclado" onPointerDown={(e) => e.preventDefault()}>
            {OSK_ROWS.map((r, i) => <div key={i} className="osk-row">{[...r].map((k) => <button key={k} type="button" onClick={() => oskKey(k)}>{k}</button>)}{i === OSK_ROWS.length - 1 ? <button type="button" className="wide" aria-label="Apagar" onClick={() => oskKey('⌫')}>{I('back')}</button> : null}</div>)}
            <div className="osk-row"><button type="button" className="wide danger" onClick={() => oskKey('clear')}>Limpar</button><button type="button" className="space" onClick={() => oskKey(' ')}>espaço</button><button type="button" className="wide primary" onClick={() => oskKey('done')}>{I('check')}Pronto</button></div>
          </div>
        ) : null}
        {kiosk && attract ? (
          <button className="kiosk-attract" onClick={wake} aria-label="Toque para começar">
            <img src="img/tce-logo.png" alt="" />
            <b>{D.event.name}</b><span>{D.event.edition} · {venue ? venue.name : D.event.place}</span>
            <em>{clock.time}<small>{cap(T.fmtDate(clock.date, 'wdlong'))}</small></em>
            <span className="cta">{I('phone')}Toque na tela para ver cursos, serviços e o mapa</span>
            <small className="org">{D.event.organizerShort} · {D.event.datesLabel}</small>
          </button>
        ) : null}
      </div>
    </AppCtx.Provider>
  );
}
