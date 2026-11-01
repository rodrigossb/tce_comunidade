/* Placas de porta (A4 paisagem), duas versões:
   - consolidada (padrão): uma folha por sala com todos os cursos e serviços daquele local;
   - destaque (?modo=destaque): uma folha por curso e por serviço de cada sala, com o nome bem grande.
   O texto do painel principal cresce automaticamente até o maior tamanho que cabe na folha (ver fit()). */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc; const M = window.TCEMap;
  const root = document.getElementById('placas');
  const all = T.allSessions();
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const svcDay = (venue) => T.serviceDays().find((d) => d.venue === venue);
  const servicesAt = (p) => D.services.filter((s) => (!p.svc || p.svc === s.id) && T.placesOf(s, p.venue).includes(p.id));
  const itemsAt = (s, p) => s.items.filter((it) => T.itemWhere(it, p.venue).includes(p.id));
  const roomSort = (a, b) => (Number(a.num) || 999) - (Number(b.num) || 999) || String(a.num).localeCompare(String(b.num));
  const KIND = { sala: 'Sala', tenda: 'Tenda', area: 'Ambiente' };

  // ---- filtros ----
  const q = T.params;
  const mode = q.get('modo') === 'destaque' ? 'destaque' : 'consolidada';
  const venues = (q.get('local') || 'jn,manga').split(',').filter((v) => D.maps[v]);
  const only = (q.get('sala') || '').split(',').filter(Boolean);
  const showAll = q.get('todas') === '1';
  const placesFor = (venue) => D.maps[venue].places.filter((p) => !p.hide).map((p) => Object.assign({ venue }, p)).sort(roomSort);
  const usesOf = (p) => all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });

  // ---- partes comuns ----
  const when = (x) => `${esc(cap(T.fmtDate(x.date, 'wdlong')))} · ${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}`;
  function side(p, uses) {
    const progNames = [...new Set(uses.map((x) => x.room).filter(Boolean))];
    const bigNum = p.num ? esc(p.num) : '';
    const kind = p.kind === 'area' && !p.num ? '' : KIND[p.kind];
    const qr = T.qrSvg(T.appUrl(`#mapa?local=${p.venue}&p=${p.id}`), { margin: 1 });
    return `<aside class="pl-side">
        <div class="pl-kind">${kind}</div>
        ${bigNum ? `<div class="pl-num ${bigNum.length > 2 ? 'long' : ''}">${bigNum}</div>` : `<div class="pl-num text">${esc(p.name)}</div>`}
        <div class="pl-name">${bigNum ? esc(p.name) : ''}${progNames.length ? `<small>${progNames.map(esc).join(' · ')} na programação dos cursos</small>` : ''}</div>
        <div class="pl-bottom"><img class="pl-cartaz" src="img/arte-cartaz.jpg" alt="Cartaz do TCE na Comunidade"><div class="pl-qr"><div class="pl-qr-box">${qr}</div><span>Aponte a câmera: caminho até aqui no mapa</span></div></div>
      </aside>`;
  }
  const head = (p) => `<header class="pl-head"><img class="pl-marca" src="img/arte-marca.jpg" alt="TCE na Comunidade"><div class="pl-head-t"><b>${esc(D.event.edition)} · ${esc(D.event.place)}</b><span>${esc(D.maps[p.venue].title)}</span></div><img class="pl-logo" src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá"></header>`;
  const foot = () => `<footer class="pl-foot"><span>${esc(D.event.datesLabel)} · www.tce.ap.gov.br/tce-na-comunidade</span><span>Cursos: inscrição pelo site da ESCON · Serviços gratuitos: por ordem de chegada</span></footer>`;
  const sheet = (p, uses, cls, body) => `<article class="placa ${p.kind} ${cls}" data-place="${p.id}"><div class="pl-band"></div>${side(p, uses)}<section class="pl-main">${head(p)}<div class="pl-body ${cls}">${body}</div>${foot()}</section></article>`;

  // ---- versão consolidada: tudo o que acontece na sala ----
  function consolidada(p) {
    const uses = usesOf(p); const svcs = servicesAt(p); const sd = svcDay(p.venue);
    if (!uses.length && !svcs.length && !showAll) return '';
    const byDay = {}; for (const x of uses) (byDay[x.date] = byDay[x.date] || []).push(x);
    const courses = Object.keys(byDay).sort().map((d) => `<div class="pl-day"><h3>${esc(cap(T.fmtDate(d, 'wdlong')))}</h3>${byDay[d].map((x) => `<div class="pl-row"><span class="pl-time">${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}</span><span class="pl-what"><b>${esc(T.title(x.course))}</b>${x.label ? ` <small class="inl">· ${esc(x.label)}</small>` : ''}<small>${esc(x.course.audience)}</small></span></div>`).join('')}</div>`).join('');
    const services = svcs.length ? `<div class="pl-day pl-svc"><h3>${esc(cap(T.fmtDate(sd.date, 'wdlong')))} · serviços gratuitos</h3>${svcs.map((s) => { const its = itemsAt(s, p); return `<div class="pl-row"><span class="pl-ico" style="--c:${s.color}">${I(s.icon)}</span><span class="pl-what"><b>${esc(s.title)}</b><small>${its.length ? its.map((it) => esc(T.itemText(it))).join(' · ') : esc(s.summary)}</small></span></div>`; }).join('')}</div>` : '';
    const n = uses.length + svcs.length;
    return sheet(p, uses, n <= 3 ? 'few' : '', courses + services || '<p class="pl-empty">Sem atividade cadastrada neste local.</p>');
  }

  // ---- versão destaque: uma folha por curso e por serviço ----
  function destaque(p) {
    const uses = usesOf(p); const svcs = servicesAt(p); const sd = svcDay(p.venue); const out = [];
    const byCourse = {}; for (const x of uses) (byCourse[x.course.id] = byCourse[x.course.id] || []).push(x);
    for (const id of Object.keys(byCourse)) {
      const xs = byCourse[id]; const c = xs[0].course;
      out.push(sheet(p, uses, 'solo curso', `<div class="pl-label">Curso gratuito</div><h2 class="pl-big">${esc(c.title)}</h2>
        <div class="pl-sessions">${xs.map((x) => `<div class="pl-sess">${I('calendar')}<span>${when(x)}</span>${x.label ? `<small>${esc(x.label)}</small>` : ''}</div>`).join('')}</div>
        <p class="pl-aud"><b>Para:</b> ${esc(c.audience)}</p>
        <p class="pl-meta">${c.hours}h de carga horária · ${c.seats} vagas · inscrição pelo site da ESCON (curso ${c.id})</p>`));
    }
    for (const s of svcs) {
      const its = itemsAt(s, p);
      out.push(sheet(p, uses, 'solo servico', `<div class="pl-label">Serviços gratuitos · ${esc(cap(T.fmtDate(sd.date, 'wdlong')))}</div>
        <h2 class="pl-big"><span class="pl-ico" style="--c:${s.color}">${I(s.icon)}</span>${esc(s.title)}</h2>
        ${its.length ? `<ul class="pl-items">${its.map((it) => `<li>${esc(T.itemText(it))}</li>`).join('')}</ul>` : `<p class="pl-aud">${esc(s.summary)}</p>`}
        <p class="pl-meta">Sem inscrição, por ordem de chegada · ${s.partners.slice(0, 4).map(esc).join(' · ')}</p>`));
    }
    return out.join('');
  }

  // ---- página ----
  const sheets = [];
  for (const v of venues) for (const p of placesFor(v)) if (!only.length || only.includes(p.id)) { const h = mode === 'destaque' ? destaque(p) : consolidada(p); if (h) sheets.push(h); }
  const link = (label, params, on) => `<a class="${on ? 'on' : ''}" href="placas.html${params ? '?' + params : ''}">${label}</a>`;
  const modeQ = mode === 'destaque' ? 'modo=destaque' : '';
  const localQ = venues.length === 1 ? `local=${venues[0]}` : '';
  const join = (...xs) => xs.filter(Boolean).join('&');
  root.innerHTML = `
    <div class="pl-tools">
      <div class="pl-tools-l"><b>Placas de porta</b><span>${mode === 'destaque' ? 'Uma folha por curso ou serviço' : 'Uma folha por sala, com tudo o que acontece nela'} · ${sheets.length} folha${sheets.length === 1 ? '' : 's'} A4 paisagem · imprimir em cores, sem margens</span></div>
      <div class="pl-tools-r">
        <span class="pl-group">${link('Consolidada', join(localQ), mode === 'consolidada')}${link('Por curso / serviço', join('modo=destaque', localQ), mode === 'destaque')}</span>
        <span class="pl-group">${link('Todas', join(modeQ), venues.length === 2)}${Object.values(D.maps).map((m) => link(esc(m.short), join(modeQ, `local=${m.venue}`), venues.length === 1 && venues[0] === m.venue)).join('')}</span>
        <button onclick="window.print()">${I('download')}Imprimir / PDF</button>
      </div>
    </div>
    <div class="pl-sheets">${sheets.join('')}</div>`;

  // Texto no maior tamanho que cabe: ajusta --k (mm) de cada painel por tentativa, do maior para o menor.
  function fit() {
    root.querySelectorAll('.pl-body').forEach((body) => {
      body.classList.remove('dense');
      const fits = () => body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1;
      let k = body.classList.contains('solo') ? 12 : 9;
      for (; k >= 3; k -= 0.25) { body.style.setProperty('--k', k); if (fits()) return; }
      body.classList.add('dense'); // ainda não coube: esconde o público
      for (k = 4; k >= 2.6; k -= 0.2) { body.style.setProperty('--k', k); if (fits()) return; }
    });
  }
  function zoom() { const w = root.clientWidth - 2; root.style.setProperty('--z', Math.min(1, w / 1123).toFixed(4)); }
  zoom(); fit();
  window.addEventListener('resize', zoom);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener('beforeprint', fit);
})();
