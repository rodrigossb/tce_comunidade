/* Modo TV: a programação do dia inteira em uma tela (sala → curso → para quem),
   dois destaques do momento e QR Code para o app. Sem rodízio de telas: quem olha vê tudo de uma vez.
   Parâmetros e teclas: ver comentário em tv.html. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc;
  const root = document.getElementById('tv');
  const LS = 'tce_tv_prefs';
  const ZOOM = [0.6, 1.6];
  const HL_SECS = 14;      // troca dos destaques
  const HL_COUNT = 2;      // destaques visíveis

  const prefs = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch { /* sem storage */ } };
  const clamp = (z) => Math.min(ZOOM[1], Math.max(ZOOM[0], z));

  // Local da TV: ?local=jn|manga|sebrae|auditorio|todos (padrão: Escola Joaquim Nabuco).
  const localParam = T.params.get('local') || 'jn';
  const venueSel = localParam === 'todos' ? null : (D.venues[localParam] ? localParam : 'jn');
  const venueName = venueSel ? D.venues[venueSel].name : D.event.place;

  let clock = T.now();
  let orientation = 'landscape';
  let boardKey = '';
  let hlPool = []; let hlPage = 0; let hlTimer = null;
  let lastTick = Date.now();

  // ---------- consultas ----------
  const atVenue = (x) => !venueSel || x.venue === venueSel;
  const sessionsAt = (date) => T.allSessions().filter((x) => x.date === date && atVenue(x));
  const st = (x) => T.sessionState(x, clock);
  const shiftWin = (k) => [T.toMin(T.SHIFTS[k].start), T.toMin(T.SHIFTS[k].end)];
  const shiftState = (k, date) => {
    if (date < clock.date) return 'past'; if (date > clock.date) return 'later';
    const [a, b] = shiftWin(k); return clock.min >= b ? 'past' : clock.min >= a ? 'now' : 'later';
  };
  /** Dia mostrado no quadro: hoje; se hoje não tem (ou já acabou) neste local, o próximo dia com cursos. */
  function boardDate() {
    const days = T.eventDays();
    const base = clock.date < D.event.start ? D.event.start : clock.date;
    const todayList = sessionsAt(base);
    const over = base === clock.date && todayList.length && todayList.every((x) => st(x) === 'past');
    if (todayList.length && !over) return base;
    return days.find((d) => d > base && sessionsAt(d).length) || (todayList.length ? base : days.filter((d) => sessionsAt(d).length).pop() || base);
  }
  const roomIdx = (x) => { const k = D.venues[x.venue].rooms.indexOf(x.room); return k < 0 ? 99 : k; };
  const vIdx = (x) => Object.keys(D.venues).indexOf(x.venue);
  const byRoom = (a, b) => T.toMin(a.time) - T.toMin(b.time) || vIdx(a) - vIdx(b) || roomIdx(a) - roomIdx(b) || String(a.room).localeCompare(String(b.room));
  const roomOf = (x) => x.room || D.venues[x.venue].short;
  const dayWord = (date) => (date === clock.date ? 'hoje' : T.relDay(date, clock.date) === 'amanhã' ? 'amanhã' : T.fmtDate(date, 'wdlong'));

  // ---------- quadro do dia ----------
  function boardHtml(date) {
    const list = sessionsAt(date).sort(byRoom);
    const cols = T.SHIFT_ORDER.filter((k) => list.some((x) => x.shift === k));
    const states = cols.map((k) => shiftState(k, date));
    // Largura de cada turno proporcional ao número de cursos (o turno em andamento ganha um pouco mais).
    const counts = cols.map((k) => list.filter((x) => x.shift === k).length);
    const widths = cols.map((k, j) => { const w = (1 + 0.4 * (Math.min(counts[j], 10) - 1)) * (states[j] === 'now' ? 1.2 : states[j] === 'past' ? 0.85 : 1); return `${w.toFixed(2)}fr`; });
    const nextCol = cols.find((k, j) => states[j] === 'later' && (j === 0 || states[j - 1] !== 'later'));
    const isToday = date === clock.date;
    const dayIdx = T.eventDays().indexOf(date);
    const when = isToday ? 'Hoje' : T.relDay(date, clock.date) === 'amanhã' ? 'Amanhã' : T.fmtDate(date, 'wdlong').replace(/^./, (c) => c.toUpperCase());
    let h = `<section class="board" id="board"><div class="board-head"><div><h1>${I('calendar')}Programação de <em>${esc(when.toLowerCase())}</em></h1><div class="where">${I('pin')}${esc(venueName)}${venueSel ? '' : ' · todos os locais'}</div></div>
      <span class="board-pill ${isToday ? 'today' : ''}">${I(isToday ? 'sun' : 'calendar')}${esc(T.fmtDate(date))}${dayIdx >= 0 ? ` · ${dayIdx + 1}º dia` : ''}</span></div>`;
    if (!cols.length) {
      h += `<div class="col-empty">Sem cursos programados neste local. Veja os serviços gratuitos na faixa abaixo.</div>`;
    } else {
      h += `<div class="cols" style="--cols:${widths.map((w) => `minmax(19em,${w})`).join(' ')}">`;
      cols.forEach((k, j) => {
        const sh = T.SHIFTS[k]; const s = states[j]; const [a, b] = shiftWin(k);
        const items = list.filter((x) => x.shift === k);
        const pct = s === 'now' ? Math.min(1, Math.max(0, (clock.min - a) / (b - a))) : s === 'past' ? 1 : 0;
        const tag = s === 'now' ? '<em class="live">Agora</em>' : s === 'past' ? '<em>Encerrado</em>' : k === nextCol && isToday ? `<em>Começa às ${T.fmtTime(sh.start)}</em>` : '';
        h += `<div class="col ${s}" style="--c:${sh.color}"><div class="col-h"><b>${I(T.SHIFT_ICON[k])}${esc(sh.label)}</b><span>${T.fmtTime(sh.start)} às ${T.fmtTime(sh.end)}</span>${tag}</div>${s !== 'later' ? `<div class="col-bar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` : ''}<div class="col-list">`;
        for (const x of items) {
          const sx = st(x); const v = D.venues[x.venue];
          const sub = venueSel ? `<small>${T.fmtTime(x.time)} às ${T.fmtTime(T.sessionEnd(x))}</small>` : `<small class="where">${esc(v.short)}</small>`;
          h += `<div class="ev ${sx}" style="--c:${sh.color}"><div class="ev-room"><b>${esc(roomOf(x))}</b>${sub}</div><div class="ev-main"><b>${esc(T.title(x.course, true))}${x.label ? ` · ${esc(x.label)}` : ''}</b><small><b>Para:</b> ${esc(x.course.audience)}</small></div>${sx === 'now' ? '<span class="ev-tag">Agora</span>' : sx === 'past' ? '<span class="ev-tag">Encerrado</span>' : ''}</div>`;
        }
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += `<div class="svc-strip"><small>Também hoje</small>${D.services.map((s) => `<span class="svc-chip" style="--c:${s.color}"><i>${I(s.icon)}</i><span>${esc(s.short || s.title)}</span></span>`).join('')}</div></section>`;
    return h;
  }
  /** Reduz a escala até caber sem rolagem; se ainda não couber, esconde a linha "Para:". */
  function fitBoard() {
    const b = document.getElementById('board'); if (!b) return;
    const lists = [...b.querySelectorAll('.col-list')];
    const overflow = () => lists.some((l) => l.scrollHeight > l.clientHeight + 1) || b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1;
    let fs = 1; b.style.setProperty('--fs', fs); b.classList.remove('compact');
    while (overflow() && fs > 0.74) { fs = Math.round((fs - 0.04) * 100) / 100; b.style.setProperty('--fs', fs); }
    if (overflow()) { b.classList.add('compact'); fs = 1; b.style.setProperty('--fs', fs); while (overflow() && fs > 0.7) { fs = Math.round((fs - 0.04) * 100) / 100; b.style.setProperty('--fs', fs); } }
  }

  // ---------- destaques ----------
  /** Candidatos, nesta ordem: em andamento agora, depois os próximos de hoje; em outro dia, todos os do dia. */
  function highlightPool(date) {
    const list = sessionsAt(date).sort(byRoom);
    const now = list.filter((x) => st(x) === 'now');
    const up = list.filter((x) => st(x) === 'today' || st(x) === 'future');
    const items = now.concat(up);
    const label = now.length ? 'Agora e a seguir' : `Destaques de ${dayWord(date)}`;
    return { label, items };
  }
  function hlCardHtml(x) {
    const s = st(x); const sh = T.SHIFTS[x.shift]; const v = D.venues[x.venue];
    const tag = s === 'now' ? `<span class="hl-tag live" style="--c:${sh.color}"><i></i>Agora · até ${T.fmtTime(T.sessionEnd(x))}</span>`
      : s === 'today' ? `<span class="hl-tag" style="--c:${sh.color}">Hoje às ${T.fmtTime(x.time)}</span>`
        : s === 'past' ? `<span class="hl-tag" style="--c:#94a3b8">Encerrado</span>`
          : `<span class="hl-tag" style="--c:${sh.color}">${esc(dayWord(x.date))} às ${T.fmtTime(x.time)}</span>`;
    return `<div class="hl" style="--c:${sh.color}">${tag}<div class="hl-room">${esc(roomOf(x))}${x.room && !venueSel ? `<small>${esc(v.short)}</small>` : ''}</div><div class="hl-title">${esc(T.title(x.course, true))}</div><div class="hl-aud"><b>Para:</b> ${esc(x.course.audience)}</div><div class="hl-foot">${I('pin')}${esc(v.name)} · ${x.course.hours}h · ${x.course.seats} vagas</div></div>`;
  }
  function renderHighlights(animate) {
    const wrap = document.getElementById('hl'); const title = document.getElementById('hl-title'); if (!wrap) return;
    const pool = hlPool; const n = pool.items.length;
    title.innerHTML = `${I('star')}${esc(pool.label)}${n > HL_COUNT ? ` · ${n} cursos` : ''}`;
    const draw = () => {
      if (!n) { wrap.innerHTML = `<div class="hl-empty">${I('handshake')}<span>Sem cursos neste momento.<br>Os serviços gratuitos continuam: veja a faixa abaixo.</span></div>`; return; }
      const start = (hlPage * HL_COUNT) % n;
      const items = []; for (let k = 0; k < Math.min(HL_COUNT, n); k++) items.push(pool.items[(start + k) % n]);
      wrap.innerHTML = items.map(hlCardHtml).join('');
    };
    if (animate) { wrap.classList.add('fading'); setTimeout(() => { draw(); wrap.classList.remove('fading'); }, 400); } else draw();
  }
  function scheduleHighlights() {
    clearInterval(hlTimer);
    hlTimer = setInterval(() => { if (hlPool.items.length > HL_COUNT) { hlPage++; renderHighlights(true); } }, HL_SECS * 1000);
  }

  // ---------- casca ----------
  function shellHtml() {
    const url = T.appUrl(venueSel ? `programacao?local=${venueSel}` : '');
    const qr = T.qrSvg(url, { margin: 1 });
    const shortUrl = url.replace(/^https?:\/\//, '').replace(/\/#.*$/, '').replace(/\/$/, '');
    const ticker = D.services.map((s) => `${s.title}: ${s.summary.replace(/\.$/, '')}`).concat(['Programação completa, serviços e inscrições no celular: aponte a câmera para o QR Code']).join('   ✦   ') + '   ✦   ';
    return `<header class="tv-head"><div class="tv-logo"><img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá"></div>
      <div class="tv-title"><b>${esc(D.event.name)} · ${esc(D.event.edition)}</b><small>${I('pin')}${esc(venueName)} · ${esc(D.event.datesLabel)} ${T.isSimulated() ? '<span class="tv-live demo"><i></i>demonstração</span>' : '<span class="tv-live"><i></i>ao vivo</span>'}</small></div>
      <div class="tv-clock"><div class="date"><b id="clock-wd"></b><small id="clock-date"></small></div><div class="time" id="clock-time"></div></div></header>
      <div class="tv-body"><div id="board-wrap" class="board-wrap"></div>
        <aside class="tv-side"><div class="side-title" id="hl-title"></div><div class="hl-wrap" id="hl"></div>
          <div class="tv-qr">${qr}<div><b>${I('phone')}Aponte a câmera do celular</b><p>Veja toda a programação, os serviços gratuitos e faça sua inscrição.</p><code>${esc(shortUrl)}</code></div></div></aside></div>
      <div class="tv-ticker"><span class="tv-ticker-label">${I('megaphone')}Serviços gratuitos</span><div class="tv-ticker-track"><span>${esc(ticker)}</span><span aria-hidden="true">${esc(ticker)}</span></div></div>
      <footer class="tv-foot"><span>${esc(D.event.organizer)} · ${esc(D.event.tagline)}</span><span>Cursos gratuitos com inscrição pelo QR Code · Serviços sem inscrição, por ordem de chegada</span></footer>`;
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
    document.getElementById('clock-wd').textContent = clock.weekday.replace('-feira', '');
    document.getElementById('clock-date').textContent = `${clock.day} de ${clock.month}`;
  }
  function refresh(force) {
    tickClock();
    const date = boardDate();
    const key = `${date}|${clock.time}|${orientation}|${root.style.getPropertyValue('--tv-zoom')}|${root.classList.contains('tv-light')}`;
    if (!force && key === boardKey) return;
    boardKey = key;
    document.getElementById('board-wrap').innerHTML = boardHtml(date);
    fitBoard();
    const pool = highlightPool(date);
    const poolKey = pool.label + pool.items.map((x) => `${x.course.id}@${x.date}${x.time}`).join(',');
    if (poolKey !== refresh.poolKey) { refresh.poolKey = poolKey; hlPool = pool; hlPage = 0; renderHighlights(false); scheduleHighlights(); }
    lastTick = Date.now();
  }
  function keys(e) {
    const k = e.key.toLowerCase();
    if (k === 'f') fullscreen();
    else if (k === 'l') { prefs.theme = root.classList.contains('tv-light') ? 'dark' : 'light'; savePrefs(); applyPrefs(); refresh(true); }
    else if (e.key === '+' || e.key === '=' || e.key === '-') { prefs.zoom = Math.round(clamp((prefs.zoom || 1) + (e.key === '-' ? -0.05 : 0.05)) * 100) / 100; savePrefs(); applyPrefs(); refresh(true); }
    else if (e.key === '0') { delete prefs.zoom; savePrefs(); applyPrefs(); refresh(true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (hlPool.items.length > HL_COUNT) { hlPage += e.key === 'ArrowRight' ? 1 : -1; if (hlPage < 0) hlPage = 1e6; renderHighlights(true); scheduleHighlights(); } }
    else if (e.key === 'Escape') { for (const p in prefs) delete prefs[p]; savePrefs(); applyPrefs(); refresh(true); }
  }
  function fullscreen() { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); }

  function start() {
    applyPrefs();
    root.innerHTML = shellHtml();
    refresh(true);
    setInterval(() => { tickClock(); if (clock.seconds === 0) refresh(); }, 1000);
    setInterval(() => {
      const h = new Date().getHours(); const m = new Date().getMinutes();
      if (h === 4 && m < 2) location.reload();                     // recarga diária (pega versões novas)
      if (Date.now() - lastTick > 10 * 60 * 1000) location.reload(); // watchdog anti-travamento
    }, 60000);
    window.addEventListener('keydown', keys);
    let rs; window.addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { applyPrefs(); refresh(true); }, 200); });
    window.addEventListener('pointerdown', fullscreen); // TVs com navegador exigem gesto para tela cheia
    document.fonts && document.fonts.ready.then(() => fitBoard());
  }
  start();
})();
