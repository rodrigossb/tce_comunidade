/* App do público (celular/desktop): rotas por hash, busca, filtros, detalhe em folha, favoritos,
   lembrete (.ics), compartilhar. Sem servidor: tudo vem de js/data.js. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc;
  const root = document.getElementById('app');
  const VIEWS = {
    inicio: { label: 'Início', icon: 'home' },
    programacao: { label: 'Programação', icon: 'calendar' },
    cursos: { label: 'Cursos', icon: 'graduation' },
    servicos: { label: 'Serviços', icon: 'handshake' },
    locais: { label: 'Locais', icon: 'pin' },
  };
  const SHEETS = { curso: 'cursos', servico: 'servicos', local: 'locais' };
  const LS_FAV = 'tce_favs';
  const LS_BASE = 'tce_base';

  const favs = new Set((() => { try { return JSON.parse(localStorage.getItem(LS_FAV)) || []; } catch { return []; } })());
  const saveFavs = () => { try { localStorage.setItem(LS_FAV, JSON.stringify([...favs])); } catch { /* sem storage */ } };
  let clock = T.now();
  let lastBase = (() => { try { return sessionStorage.getItem(LS_BASE); } catch { return null; } })() || 'inicio';
  let route = parse();
  let filtersOpen = false;
  let sheetPushed = false;

  // ---------- rotas ----------
  function parse() {
    const h = decodeURIComponent(location.hash.slice(1) || 'inicio');
    const [path, qs] = h.split('?');
    const [view, id] = path.split('/');
    const p = new URLSearchParams(qs || '');
    if (SHEETS[view]) return { view: lastBase, sheet: view, id, p };
    return { view: VIEWS[view] ? view : 'inicio', sheet: null, id: null, p };
  }
  const hashOf = (view, p) => { const q = p && [...p.keys()].length ? `?${p.toString()}` : ''; return `#${view}${q}`; };
  function go(hash, replace) {
    if (replace) history.replaceState(null, '', hash); else location.hash = hash;
    if (replace) onRoute();
  }
  function setParam(k, v) { const p = new URLSearchParams(route.p); if (v == null || v === '' || v === 'todos') p.delete(k); else p.set(k, v); go(hashOf(route.view, p), true); }
  function openSheet(kind, id) { sheetPushed = true; location.hash = `#${kind}/${id}`; }
  function closeSheet() {
    const el = document.getElementById('sheet-root');
    if (el) { el.classList.add('closing'); }
    setTimeout(() => { if (sheetPushed && history.length > 1) history.back(); else go(hashOf(route.view, route.p), true); sheetPushed = false; }, 150);
  }
  function onRoute() {
    const prev = route; route = parse();
    if (!route.sheet) { lastBase = route.view; try { sessionStorage.setItem(LS_BASE, lastBase); } catch { /* */ } }
    const viewChanged = !prev || prev.view !== route.view || prev.p.toString() !== route.p.toString();
    if (viewChanged || !prev.sheet === !route.sheet && !route.sheet) renderMain(prev && prev.view === route.view);
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
  const dayLabel = (d) => `${T.fmtDate(d, 'wd')}${d === clock.date ? ' · hoje' : T.relDay(d, clock.date) === 'amanhã' ? ' · amanhã' : ''}`;
  const focusDate = () => (clock.date < D.event.start ? D.event.start : clock.date > D.event.end ? D.event.end : clock.date);
  const sessionsOf = (f) => T.allSessions().filter(f);
  const nextOf = (c) => T.nextSession(c, clock) || T.allSessions().find((x) => x.course === c);
  const courseSort = {
    proximas: (a, b) => { const sa = T.courseState(a, clock) === 'past'; const sb = T.courseState(b, clock) === 'past'; if (sa !== sb) return sa ? 1 : -1; const na = nextOf(a); const nb = nextOf(b); return na.date.localeCompare(nb.date) || T.toMin(na.time) - T.toMin(nb.time) || T.title(a, true).localeCompare(T.title(b, true)); },
    az: (a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'),
    ch: (a, b) => b.hours - a.hours || courseSort.az(a, b),
  };
  function searchable(c) {
    return T.norm([c.title, c.short, c.audience, c.tags.map((t) => D.tags[t]).join(' '), c.sessions.map((x) => `${D.venues[x.venue].name} ${x.room}`).join(' '), String(c.id)].join(' '));
  }
  function filterCourses(p) {
    const q = T.norm(p.get('q') || '').trim(); const tag = p.get('tema'); const dia = p.get('dia'); const turno = p.get('turno'); const local = p.get('local'); const fav = p.get('fav');
    return D.courses.filter((c) => {
      if (q && !q.split(/\s+/).every((w) => searchable(c).includes(w))) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (fav && !favs.has(c.id)) return false;
      const sess = c.sessions.filter((x) => (!dia || x.date === dia) && (!turno || T.shiftOf(x.time) === turno) && (!local || x.venue === local));
      return sess.length > 0;
    });
  }
  const activeFilterCount = (p) => ['tema', 'dia', 'turno', 'local', 'fav'].filter((k) => p.get(k)).length;

  // ---------- componentes ----------
  const sessRow = (x, opts) => {
    const o = opts || {}; const s = st(x); const c = shiftColor(x.shift);
    return `<button class="sess ${s}" style="--c:${c}" data-sheet="curso" data-id="${x.course.id}" aria-label="${esc(T.title(x.course))}">
      <span class="sess-time"><b>${T.fmtTime(x.time)}</b><small>${o.showDate ? esc(T.fmtDate(x.date, 'wd')) : esc(T.SHIFTS[x.shift].short)}</small></span>
      <span class="sess-body"><b>${esc(T.title(x.course, true))}</b><small class="room">${I('door')}${esc(roomLabel(x))}${x.label ? ` · ${esc(x.label)}` : ''}</small><small>${esc(x.course.audience)}</small></span>
      <span class="sess-right">${stateBadge(s, c)}${favs.has(x.course.id) ? `<span class="cc-fav">${I('bookmark')}</span>` : ''}${I('right')}</span></button>`;
  };
  const courseCard = (c) => {
    const s = T.courseState(c, clock); const nx = nextOf(c); const col = shiftColor(nx.shift);
    const venues = [...new Set(c.sessions.map((x) => D.venues[x.venue].short))].join(' · ');
    return `<button class="card course-card" style="--c:${col}" data-sheet="curso" data-id="${c.id}">
      <div class="cc-top"><span class="cc-tags">${c.tags.map((t) => `<span class="tagc">${esc(D.tags[t])}</span>`).join('')}${s === 'now' ? `<span class="badge now" style="--c:${col}">agora</span>` : s === 'today' ? '<span class="badge today">hoje</span>' : s === 'past' ? '<span class="badge past">encerrado</span>' : ''}</span>${favs.has(c.id) ? `<span class="cc-fav" title="Nos meus cursos">${I('bookmark')}</span>` : ''}</div>
      <h3>${esc(c.title)}</h3>
      <p class="cc-aud">${esc(c.audience)}</p>
      <div class="cc-meta"><span>${I('hourglass')}${c.hours}h</span><span>${I('users')}${c.seats} vagas</span><span>${I('pin')}${esc(venues)}</span></div>
      <div class="cc-dates">${T.allSessions().filter((x) => x.course === c).map((x) => `<span class="datec ${st(x)}" style="--c:${shiftColor(x.shift)}"><i></i>${esc(T.fmtDate(x.date, 'wd'))} · ${T.fmtTime(x.time)}${x.room ? ` · ${esc(x.room)}` : ''}</span>`).join('')}</div>
    </button>`;
  };
  const svcCard = (s) => `<button class="card svc-card" style="--c:${s.color}" data-sheet="servico" data-id="${s.id}"><span class="svc-ico">${I(s.icon)}</span><span><b>${s.num ? `<em>${s.num}.</em>` : ''}${esc(s.title)}</b><small>${esc(s.summary)}</small></span><span class="chev">${I('right')}</span></button>`;
  const chip = (label, on, attrs, color) => `<button class="chip ${on ? 'on' : ''} ${color ? 'c' : ''}" ${attrs} ${color ? `style="--c:${color}"` : ''}>${color ? '<i></i>' : ''}${label}</button>`;
  const empty = (icon, text) => `<div class="empty">${I(icon)}<p>${text}</p></div>`;

  // ---------- telas ----------
  function viewInicio() {
    const days = T.eventDays(); const idx = days.indexOf(clock.date);
    const diff = Math.round((Date.parse(D.event.start) - Date.parse(clock.date)) / 864e5);
    const status = idx >= 0 ? `${I('sparkles')}Hoje é o ${idx + 1}º dia do evento` : diff > 0 ? `${I('calendar')}${diff === 1 ? 'Começa amanhã' : `Começa em ${diff} dias`}` : `${I('check')}Evento encerrado · obrigado!`;
    // Agora / a seguir
    const date = focusDate(); const todayList = sessionsOf((x) => x.date === date);
    let nowList = todayList.filter((x) => st(x) === 'now'); let nowTitle = 'Acontecendo agora'; let more = '';
    if (!nowList.length) {
      let up = date === clock.date ? todayList.filter((x) => st(x) === 'today') : todayList; let lbl = date === clock.date ? 'A seguir hoje' : `${T.fmtDate(date, 'wdlong')}`;
      if (!up.length) { const nd = days.find((d) => d > clock.date && sessionsOf((x) => x.date === d).length); if (nd) { up = sessionsOf((x) => x.date === nd); lbl = T.relDay(nd, clock.date) === 'amanhã' ? 'Amanhã' : T.fmtDate(nd, 'wdlong'); } }
      if (up.length) { const k = up[0].shift; nowList = up.filter((x) => x.shift === k); nowTitle = `${lbl} · ${T.SHIFTS[k].label} ${T.fmtTime(T.SHIFTS[k].start)}`; }
    }
    if (nowList.length > 4) { more = `<button class="link" data-go="programacao?d=${nowList[0].date}">Ver todos (${nowList.length}) ${I('right')}</button>`; nowList = nowList.slice(0, 4); }
    const favList = D.courses.filter((c) => favs.has(c.id));
    return `
      <section class="hero"><span class="eyebrow">${esc(D.event.edition)} · ${esc(D.event.datesLabel)}</span><h1>${esc(D.event.name)}</h1><p>${esc(D.event.place)} · ${esc(D.event.tagline)}. Cursos, horários, salas e inscrições na palma da mão.</p><span class="status">${status}</span>
        <form class="search" data-search-form role="search"><label class="sr-only" for="q0">Buscar curso</label>${I('search')}<input id="q0" type="search" placeholder="Buscar curso, público ou tema…" autocomplete="off"><button class="icon-btn" type="submit" aria-label="Buscar">${I('right')}</button></form></section>
      ${nowList.length ? `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('clock')}</span><h2>${nowTitle}</h2><button class="link" data-go="programacao?d=${nowList[0].date}">Programação ${I('right')}</button></div><div class="stack cols">${nowList.map((x) => sessRow(x, { showDate: nowList[0].date !== clock.date })).join('')}</div>${more}</section>` : ''}
      <div class="quick">
        <button data-go="programacao"><span class="q-ico">${I('calendar')}</span><span><b>Programação</b><small>por dia e turno</small></span></button>
        <button data-go="cursos"><span class="q-ico">${I('graduation')}</span><span><b>${D.courses.length} cursos</b><small>gratuitos, com inscrição</small></span></button>
        <button data-go="servicos"><span class="q-ico">${I('handshake')}</span><span><b>Serviços</b><small>${D.services.length - 1} pilares de atendimento</small></span></button>
        <button data-go="locais"><span class="q-ico">${I('pin')}</span><span><b>Locais</b><small>${Object.keys(D.venues).length} pontos de atendimento</small></span></button>
      </div>
      ${favList.length ? `<section class="sec"><div class="sec-head"><span class="sec-ico">${I('bookmark')}</span><h2>Meus cursos <small>${favList.length}</small></h2><button class="link" data-go="cursos?fav=1">Ver ${I('right')}</button></div><div class="stack cols">${favList.slice(0, 4).map((c) => sessRow(nextOf(c), { showDate: true })).join('')}</div></section>` : ''}
      <section class="sec"><div class="sec-head"><span class="sec-ico">${I('handshake')}</span><h2>Serviços gratuitos</h2><button class="link" data-go="servicos">Todos ${I('right')}</button></div>
        <div class="hscroll">${D.services.map((s) => `<button class="pillar-mini" style="--c:${s.color}" data-sheet="servico" data-id="${s.id}"><i>${I(s.icon)}</i><b>${esc(s.title)}</b><small>${esc(s.summary)}</small></button>`).join('')}</div></section>
      <footer class="foot">${esc(D.event.organizer)}<br>${esc(D.event.edition)} · ${esc(D.event.place)} · ${esc(D.event.datesLabel)}<br><a href="tv.html">Modo TV</a></footer>`;
  }

  function viewProgramacao() {
    const days = T.eventDays(); const d = days.includes(route.p.get('d')) ? route.p.get('d') : focusDate(); const local = route.p.get('local') || '';
    const list = sessionsOf((x) => x.date === d && (!local || x.venue === local));
    const shifts = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
    return `<div class="page-head"><span class="page-ico">${I('calendar')}</span><h1>Programação</h1></div>
      <div class="tabs" role="tablist">${days.map((x) => `<button role="tab" aria-selected="${x === d}" class="${x === d ? 'on' : ''} ${x === clock.date ? 'today' : ''}" data-param="d" data-value="${x}"><small>${T.fmtDate(x, 'wd').split(' ')[0]}</small><b>${x.slice(8)}</b><em>${sessionsOf((y) => y.date === x).length} aulas</em></button>`).join('')}</div>
      <div class="chips scroll">${chip('Todos os locais', !local, 'data-param="local" data-value=""')}${Object.values(D.venues).map((v) => chip(esc(v.short), local === v.id, `data-param="local" data-value="${v.id}"`)).join('')}</div>
      <p class="page-lead">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''} · ${list.length} aula${list.length === 1 ? '' : 's'}${local ? ` em ${esc(D.venues[local].name)}` : ''}</p>
      ${shifts.length ? shifts.map((k) => { const sh = T.SHIFTS[k]; const l = list.filter((x) => x.shift === k); return `<section class="sec"><div class="sec-head"><span class="sec-ico c" style="--c:${sh.color}">${I(T.SHIFT_ICON[k])}</span><h2>${sh.label} <small>${T.fmtTime(sh.start)}–${T.fmtTime(sh.end)}</small></h2><span class="muted tiny">${l.length} curso${l.length === 1 ? '' : 's'}</span></div><div class="stack cols">${l.map((x) => sessRow(x)).join('')}</div></section>`; }).join('') : empty('calendar', 'Nenhum curso neste dia e local. Confira os serviços gratuitos na aba Serviços.')}`;
  }

  function viewCursos() {
    const p = route.p; const q = p.get('q') || ''; const sort = p.get('ord') || 'proximas';
    const list = filterCourses(p).sort(courseSort[sort] || courseSort.proximas);
    const n = activeFilterCount(p);
    const days = T.eventDays();
    return `<div class="page-head"><span class="page-ico">${I('graduation')}</span><h1>Cursos <span class="count">${D.courses.length}</span></h1></div>
      <div class="filter-bar"><div class="search">${I('search')}<label class="sr-only" for="q">Buscar</label><input id="q" type="search" value="${esc(q)}" placeholder="Buscar por nome, público, tema…" autocomplete="off" data-search>${q ? `<button class="icon-btn" data-param="q" data-value="" aria-label="Limpar busca">${I('x')}</button>` : ''}</div><button class="icon-btn ${filtersOpen || n ? 'on' : ''}" data-toggle-filters aria-label="Filtros" aria-expanded="${filtersOpen}">${I('sliders')}${n ? `<em>${n}</em>` : ''}</button></div>
      ${filtersOpen || n ? `<div class="filters">
        <div class="f-group"><small>Tema</small><div class="chips">${chip('Todos', !p.get('tema'), 'data-param="tema" data-value=""')}${Object.entries(D.tags).map(([k, v]) => chip(esc(v), p.get('tema') === k, `data-param="tema" data-value="${k}"`)).join('')}</div></div>
        <div class="f-group"><small>Dia</small><div class="chips">${chip('Todos', !p.get('dia'), 'data-param="dia" data-value=""')}${days.map((d) => chip(esc(T.fmtDate(d, 'wd')), p.get('dia') === d, `data-param="dia" data-value="${d}"`)).join('')}</div></div>
        <div class="f-group"><small>Turno</small><div class="chips">${chip('Todos', !p.get('turno'), 'data-param="turno" data-value=""')}${T.SHIFT_ORDER.map((k) => chip(`${T.SHIFTS[k].label} ${T.fmtTime(T.SHIFTS[k].start)}`, p.get('turno') === k, `data-param="turno" data-value="${k}"`, T.SHIFTS[k].color)).join('')}</div></div>
        <div class="f-group"><small>Local</small><div class="chips">${chip('Todos', !p.get('local'), 'data-param="local" data-value=""')}${Object.values(D.venues).map((v) => chip(esc(v.short), p.get('local') === v.id, `data-param="local" data-value="${v.id}"`)).join('')}</div></div>
        <div class="f-group"><small>Outros</small><div class="chips">${chip(`${I('bookmark')}Meus cursos${favs.size ? ` (${favs.size})` : ''}`, !!p.get('fav'), `data-param="fav" data-value="${p.get('fav') ? '' : '1'}"`)}${n ? chip(`${I('x')}Limpar filtros`, false, 'data-clear-filters', null).replace('class="chip', 'class="chip clear') : ''}</div></div>
      </div>` : ''}
      <div class="result-line"><span>${list.length} de ${D.courses.length} curso${D.courses.length === 1 ? '' : 's'}</span><label>Ordenar <select data-param="ord"><option value="proximas" ${sort === 'proximas' ? 'selected' : ''}>Próximas datas</option><option value="az" ${sort === 'az' ? 'selected' : ''}>A–Z</option><option value="ch" ${sort === 'ch' ? 'selected' : ''}>Carga horária</option></select></label></div>
      ${list.length ? `<div class="stack cols">${list.map(courseCard).join('')}</div>` : empty('search', 'Nenhum curso encontrado. Tente outra palavra ou limpe os filtros.')}`;
  }

  function viewServicos() {
    return `<div class="page-head"><span class="page-ico">${I('handshake')}</span><h1>Serviços</h1></div>
      <p class="page-lead">${esc(D.event.tagline)}. Toque em um pilar para ver todos os atendimentos e os parceiros responsáveis.</p>
      <div class="stack cols">${D.services.map(svcCard).join('')}</div>`;
  }

  function viewLocais() {
    return `<div class="page-head"><span class="page-ico">${I('pin')}</span><h1>Locais</h1></div>
      <p class="page-lead">Onde acontecem os cursos. Toque para ver a programação de cada local.</p>
      <div class="stack cols">${Object.values(D.venues).map((v) => { const n = sessionsOf((x) => x.venue === v.id).length; const days = [...new Set(sessionsOf((x) => x.venue === v.id).map((x) => x.date))];
        return `<button class="card svc-card venue-card" style="--c:${'#60a5fa'}" data-sheet="local" data-id="${v.id}"><span class="svc-ico">${I('building')}</span><span><b>${esc(v.name)}</b><small>${esc(v.city)} · ${n} aula${n === 1 ? '' : 's'} em ${days.length} dia${days.length === 1 ? '' : 's'}</small>${v.rooms.length ? `<span class="rooms">${v.rooms.map((r) => `<span>${esc(r)}</span>`).join('')}</span>` : ''}</span><span class="chev">${I('right')}</span></button>`; }).join('')}</div>`;
  }

  // ---------- folhas ----------
  function sheetCurso(c) {
    const sessions = T.allSessions().filter((x) => x.course === c);
    const byDay = {}; sessions.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    const venues = [...new Set(sessions.map((x) => D.venues[x.venue].short))].join(' · ');
    const fav = favs.has(c.id); const s = T.courseState(c, clock);
    const links = [...new Set(sessions.map((x) => x.link))];
    const qr = T.qrSvg(location.href.split('#')[0] + `#curso/${c.id}`, { margin: 1 });
    return `<div class="sheet-head"><span class="kicker">${I('graduation')}Curso gratuito · Escola de Contas · TCE/AP</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div>
      <div class="sheet-body"><h2>${esc(c.title)}</h2>
        <div class="chips" style="margin-top:0">${c.tags.map((t) => `<span class="tagc">${esc(D.tags[t])}</span>`).join('')}${s === 'now' ? `<span class="badge now" style="--c:${shiftColor(nextOf(c).shift)}">acontecendo agora</span>` : s === 'past' ? '<span class="badge past">encerrado</span>' : ''}</div>
        <div class="meta-grid"><div><small>Carga horária</small><b>${c.hours}h</b></div><div><small>Vagas</small><b>${c.seats}</b></div><div><small>Local</small><b>${esc(venues)}</b></div></div>
        <p><b>Público-alvo:</b> ${esc(c.audience)}</p>
        ${c.note ? `<p class="note" style="margin-top:.6em">${I('info')}<span>${esc(c.note)}</span></p>` : ''}
        <h3>${I('calendar')}Aulas (${sessions.length})</h3>
        ${Object.keys(byDay).map((d) => `<div class="day-group"><small class="${d === clock.date ? 'today' : ''}">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''}</small>${byDay[d].map((x) => { const sx = st(x); return `<div class="sess-static ${sx}" style="--c:${shiftColor(x.shift)}"><span class="sess-time"><b>${T.fmtTime(x.time)}</b><small>${esc(T.SHIFTS[x.shift].short)}</small></span><span class="sess-body"><b>${esc(x.room || D.venues[x.venue].short)}${x.label ? ` · ${esc(x.label)}` : ''}</b><small>${esc(D.venues[x.venue].name)} · até ${T.fmtTime(T.sessionEnd(x))}</small></span><span class="sess-right">${stateBadge(sx, shiftColor(x.shift))}</span>${links.length > 1 && x.link !== c.link ? `<a class="sess-link link" href="${esc(x.link)}" target="_blank" rel="noopener">Inscrição ${esc(x.label || '')} ${I('external')}</a>` : ''}</div>`; }).join('')}</div>`).join('')}
        <div class="actions">
          <a class="btn btn-primary" href="${esc(c.link)}" target="_blank" rel="noopener">${I('external')}Inscrever-se${links.length > 1 ? ` (${esc(sessions.find((x) => x.link === c.link)?.label || 'Turma I')})` : ''}</a>
          <button class="btn btn-ghost ${fav ? 'on' : ''}" data-fav="${c.id}">${I('bookmark')}${fav ? 'Salvo' : 'Salvar'}</button>
          <button class="btn btn-ghost" data-ics="${c.id}">${I('calendarplus')}Lembrar</button>
          <button class="btn btn-ghost" data-share="${c.id}">${I('share')}Compartilhar</button>
          <button class="btn btn-ghost" data-go="programacao?d=${nextOf(c).date}">${I('calendar')}Ver o dia</button>
        </div>
        <p class="tiny muted">As inscrições são feitas no site da Escola de Contas (ESCON).${c.linkNote ? ' Se o link não abrir, procure o curso pelo nome na página de cursos da Escola de Contas.' : ''}</p>
        <div class="qr-box">${qr}<small><b>Mostre para alguém:</b> este QR Code abre esta página do curso no celular.</small></div>
      </div>`;
  }
  function sheetServico(s) {
    return `<div class="sheet-head"><span class="kicker" style="color:color-mix(in srgb,${s.color} 70%,var(--ink))">${I(s.icon)}${s.num ? `Pilar ${s.num}` : 'Acolhida'} · Serviços gratuitos</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div>
      <div class="sheet-body" style="--c:${s.color}"><h2>${esc(s.title)}</h2><p class="muted">${esc(s.summary)}</p>
        <h3>${I('check')}O que é oferecido</h3><ul class="ul">${s.items.map((it) => `<li><i></i><span>${esc(it)}</span></li>`).join('')}</ul>
        <h3>${I('users')}Parceiros</h3><div class="partners">${s.partners.map((p) => `<span>${esc(p)}</span>`).join('')}</div>
        ${s.coursesLink ? `<div class="actions"><button class="btn btn-primary" data-go="cursos">${I('graduation')}Ver os ${D.courses.length} cursos com inscrição</button></div>` : ''}
        <div class="share-row"><button class="btn btn-ghost" data-share-svc="${s.id}">${I('share')}Compartilhar</button></div>
      </div>`;
  }
  function sheetLocal(v) {
    const list = sessionsOf((x) => x.venue === v.id); const byDay = {}; list.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    return `<div class="sheet-head"><span class="kicker">${I('pin')}Local · ${esc(v.city)}</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div>
      <div class="sheet-body"><h2>${esc(v.name)}</h2>${v.rooms.length ? `<div class="partners">${v.rooms.map((r) => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
        <h3>${I('calendar')}Programação neste local (${list.length})</h3>
        ${Object.keys(byDay).map((d) => `<div class="day-group"><small class="${d === clock.date ? 'today' : ''}">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''}</small><div class="stack">${byDay[d].map((x) => sessRow(x)).join('')}</div></div>`).join('') || empty('calendar', 'Sem cursos cadastrados neste local.')}
      </div>`;
  }

  // ---------- render ----------
  function shell() {
    const navBtns = (cls) => Object.entries(VIEWS).map(([k, v]) => `<button class="${route.view === k ? 'on' : ''}" data-go="${k}" aria-label="${v.label}"><span class="nav-ico">${I(v.icon)}</span>${v.label}</button>`).join('');
    root.innerHTML = `<header class="app-head"><button class="app-brand" data-go="inicio"><span class="logo-chip"><img src="img/tce-mark.png" alt=""></span><span><b>${esc(D.event.name)}</b><small>${esc(D.event.edition)} · ${esc(D.event.placeShort)}</small></span></button><div class="app-head-right">${T.isSimulated() ? '<span class="demo-pill">demo</span>' : ''}<div class="app-clock" id="clock"></div></div></header>
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
    main.innerHTML = { inicio: viewInicio, programacao: viewProgramacao, cursos: viewCursos, servicos: viewServicos, locais: viewLocais }[route.view]();
    if (!keepScroll) window.scrollTo({ top: 0 });
    if (wasSearch) { const inp = main.querySelector('[data-search]'); if (inp) { inp.focus(); try { inp.setSelectionRange(pos[0], pos[1]); } catch { /* */ } } }
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
      if (route.sheet) { sheetPushed = false; }
      go(`#${view}${qs ? `?${qs}` : ''}`); return;
    }
    if ((b = el('[data-param]')) && b.tagName !== 'SELECT') { setParam(b.dataset.param, b.dataset.value); return; }
    if ((b = el('[data-toggle-filters]'))) { filtersOpen = !filtersOpen; renderMain(true); return; }
    if ((b = el('[data-clear-filters]'))) { const p = new URLSearchParams(); if (route.p.get('q')) p.set('q', route.p.get('q')); filtersOpen = false; go(hashOf('cursos', p), true); return; }
    if ((b = el('[data-fav]'))) {
      const id = Number(b.dataset.fav); if (favs.has(id)) { favs.delete(id); toast('Removido dos meus cursos', 'bookmark'); } else { favs.add(id); toast('Salvo em "Meus cursos"', 'bookmark'); }
      saveFavs(); renderSheet(); renderMain(true); return;
    }
    if ((b = el('[data-ics]'))) { const c = T.courseById(b.dataset.ics); download(`curso-${c.id}.ics`, T.icsFor(c), 'text/calendar'); toast('Lembrete gerado: abra o arquivo para salvar na agenda'); return; }
    if ((b = el('[data-share]'))) { const c = T.courseById(b.dataset.share); const nx = nextOf(c); share(T.title(c), `${T.title(c)} · ${T.fmtDate(nx.date, 'wdlong')} às ${T.fmtTime(nx.time)} · ${roomLabel(nx)} · ${D.event.name}`, location.href.split('#')[0] + `#curso/${c.id}`); return; }
    if ((b = el('[data-share-svc]'))) { const s = T.serviceById(b.dataset.shareSvc); share(s.title, `${s.title}: ${s.summary} · ${D.event.name} · ${D.event.datesLabel}`, location.href.split('#')[0] + `#servico/${s.id}`); return; }
  });
  document.addEventListener('change', (e) => { const s = e.target.closest('select[data-param]'); if (s) setParam(s.dataset.param, s.value); });
  document.addEventListener('submit', (e) => { const f = e.target.closest('[data-search-form]'); if (!f) return; e.preventDefault(); const q = f.querySelector('input').value.trim(); const p = new URLSearchParams(); if (q) p.set('q', q); go(hashOf('cursos', p)); });
  let searchTimer = null;
  document.addEventListener('input', (e) => { const inp = e.target.closest('[data-search]'); if (!inp) return; clearTimeout(searchTimer); searchTimer = setTimeout(() => setParam('q', inp.value.trim()), 180); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && route.sheet) closeSheet(); });
  window.addEventListener('hashchange', onRoute);

  // Arraste para fechar a folha (celular). Ignora o toque em botões para não engolir o clique.
  let drag = null;
  document.addEventListener('pointerdown', (e) => { const grab = e.target.closest('.sheet-head, .sheet-grab'); if (!grab || e.target.closest('button,a')) return; drag = { y: e.clientY, sheet: grab.closest('.sheet') }; });
  document.addEventListener('pointermove', (e) => { if (!drag) return; const dy = Math.max(0, e.clientY - drag.y); drag.sheet.style.transform = `translateY(${dy}px)`; drag.dy = dy; });
  document.addEventListener('pointerup', () => { if (!drag) return; if (drag.dy > 90) closeSheet(); else drag.sheet.style.transform = ''; drag = null; });

  // ---------- início ----------
  shell();
  onRoute();
  setInterval(() => { const c = T.now(); if (c.time !== clock.time) { clock = c; renderClock(); if (c.seconds === 0 || c.time.endsWith(':00')) { renderMain(true); if (route.sheet) renderSheet(); } } }, 1000);
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
