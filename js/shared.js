/* Utilitários comuns às duas páginas. Sem dependências além de js/data.js e vendor/qrcode.js. */
(function (root) {
  'use strict';
  const D = root.TCE_DATA;
  const TZ = D.event.timezone;
  const SHIFTS = D.event.shifts;
  const SHIFT_ORDER = ['manha', 'tarde', 'noite'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- relógio no fuso do evento, com simulação por URL (?t=HH:MM&d=AAAA-MM-DD) ----
  const params = new URLSearchParams(root.location ? root.location.search : '');
  let simOffset = null; // ms a somar ao Date.now()
  (function initSim() {
    const t = params.get('t'); const d = params.get('d');
    if (!t && !d) return;
    const real = partsOf(new Date());
    const date = d || real.date; const time = t || real.time;
    // Constrói o instante simulado no fuso do evento e calcula o desvio.
    const target = zonedToUtc(date, time);
    simOffset = target - Date.now();
  })();
  function zonedToUtc(date, time) {
    // Busca o instante UTC cujo horário em TZ é date+time (duas iterações bastam para fusos fixos).
    let guess = Date.parse(`${date}T${time}:00Z`);
    for (let i = 0; i < 2; i++) {
      const p = partsOf(new Date(guess));
      const diff = Date.parse(`${p.date}T${p.time}:${pad(p.seconds)}Z`) - Date.parse(`${date}T${time}:00Z`);
      guess -= diff;
    }
    return guess;
  }
  function partsOf(dt) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
    const o = {}; for (const p of f.formatToParts(dt)) o[p.type] = p.value;
    const hour = o.hour === '24' ? '00' : o.hour;
    const date = `${o.year}-${o.month}-${o.day}`;
    const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
    return { date, time: `${hour}:${o.minute}`, seconds: Number(o.second), weekdayNum: wd, weekday: WEEKDAYS[wd], day: Number(o.day), month: MONTHS[Number(o.month) - 1], min: toMin(`${hour}:${o.minute}`) };
  }
  const now = () => partsOf(new Date(Date.now() + (simOffset || 0)));
  const isSimulated = () => simOffset != null;

  // ---- datas / turnos ----
  const fmtDate = (iso, mode) => {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (mode === 'short') return `${pad(d)}/${pad(m)}`;
    if (mode === 'wd') return `${WEEKDAYS_SHORT[wd]} ${pad(d)}`;
    if (mode === 'wdlong') return `${WEEKDAYS[wd].replace('-feira', '')}, ${pad(d)}/${pad(m)}`;
    if (mode === 'day') return `${d} de ${MONTHS[m - 1]}`;
    return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]}`;
  };
  const weekdayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const shiftOf = (time) => { const h = toMin(time) / 60; return h < 13 ? 'manha' : h < 18 ? 'tarde' : 'noite'; };
  const fmtTime = (t) => { const [h, m] = t.split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`; };
  const eventDays = () => {
    const out = []; const [y, m, d0] = D.event.start.split('-').map(Number); const [, , d1] = D.event.end.split('-').map(Number);
    for (let d = d0; d <= d1; d++) out.push(`${y}-${pad(m)}-${pad(d)}`);
    return out;
  };
  const relDay = (iso, today) => {
    const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 864e5);
    return diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff === -1 ? 'ontem' : diff > 1 ? `em ${diff} dias` : '';
  };

  // ---- sessões ----
  const sessionEnd = (sess) => sess.end || SHIFTS[shiftOf(sess.time)].end;
  /** Estado da sessão frente ao relógio: past | now | next (próxima de hoje) | today | future. */
  function sessionState(sess, clock) {
    if (sess.date < clock.date) return 'past';
    if (sess.date > clock.date) return 'future';
    const a = toMin(sess.time); const b = toMin(sessionEnd(sess));
    if (clock.min >= b) return 'past';
    if (clock.min >= a) return 'now';
    return 'today';
  }
  const venueLabel = (sess, opts) => {
    const v = D.venues[sess.venue]; const name = opts && opts.long ? v.name : v.short;
    return sess.room ? `${sess.room} · ${name}` : name;
  };
  /** Todas as sessões com referência ao curso, ordenadas por data e hora. */
  let _all = null;
  function allSessions() {
    if (_all) return _all;
    _all = [];
    for (const c of D.courses) for (const sess of c.sessions) _all.push(Object.assign({ course: c, shift: shiftOf(sess.time), link: sess.link || c.link }, sess));
    _all.sort((x, y) => x.date.localeCompare(y.date) || toMin(x.time) - toMin(y.time) || String(x.room).localeCompare(String(y.room)));
    return _all;
  }
  const courseById = (id) => D.courses.find((c) => String(c.id) === String(id));
  const serviceById = (id) => D.services.find((x) => x.id === id);
  const title = (c, short) => (short && c.short) || c.title;
  /** Próxima sessão (a partir de agora) de um curso; null se todas passaram. */
  const nextSession = (c, clock) => allSessions().filter((x) => x.course === c && sessionState(x, clock) !== 'past')[0] || null;
  const courseState = (c, clock) => {
    const st = c.sessions.map((x) => sessionState(x, clock));
    return st.includes('now') ? 'now' : st.includes('today') ? 'today' : st.every((x) => x === 'past') ? 'past' : 'future';
  };

  // ---- QR ----
  function qrSvg(text, opts) {
    const o = Object.assign({ cell: 4, margin: 2, dark: '#0b1b3a', light: '#ffffff' }, opts || {});
    if (typeof root.qrcode !== 'function') return '';
    const q = root.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(); const size = n + o.margin * 2;
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c + o.margin} ${r + o.margin}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${size}" height="${size}" fill="${o.light}"/><path d="${path}" fill="${o.dark}"/></svg>`;
  }
  /** URL do app a partir da TV (mesma pasta), com ?app= para sobrescrever. */
  function appUrl(hash) {
    const base = params.get('app') || new URL('./', root.location.href).href;
    return base + (hash ? `#${hash}` : '');
  }

  // ---- .ics ----
  function icsFor(course, sessions) {
    const list = sessions || course.sessions;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TCE na Comunidade//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    const fold = (s) => s.replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
    list.forEach((sess, i) => {
      const dt = (iso, t) => `${iso.replace(/-/g, '')}T${t.replace(':', '')}00`;
      lines.push('BEGIN:VEVENT', `UID:tce-comunidade-${course.id}-${i}@tce.ap.gov.br`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TZ}:${dt(sess.date, sess.time)}`, `DTEND;TZID=${TZ}:${dt(sess.date, sessionEnd(sess))}`,
        `SUMMARY:${fold(title(course))}`, `LOCATION:${fold(venueLabel(sess, { long: true }))}`,
        `DESCRIPTION:${fold(`${D.event.name} · ${D.event.edition}\nPúblico: ${course.audience}\nCarga horária: ${course.hours}h\nInscrição: ${sess.link || course.link}`)}`,
        `URL:${sess.link || course.link}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  root.TCE = { D, TZ, SHIFTS, SHIFT_ORDER, pad, toMin, norm, esc, now, isSimulated, partsOf, fmtDate, fmtTime, weekdayOf, shiftOf, eventDays, relDay,
    sessionEnd, sessionState, venueLabel, allSessions, courseById, serviceById, title, nextSession, courseState, qrSvg, appUrl, icsFor, params };
})(typeof window !== 'undefined' ? window : globalThis);
