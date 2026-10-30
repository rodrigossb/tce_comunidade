/* App do público (celular/desktop). Abre direto na programação do dia e do local usados por último
   (guardados no aparelho, sem cadastro), com busca única para cursos, serviços e locais.
   Rotas por hash; detalhe em folha; favoritos; lembrete (.ics); compartilhar. Tudo vem de js/data.js. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc;
  const root = document.getElementById('app');
  // Modo totem (totem.html): aparelho compartilhado em pé — sem memória, sem favoritos/compartilhar, QR em destaque.
  const TOTEM = window.TCE_TOTEM || null;
  const VIEWS = {
    programacao: { label: 'Programação', icon: 'calendar' },
    busca: { label: 'Buscar', icon: 'search' },
    cursos: { label: 'Cursos', icon: 'graduation' },
    servicos: { label: 'Serviços', icon: 'handshake' },
    locais: { label: 'Locais', icon: 'pin' },
  };
  const SHEETS = { curso: 'cursos', servico: 'servicos', local: 'locais' };
  const LS_FAV = 'tce_favs';
  const LS_PREFS = 'tce_prefs';
  const LS_BASE = 'tce_base';

  const favs = new Set((() => { try { return JSON.parse(localStorage.getItem(LS_FAV)) || []; } catch { return []; } })());
  const saveFavs = () => { try { localStorage.setItem(LS_FAV, JSON.stringify([...favs])); } catch { /* sem storage */ } };
  const prefs = TOTEM ? { local: TOTEM.local || '' } : (() => { try { return JSON.parse(localStorage.getItem(LS_PREFS)) || {}; } catch { return {}; } })();
  const savePrefs = () => { if (TOTEM) return; try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); } catch { /* sem storage */ } };
  let clock = T.now();
  let lastBase = (() => { try { return sessionStorage.getItem(LS_BASE); } catch { return null; } })() || 'programacao';
  let route = null;
  let filtersOpen = false;
  let sheetPushed = false;
  const openShifts = new Set(); // turnos encerrados que o usuário abriu

  // ---------- rotas ----------
  function parse() {
    const h = decodeURIComponent(location.hash.slice(1) || 'programacao');
    const [path, qs] = h.split('?');
    let [view, id] = path.split('/');
    if (view === 'inicio' || view === '') view = 'programacao';
    const p = new URLSearchParams(qs || '');
    if (SHEETS[view]) return { view: lastBase, sheet: view, id, p };
    return { view: VIEWS[view] ? view : 'programacao', sheet: null, id: null, p };
  }
  const hashOf = (view, p) => { const q = p && [...p.keys()].length ? `?${p.toString()}` : ''; return `#${view}${q}`; };
  function go(hash, replace) {
    if (replace) { history.replaceState(null, '', hash); onRoute(); } else location.hash = hash;
  }
  function setParam(k, v, push) { const p = new URLSearchParams(route.p); if (v == null || v === '') p.delete(k); else p.set(k, v); go(hashOf(route.view, p), !push); }
  function openSheet(kind, id) { sheetPushed = true; location.hash = `#${kind}/${id}`; }
  function closeSheet() {
    const el = document.getElementById('sheet-root');
    if (el) el.classList.add('closing');
    setTimeout(() => { if (sheetPushed && history.length > 1) history.back(); else go(hashOf(route.view, route.p), true); sheetPushed = false; }, 150);
  }
  /** Programação sem parâmetros: aplica a última escolha de local/dia guardada no aparelho. */
  function applyRemembered() {
    if (route.view !== 'programacao') return false;
    const p = new URLSearchParams(route.p); let changed = false;
    if (!p.has('local') && 'local' in prefs && (prefs.local === '' || D.venues[prefs.local])) { if (prefs.local) p.set('local', prefs.local); }
    if (!p.has('d') && prefs.d && prefs.dOn === clock.date && T.eventDays().includes(prefs.d) && prefs.d >= clock.date) { p.set('d', prefs.d); changed = true; }
    if (p.toString() !== route.p.toString()) { route.p = p; history.replaceState(null, '', hashOf('programacao', p)); }
    return changed;
  }
  function remember() {
    if (route.view !== 'programacao' || TOTEM) return;
    const local = route.p.get('local') || ''; const d = route.p.get('d');
    if (local && local !== 'todos' && !D.venues[local]) return;
    if (prefs.local !== local) { prefs.local = local; savePrefs(); }
    if (d && (prefs.d !== d || prefs.dOn !== clock.date)) { prefs.d = d; prefs.dOn = clock.date; savePrefs(); }
  }
  function onRoute() {
    const prev = route; route = parse();
    if (!route.sheet) { lastBase = route.view; try { sessionStorage.setItem(LS_BASE, lastBase); } catch { /* */ } }
    if (!route.sheet) { applyRemembered(); remember(); }
    const viewChanged = !prev || prev.view !== route.view || prev.p.toString() !== route.p.toString();
    if (viewChanged || (!route.sheet && !prev.sheet)) renderMain(prev && prev.view === route.view);
    renderNav();
    renderSheet();
    document.title = titleFor();
  }
  function titleFor() {
    const base = 'TCE na Comunidade · Oiapoque 2026';
    if (route.sheet === 'curso') { const c = T.courseById(route.id); return c ? `${T.title(c, true)} · ${base}` : base; }
    if (route.sheet === 'servico') { const s = T.serviceById(route.id); return s ? `${s.title} · ${base}` : base; }
    return `${VIEWS[route.view].label} · ${base}`;
  }

  // ---------- helpers de domínio ----------
  const st = (x) => T.sessionState(x, clock);
  const shiftColor = (k) => T.SHIFTS[k].color;
  const roomLabel = (x) => (x.room ? `${x.room} · ${D.venues[x.venue].short}` : D.venues[x.venue].name);
  const stateBadge = (s, c) => (s === 'now' ? `<span class="badge now" style="--c:${c}">agora</span>` : s === 'today' ? '<span class="badge today">hoje</span>' : s === 'past' ? '<span class="badge past">encerrada</span>' : '');
  const focusDate = () => (clock.date < D.event.start ? D.event.start : clock.date > D.event.end ? D.event.end : clock.date);
  // ---- serviços: dias, rótulos e itens "só em 07/11" ----
  const onlyLabel = (it) => { const o = T.itemOnly(it); if (!o) return ''; const d = T.serviceDayOf(o); return `<em class="only">${I('calendar')}só ${esc(T.fmtDate(o, 'wdm'))} · ${esc(d ? d.place : '')}</em>`; };
  const itemLi = (it, date) => { const o = T.itemOnly(it); const off = date && o && o !== date; return `<li class="${off ? 'off' : ''}"><i></i><span>${esc(T.itemText(it))}${onlyLabel(it)}</span></li>`; };
  const svcDayCard = (d, opts) => { const o = opts || {}; const today = d.date === clock.date; return `<button class="svc-day ${today ? 'today' : ''} ${o.on ? 'on' : ''}" ${o.attrs || `data-go="servicos?dia=${d.date}"`}><span class="sd-date"><small>${today ? 'hoje' : esc(T.fmtDate(d.date, 'wd').split(' ')[0])}</small><b>${d.date.slice(8)}/${d.date.slice(5, 7)}</b></span><span class="sd-body"><b>${esc(d.place)}</b><small>${o.sub || 'Todos os serviços gratuitos · sem inscrição'}</small></span>${I('right')}</button>`; };
  const whenBox = (sel) => `<div class="when-box"><small>${I('calendar')}Quando e onde</small><div class="svc-days">${T.serviceDays().map((d) => svcDayCard(d, { on: sel === d.date, attrs: `data-param="dia" data-value="${sel === d.date ? '' : d.date}"` })).join('')}</div><p class="tiny muted">Sem inscrição, por ordem de chegada. Itens marcados com “só 07/11” acontecem apenas no sábado, na Escola Joaquim Nabuco.</p></div>`;
  const sessionsOf = (f) => T.allSessions().filter(f);
  const nextOf = (c) => T.nextSession(c, clock) || T.allSessions().find((x) => x.course === c);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  const shiftState = (k, date) => { if (date < clock.date) return 'past'; if (date > clock.date) return 'later'; const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later'; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dayWord = (d) => (d === clock.date ? 'hoje' : T.relDay(d, clock.date) === 'amanhã' ? 'amanhã' : T.fmtDate(d, 'wdlong'));
  const courseSort = {
    proximas: (a, b) => { const sa = T.courseState(a, clock) === 'past'; const sb = T.courseState(b, clock) === 'past'; if (sa !== sb) return sa ? 1 : -1; const na = nextOf(a); const nb = nextOf(b); return na.date.localeCompare(nb.date) || T.toMin(na.time) - T.toMin(nb.time) || T.title(a, true).localeCompare(T.title(b, true)); },
    az: (a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'),
    ch: (a, b) => b.hours - a.hours || courseSort.az(a, b),
  };
  function filterCourses(p) {
    const tt = T.searchTerms(p.get('q') || ''); const tag = p.get('tema'); const dia = p.get('dia'); const turno = p.get('turno'); const local = p.get('local'); const fav = p.get('fav');
    return D.courses.filter((c) => {
      if (tt.length && !T.searchMatch(T.searchableCourse(c), tt)) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (fav && !favs.has(c.id)) return false;
      return c.sessions.some((x) => (!dia || x.date === dia) && (!turno || T.shiftOf(x.time) === turno) && (!local || x.venue === local));
    });
  }
  const activeFilterCount = (p) => ['tema', 'dia', 'turno', 'local', 'fav'].filter((k) => p.get(k)).length;

  // ---------- componentes ----------
  const sessRow = (x, opts) => {
    const o = opts || {}; const s = st(x); const c = shiftColor(x.shift);
    return `<button class="sess ${s}" style="--c:${c}" data-sheet="curso" data-id="${x.course.id}" aria-label="${esc(T.title(x.course))}">
      <span class="sess-time"><b>${T.fmtTime(x.time)}</b><small>${o.showDate ? esc(T.fmtDate(x.date, 'wd')) : `até ${T.fmtTime(T.sessionEnd(x))}`}</small></span>
      <span class="sess-body"><small class="room">${I('door')}${esc(roomLabel(x))}${x.label ? ` · ${esc(x.label)}` : ''}</small><b>${esc(T.title(x.course, true))}</b><small>Para: ${esc(x.course.audience)}</small></span>
      <span class="sess-right">${stateBadge(s, c)}${favs.has(x.course.id) ? `<span class="cc-fav">${I('bookmark')}</span>` : ''}${I('right')}</span></button>`;
  };
  const courseCard = (c) => {
    const s = T.courseState(c, clock); const nx = nextOf(c); const col = shiftColor(nx.shift);
    const venues = [...new Set(c.sessions.map((x) => D.venues[x.venue].short))].join(' · ');
    return `<button class="card course-card" style="--c:${col}" data-sheet="curso" data-id="${c.id}">
      <div class="cc-top"><span class="cc-tags">${c.tags.map((t) => `<span class="tagc">${esc(D.tags[t])}</span>`).join('')}${s === 'now' ? `<span class="badge now" style="--c:${col}">agora</span>` : s === 'today' ? '<span class="badge today">hoje</span>' : s === 'past' ? '<span class="badge past">encerrado</span>' : ''}</span>${favs.has(c.id) ? `<span class="cc-fav" title="Nos meus cursos">${I('bookmark')}</span>` : ''}</div>
      <h3>${esc(c.title)}</h3>
      <p class="cc-aud"><b>Para:</b> ${esc(c.audience)}</p>
      <div class="cc-meta"><span>${I('hourglass')}${c.hours}h</span><span>${I('users')}${c.seats} vagas</span><span>${I('pin')}${esc(venues)}</span></div>
      <div class="cc-dates">${T.allSessions().filter((x) => x.course === c).map((x) => `<span class="datec ${st(x)}" style="--c:${shiftColor(x.shift)}"><i></i>${esc(T.fmtDate(x.date, 'wd'))} · ${T.fmtTime(x.time)}${x.room ? ` · ${esc(x.room)}` : ''}</span>`).join('')}</div>
    </button>`;
  };
  const svcCard = (s, hits) => `<button class="card svc-card" style="--c:${s.color}" data-sheet="servico" data-id="${s.id}"><span class="svc-ico">${I(s.icon)}</span><span><b>${s.num ? `<em>${s.num}.</em>` : ''}${esc(s.title)}</b><small>${esc(s.summary)}</small>${hits && hits.length ? `<ul class="hits">${hits.map((h) => `<li>${I('check')}<span>${esc(T.itemText(h))}</span>${onlyLabel(h)}</li>`).join('')}</ul>` : ''}</span><span class="chev">${I('right')}</span></button>`;
  const venueCard = (v) => { const n = sessionsOf((x) => x.venue === v.id).length; const days = [...new Set(sessionsOf((x) => x.venue === v.id).map((x) => x.date))];
    return `<button class="card svc-card venue-card" style="--c:#60a5fa" data-sheet="local" data-id="${v.id}"><span class="svc-ico">${I('building')}</span><span><b>${esc(v.name)}</b><small>${esc(v.city)} · ${n} aula${n === 1 ? '' : 's'} em ${days.length} dia${days.length === 1 ? '' : 's'}</small>${v.rooms.length ? `<span class="rooms">${v.rooms.map((r) => `<span>${esc(r)}</span>`).join('')}</span>` : ''}</span><span class="chev">${I('right')}</span></button>`; };
  const chip = (label, on, attrs, color) => `<button class="chip ${on ? 'on' : ''} ${color ? 'c' : ''}" ${attrs} ${color ? `style="--c:${color}"` : ''}>${color ? '<i></i>' : ''}${label}</button>`;
  const empty = (icon, text) => `<div class="empty">${I(icon)}<p>${text}</p></div>`;
  const searchBox = (q, opts) => { const o = opts || {}; return `<div class="search ${o.big ? 'big' : ''}">${I('search')}<label class="sr-only" for="${o.id || 'q'}">Buscar</label><input id="${o.id || 'q'}" type="search" value="${esc(q || '')}" placeholder="${esc(o.placeholder || 'Buscar curso, serviço, sala…')}" autocomplete="off" enterkeyhint="search" data-search ${o.autofocus ? 'autofocus' : ''} ${TOTEM ? 'inputmode="none"' : ''}>${q ? `<button class="icon-btn" data-param="q" data-value="" aria-label="Limpar busca">${I('x')}</button>` : ''}</div>`; };
  const servicesStrip = () => `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('handshake')}</span><h2>Serviços gratuitos <small>sem inscrição</small></h2><button class="link" data-go="servicos">Todos ${I('right')}</button></div>
    <div class="svc-days compact">${T.serviceDays().map((d) => svcDayCard(d)).join('')}</div>
    <div class="hscroll">${D.services.map((s) => `<button class="pillar-mini" style="--c:${s.color}" data-sheet="servico" data-id="${s.id}"><i>${I(s.icon)}</i><b>${esc(s.short || s.title)}</b><small>${esc(s.summary)}</small></button>`).join('')}</div></section>`;
  const footer = () => `<footer class="foot">${esc(D.event.organizer)}<br>${esc(D.event.edition)} · ${esc(D.event.place)} · ${esc(D.event.datesLabel)}${TOTEM ? '' : '<br><a href="tv.html">Modo TV</a>'}</footer>`;
  /** Bloco "leve no celular": QR grande, usado no totem no lugar de salvar/compartilhar. */
  const takeAway = (hash, title, text) => `<div class="qr-box take"><div class="qr-big">${T.qrSvg(T.appUrl(hash), { margin: 1 })}</div><div><b>${I('phone')}${title}</b><small>${text}</small></div></div>`;

  // ---------- telas ----------
  function viewProgramacao() {
    const days = T.eventDays(); const p = route.p;
    const d = days.includes(p.get('d')) ? p.get('d') : focusDate(); const local = D.venues[p.get('local')] ? p.get('local') : '';
    const list = sessionsOf((x) => x.date === d && (!local || x.venue === local));
    const idx = days.indexOf(clock.date); const diff = Math.round((Date.parse(D.event.start) - Date.parse(clock.date)) / 864e5);
    const tsd = T.serviceDayOf(clock.date);
    const status = tsd ? `Hoje: <b>serviços gratuitos</b> no ${esc(tsd.place)}` : idx >= 0 ? `Hoje é o <b>${idx + 1}º dia</b> do evento` : diff > 0 ? (diff === 1 ? 'O evento <b>começa amanhã</b>' : `O evento <b>começa em ${diff} dias</b>`) : 'Evento encerrado · obrigado, Oiapoque!';
    // Cartão "agora / a seguir" (só para o dia de hoje).
    let nowCard = '';
    if (d === clock.date) {
      const now = list.filter((x) => st(x) === 'now'); const up = list.filter((x) => st(x) === 'today');
      if (now.length) { const k = now[0].shift; nowCard = `<button class="now-card" style="--c:${shiftColor(k)}" data-scroll="turno-${k}"><span class="nc-ico">${I('clock')}</span><span><b><i></i>Acontecendo agora · ${T.SHIFTS[k].label} até ${T.fmtTime(T.SHIFTS[k].end)}</b><small>${now.length} curso${now.length > 1 ? 's' : ''} em andamento${local ? ` · ${esc(D.venues[local].short)}` : ''}</small></span>${I('down')}</button>`; }
      else if (up.length) { const k = up[0].shift; const n = up.filter((x) => x.shift === k).length; nowCard = `<button class="now-card next" style="--c:${shiftColor(k)}" data-scroll="turno-${k}"><span class="nc-ico">${I('next')}</span><span><b>A seguir · ${T.SHIFTS[k].label} às ${T.fmtTime(T.SHIFTS[k].start)}</b><small>${n} curso${n > 1 ? 's' : ''}${local ? ` · ${esc(D.venues[local].short)}` : ''}</small></span>${I('down')}</button>`; }
      else if (list.length) nowCard = `<div class="now-card done"><span class="nc-ico">${I('check')}</span><span><b>Cursos de hoje encerrados</b><small>Veja amanhã nas abas acima ou os serviços gratuitos abaixo</small></span></div>`;
    }
    const shifts = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
    const sections = shifts.map((k) => {
      const sh = T.SHIFTS[k]; const l = list.filter((x) => x.shift === k); const s = shiftState(k, d);
      const collapsed = s === 'past' && !openShifts.has(`${d}-${k}`);
      const tag = s === 'now' ? `<span class="badge now" style="--c:${sh.color}">agora</span>` : s === 'past' ? '<span class="badge past">encerrado</span>' : '';
      return `<section class="sec shift-sec ${s} ${collapsed ? 'collapsed' : ''}" id="turno-${k}"><button class="sec-head" data-toggle-shift="${d}-${k}" aria-expanded="${!collapsed}"><span class="sec-ico c" style="--c:${sh.color}">${I(T.SHIFT_ICON[k])}</span><h2>${sh.label} <small>${T.fmtTime(sh.start)} às ${T.fmtTime(sh.end)}</small></h2>${tag}<span class="muted tiny">${l.length} curso${l.length === 1 ? '' : 's'}</span>${collapsed ? I('down') : ''}</button>${collapsed ? '' : `<div class="stack cols">${l.map((x) => sessRow(x)).join('')}</div>`}</section>`;
    }).join('');
    const favList = D.courses.filter((c) => favs.has(c.id));
    const sd = T.serviceDayOf(d); const nsd = T.nextServiceDay(clock.date);
    // Dia de serviços: os serviços são o destaque (sempre, mesmo com outro local filtrado); os cursos vêm depois.
    const svcSection = sd
      ? `<section class="sec svc-focus" style="--c:${D.event.shifts.manha.color}"><div class="svc-banner static"><span class="sb-ico">${I('handshake')}</span><span><small>${d === clock.date ? 'Hoje' : esc(cap(T.fmtDate(d, 'wdlong')))} é dia de</small><b>Serviços gratuitos · ${esc(sd.placeLong || sd.place)}</b><small>Sem inscrição, por ordem de chegada. Toque em um bloco para ver tudo o que é oferecido.</small></span></div>
          <div class="stack cols">${D.services.map((s) => { const n = T.itemsOn(s, d).length; const hidden = s.items.length - n; return svcCard(s).replace('</small>', `</small>${hidden ? `<small class="only-note">${I('info')}${hidden} ${hidden > 1 ? 'itens' : 'item'} só em 07/11 na Joaquim Nabuco</small>` : ''}`); }).join('')}</div></section>`
      : (nsd && d === clock.date ? `<button class="svc-note" data-go="servicos"><span>${I('handshake')}</span><span>Serviços gratuitos (saúde, documentos, justiça…): <b>${esc(T.serviceDaysLabel())}</b></span>${I('right')}</button>` : '');
    return `${searchBox('', { id: 'q0', big: true, placeholder: 'Buscar curso, serviço, sala ou assunto…' })}
      <p class="status-line">${I('sparkles')}<span>${status} · ${esc(D.event.placeShort)}</span></p>
      <div class="tabs" role="tablist" aria-label="Dia">${days.map((x) => { const n = sessionsOf((y) => y.date === x && (!local || y.venue === local)).length; const xs = T.serviceDayOf(x); return `<button role="tab" aria-selected="${x === d}" class="${x === d ? 'on' : ''} ${x === clock.date ? 'today' : ''} ${x < clock.date ? 'past' : ''} ${xs ? 'svc' : ''}" data-param="d" data-value="${x}"><small>${x === clock.date ? 'hoje' : T.fmtDate(x, 'wd').split(' ')[0]}</small><b>${x.slice(8)}</b><em>${xs ? `${I('handshake')}serviços` : n ? `${n} curso${n > 1 ? 's' : ''}` : '—'}</em></button>`; }).join('')}</div>
      <div class="chips scroll" aria-label="Local">${chip(`${I('pin')}Todos os locais`, !local, 'data-param="local" data-value="todos"')}${Object.values(D.venues).map((v) => chip(esc(v.short), local === v.id, `data-param="local" data-value="${v.id}"`)).join('')}</div>
      <p class="page-lead">${esc(cap(T.fmtDate(d)))}${d === clock.date ? ' · hoje' : T.relDay(d, clock.date) === 'amanhã' ? ' · amanhã' : ''} · ${sd ? `<b>serviços gratuitos</b> em ${esc(sd.place)}${list.length ? ` e <b>${list.length} curso${list.length === 1 ? '' : 's'}</b>${local ? ` em ${esc(D.venues[local].short)}` : ''}` : ''}` : `<b>${list.length} curso${list.length === 1 ? '' : 's'}</b>${local ? ` em ${esc(D.venues[local].name)}` : ' em todos os locais'}`}</p>
      ${svcSection}
      ${nowCard}
      ${sd && shifts.length ? `<div class="sec-head" style="margin-top:1.4em"><span class="sec-ico">${I('graduation')}</span><h2>Cursos do dia <small>com inscrição</small></h2></div>` : ''}
      ${shifts.length ? sections : (sd ? '' : empty('calendar', `Nenhum curso ${d === clock.date ? 'hoje' : 'neste dia'}${local ? ` em ${esc(D.venues[local].short)}` : ''}. Toque em outro dia ou local acima, ou veja os serviços gratuitos.`))}
      ${favList.length ? `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('bookmark')}</span><h2>Meus cursos <small>${favList.length}</small></h2><button class="link" data-go="cursos?fav=1">Ver ${I('right')}</button></div><div class="stack cols">${favList.slice(0, 4).map((c) => sessRow(nextOf(c), { showDate: true })).join('')}</div></section>` : ''}
      ${servicesStrip()}
      ${footer()}`;
  }

  function viewBusca() {
    const q = route.p.get('q') || ''; const R = T.search(q); const SUGGESTIONS = T.SUGGESTIONS;
    let body = '';
    if (!R.terms.length) {
      body = `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('sparkles')}</span><h2>O que você procura?</h2></div>
          <div class="chips">${SUGGESTIONS.map((s) => chip(esc(s), false, `data-param="q" data-value="${esc(s)}"`)).join('')}</div></section>
        <section class="sec"><div class="sec-head"><span class="sec-ico">${I('pin')}</span><h2>Por local</h2></div><div class="chips">${Object.values(D.venues).map((v) => chip(esc(v.short), false, `data-go="programacao?local=${v.id}"`)).join('')}</div></section>
        <section class="sec"><div class="sec-head"><span class="sec-ico">${I('calendar')}</span><h2>Por dia</h2></div><div class="chips">${T.eventDays().map((d) => chip(esc(d === clock.date ? 'Hoje' : cap(T.fmtDate(d, 'wd'))), false, `data-go="programacao?d=${d}"`)).join('')}</div></section>
        <section class="sec"><div class="sec-head"><span class="sec-ico">${I('tag')}</span><h2>Cursos por tema</h2></div><div class="chips">${Object.entries(D.tags).map(([k, v]) => chip(esc(v), false, `data-go="cursos?tema=${k}"`)).join('')}</div></section>`;
    } else {
      const courses = R.courses.sort(courseSort.proximas); const services = R.services; const venues = R.venues; const total = R.total;
      body = total ? `<p class="result-line"><span><b>${total}</b> resultado${total > 1 ? 's' : ''} para “${esc(q)}”</span></p>
        ${services.length ? `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('handshake')}</span><h2>Serviços gratuitos <small>${services.length}</small></h2></div><div class="stack">${services.map((r) => svcCard(r.s, r.hits)).join('')}</div></section>` : ''}
        ${courses.length ? `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('graduation')}</span><h2>Cursos <small>${courses.length}</small></h2>${courses.length > 3 ? `<button class="link" data-go="cursos?q=${encodeURIComponent(q)}">Filtrar ${I('right')}</button>` : ''}</div><div class="stack cols">${courses.map((c) => sessRow(nextOf(c), { showDate: true })).join('')}</div></section>` : ''}
        ${venues.length ? `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('pin')}</span><h2>Locais <small>${venues.length}</small></h2></div><div class="stack">${venues.map(venueCard).join('')}</div></section>` : ''}`
        : `${empty('search', `Nada encontrado para “${esc(q)}”. Tente uma palavra mais simples, como “saúde”, “documento” ou “curso”.`)}<div class="chips" style="justify-content:center">${SUGGESTIONS.slice(0, 6).map((s) => chip(esc(s), false, `data-param="q" data-value="${esc(s)}"`)).join('')}</div>`;
    }
    return `<div class="page-head"><span class="page-ico">${I('search')}</span><h1>Buscar</h1></div>
      ${searchBox(q, { id: 'q', big: true, autofocus: true, placeholder: 'Ex.: vacina, identidade, panificação…' })}
      ${body}`;
  }

  function viewCursos() {
    const p = route.p; const q = p.get('q') || ''; const sort = p.get('ord') || 'proximas';
    const list = filterCourses(p).sort(courseSort[sort] || courseSort.proximas);
    const n = activeFilterCount(p);
    const days = T.eventDays();
    return `<div class="page-head"><span class="page-ico">${I('graduation')}</span><h1>Cursos <span class="count">${D.courses.length}</span></h1></div>
      <p class="page-lead">Gratuitos, com inscrição pelo site da Escola de Contas. Toque no curso para ver horários, sala e inscrição.</p>
      <div class="filter-bar">${searchBox(q, { placeholder: 'Buscar por nome, público, tema…' })}<button class="icon-btn ${filtersOpen || n ? 'on' : ''}" data-toggle-filters aria-label="Filtros" aria-expanded="${filtersOpen}">${I('sliders')}${n ? `<em>${n}</em>` : ''}</button></div>
      <div class="chips scroll">${chip(`${I('clock')}Hoje`, p.get('dia') === clock.date, `data-param="dia" data-value="${p.get('dia') === clock.date ? '' : clock.date}"`)}${prefs.local && D.venues[prefs.local] ? chip(`${I('pin')}${esc(D.venues[prefs.local].short)}`, p.get('local') === prefs.local, `data-param="local" data-value="${p.get('local') === prefs.local ? '' : prefs.local}"`) : ''}${chip(`${I('bookmark')}Meus cursos${favs.size ? ` (${favs.size})` : ''}`, !!p.get('fav'), `data-param="fav" data-value="${p.get('fav') ? '' : '1'}"`)}</div>
      ${filtersOpen || n ? `<div class="filters">
        <div class="f-group"><small>Tema</small><div class="chips">${chip('Todos', !p.get('tema'), 'data-param="tema" data-value=""')}${Object.entries(D.tags).map(([k, v]) => chip(esc(v), p.get('tema') === k, `data-param="tema" data-value="${k}"`)).join('')}</div></div>
        <div class="f-group"><small>Dia</small><div class="chips">${chip('Todos', !p.get('dia'), 'data-param="dia" data-value=""')}${days.map((d) => chip(esc(T.fmtDate(d, 'wd')), p.get('dia') === d, `data-param="dia" data-value="${d}"`)).join('')}</div></div>
        <div class="f-group"><small>Turno</small><div class="chips">${chip('Todos', !p.get('turno'), 'data-param="turno" data-value=""')}${T.SHIFT_ORDER.map((k) => chip(`${T.SHIFTS[k].label} ${T.fmtTime(T.SHIFTS[k].start)}`, p.get('turno') === k, `data-param="turno" data-value="${k}"`, T.SHIFTS[k].color)).join('')}</div></div>
        <div class="f-group"><small>Local</small><div class="chips">${chip('Todos', !p.get('local'), 'data-param="local" data-value=""')}${Object.values(D.venues).map((v) => chip(esc(v.short), p.get('local') === v.id, `data-param="local" data-value="${v.id}"`)).join('')}</div></div>
        ${n ? `<div class="f-group"><div class="chips">${chip(`${I('x')}Limpar filtros`, false, 'data-clear-filters').replace('class="chip', 'class="chip clear')}</div></div>` : ''}
      </div>` : ''}
      <div class="result-line"><span>${list.length} de ${D.courses.length} cursos</span><label>Ordenar <select data-param="ord"><option value="proximas" ${sort === 'proximas' ? 'selected' : ''}>Próximas datas</option><option value="az" ${sort === 'az' ? 'selected' : ''}>A–Z</option><option value="ch" ${sort === 'ch' ? 'selected' : ''}>Carga horária</option></select></label></div>
      ${list.length ? `<div class="stack cols">${list.map(courseCard).join('')}</div>` : empty('search', 'Nenhum curso encontrado. Tente outra palavra ou limpe os filtros.')}`;
  }

  function viewServicos() {
    const sel = T.serviceDayOf(route.p.get('dia')) ? route.p.get('dia') : '';
    const selDay = sel ? T.serviceDayOf(sel) : null;
    return `<div class="page-head"><span class="page-ico">${I('handshake')}</span><h1>Serviços gratuitos</h1></div>
      <p class="page-lead">Atendimentos para toda a população, <b>sem inscrição</b>, em dois dias: ${esc(T.serviceDaysLabel())}. Toque em um bloco para ver tudo o que é oferecido e quem atende.</p>
      ${whenBox(sel)}
      ${selDay ? `<p class="result-line"><span>Mostrando o que há em <b>${esc(T.fmtDate(sel, 'wdlong'))} · ${esc(selDay.place)}</b></span><button class="link" data-param="dia" data-value="">Ver tudo ${I('x')}</button></p>` : ''}
      <div class="stack cols">${D.services.map((s) => { const n = T.itemsOn(s, sel).length; const hidden = s.items.length - n; return svcCard(s).replace('</small>', `</small>${hidden ? `<small class="only-note">${I('info')}${hidden} ${hidden > 1 ? 'itens' : 'item'} só em 07/11 na Joaquim Nabuco</small>` : ''}`); }).join('')}</div>`;
  }

  function viewLocais() {
    return `<div class="page-head"><span class="page-ico">${I('pin')}</span><h1>Locais</h1></div>
      <p class="page-lead">Onde acontecem os cursos. Toque para ver a programação de cada local.</p>
      <div class="stack cols">${Object.values(D.venues).map(venueCard).join('')}</div>`;
  }

  // ---------- folhas ----------
  function sheetCurso(c) {
    const sessions = T.allSessions().filter((x) => x.course === c);
    const byDay = {}; sessions.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    const venues = [...new Set(sessions.map((x) => D.venues[x.venue].short))].join(' · ');
    const fav = favs.has(c.id); const s = T.courseState(c, clock); const nx = nextOf(c);
    const links = [...new Set(sessions.map((x) => x.link))];
    const qr = T.qrSvg(T.appUrl(`curso/${c.id}`), { margin: 1 });
    const nextLine = s === 'now' ? `Acontecendo agora · ${esc(roomLabel(nx))} · até ${T.fmtTime(T.sessionEnd(nx))}` : s === 'past' ? 'Todas as aulas já aconteceram' : `${cap(dayWord(nx.date))} às ${T.fmtTime(nx.time)} · ${esc(roomLabel(nx))}`;
    return `<div class="sheet-head"><span class="kicker">${I('graduation')}Curso gratuito · Escola de Contas · TCE/AP</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div>
      <div class="sheet-body"><h2>${esc(c.title)}</h2>
        <div class="next-line ${s}" style="--c:${shiftColor(nx.shift)}">${I(s === 'now' ? 'clock' : 'calendar')}<span>${nextLine}</span></div>
        <div class="chips" style="margin-top:.4em">${c.tags.map((t) => `<span class="tagc">${esc(D.tags[t])}</span>`).join('')}</div>
        <div class="meta-grid"><div><small>Carga horária</small><b>${c.hours}h</b></div><div><small>Vagas</small><b>${c.seats}</b></div><div><small>Local</small><b>${esc(venues)}</b></div></div>
        <p><b>Para quem é:</b> ${esc(c.audience)}</p>
        ${c.note ? `<p class="note" style="margin-top:.6em">${I('info')}<span>${esc(c.note)}</span></p>` : ''}
        <h3>${I('calendar')}Dias e horários (${sessions.length})</h3>
        ${Object.keys(byDay).map((d) => `<div class="day-group"><small class="${d === clock.date ? 'today' : ''}">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''}</small>${byDay[d].map((x) => { const sx = st(x); return `<div class="sess-static ${sx}" style="--c:${shiftColor(x.shift)}"><span class="sess-time"><b>${T.fmtTime(x.time)}</b><small>até ${T.fmtTime(T.sessionEnd(x))}</small></span><span class="sess-body"><b>${esc(x.room || D.venues[x.venue].short)}${x.label ? ` · ${esc(x.label)}` : ''}</b><small>${esc(D.venues[x.venue].name)}</small></span><span class="sess-right">${stateBadge(sx, shiftColor(x.shift))}</span>${links.length > 1 && x.link !== c.link ? `<a class="sess-link link" href="${esc(x.link)}" target="_blank" rel="noopener">Inscrição ${esc(x.label || '')} ${I('external')}</a>` : ''}</div>`; }).join('')}</div>`).join('')}
        ${TOTEM ? `${takeAway(`curso/${c.id}`, 'Inscreva-se pelo celular', 'Aponte a câmera para o QR Code: abre esta página do curso no seu celular, com o botão de inscrição. A inscrição é gratuita, no site da Escola de Contas.')}
        <div class="actions"><button class="btn btn-ghost" data-go="programacao?d=${nx.date}&local=${nx.venue}">${I('calendar')}Ver o dia</button><button class="btn btn-primary" data-close>${I('x')}Fechar</button></div>` : `<div class="actions">
          <a class="btn btn-primary" href="${esc(c.link)}" target="_blank" rel="noopener">${I('external')}Fazer inscrição${links.length > 1 ? ` (${esc(sessions.find((x) => x.link === c.link)?.label || 'Turma I')})` : ''}</a>
          <button class="btn btn-ghost ${fav ? 'on' : ''}" data-fav="${c.id}">${I('bookmark')}${fav ? 'Salvo' : 'Salvar'}</button>
          <button class="btn btn-ghost" data-ics="${c.id}">${I('calendarplus')}Lembrar</button>
          <button class="btn btn-ghost" data-share="${c.id}">${I('share')}Compartilhar</button>
          <button class="btn btn-ghost" data-go="programacao?d=${nx.date}&local=${nx.venue}">${I('calendar')}Ver o dia</button>
        </div>
        <p class="tiny muted">A inscrição é feita no site da Escola de Contas (ESCON). É gratuita.${c.linkNote ? ' Se o link não abrir, procure o curso pelo nome na página de cursos da Escola de Contas.' : ''}</p>
        <div class="qr-box">${qr}<small><b>Mostre para alguém:</b> este QR Code abre esta página do curso no celular.</small></div>`}
      </div>`;
  }
  function sheetServico(s) {
    return `<div class="sheet-head"><span class="kicker" style="color:color-mix(in srgb,${s.color} 70%,var(--ink))">${I(s.icon)}${s.num ? `Pilar ${s.num}` : 'Acolhida'} · Serviços gratuitos</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div>
      <div class="sheet-body" style="--c:${s.color}"><h2>${esc(s.title)}</h2><p class="muted">${esc(s.summary)}</p>
        <div class="when-box" style="margin-top:.7em"><small>${I('calendar')}Quando e onde · sem inscrição, por ordem de chegada</small><div class="svc-days compact">${T.serviceDays().map((d) => svcDayCard(d, { attrs: `data-go="programacao?d=${d.date}&local=${d.venue}"`, sub: T.itemsOn(s, d.date).length === s.items.length ? 'Todos os itens abaixo' : `${T.itemsOn(s, d.date).length} de ${s.items.length} itens abaixo` })).join('')}</div></div>
        <h3>${I('check')}O que é oferecido</h3><ul class="ul">${s.items.map((it) => itemLi(it, route.p.get('dia'))).join('')}</ul>
        ${s.detail ? `<p class="note">${I('info')}<span>${esc(s.detail)}</span></p>` : ''}
        <h3>${I('users')}Quem atende</h3><div class="partners">${s.partners.map((p) => `<span>${esc(p)}</span>`).join('')}</div>
        ${s.coursesLink ? `<div class="actions"><button class="btn btn-primary" data-go="cursos">${I('graduation')}Ver os ${D.courses.length} cursos com inscrição</button></div>` : ''}
        ${TOTEM ? `${takeAway(`servico/${s.id}`, 'Leve no celular', 'Aponte a câmera para o QR Code e abra esta lista no seu celular.')}<div class="actions"><button class="btn btn-primary" data-close>${I('x')}Fechar</button></div>` : `<div class="share-row"><button class="btn btn-ghost" data-share-svc="${s.id}">${I('share')}Compartilhar</button></div>`}
      </div>`;
  }
  function sheetLocal(v) {
    const list = sessionsOf((x) => x.venue === v.id); const byDay = {}; list.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    return `<div class="sheet-head"><span class="kicker">${I('pin')}Local · ${esc(v.city)}</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div>
      <div class="sheet-body"><h2>${esc(v.name)}</h2>${v.rooms.length ? `<div class="partners">${v.rooms.map((r) => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
        <div class="actions" style="margin:.9em 0"><button class="btn btn-primary" data-go="programacao?local=${v.id}">${I('calendar')}Abrir a programação deste local</button></div>
        <h3>${I('calendar')}Cursos neste local (${list.length})</h3>
        ${Object.keys(byDay).map((d) => `<div class="day-group"><small class="${d === clock.date ? 'today' : ''}">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''}</small><div class="stack">${byDay[d].map((x) => sessRow(x)).join('')}</div></div>`).join('') || empty('calendar', 'Sem cursos cadastrados neste local.')}
        ${TOTEM ? `<div class="actions"><button class="btn btn-primary" data-close>${I('x')}Fechar</button></div>` : ''}
      </div>`;
  }

  // ---------- render ----------
  function shell() {
    const navBtns = () => Object.entries(VIEWS).map(([k, v]) => `<button class="${route.view === k ? 'on' : ''}" data-go="${k}" aria-label="${v.label}"><span class="nav-ico">${I(v.icon)}</span>${v.label}</button>`).join('');
    root.innerHTML = `<header class="app-head"><button class="app-brand" data-go="programacao"><span class="logo-chip"><img src="img/tce-mark.png" alt=""></span><span><b>${esc(D.event.name)}</b><small>${esc(D.event.edition)} · ${esc(TOTEM && TOTEM.local && D.venues[TOTEM.local] ? D.venues[TOTEM.local].name : D.event.placeShort)}</small></span></button><div class="app-head-right">${T.isSimulated() ? '<span class="demo-pill">demo</span>' : ''}<div class="app-clock" id="clock"></div>${TOTEM ? '' : `<button class="icon-btn head-search" data-go="busca" aria-label="Buscar">${I('search')}</button>`}</div></header>
      <div class="app-body"><nav class="side-nav" id="side-nav">${navBtns()}<div class="sn-foot">${esc(D.event.organizerShort)}<br>${esc(D.event.datesLabel)}<br><a href="tv.html">Modo TV</a></div></nav><main class="app-main" id="main"></main></div>
      <nav class="bottom-nav" id="bottom-nav">${navBtns()}</nav><div id="sheet"></div><div id="toast"></div>`;
    renderClock();
  }
  function renderClock() {
    const el = document.getElementById('clock'); if (!el) return;
    el.innerHTML = `${clock.time}<small>${esc(T.fmtDate(clock.date, 'wdlong'))}</small>`;
  }
  function renderNav() {
    for (const id of ['side-nav', 'bottom-nav']) { const nav = document.getElementById(id); if (!nav) continue; nav.querySelectorAll('button[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === route.view)); }
  }
  function renderMain(keepScroll) {
    const main = document.getElementById('main');
    const active = document.activeElement; const wasSearch = active && active.hasAttribute('data-search'); const pos = wasSearch ? [active.selectionStart, active.selectionEnd] : null;
    main.innerHTML = { programacao: viewProgramacao, busca: viewBusca, cursos: viewCursos, servicos: viewServicos, locais: viewLocais }[route.view]();
    if (!keepScroll) window.scrollTo({ top: 0 });
    const inp = main.querySelector('[data-search]');
    if (inp && (wasSearch || (route.view === 'busca' && !route.p.get('q')))) { inp.focus({ preventScroll: true }); try { if (pos) inp.setSelectionRange(Math.min(pos[0], inp.value.length), Math.min(pos[1], inp.value.length)); } catch { /* */ } }
  }
  function renderSheet() {
    const holder = document.getElementById('sheet');
    if (!route.sheet) { holder.innerHTML = ''; document.body.style.overflow = ''; return; }
    let inner = '';
    if (route.sheet === 'curso') { const c = T.courseById(route.id); inner = c ? sheetCurso(c) : notFound('Curso não encontrado.'); }
    if (route.sheet === 'servico') { const s = T.serviceById(route.id); inner = s ? sheetServico(s) : notFound('Serviço não encontrado.'); }
    if (route.sheet === 'local') { const v = D.venues[route.id]; inner = v ? sheetLocal(v) : notFound('Local não encontrado.'); }
    holder.innerHTML = `<div class="sheet-root" id="sheet-root" role="dialog" aria-modal="true"><div class="sheet"><div class="sheet-grab"></div>${inner}</div></div>`;
    document.body.style.overflow = 'hidden';
    const first = holder.querySelector('.sheet-body'); if (first) first.scrollTop = 0;
  }
  const notFound = (msg) => `<div class="sheet-head"><span class="kicker">Ops</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div><div class="sheet-body">${empty('alert', msg)}</div>`;

  // ---------- ações ----------
  function toast(msg, icon) {
    const el = document.getElementById('toast'); el.innerHTML = `<div class="toast">${I(icon || 'check')}${esc(msg)}</div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.innerHTML = ''; }, 2600);
  }
  async function share(title, text, url) {
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Link copiado para a área de transferência'); } catch { toast('Copie o endereço da barra do navegador', 'info'); }
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  document.addEventListener('click', (e) => {
    const el = (sel) => e.target.closest(sel);
    let b;
    if ((b = el('[data-close]'))) { closeSheet(); return; }
    if ((b = el('#sheet-root')) && !e.target.closest('.sheet')) { closeSheet(); return; }
    if ((b = el('[data-sheet]'))) { openSheet(b.dataset.sheet, b.dataset.id); return; }
    if ((b = el('[data-go]'))) {
      const target = b.dataset.go; const [view, qs] = target.split('?');
      if (route.sheet) sheetPushed = false;
      go(`#${view}${qs ? `?${qs}` : ''}`); return;
    }
    if ((b = el('[data-scroll]'))) { const t = document.getElementById(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if ((b = el('[data-toggle-shift]'))) { const k = b.dataset.toggleShift; if (openShifts.has(k)) openShifts.delete(k); else openShifts.add(k); renderMain(true); return; }
    if ((b = el('[data-param]')) && b.tagName !== 'SELECT') { setParam(b.dataset.param, b.dataset.value, route.view === 'programacao' && b.dataset.param !== 'q'); return; }
    if ((b = el('[data-toggle-filters]'))) { filtersOpen = !filtersOpen; renderMain(true); return; }
    if ((b = el('[data-clear-filters]'))) { const p = new URLSearchParams(); if (route.p.get('q')) p.set('q', route.p.get('q')); filtersOpen = false; go(hashOf('cursos', p), true); return; }
    if ((b = el('[data-fav]'))) {
      const id = Number(b.dataset.fav); if (favs.has(id)) { favs.delete(id); toast('Removido dos meus cursos', 'bookmark'); } else { favs.add(id); toast('Salvo em "Meus cursos"', 'bookmark'); }
      saveFavs(); renderSheet(); renderMain(true); return;
    }
    if ((b = el('[data-ics]'))) { const c = T.courseById(b.dataset.ics); download(`curso-${c.id}.ics`, T.icsFor(c), 'text/calendar'); toast('Lembrete gerado: abra o arquivo para salvar na agenda'); return; }
    if ((b = el('[data-share]'))) { const c = T.courseById(b.dataset.share); const nx = nextOf(c); share(T.title(c), `${T.title(c)} · ${T.fmtDate(nx.date, 'wdlong')} às ${T.fmtTime(nx.time)} · ${roomLabel(nx)} · ${D.event.name}`, T.appUrl(`curso/${c.id}`)); return; }
    if ((b = el('[data-share-svc]'))) { const s = T.serviceById(b.dataset.shareSvc); share(s.title, `${s.title}: ${s.summary} · ${D.event.name} · ${D.event.datesLabel}`, T.appUrl(`servico/${s.id}`)); return; }
  });
  document.addEventListener('change', (e) => { const s = e.target.closest('select[data-param]'); if (s) setParam(s.dataset.param, s.value); });
  let searchTimer = null;
  document.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-search]'); if (!inp) return;
    clearTimeout(searchTimer);
    const q = inp.value.trim();
    if (route.view === 'cursos') { searchTimer = setTimeout(() => setParam('q', q), 180); return; }
    if (route.view !== 'busca') { const p = new URLSearchParams(); if (q) p.set('q', q); go(hashOf('busca', p)); return; } // da programação vai para a busca única
    searchTimer = setTimeout(() => setParam('q', q), 150);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && route.sheet) closeSheet(); if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-search]')) e.target.blur(); });
  window.addEventListener('hashchange', onRoute);

  // Arraste para fechar a folha (celular). Ignora o toque em botões para não engolir o clique.
  let drag = null;
  document.addEventListener('pointerdown', (e) => { const grab = e.target.closest('.sheet-head, .sheet-grab'); if (!grab || e.target.closest('button,a')) return; drag = { y: e.clientY, sheet: grab.closest('.sheet') }; });
  document.addEventListener('pointermove', (e) => { if (!drag) return; const dy = Math.max(0, e.clientY - drag.y); drag.sheet.style.transform = `translateY(${dy}px)`; drag.dy = dy; });
  document.addEventListener('pointerup', () => { if (!drag) return; if (drag.dy > 90) closeSheet(); else drag.sheet.style.transform = ''; drag = null; });

  // ---------- início ----------
  route = parse();
  shell();
  onRoute();
  setInterval(() => { const c = T.now(); if (c.time !== clock.time) { clock = c; renderClock(); if (!document.activeElement || !document.activeElement.hasAttribute('data-search')) { renderMain(true); if (route.sheet) renderSheet(); } } }, 1000);
  if (!TOTEM && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Para o modo totem: volta ao início e limpa o estado da tela.
  window.TCE_APP = { reset() { filtersOpen = false; openShifts.clear(); sheetPushed = false; const p = new URLSearchParams(); if (prefs.local) p.set('local', prefs.local); const h = hashOf('programacao', p); if (location.hash === h) { renderMain(false); renderSheet(); } else go(h, true); window.scrollTo({ top: 0 }); } };
})();
