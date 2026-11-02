'use client';
/* App do público (celular/desktop). Abre direto na programação do dia e do local usados por último
   (guardados no aparelho, sem cadastro), com busca única para cursos, serviços e locais.
   Rotas por hash; detalhe em folha; favoritos; lembrete (.ics); compartilhar. Porta em React de js/app.js. */
import '@tce/core/css/map.css';
import '@tce/core/css/app.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClock, useHash } from '@/lib/hooks';
import { T, D, I, VIEWS, SHEETS, AppCtx, hashOf } from '@/components/app/ui';
import { ViewProgramacao, ViewBusca, ViewCursos, ViewMapa, ViewServicos, ViewLocais } from '@/components/app/views';
import { Sheet, SheetCurso, SheetServico, SheetLocal, SheetMapaFull, NotFound } from '@/components/app/sheets';

const LS_FAV = 'tce_favs';
const LS_PREFS = 'tce_prefs';
const LS_BASE = 'tce_base';
const readJson = (store, k, fb) => { try { return JSON.parse(store.getItem(k)) || fb; } catch { return fb; } };

export default function AppPage() {
  const clock = useClock(); const clockRef = useRef(clock); clockRef.current = clock;
  const [hash, go] = useHash('programacao');
  const [ready, setReady] = useState(false);
  const [favs, setFavs] = useState(() => new Set());
  const [prefs, setPrefs] = useState({}); const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const [route, setRoute] = useState(null); const routeRef = useRef(route); routeRef.current = route;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openShifts, setOpenShifts] = useState(() => new Set());
  const [closing, setClosing] = useState(false);
  const [fullMap, setFullMap] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const baseRef = useRef({ view: 'programacao', p: new URLSearchParams() }); // tela por trás da folha
  const sheetPushed = useRef(false);
  const toastTimer = useRef(null);

  // ---------- início: estado guardado no aparelho ----------
  useEffect(() => {
    setFavs(new Set(readJson(localStorage, LS_FAV, [])));
    const pr = readJson(localStorage, LS_PREFS, {}); setPrefs(pr); prefsRef.current = pr;
    let base = null; try { base = sessionStorage.getItem(LS_BASE); } catch { /* */ }
    baseRef.current = { view: base && VIEWS[base] ? base : 'programacao', p: new URLSearchParams() };
    setReady(true);
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }, []);

  // ---------- rotas ----------
  useEffect(() => {
    if (!ready) return;
    const h = hash || 'programacao'; const [path, qs] = h.split('?'); let [view, id] = path.split('/');
    if (view === 'inicio' || view === '') view = 'programacao';
    let p = new URLSearchParams(qs || '');
    if (SHEETS[view]) { setRoute({ view: baseRef.current.view, sheet: view, id, p: baseRef.current.p }); return; } // a folha abre por cima: a tela de trás não muda
    view = VIEWS[view] ? view : 'programacao';
    const c = clockRef.current; const pr = prefsRef.current;
    if (view === 'programacao') {
      // Programação sem parâmetros: aplica a última escolha de local/dia guardada no aparelho.
      const np = new URLSearchParams(p);
      if (!np.has('local') && 'local' in pr && (pr.local === '' || D.venues[pr.local])) { if (pr.local) np.set('local', pr.local); }
      if (!np.has('d') && pr.d && pr.dOn === c.date && T.eventDays().includes(pr.d) && pr.d >= c.date) np.set('d', pr.d);
      if (np.toString() !== p.toString()) { p = np; history.replaceState(null, '', hashOf('programacao', p)); }
      // Guarda local/dia escolhidos.
      const local = p.get('local') || ''; const d = p.get('d');
      if (!(local && local !== 'todos' && !D.venues[local])) {
        const next = Object.assign({}, pr); let changed = false;
        if (next.local !== local) { next.local = local; changed = true; }
        if (d && (next.d !== d || next.dOn !== c.date)) { next.d = d; next.dOn = c.date; changed = true; }
        if (changed) { prefsRef.current = next; setPrefs(next); try { localStorage.setItem(LS_PREFS, JSON.stringify(next)); } catch { /* */ } }
      }
    }
    baseRef.current = { view, p }; try { sessionStorage.setItem(LS_BASE, view); } catch { /* */ }
    setRoute({ view, sheet: null, id: null, p });
    setClosing(false);
  }, [hash, ready]);
  // Rolagem ao topo quando muda de tela (não ao mudar só os parâmetros).
  const view = route ? route.view : null;
  useEffect(() => { if (view) window.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    if (!route) return;
    const base = 'TCE na Comunidade · Oiapoque 2026'; let t = `${VIEWS[route.view].label} · ${base}`;
    if (route.sheet === 'curso') { const c = T.courseById(route.id); t = c ? `${T.title(c, true)} · ${base}` : base; }
    if (route.sheet === 'servico') { const s = T.serviceById(route.id); t = s ? `${s.title} · ${base}` : base; }
    document.title = t;
  }, [route]);

  // ---------- ações ----------
  const setParam = useCallback((k, v, push) => { const r = routeRef.current; const p = new URLSearchParams(r.p); if (v == null || v === '') p.delete(k); else p.set(k, v); go(hashOf(r.view, p), !push); }, [go]);
  const nav = useCallback((target) => { const [v, qs] = target.split('?'); if (routeRef.current && routeRef.current.sheet) sheetPushed.current = false; go(`#${v}${qs ? `?${qs}` : ''}`); }, [go]);
  const openSheet = useCallback((kind, id) => { sheetPushed.current = true; location.hash = `#${kind}/${id}`; }, []);
  const closeSheet = useCallback(() => {
    if (fullMap) { setFullMap(null); return; }
    setClosing(true);
    setTimeout(() => { const r = routeRef.current; if (sheetPushed.current && history.length > 1) history.back(); else go(hashOf(r.view, r.p), true); sheetPushed.current = false; }, 150);
  }, [fullMap, go]);
  const closeFullMap = useCallback(() => setFullMap(null), []);
  const toast = useCallback((msg, icon) => { setToastMsg({ msg, icon: icon || 'check' }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(null), 2600); }, []);
  const toggleFav = useCallback((id) => {
    setFavs((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id); toast('Removido dos meus cursos', 'bookmark'); } else { n.add(id); toast('Salvo em "Meus cursos"', 'bookmark'); } try { localStorage.setItem(LS_FAV, JSON.stringify([...n])); } catch { /* */ } return n; });
  }, [toast]);
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
    const onKey = (e) => { if (e.key === 'Escape') { if (fullMap) setFullMap(null); else if (routeRef.current && routeRef.current.sheet) closeSheet(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [fullMap, closeSheet]);

  const ctx = useMemo(() => ({ clock, route, favs, prefs, filtersOpen, setFiltersOpen, openShifts, toggleShift, go, setParam, nav, openSheet, closeSheet, toggleFav, share, download, toast, setFullMap }),
    [clock, route, favs, prefs, filtersOpen, openShifts, toggleShift, go, setParam, nav, openSheet, closeSheet, toggleFav, share, download, toast]);

  if (!ready || !route) return <div id="app" className="app"><div className="app-loading">Carregando…</div></div>;

  const Main = { programacao: ViewProgramacao, busca: ViewBusca, cursos: ViewCursos, servicos: ViewServicos, locais: ViewLocais, mapa: ViewMapa }[route.view];
  const navBtns = Object.entries(VIEWS).filter(([, v]) => !v.hidden).map(([k, v]) => <button key={k} className={route.view === k ? 'on' : ''} onClick={() => nav(k)} aria-label={v.label}><span className="nav-ico">{I(v.icon)}</span>{v.label}</button>);
  let sheet = null;
  if (route.sheet === 'curso') { const c = T.courseById(route.id); sheet = c ? <SheetCurso key={`c${c.id}`} c={c} onClose={closeSheet} /> : <NotFound msg="Curso não encontrado." onClose={closeSheet} />; }
  if (route.sheet === 'servico') { const s = T.serviceById(route.id); sheet = s ? <SheetServico key={`s${s.id}`} s={s} onClose={closeSheet} /> : <NotFound msg="Serviço não encontrado." onClose={closeSheet} />; }
  if (route.sheet === 'local') { const v = D.venues[route.id]; sheet = v ? <SheetLocal key={`l${v.id}`} v={v} onClose={closeSheet} /> : <NotFound msg="Local não encontrado." onClose={closeSheet} />; }

  return (
    <AppCtx.Provider value={ctx}>
      <div id="app" className="app">
        <header className="app-head"><button className="app-brand" onClick={() => nav('programacao')}><span className="logo-chip"><img src="img/tce-mark.png" alt="" /></span><span><b>{D.event.name}</b><small>{D.event.edition} · {D.event.placeShort}</small></span></button><div className="app-head-right">{T.isSimulated() ? <span className="demo-pill">demo</span> : null}<div className="app-clock" id="clock">{clock.time}<small>{T.fmtDate(clock.date, 'wdlong')}</small></div><button className="icon-btn head-search" onClick={() => nav('busca')} aria-label="Buscar">{I('search')}</button></div></header>
        <div className="app-body"><nav className="side-nav" id="side-nav">{navBtns}<div className="sn-foot">{D.event.organizerShort}<br />{D.event.datesLabel}<br /><a href="tv.html">Modo TV</a></div></nav><main className="app-main" id="main"><Main key={route.view} /></main></div>
        <nav className="bottom-nav" id="bottom-nav">{navBtns}</nav>
        <div id="sheet">
          {sheet ? <Sheet key={`${route.sheet}/${route.id}`} onClose={closeSheet} closing={closing}>{sheet}</Sheet> : null}
          {fullMap ? <Sheet key="mapfull" onClose={closeFullMap}><SheetMapaFull venue={fullMap} onClose={closeFullMap} /></Sheet> : null}
        </div>
        <div id="toast">{toastMsg ? <div className="toast">{I(toastMsg.icon)}{toastMsg.msg}</div> : null}</div>
      </div>
    </AppCtx.Provider>
  );
}
