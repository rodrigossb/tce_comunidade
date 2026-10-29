/* Totem (quiosque vertical por toque). Interface própria, sobre os mesmos dados e utilitários do app
   (js/data.js, js/shared.js). Sem memória entre pessoas; volta ao início e à tela de descanso sozinho. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc;
  const root = document.getElementById('totem');
  const P = T.params;
  const LOCAL = D.venues[P.get('local')] ? P.get('local') : 'jn';
  const VENUE = D.venues[LOCAL];
  const IDLE_MS = Math.max(20, Number(P.get('ocioso')) || 90) * 1000;
  const ATTRACT = P.get('descanso') !== '0'; // ?descanso=0 → sem tela de descanso: cai direto em "explorar" e volta ao início quando ocioso
  const APP_BASE = P.get('app') || new URL('./', location.href).href;
  const VIEWS = { inicio: ['Início', 'home'], programacao: ['Programação', 'calendar'], cursos: ['Cursos', 'graduation'], servicos: ['Serviços', 'handshake'], locais: ['Locais', 'pin'] };
  const PANELS = { curso: 'cursos', servico: 'servicos', local: 'locais' };

  let clock = T.now();
  let route = { view: 'inicio', p: new URLSearchParams(), panel: null, id: null };
  let lastBase = 'inicio';
  const openShifts = new Set();
  let idleTimer = null; let attractEl = null; let keyboardEl = null; let input = null;

  // ---------- rotas (hash, para o botão Voltar funcionar) ----------
  function parse() {
    const h = decodeURIComponent(location.hash.slice(1) || 'inicio');
    const [path, qs] = h.split('?'); const [view, id] = path.split('/'); const p = new URLSearchParams(qs || '');
    if (PANELS[view]) return { view: lastBase, p: route.p, panel: view, id };
    return { view: VIEWS[view] ? view : (view === 'busca' ? 'busca' : 'inicio'), p, panel: null, id: null };
  }
  const hashOf = (view, p) => { const q = p && [...p.keys()].length ? `?${p.toString()}` : ''; return `#${view}${q}`; };
  const go = (hash, replace) => { if (replace) { history.replaceState(null, '', hash); onRoute(); } else location.hash = hash; };
  const setParam = (k, v) => { const p = new URLSearchParams(route.p); if (v == null || v === '') p.delete(k); else p.set(k, v); go(hashOf(route.view, p), true); };
  function onRoute() {
    const prev = route; route = parse();
    if (!route.panel) lastBase = route.view;
    const changed = !prev || prev.view !== route.view || prev.p.toString() !== route.p.toString();
    if (changed || !route.panel) renderMain(prev && prev.view === route.view);
    renderNav(); renderPanel();
  }
  function closePanel() {
    const el = document.getElementById('panel'); if (el) el.classList.add('closing');
    setTimeout(() => go(hashOf(route.view, route.p), true), 180);
  }

  // ---------- domínio ----------
  const st = (x) => T.sessionState(x, clock);
  const col = (k) => T.SHIFTS[k].color;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const focusDate = () => (clock.date < D.event.start ? D.event.start : clock.date > D.event.end ? D.event.end : clock.date);
  const sessionsOf = (f) => T.allSessions().filter(f);
  const nextOf = (c) => T.nextSession(c, clock) || T.allSessions().find((x) => x.course === c);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  const shiftState = (k, date) => { if (date < clock.date) return 'past'; if (date > clock.date) return 'later'; const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later'; };
  const dayWord = (d) => (d === clock.date ? 'hoje' : T.relDay(d, clock.date) === 'amanhã' ? 'amanhã' : T.fmtDate(d, 'wdlong'));
  const roomLabel = (x) => (x.room ? `${x.room} · ${D.venues[x.venue].short}` : D.venues[x.venue].name);
  const byNext = (a, b) => { const sa = T.courseState(a, clock) === 'past'; const sb = T.courseState(b, clock) === 'past'; if (sa !== sb) return sa ? 1 : -1; const na = nextOf(a); const nb = nextOf(b); return na.date.localeCompare(nb.date) || T.toMin(na.time) - T.toMin(nb.time) || T.title(a, true).localeCompare(T.title(b, true)); };
  const badge = (s, c) => (s === 'now' ? `<span class="badge now" style="--c:${c}">agora</span>` : s === 'today' ? '<span class="badge today">hoje</span>' : s === 'past' ? '<span class="badge">encerrada</span>' : '');
  const qrFor = (hash) => T.qrSvg(`${APP_BASE}#${hash}`, { margin: 1 });

  // ---------- componentes ----------
  const row = (x, o) => { o = o || {}; const s = st(x); const c = col(x.shift);
    return `<button class="tt-row ${s}" style="--c:${c}" data-panel="curso" data-id="${x.course.id}"><span class="tt-time"><b>${T.fmtTime(x.time)}</b><small>${o.date ? esc(T.fmtDate(x.date, 'wd')) : `até ${T.fmtTime(T.sessionEnd(x))}`}</small></span><span class="tt-body"><span class="room">${I('door')}${esc(roomLabel(x))}${x.label ? ` · ${esc(x.label)}` : ''}</span><b>${esc(T.title(x.course, true))}</b><small>Para: ${esc(x.course.audience)}</small></span><span class="tt-right">${badge(s, c)}${I('right')}</span></button>`; };
  const courseRow = (c) => { const s = T.courseState(c, clock); const nx = nextOf(c); const cc = col(nx.shift);
    return `<button class="tt-row two ${s === 'now' ? 'now' : s === 'past' ? 'past' : ''}" style="--c:${cc}" data-panel="curso" data-id="${c.id}"><span class="tt-body"><span class="room">${I('tag')}${c.tags.map((t) => esc(D.tags[t])).join(' · ')}</span><b>${esc(c.title)}</b><small>Para: ${esc(c.audience)}</small><span class="tt-dates">${T.allSessions().filter((x) => x.course === c).map((x) => `<span class="tt-date ${st(x)}" style="--c:${col(x.shift)}"><i></i>${esc(T.fmtDate(x.date, 'wd'))} · ${T.fmtTime(x.time)}${x.room ? ` · ${esc(x.room)}` : ''}</span>`).join('')}</span></span><span class="tt-right">${badge(s, cc)}${I('right')}</span></button>`; };
  const svcCard = (s, hits) => `<button class="tt-svc" style="--c:${s.color}" data-panel="servico" data-id="${s.id}"><i>${I(s.icon)}</i><span><b>${s.num ? `<em>${s.num}.</em>` : ''}${esc(s.title)}</b><small>${esc(s.summary)}</small>${hits && hits.length ? `<ul class="hits">${hits.map((h) => `<li>${I('check')}<span>${esc(h)}</span></li>`).join('')}</ul>` : ''}</span>${I('right')}</button>`;
  const venueCard = (v) => { const list = sessionsOf((x) => x.venue === v.id); const days = new Set(list.map((x) => x.date));
    return `<button class="tt-svc" style="--c:#60a5fa" data-panel="local" data-id="${v.id}"><i>${I('building')}</i><span><b>${esc(v.name)}</b><small>${esc(v.city)} · ${list.length} aula${list.length === 1 ? '' : 's'} em ${days.size} dia${days.size === 1 ? '' : 's'}</small>${v.rooms.length ? `<span class="tt-rooms">${v.rooms.map((r) => `<span>${esc(r)}</span>`).join('')}</span>` : ''}</span>${I('right')}</button>`; };
  const chip = (label, on, attrs, c) => `<button class="tt-chip ${on ? 'on' : ''} ${c ? 'c' : ''}" ${attrs} ${c ? `style="--c:${c}"` : ''}>${c ? '<i></i>' : ''}${label}</button>`;
  const empty = (icon, text) => `<div class="tt-empty">${I(icon)}<p>${text}</p></div>`;
  const searchField = (q, opts) => { const o = opts || {}; return `<div class="tt-search ${o.live ? 'on' : ''}">${I('search')}<input id="q" type="search" value="${esc(q || '')}" placeholder="${esc(o.placeholder || 'Toque para buscar curso, serviço ou sala')}" autocomplete="off" inputmode="none" data-search>${q ? `<button class="clr" data-clear aria-label="Limpar">${I('x')}</button>` : ''}</div>`; };
  const secHead = (icon, title, extra, c) => `<div class="tt-sec-head"><span class="tt-sec-ico ${c ? 'c' : ''}" ${c ? `style="--c:${c}"` : ''}>${I(icon)}</span><h2>${title}</h2>${extra || ''}</div>`;

  // ---------- telas ----------
  function viewInicio() {
    const days = T.eventDays(); const idx = days.indexOf(clock.date); const diff = Math.round((Date.parse(D.event.start) - Date.parse(clock.date)) / 864e5);
    const status = idx >= 0 ? `<b>${cap(T.fmtDate(clock.date, 'wdlong'))}</b> · ${idx + 1}º dia do evento` : diff > 0 ? `O evento <b>começa ${diff === 1 ? 'amanhã' : `em ${diff} dias`}</b> · ${esc(D.event.datesLabel)}` : 'Evento encerrado · obrigado, Oiapoque!';
    const date = focusDate(); const here = sessionsOf((x) => x.date === date && x.venue === LOCAL);
    const now = here.filter((x) => st(x) === 'now'); const up = here.filter((x) => st(x) === 'today');
    const list = now.length ? now : up.length ? up.filter((x) => x.shift === up[0].shift) : here.filter((x) => x.shift === (here[0] || {}).shift);
    const title = now.length ? 'Acontecendo agora' : up.length ? `A seguir · ${T.SHIFTS[up[0].shift].label} às ${T.fmtTime(T.SHIFTS[up[0].shift].start)}` : here.length ? `${cap(dayWord(date))} · ${T.SHIFTS[here[0].shift].label}` : '';
    const live = now.length ? `<span class="live"><i></i>${now.length} agora</span>` : '';
    const s1 = T.serviceById('pilar-1'); const s2 = T.serviceById('pilar-2');
    return `<h1 class="tt-h1">Olá! <em>O que você procura?</em></h1>
      <p class="tt-status">${I('sparkles')}<span>${status}</span></p>
      <button class="tt-search" data-go="busca">${I('search')}<span>Toque para buscar curso, serviço ou sala</span></button>
      <div class="tt-tiles">
        <button class="tt-tile primary" style="--c:${D.event.shifts.manha.color}" data-go="programacao">${live}<i>${I('calendar')}</i><span><b>Programação de hoje</b><small>${here.length} curso${here.length === 1 ? '' : 's'} em ${esc(VENUE.short)}</small></span></button>
        <button class="tt-tile" style="--c:#34d399" data-go="cursos"><i>${I('graduation')}</i><span><b>Cursos gratuitos</b><small>${D.courses.length} cursos com inscrição</small></span></button>
        <button class="tt-tile" style="--c:${s1.color}" data-panel="servico" data-id="${s1.id}"><i>${I(s1.icon)}</i><span><b>${esc(s1.short)}</b><small>${esc(s1.summary)}</small></span></button>
        <button class="tt-tile" style="--c:${s2.color}" data-panel="servico" data-id="${s2.id}"><i>${I(s2.icon)}</i><span><b>${esc(s2.short)}</b><small>${esc(s2.summary)}</small></span></button>
        <button class="tt-tile" style="--c:${D.event.shifts.manha.color}" data-go="servicos"><i>${I('handshake')}</i><span><b>Todos os serviços</b><small>${D.services.length} blocos de atendimento gratuito, sem inscrição</small></span></button>
        <button class="tt-tile" style="--c:#c084fc" data-go="locais"><i>${I('pin')}</i><span><b>Onde fica</b><small>${Object.keys(D.venues).length} locais em Oiapoque e no Manga</small></span></button>
      </div>
      ${list.length ? `<section class="tt-sec">${secHead('clock', title, `<button class="tt-link" data-go="programacao">Ver tudo ${I('right')}</button>`)}<div class="tt-stack">${list.slice(0, 4).map((x) => row(x, { date: date !== clock.date })).join('')}</div></section>` : ''}`;
  }

  function viewProgramacao() {
    const days = T.eventDays(); const p = route.p; const d = days.includes(p.get('d')) ? p.get('d') : focusDate(); const all = p.get('todos') === '1';
    const list = sessionsOf((x) => x.date === d && (all || x.venue === LOCAL));
    let nowCard = '';
    if (d === clock.date) {
      const now = list.filter((x) => st(x) === 'now'); const up = list.filter((x) => st(x) === 'today');
      if (now.length) { const k = now[0].shift; nowCard = `<button class="tt-now" style="--c:${col(k)}" data-scroll="turno-${k}"><i>${I('clock')}</i><span><b>Acontecendo agora · ${T.SHIFTS[k].label} até ${T.fmtTime(T.SHIFTS[k].end)}</b><small>${now.length} curso${now.length > 1 ? 's' : ''} em andamento</small></span>${I('down')}</button>`; }
      else if (up.length) { const k = up[0].shift; const n = up.filter((x) => x.shift === k).length; nowCard = `<button class="tt-now next" style="--c:${col(k)}" data-scroll="turno-${k}"><i>${I('next')}</i><span><b>A seguir · ${T.SHIFTS[k].label} às ${T.fmtTime(T.SHIFTS[k].start)}</b><small>${n} curso${n > 1 ? 's' : ''}</small></span>${I('down')}</button>`; }
    }
    const shifts = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
    const secs = shifts.map((k) => { const sh = T.SHIFTS[k]; const l = list.filter((x) => x.shift === k); const s = shiftState(k, d); const collapsed = s === 'past' && !openShifts.has(`${d}-${k}`);
      return `<section class="tt-shift ${s} ${collapsed ? 'collapsed' : ''}" id="turno-${k}"><button data-toggle-shift="${d}-${k}"><span class="tt-sec-ico c" style="--c:${sh.color}">${I(T.SHIFT_ICON[k])}</span><h2>${sh.label} <small>${T.fmtTime(sh.start)} às ${T.fmtTime(sh.end)}</small></h2>${s === 'now' ? `<span class="badge now" style="--c:${sh.color}">agora</span>` : s === 'past' ? '<span class="badge">encerrado</span>' : ''}<span class="muted tiny">${l.length} curso${l.length === 1 ? '' : 's'}</span>${collapsed ? I('down') : ''}</button>${collapsed ? '' : `<div class="tt-stack">${l.map((x) => row(x)).join('')}</div>`}</section>`; }).join('');
    return `<h1 class="tt-h1">Programação</h1>
      <div class="tt-days">${days.map((x) => { const n = sessionsOf((y) => y.date === x && (all || y.venue === LOCAL)).length; return `<button class="${x === d ? 'on' : ''} ${x === clock.date ? 'today' : ''}" data-param="d" data-value="${x}"><small>${x === clock.date ? 'hoje' : T.fmtDate(x, 'wd').split(' ')[0]}</small><b>${x.slice(8)}</b><em>${n ? `${n} curso${n > 1 ? 's' : ''}` : '—'}</em></button>`; }).join('')}</div>
      <div class="tt-chips">${chip(`${I('pin')}${esc(VENUE.short)}`, !all, 'data-param="todos" data-value=""')}${chip(`${I('layers')}Todos os locais`, all, 'data-param="todos" data-value="1"')}</div>
      <p class="tt-lead">${esc(cap(T.fmtDate(d)))}${d === clock.date ? ' · hoje' : ''} · <b>${list.length} curso${list.length === 1 ? '' : 's'}</b> ${all ? 'em todos os locais' : `em ${esc(VENUE.name)}`}</p>
      ${nowCard}
      ${shifts.length ? secs : empty('calendar', `Nenhum curso ${d === clock.date ? 'hoje' : 'neste dia'} ${all ? '' : `em ${esc(VENUE.short)}`}. Toque em outro dia ou em "Todos os locais".`)}`;
  }

  function viewCursos() {
    const p = route.p; const q = p.get('q') || ''; const tema = p.get('tema') || ''; const hoje = p.get('hoje') === '1';
    const R = T.search(q);
    const list = (R.terms.length ? R.courses : D.courses.slice()).filter((c) => (!tema || c.tags.includes(tema)) && (!hoje || c.sessions.some((x) => x.date === clock.date))).sort(byNext);
    return `<h1 class="tt-h1">Cursos gratuitos</h1><p class="tt-lead">Com inscrição pelo celular (QR Code na página de cada curso). Toque no curso para ver dias, sala e público.</p>
      ${searchField(q, { placeholder: 'Buscar curso por nome, público ou tema', live: !!q })}
      <div class="tt-chips">${chip(`${I('clock')}Hoje`, hoje, `data-param="hoje" data-value="${hoje ? '' : '1'}"`)}${chip('Todos os temas', !tema, 'data-param="tema" data-value=""')}${Object.entries(D.tags).map(([k, v]) => chip(esc(v), tema === k, `data-param="tema" data-value="${k}"`)).join('')}</div>
      <p class="tt-lead"><b>${list.length}</b> de ${D.courses.length} cursos</p>
      ${list.length ? `<div class="tt-stack">${list.map(courseRow).join('')}</div>` : empty('search', 'Nenhum curso encontrado. Tente outra palavra ou limpe os filtros.')}`;
  }

  function viewServicos() {
    return `<h1 class="tt-h1">Serviços gratuitos</h1><p class="tt-lead">Sem inscrição, por ordem de chegada, de ${esc(D.event.datesLabel)}. Toque para ver tudo o que é oferecido e quem atende.</p>
      <div class="tt-stack">${D.services.map((s) => svcCard(s)).join('')}</div>`;
  }
  function viewLocais() {
    return `<h1 class="tt-h1">Onde fica</h1><p class="tt-lead">Locais dos cursos em Oiapoque e no Distrito do Manga. Toque para ver a programação de cada um.</p>
      <div class="tt-stack">${Object.values(D.venues).map(venueCard).join('')}</div>`;
  }
  function viewBusca() {
    const q = route.p.get('q') || ''; const R = T.search(q);
    let body;
    if (!R.terms.length) body = `<section class="tt-sec">${secHead('sparkles', 'Sugestões')}<div class="tt-chips">${T.SUGGESTIONS.map((s) => chip(esc(s), false, `data-param="q" data-value="${esc(s)}"`)).join('')}</div></section>
      <section class="tt-sec">${secHead('tag', 'Cursos por tema')}<div class="tt-chips">${Object.entries(D.tags).map(([k, v]) => chip(esc(v), false, `data-go="cursos?tema=${k}"`)).join('')}</div></section>`;
    else if (!R.total) body = `${empty('search', `Nada encontrado para “${esc(q)}”. Tente uma palavra mais simples, como “saúde”, “documento” ou “curso”.`)}<div class="tt-chips" style="justify-content:center">${T.SUGGESTIONS.slice(0, 6).map((s) => chip(esc(s), false, `data-param="q" data-value="${esc(s)}"`)).join('')}</div>`;
    else body = `<p class="tt-lead"><b>${R.total}</b> resultado${R.total > 1 ? 's' : ''} para “${esc(q)}”</p>
      ${R.services.length ? `<section class="tt-sec">${secHead('handshake', `Serviços gratuitos <small>${R.services.length}</small>`)}<div class="tt-stack">${R.services.map((r) => svcCard(r.s, r.hits)).join('')}</div></section>` : ''}
      ${R.courses.length ? `<section class="tt-sec">${secHead('graduation', `Cursos <small>${R.courses.length}</small>`)}<div class="tt-stack">${R.courses.sort(byNext).map((c) => row(nextOf(c), { date: true })).join('')}</div></section>` : ''}
      ${R.venues.length ? `<section class="tt-sec">${secHead('pin', `Locais <small>${R.venues.length}</small>`)}<div class="tt-stack">${R.venues.map(venueCard).join('')}</div></section>` : ''}`;
    return `<h1 class="tt-h1">Buscar</h1>${searchField(q, { placeholder: 'Ex.: vacina, identidade, panificação…', live: true })}${body}`;
  }

  // ---------- painéis ----------
  function panelCurso(c) {
    const sessions = T.allSessions().filter((x) => x.course === c); const byDay = {}; sessions.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    const venues = [...new Set(sessions.map((x) => D.venues[x.venue].short))].join(' · '); const s = T.courseState(c, clock); const nx = nextOf(c);
    const nextLine = s === 'now' ? `Acontecendo agora · ${esc(roomLabel(nx))} · até ${T.fmtTime(T.sessionEnd(nx))}` : s === 'past' ? 'Todas as aulas já aconteceram' : `${cap(dayWord(nx.date))} às ${T.fmtTime(nx.time)} · ${esc(roomLabel(nx))}`;
    return `<div class="tt-panel-top"><button class="tt-back" data-close>${I('back')}Voltar</button><span class="tt-kicker">${I('graduation')}Curso gratuito · Escola de Contas · TCE/AP</span></div>
      <div class="tt-panel-body"><h2>${esc(c.title)}</h2>
        <div class="tt-next ${s}" style="--c:${col(nx.shift)}">${I(s === 'now' ? 'clock' : 'calendar')}<span>${nextLine}</span></div>
        <div class="tt-tags">${c.tags.map((t) => `<span class="tagc">${esc(D.tags[t])}</span>`).join('')}</div>
        <div class="tt-meta"><div><small>Carga horária</small><b>${c.hours}h</b></div><div><small>Vagas</small><b>${c.seats}</b></div><div><small>Local</small><b>${esc(venues)}</b></div></div>
        <p><b>Para quem é:</b> ${esc(c.audience)}</p>
        ${c.note ? `<p class="tt-note">${I('info')}<span>${esc(c.note)}</span></p>` : ''}
        <h3>${I('calendar')}Dias e horários (${sessions.length})</h3>
        ${Object.keys(byDay).map((d) => `<div class="tt-day"><small class="${d === clock.date ? 'today' : ''}">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''}</small>${byDay[d].map((x) => { const sx = st(x); return `<div class="tt-sess ${sx}" style="--c:${col(x.shift)}"><span class="tt-time"><b>${T.fmtTime(x.time)}</b><small>até ${T.fmtTime(T.sessionEnd(x))}</small></span><span class="tt-body"><b>${esc(x.room || D.venues[x.venue].short)}${x.label ? ` · ${esc(x.label)}` : ''}</b><small>${esc(D.venues[x.venue].name)}</small></span><span class="tt-right">${badge(sx, col(x.shift))}</span></div>`; }).join('')}</div>`).join('')}
        <div class="tt-qr">${qrFor(`curso/${c.id}`)}<div><b>${I('phone')}Inscreva-se pelo celular</b><small>Aponte a câmera do celular para o QR Code. Abre esta página do curso com o botão de inscrição. <b>É gratuito.</b></small></div></div>
        <div class="tt-actions"><button class="tt-btn" data-go="programacao?d=${nx.date}${nx.venue !== LOCAL ? '&todos=1' : ''}">${I('calendar')}Ver o dia</button><button class="tt-btn primary" data-close>${I('back')}Voltar</button></div>
      </div>`;
  }
  function panelServico(s) {
    return `<div class="tt-panel-top"><button class="tt-back" data-close>${I('back')}Voltar</button><span class="tt-kicker" style="color:color-mix(in srgb,${s.color} 70%,var(--ink))">${I(s.icon)}${s.num ? `Pilar ${s.num}` : 'Acolhida'} · Serviços gratuitos</span></div>
      <div class="tt-panel-body" style="--c:${s.color}"><h2>${esc(s.title)}</h2><p class="muted">${esc(s.summary)}</p>
        <div class="tt-next" style="--c:${s.color};margin-top:.7em">${I('info')}<span>Sem inscrição: basta chegar. ${esc(D.event.datesLabel)}, em ${esc(D.event.place)}.</span></div>
        <h3>${I('check')}O que é oferecido</h3><ul class="tt-ul">${s.items.map((it) => `<li><i></i><span>${esc(it)}</span></li>`).join('')}</ul>
        <h3>${I('users')}Quem atende</h3><div class="tt-partners">${s.partners.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        ${s.coursesLink ? `<div class="tt-actions" style="margin-top:1em"><button class="tt-btn primary" data-go="cursos">${I('graduation')}Ver os ${D.courses.length} cursos com inscrição</button></div>` : ''}
        <div class="tt-qr">${qrFor(`servico/${s.id}`)}<div><b>${I('phone')}Leve no celular</b><small>Aponte a câmera para o QR Code e abra esta lista no seu celular.</small></div></div>
        <div class="tt-actions"><button class="tt-btn primary" data-close>${I('back')}Voltar</button></div>
      </div>`;
  }
  function panelLocal(v) {
    const list = sessionsOf((x) => x.venue === v.id); const byDay = {}; list.forEach((x) => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    return `<div class="tt-panel-top"><button class="tt-back" data-close>${I('back')}Voltar</button><span class="tt-kicker">${I('pin')}Local · ${esc(v.city)}</span></div>
      <div class="tt-panel-body"><h2>${esc(v.name)}</h2>${v.rooms.length ? `<div class="tt-partners">${v.rooms.map((r) => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
        <h3>${I('calendar')}Cursos neste local (${list.length})</h3>
        ${Object.keys(byDay).map((d) => `<div class="tt-day"><small class="${d === clock.date ? 'today' : ''}">${esc(T.fmtDate(d))}${d === clock.date ? ' · hoje' : ''}</small><div class="tt-stack">${byDay[d].map((x) => row(x)).join('')}</div></div>`).join('') || empty('calendar', 'Sem cursos cadastrados neste local.')}
        <div class="tt-actions"><button class="tt-btn primary" data-close>${I('back')}Voltar</button></div>
      </div>`;
  }

  // ---------- casca e render ----------
  function shell() {
    const qr = T.qrSvg(`${APP_BASE}#programacao?local=${LOCAL}`, { margin: 1 });
    root.innerHTML = `<header class="tt-head"><div class="tt-logo"><img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá"></div><div class="tt-title"><b>${esc(D.event.name)} · ${esc(D.event.edition)}${T.isSimulated() ? '<span class="tt-demo">demonstração</span>' : ''}</b><small>${I('pin')}${esc(VENUE.name)} · ${esc(D.event.datesLabel)}</small></div><div class="tt-clock"><b id="clock-time"></b><small id="clock-date"></small></div></header>
      <nav class="tt-nav" id="nav">${Object.entries(VIEWS).map(([k, [label, icon]]) => `<button data-go="${k}">${I(icon)}${label}</button>`).join('')}</nav>
      <main class="tt-main" id="main"></main>
      <footer class="tt-foot"><div class="qr">${qr}</div><div><b>${I('phone')}Leve o app no celular</b><small>Aponte a câmera para o QR Code: programação completa, serviços e inscrições.</small></div><div class="org">${esc(D.event.organizerShort)}<br>${esc(D.event.datesLabel)}</div></footer>
      <div id="panel-holder"></div><div id="toast"></div>`;
    tickClock();
  }
  function tickClock() {
    clock = T.now();
    const t = document.getElementById('clock-time'); if (!t) return;
    t.textContent = clock.time; document.getElementById('clock-date').textContent = cap(T.fmtDate(clock.date, 'wdlong'));
  }
  function renderNav() { document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === route.view)); }
  function renderMain(keepScroll) {
    const main = document.getElementById('main');
    const wasSearch = document.activeElement && document.activeElement.hasAttribute('data-search');
    main.innerHTML = { inicio: viewInicio, programacao: viewProgramacao, cursos: viewCursos, servicos: viewServicos, locais: viewLocais, busca: viewBusca }[route.view]();
    if (!keepScroll) main.scrollTop = 0;
    const inp = main.querySelector('[data-search]');
    if (inp && (wasSearch || route.view === 'busca')) { inp.focus({ preventScroll: true }); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* */ } }
    else hideKeyboard();
  }
  function renderPanel() {
    const holder = document.getElementById('panel-holder');
    if (!route.panel) { holder.innerHTML = ''; return; }
    let inner = '';
    if (route.panel === 'curso') { const c = T.courseById(route.id); inner = c ? panelCurso(c) : ''; }
    if (route.panel === 'servico') { const s = T.serviceById(route.id); inner = s ? panelServico(s) : ''; }
    if (route.panel === 'local') { const v = D.venues[route.id]; inner = v ? panelLocal(v) : ''; }
    if (!inner) { closePanel(); return; }
    holder.innerHTML = `<div class="tt-panel" id="panel" role="dialog" aria-modal="true">${inner}</div>`;
    hideKeyboard();
  }
  function reset() {
    openShifts.clear(); hideKeyboard();
    if (location.hash && location.hash !== '#inicio') go('#inicio', true); else renderMain(false);
  }

  // ---------- teclado na tela ----------
  const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm'];
  function buildKeyboard() {
    const el = document.createElement('div'); el.className = 'osk'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Teclado');
    el.innerHTML = ROWS.map((r, i) => `<div class="osk-row">${[...r].map((k) => `<button type="button" data-key="${k}">${k}</button>`).join('')}${i === ROWS.length - 1 ? `<button type="button" class="wide" data-key="⌫" aria-label="Apagar">${I('back')}</button>` : ''}</div>`).join('')
      + `<div class="osk-row"><button type="button" class="wide danger" data-key="clear">Limpar</button><button type="button" class="space" data-key=" ">espaço</button><button type="button" class="wide primary" data-key="done">${I('check')}Pronto</button></div>`;
    el.addEventListener('pointerdown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]'); if (!b || !input) return; const k = b.dataset.key;
      if (k === 'done') { const inp = input; hideKeyboard(); inp.blur(); return; }
      if (k === 'clear') input.value = ''; else if (k === '⌫') input.value = input.value.slice(0, -1); else input.value += k;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return el;
  }
  function showKeyboard(inp) { input = inp; if (!keyboardEl) { keyboardEl = buildKeyboard(); root.appendChild(keyboardEl); } root.classList.add('osk-open'); }
  function hideKeyboard() { if (keyboardEl) { keyboardEl.remove(); keyboardEl = null; } root.classList.remove('osk-open'); input = null; }

  // ---------- tela de descanso e ociosidade ----------
  function tvUrl() { const p = new URLSearchParams(); p.set('local', LOCAL); p.set('orientation', window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'); for (const k of ['t', 'd', 'theme', 'zoom']) if (P.get(k)) p.set(k, P.get(k)); if (P.get('app')) p.set('app', P.get('app')); return `tv.html?${p.toString()}`; }
  function showAttract() {
    if (attractEl) return;
    reset();
    if (!ATTRACT) return;
    attractEl = document.createElement('div'); attractEl.className = 'attract';
    attractEl.innerHTML = `<iframe src="${tvUrl()}" title="Programação do dia" tabindex="-1"></iframe><div class="attract-bar"><span class="attract-cta">${I('phone')}Toque na tela para explorar</span></div><button class="attract-tap" aria-label="Toque para começar"></button>`;
    document.body.appendChild(attractEl);
  }
  function hideAttract() { if (!attractEl) return; const el = attractEl; attractEl = null; el.classList.add('hiding'); setTimeout(() => el.remove(), 250); reset(); }
  function touch() { clearTimeout(idleTimer); idleTimer = setTimeout(showAttract, IDLE_MS); }

  // ---------- eventos ----------
  document.addEventListener('click', (e) => {
    const el = (s) => e.target.closest(s); let b;
    if (el('.attract')) { e.preventDefault(); hideAttract(); return; }
    if ((b = el('[data-close]'))) { closePanel(); return; }
    if ((b = el('[data-panel]'))) { location.hash = `#${b.dataset.panel}/${b.dataset.id}`; return; }
    if ((b = el('[data-go]'))) { const [v, qs] = b.dataset.go.split('?'); go(`#${v}${qs ? `?${qs}` : ''}`, !!route.panel); return; }
    if ((b = el('[data-scroll]'))) { const t = document.getElementById(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if ((b = el('[data-toggle-shift]'))) { const k = b.dataset.toggleShift; if (openShifts.has(k)) openShifts.delete(k); else openShifts.add(k); renderMain(true); return; }
    if ((b = el('[data-clear]'))) { setParam('q', ''); return; }
    if ((b = el('[data-param]'))) { setParam(b.dataset.param, b.dataset.value); return; }
  });
  let searchTimer = null;
  document.addEventListener('input', (e) => { const inp = e.target.closest('[data-search]'); if (!inp) return; clearTimeout(searchTimer); searchTimer = setTimeout(() => setParam('q', inp.value.trim()), 150); });
  document.addEventListener('focusin', (e) => { const inp = e.target.closest('[data-search]'); if (inp) showKeyboard(inp); });
  document.addEventListener('pointerdown', (e) => { if (keyboardEl && !e.target.closest('.osk') && !e.target.closest('.tt-search')) hideKeyboard(); });
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'f' && !e.target.closest('input')) { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); } });
  document.addEventListener('click', (e) => { const a = e.target.closest('a[href]'); if (a) e.preventDefault(); }, true);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('hashchange', onRoute);
  setInterval(() => { const c = T.now(); if (c.time !== clock.time) { tickClock(); if (!input) { renderMain(true); if (route.panel) renderPanel(); } } }, 1000);
  setInterval(() => { const h = new Date().getHours(); if (h === 4 && new Date().getMinutes() < 2) location.reload(); }, 60000);

  // ---------- início ----------
  shell();
  route = parse(); onRoute();
  touch();
  if (ATTRACT) showAttract();
})();
