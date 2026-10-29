/* Modo TV: rodízio de telas sem interação, com relógio, quadro "agora", QR para o app e faixa de serviços.
   Parâmetros e teclas: ver comentário em tv.html. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc;
  const root = document.getElementById('tv');
  const LS = 'tce_tv_prefs';
  const ZOOM = [0.6, 1.6];
  const PAGE_ROWS = 7;           // linhas máximas do quadro de salas por tela
  const COURSE_SLIDES_MAX = 8;   // detalhes de curso por ciclo

  const prefs = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch { /* sem storage */ } };
  const clamp = (z) => Math.min(ZOOM[1], Math.max(ZOOM[0], z));

  // Local da TV: ?local=jn|manga|sebrae|auditorio|todos (padrão: Escola Joaquim Nabuco).
  const localParam = T.params.get('local') || 'jn';
  const venueSel = localParam === 'todos' ? null : (D.venues[localParam] ? localParam : 'jn');
  const venueName = venueSel ? D.venues[venueSel].name : D.event.place;
  const venueShort = venueSel ? D.venues[venueSel].short : 'todos os locais';

  let clock = T.now();
  let playlist = [];
  let playKey = '';
  let i = 0;
  let timer = null;
  let lastAdvance = Date.now();
  let orientation = 'landscape';

  // ---------- consultas ----------
  const inEvent = (date) => date >= D.event.start && date <= D.event.end;
  const focusDate = () => (clock.date < D.event.start ? D.event.start : clock.date > D.event.end ? D.event.end : clock.date);
  const atVenue = (x) => !venueSel || x.venue === venueSel;
  const sessionsAt = (date) => T.allSessions().filter((x) => x.date === date && atVenue(x));
  const st = (x) => T.sessionState(x, clock);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  /** Turno em foco hoje: em andamento, senão o próximo; null se o dia acabou. */
  function focusShift(date) {
    if (date !== clock.date) return 'manha';
    for (const k of T.SHIFT_ORDER) { const [a, b] = shiftWin(k); if (clock.min < b) return clock.min >= a ? k : k; }
    return null;
  }
  const shiftState = (k, date) => {
    if (date < clock.date) return 'past'; if (date > clock.date) return 'later';
    const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later';
  };
  const uniqCourses = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.course.id) && seen.add(x.course.id)); };
  const roomLabel = (x) => x.room || D.venues[x.venue].short;
  const venueOf = (x) => D.venues[x.venue].short;

  // ---------- playlist ----------
  function buildPlaylist() {
    const items = [];
    const push = (kind, data, secs) => items.push({ key: `${kind}-${data.key || ''}`, kind, data, secs });
    push('welcome', {}, 12);
    const date = focusDate();
    const today = sessionsAt(date);
    const fs = focusShift(date);
    // Quadro de salas (paginado se houver muitas linhas).
    const rows = boardRows(today);
    for (let p = 0; p * PAGE_ROWS < rows.length; p++) push('board', { key: p, date, rows: rows.slice(p * PAGE_ROWS, (p + 1) * PAGE_ROWS), page: p, pages: Math.ceil(rows.length / PAGE_ROWS) }, rows.length > PAGE_ROWS ? 14 : 20);
    // Turnos de hoje: o atual/próximo primeiro, depois os seguintes, depois os encerrados.
    const shifts = T.SHIFT_ORDER.filter((k) => today.some((x) => x.shift === k));
    const order = fs ? shifts.slice(shifts.indexOf(fs)).concat(shifts.slice(0, Math.max(0, shifts.indexOf(fs)))) : shifts;
    for (const k of order) push('shift', { key: `${date}-${k}`, date, shift: k, list: today.filter((x) => x.shift === k) }, 14);
    // Detalhe dos cursos do turno em foco (ou do próximo com cursos).
    let focusList = fs ? today.filter((x) => x.shift === fs) : [];
    if (!focusList.length) focusList = order.length ? today.filter((x) => x.shift === order[0]) : [];
    if (!focusList.length && !today.length) {
      // Sem programação neste local hoje: mostra o próximo dia com programação.
      const nextDay = T.eventDays().find((d) => d > date && sessionsAt(d).length);
      if (nextDay) focusList = sessionsAt(nextDay).filter((x) => x.shift === 'manha');
    }
    uniqCourses(focusList).slice(0, COURSE_SLIDES_MAX).forEach((x) => push('course', { key: x.course.id, course: x.course, sess: x }, 12));
    push('services', {}, 14);
    D.services.forEach((s) => push('service', { key: s.id, s }, 10));
    push('week', {}, 18);
    return items;
  }
  /** Linhas do quadro: uma por local/sala com aula hoje (salas na ordem cadastrada; sem sala → uma linha por curso). */
  function boardRows(today) {
    const rows = []; const seen = new Map();
    const vOrder = Object.keys(D.venues);
    const sorted = [...today].sort((a, b) => vOrder.indexOf(a.venue) - vOrder.indexOf(b.venue) || roomIdx(a) - roomIdx(b) || T.toMin(a.time) - T.toMin(b.time));
    for (const x of sorted) {
      const key = x.room ? `${x.venue}|${x.room}` : `${x.venue}|#${x.course.id}`;
      if (!seen.has(key)) { seen.set(key, { key, venue: x.venue, room: x.room, cells: {} }); rows.push(seen.get(key)); }
      const r = seen.get(key); (r.cells[x.shift] = r.cells[x.shift] || []).push(x);
    }
    return rows;
  }
  const roomIdx = (x) => { const k = D.venues[x.venue].rooms.indexOf(x.room); return k < 0 ? 99 : k; };

  // ---------- render ----------
  function slideHtml(it) {
    const d = it.data;
    switch (it.kind) {
      case 'welcome': return welcomeHtml();
      case 'board': return boardHtml(d);
      case 'shift': return shiftHtml(d);
      case 'course': return courseHtml(d);
      case 'services': return servicesHtml();
      case 'service': return serviceHtml(d.s);
      case 'week': return weekHtml();
      default: return '';
    }
  }
  const kicker = (icon, text) => `<span class="sl-kicker"><i>${I(icon)}</i>${text}</span>`;
  const shiftTag = (k, date) => {
    const s = shiftState(k, date); const sh = T.SHIFTS[k];
    const txt = s === 'now' ? `em andamento · até ${T.fmtTime(sh.end)}` : s === 'past' ? 'encerrado' : date === clock.date ? `começa às ${T.fmtTime(sh.start)}` : `${T.fmtDate(date, 'wd')} · ${T.fmtTime(sh.start)}`;
    return `<span class="sl-tag shift" style="--c:${sh.color}"><i></i>${txt}</span>`;
  };

  function welcomeHtml() {
    const days = T.eventDays(); const idx = days.indexOf(clock.date);
    const diff = Math.round((Date.parse(D.event.start) - Date.parse(clock.date)) / 864e5);
    const count = idx >= 0 ? `Hoje é o ${idx + 1}º dia do evento` : diff > 0 ? (diff === 1 ? 'Começa amanhã' : `Começa em ${diff} dias`) : 'Evento encerrado · obrigado, Oiapoque!';
    const n = T.allSessions().length;
    return `<div class="sl sl-welcome">${kicker('sparkles', 'Bem-vindo')}
      <h1>${esc(D.event.name)}</h1>
      <p class="sub"><b>${esc(D.event.edition)}</b> · ${esc(D.event.place)} · ${esc(D.event.datesLabel)}</p>
      <div class="sl-count">${count}</div>
      <div class="sl-kpis"><div><b>${D.courses.length}</b><span>cursos gratuitos</span></div><div><b>${n}</b><span>aulas e oficinas</span></div><div><b>${D.services.length - 1}</b><span>pilares de serviços</span></div><div><b>${Object.keys(D.venues).length}</b><span>locais</span></div></div>
      <p class="sl-foot">${I('phone')}Programação completa e inscrições: aponte a câmera para o QR Code</p></div>`;
  }

  function boardHtml(d) {
    const cols = T.SHIFT_ORDER.filter((k) => d.rows.some((r) => r.cells[k]) || sessionsAt(d.date).some((x) => x.shift === k));
    const states = cols.map((k) => shiftState(k, d.date));
    const allPast = states.every((s) => s === 'past');
    const nextCol = cols.find((k, j) => states[j] === 'later');
    // Em pé, as colunas já são estreitas: só a atual cresce um pouco; deitado, as passadas encolhem.
    const portrait = orientation === 'portrait';
    const width = (s) => (allPast ? 'minmax(0,1fr)' : s === 'now' ? (portrait ? 'minmax(0,1.3fr)' : 'minmax(0,1.45fr)') : s === 'past' && !portrait ? 'minmax(0,.55fr)' : 'minmax(0,1fr)');
    const template = `minmax(6.5em,.5fr) ${states.map(width).join(' ')}`;
    const fs = d.rows.length <= 3 ? 1.3 : d.rows.length <= 5 ? 1.12 : d.rows.length <= 7 ? 1 : 0.9;
    const multi = !venueSel;
    let h = `<div class="sl sl-board"><div class="sl-head"><div class="sl-row">${kicker('door', `${d.date === clock.date ? 'Salas de hoje' : `Salas · ${esc(T.fmtDate(d.date, 'wd'))}`} · ${esc(venueShort)}${d.pages > 1 ? ` · ${d.page + 1}/${d.pages}` : ''}`)}<span class="sl-tag">${I('calendar')}${esc(T.fmtDate(d.date))}${d.date !== clock.date ? ` · ${T.relDay(d.date, clock.date)}` : ''}</span></div></div>`;
    h += `<div class="cm" style="grid-template-columns:${template};grid-template-rows:auto repeat(${d.rows.length},minmax(2.4em,1fr));--fs:${fs}">`;
    h += '<div class="cm-corner"></div>';
    cols.forEach((k, j) => {
      const sh = T.SHIFTS[k]; const s = states[j];
      h += `<div class="cm-h ${s}" style="--c:${sh.color}"><b>${I(T.SHIFT_ICON[k])}${sh.label}${s === 'now' ? '<em>agora</em>' : k === nextCol ? '<em class="nx">próximo</em>' : ''}</b><small>${T.fmtTime(sh.start)}–${T.fmtTime(sh.end)}</small></div>`;
    });
    for (const r of d.rows) {
      h += `<div class="cm-cls"><b>${esc(r.room || D.venues[r.venue].short)}</b>${multi && r.room ? `<small>${esc(D.venues[r.venue].short)}</small>` : ''}</div>`;
      cols.forEach((k, j) => {
        const list = r.cells[k]; const s = states[j]; const sh = T.SHIFTS[k];
        if (!list) { h += `<div class="cm-cell empty ${s}">—</div>`; return; }
        const x = list[0];
        const [a, b] = shiftWin(k); const pct = s === 'now' ? Math.min(1, Math.max(0, (clock.min - a) / (b - a))) : 0;
        // Mais de um curso na mesma sala e turno (conflito na tabela oficial): mostra todos, um por linha.
        const titles = list.slice(0, 3).map((y) => `<b>${esc(T.title(y.course, true))}</b>`).join('');
        h += `<div class="cm-cell ${s}${list.length > 1 ? ' multi' : ''}" style="--c:${sh.color}">${titles}<small>${esc(T.fmtTime(x.time))} · ${esc(x.course.audience)}</small>${s === 'now' ? `<span class="cb-bar"><i style="transform:scaleX(${pct.toFixed(3)})"></i></span>` : ''}</div>`;
      });
    }
    return h + '</div></div>';
  }

  function shiftHtml(d) {
    const sh = T.SHIFTS[d.shift]; const many = d.list.length > 6;
    let h = `<div class="sl sl-shift" style="--c:${sh.color}"><div class="sl-head"><div class="sl-row">${kicker(T.SHIFT_ICON[d.shift], `${d.date === clock.date ? 'Hoje' : esc(T.fmtDate(d.date, 'wdlong'))} · ${sh.label} · a partir das ${T.fmtTime(sh.start)}`)}${shiftTag(d.shift, d.date)}</div><h1>Cursos da ${sh.label.toLowerCase()} · ${esc(venueShort)}</h1></div>`;
    h += `<ol class="sl-slots${many ? ' many' : ''}">`;
    for (const x of d.list) {
      const s = st(x);
      h += `<li class="${s}"><span class="room">${esc(roomLabel(x))}${venueSel && x.room ? '' : `<small>${esc(venueOf(x))}</small>`}${venueSel && x.room ? `<small>${esc(T.fmtTime(x.time))}</small>` : ''}</span><b>${esc(T.title(x.course, true))}</b><small>${esc(x.course.audience)} · ${x.course.hours}h</small>${s === 'now' ? '<em>agora</em>' : ''}</li>`;
    }
    return h + '</ol></div>';
  }

  function courseHtml(d) {
    const c = d.course; const next = T.nextSession(c, clock) || d.sess; const sh = T.SHIFTS[next.shift];
    const s = st(next);
    const lbl = s === 'now' ? 'Em andamento agora' : s === 'today' ? 'Hoje' : s === 'past' ? 'Última aula' : T.relDay(next.date, clock.date) ? `Próxima aula · ${T.relDay(next.date, clock.date)}` : 'Próxima aula';
    const venuesOf = [...new Set(c.sessions.map((x) => x.venue))].map((v) => D.venues[v].short).join(' · ');
    let h = `<div class="sl sl-course" style="--c:${sh.color}"><div class="sl-head">${kicker('graduation', 'Curso gratuito · Escola de Contas · TCE/AP')}<h1 class="${c.title.length > 70 ? 'long' : ''}">${esc(c.title)}</h1></div><div class="sl-row"><div class="sl-text">`;
    h += `<p class="sl-aud ${c.audience.length > 90 ? 'long' : ''}"><b>Público-alvo:</b> ${esc(c.audience)}</p>`;
    h += `<div class="sl-meta"><span>${I('hourglass')}${c.hours}h de carga horária</span><span>${I('users')}${c.seats} vagas</span><span>${I('pin')}${esc(venuesOf)}</span></div>`;
    h += '<div class="sl-dates">' + T.allSessions().filter((x) => x.course === c).map((x) => `<div class="sl-date ${st(x)}" style="--c:${T.SHIFTS[x.shift].color}"><b>${x.date.slice(8)}</b><span>${T.fmtDate(x.date, 'wd').split(' ')[0]}${x.label ? ` · ${esc(x.label)}` : ''}</span><small>${T.fmtTime(x.time)} · ${esc(roomLabel(x))}${!venueSel || x.venue !== venueSel ? ` · ${esc(venueOf(x))}` : ''}</small></div>`).join('') + '</div>';
    h += `<div class="sl-cta">${I('phone')}<span>Inscreva-se pelo celular: aponte a câmera para o QR Code</span></div></div>`;
    h += `<div class="sl-aside"><div class="sl-next"><small>${lbl}</small><b>${esc(roomLabel(next))}</b><span>${esc(T.fmtDate(next.date, 'wdlong'))} · ${T.fmtTime(next.time)} · ${esc(D.venues[next.venue].name)}</span></div>${c.note ? `<p class="sl-foot" style="margin:0">${I('info')}${esc(c.note)}</p>` : ''}</div></div></div>`;
    return h;
  }

  function servicesHtml() {
    let h = `<div class="sl sl-services"><div class="sl-head">${kicker('handshake', 'Serviços gratuitos para a população')}<h1>O que você encontra no ${esc(D.event.name)}</h1></div><div class="sl-pillars">`;
    for (const s of D.services) h += `<div class="sl-pillar" style="--c:${s.color}"><i>${I(s.icon)}</i><div><b>${s.num ? `${s.num}. ` : ''}${esc(s.title)}</b><small>${esc(s.summary)}</small></div></div>`;
    return h + '</div></div>';
  }

  function serviceHtml(s) {
    const items = s.items.slice(0, 7); const partners = s.partners.slice(0, 7);
    let h = `<div class="sl sl-service" style="--c:${s.color}"><div class="sl-text"><div class="big-ico">${I(s.icon)}</div>${kicker('handshake', s.num ? `Pilar ${s.num} · Serviços gratuitos` : 'Serviços gratuitos')}<h1>${esc(s.title)}</h1><p class="lead">${esc(s.summary)}</p>`;
    h += `<div class="sl-partners"><small>Parceiros</small>${partners.map((p) => `<span>${esc(p)}</span>`).join('')}${s.partners.length > 7 ? `<span>+${s.partners.length - 7}</span>` : ''}</div></div>`;
    h += `<ul class="sl-items${items.length > 5 ? ' many' : ''}">${items.map((it) => `<li><i></i><span>${esc(it)}</span></li>`).join('')}</ul></div>`;
    return h;
  }

  function weekHtml() {
    const days = T.eventDays(); const MAX = 12;
    const perDay = days.map((d) => sessionsAt(d));
    const fs = Math.max(...perDay.map((l) => l.length)) > 9 ? 0.9 : 1;
    let h = `<div class="sl sl-week"><div class="sl-head"><div class="sl-row">${kicker('calendar', `Programação da semana · ${esc(venueShort)}`)}<span class="sl-tag">${esc(D.event.datesLabel)}</span></div></div><div class="sl-days" style="--fs:${fs}">`;
    days.forEach((d, k) => {
      const list = perDay[k]; const cls = (d === clock.date ? 'today' : d < clock.date ? 'past' : '') + (list.length > 8 ? ' dense' : '');
      h += `<div class="sl-day ${cls}"><b>${esc(T.fmtDate(d, 'wd'))}<small>${list.length ? `${list.length} aula${list.length > 1 ? 's' : ''}` : 'sem cursos'}</small></b><ul>`;
      h += list.slice(0, MAX).map((x) => `<li style="--c:${T.SHIFTS[x.shift].color}"><span>${T.fmtTime(x.time)}</span><b>${esc(T.title(x.course, true))}</b><small>${esc(roomLabel(x))}${!venueSel ? ` · ${esc(venueOf(x))}` : ''}</small></li>`).join('');
      h += `</ul>${list.length > MAX ? `<div class="more">+${list.length - MAX} no app</div>` : ''}</div>`;
    });
    return h + '</div></div>';
  }

  const slideTitle = (it) => ({ welcome: 'Bem-vindo', board: 'Salas de hoje', shift: it.data.shift ? `Cursos da ${T.SHIFTS[it.data.shift].label.toLowerCase()}` : '', course: it.data.course ? T.title(it.data.course, true) : '', services: 'Serviços gratuitos', service: it.data.s ? it.data.s.title : '', week: 'Programação da semana' }[it.kind] || '');

  /** Quadro "agora" da lateral. */
  function nowHtml() {
    const date = focusDate();
    const list = sessionsAt(date);
    let title = ''; let rem = ''; let rows = [];
    const nowList = list.filter((x) => st(x) === 'now');
    if (date === clock.date && nowList.length) {
      const k = nowList[0].shift; title = `Agora · ${T.SHIFTS[k].label}`; rem = `até <b>${T.fmtTime(T.SHIFTS[k].end)}</b>`; rows = nowList;
    } else {
      let upcoming = date === clock.date ? list.filter((x) => st(x) === 'today') : list;
      let dayLabel = date === clock.date ? 'A seguir' : T.relDay(date, clock.date) === 'amanhã' ? 'Amanhã' : T.fmtDate(date, 'wd');
      if (!upcoming.length) {
        const nextDay = T.eventDays().find((d) => d > clock.date && sessionsAt(d).length);
        if (nextDay) { upcoming = sessionsAt(nextDay); dayLabel = T.relDay(nextDay, clock.date) === 'amanhã' ? 'Amanhã' : T.fmtDate(nextDay, 'wd'); }
      }
      if (upcoming.length) {
        const k = upcoming[0].shift; rows = upcoming.filter((x) => x.shift === k);
        title = `${dayLabel} · ${T.SHIFTS[k].label}`; rem = `às <b>${T.fmtTime(T.SHIFTS[k].start)}</b>`;
      }
    }
    if (!rows.length) return `<div class="mb"><div class="mb-head"><span class="mb-title">${I('door')}Agora</span></div><p class="mb-empty">Programação de cursos encerrada neste local.<br>Confira os serviços no app.</p></div>`;
    const MAX = 5;
    let h = `<div class="mb"><div class="mb-head"><span class="mb-title">${I('door')}${title}</span><span class="mb-rem">${rem}</span></div><div class="mb-rows">`;
    for (const x of rows.slice(0, MAX)) h += `<div class="mb-row ${st(x)}" style="--c:${T.SHIFTS[x.shift].color}"><div class="mb-room"><b>${esc(roomLabel(x))}</b><small>${esc(venueSel && x.room ? T.fmtTime(x.time) : venueOf(x))}</small></div><div class="mb-what"><b>${esc(T.title(x.course, true))}</b><small>${esc(x.course.audience)}</small></div></div>`;
    h += '</div>' + (rows.length > MAX ? `<div class="mb-more">+${rows.length - MAX} cursos neste turno</div>` : '') + '</div>';
    return h;
  }

  function shellHtml() {
    const qr = T.qrSvg(T.appUrl(''), { margin: 1 });
    const ticker = D.services.map((s) => `${s.title}: ${s.summary.replace(/\.$/, '')}`).concat(['Inscrições e programação completa no celular: aponte a câmera para o QR Code']).join('   ✦   ') + '   ✦   ';
    return `<header class="tv-head"><div class="tv-brand"><div class="tv-logo"><img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá"></div><div><b>${esc(D.event.name)} · ${esc(D.event.edition)}</b><small>${esc(venueName)} · ${esc(D.event.datesLabel)} ${T.isSimulated() ? '<span class="tv-live demo"><i></i>demonstração</span>' : '<span class="tv-live"><i></i>ao vivo</span>'}</small></div></div><div class="tv-clock"><b id="clock-time"></b><small id="clock-date"></small></div></header>
      <div class="tv-body"><main class="tv-stage" id="stage"></main><aside class="tv-side"><div id="now"></div><div class="tv-next"><small>${I('next')}A seguir</small><b id="next-title"></b></div><div class="tv-qr">${qr}<p>${I('phone')}Aponte a câmera: programação e inscrições</p></div></aside></div>
      <div class="tv-ticker"><span class="tv-ticker-label">${I('megaphone')}Serviços</span><div class="tv-ticker-track"><span>${esc(ticker)}</span><span aria-hidden="true">${esc(ticker)}</span></div></div>
      <footer class="tv-foot"><span>${esc(D.event.organizer)} · ${esc(D.event.tagline)}</span><span class="tv-dots" id="dots"></span></footer>`;
  }

  // ---------- ciclo ----------
  function applyPrefs() {
    const zoom = clamp(Number(T.params.get('zoom')) || prefs.zoom || 1);
    const theme = T.params.get('theme') || prefs.theme || 'dark';
    root.style.setProperty('--tv-zoom', zoom);
    root.classList.toggle('tv-light', theme === 'light'); root.classList.toggle('tv-dark', theme !== 'light');
    orientation = T.params.get('orientation') || (window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    root.classList.toggle('portrait', orientation === 'portrait'); root.classList.toggle('landscape', orientation !== 'portrait');
  }
  function tickClock() {
    clock = T.now();
    document.getElementById('clock-time').textContent = clock.time;
    const wd = clock.weekday; document.getElementById('clock-date').textContent = `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${clock.day} de ${clock.month}`;
  }
  function refresh() {
    tickClock();
    const key = `${focusDate()}|${focusShift(focusDate())}|${Math.floor(clock.min / 5)}`;
    if (key !== playKey) {
      const curKey = playlist[i] && playlist[i].key;
      playlist = buildPlaylist(); playKey = key;
      const k = playlist.findIndex((it) => it.key === curKey); i = k >= 0 ? k : i % playlist.length;
      document.getElementById('now').innerHTML = nowHtml();
      renderDots();
    }
  }
  function show(step) {
    const stage = document.getElementById('stage');
    stage.classList.add('fading');
    lastAdvance = Date.now();
    clearTimeout(timer);
    setTimeout(() => {
      i = (i + step + playlist.length * 100) % playlist.length;
      const it = playlist[i];
      stage.innerHTML = slideHtml(it) + `<div class="tv-progress" style="animation-duration:${it.secs}s"></div>`;
      stage.classList.remove('fading');
      document.getElementById('next-title').textContent = slideTitle(playlist[(i + 1) % playlist.length]);
      renderDots();
      timer = setTimeout(() => show(1), it.secs * 1000);
    }, step === 0 ? 0 : 450);
  }
  function renderDots() {
    document.getElementById('dots').innerHTML = playlist.slice(0, 40).map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  }
  function keys(e) {
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') show(1);
    else if (e.key === 'ArrowLeft') show(-1);
    else if (k === 'f') fullscreen();
    else if (k === 'l') { prefs.theme = root.classList.contains('tv-light') ? 'dark' : 'light'; savePrefs(); applyPrefs(); }
    else if (e.key === '+' || e.key === '=' || e.key === '-') { prefs.zoom = Math.round(clamp((prefs.zoom || 1) + (e.key === '-' ? -0.05 : 0.05)) * 100) / 100; savePrefs(); applyPrefs(); }
    else if (e.key === '0') { delete prefs.zoom; savePrefs(); applyPrefs(); }
    else if (e.key === 'Escape') { for (const p in prefs) delete prefs[p]; savePrefs(); applyPrefs(); }
  }
  function fullscreen() { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); }

  function start() {
    applyPrefs();
    root.innerHTML = shellHtml();
    refresh();
    show(0);
    setInterval(() => { tickClock(); if (clock.seconds === 0) refresh(); }, 1000);
    setInterval(() => {
      const h = new Date().getHours(); const m = new Date().getMinutes();
      if (h === 4 && m < 2) location.reload();                    // recarga diária (pega versões novas)
      if (Date.now() - lastAdvance > 10 * 60 * 1000) location.reload(); // watchdog anti-travamento
    }, 60000);
    window.addEventListener('keydown', keys);
    window.addEventListener('resize', applyPrefs);
    window.addEventListener('pointerdown', fullscreen); // TVs com navegador exigem gesto para tela cheia
  }
  start();
})();
