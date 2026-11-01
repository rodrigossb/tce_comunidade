/* Placas de porta: uma folha A4 paisagem por sala/tenda/ambiente da planta. Painel escuro à esquerda com o
   número grande e o QR do caminho no mapa; à direita, logo, local, cursos por dia e serviços do dia de atendimentos. */
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
  const venues = (q.get('local') || 'jn,manga').split(',').filter((v) => D.maps[v]);
  const only = (q.get('sala') || '').split(',').filter(Boolean);
  const showAll = q.get('todas') === '1';

  function placesFor(venue) {
    return D.maps[venue].places.filter((p) => !p.hide).map((p) => Object.assign({ venue }, p)).sort(roomSort);
  }
  const usesOf = (p) => all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });

  // ---- uma placa ----
  function placa(p) {
    const uses = usesOf(p); const svcs = servicesAt(p); const sd = svcDay(p.venue); const map = D.maps[p.venue];
    if (!uses.length && !svcs.length && !showAll) return '';
    const progNames = [...new Set(uses.map((x) => x.room).filter(Boolean))];
    const byDay = {}; for (const x of uses) (byDay[x.date] = byDay[x.date] || []).push(x);
    const courses = Object.keys(byDay).sort().map((d) => `<div class="pl-day"><h3>${esc(cap(T.fmtDate(d, 'wdlong')))}</h3>${byDay[d].map((x) => `<div class="pl-row"><span class="pl-time">${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}</span><span class="pl-what"><b>${esc(T.title(x.course))}</b>${x.label ? ` <small>· ${esc(x.label)}</small>` : ''}<small>${esc(x.course.audience)}</small></span></div>`).join('')}</div>`).join('');
    const services = svcs.length ? `<div class="pl-day pl-svc"><h3>${esc(cap(T.fmtDate(sd.date, 'wdlong')))} · serviços gratuitos</h3>${svcs.map((s) => { const its = itemsAt(s, p); return `<div class="pl-row"><span class="pl-ico" style="--c:${s.color}">${I(s.icon)}</span><span class="pl-what"><b>${esc(s.title)}</b><small>${its.length ? its.map((it) => esc(T.itemText(it))).join(' · ') : esc(s.summary)}</small></span></div>`; }).join('')}</div>` : '';
    const bigNum = p.num ? esc(p.num) : '';
    const kind = p.kind === 'area' && !p.num ? '' : KIND[p.kind];
    const qr = T.qrSvg(T.appUrl(`#mapa?local=${p.venue}&p=${p.id}`), { margin: 1 });
    return `<article class="placa ${p.kind}" data-place="${p.id}">
      <aside class="pl-side">
        <div class="pl-kind">${kind}</div>
        ${bigNum ? `<div class="pl-num ${bigNum.length > 2 ? 'long' : ''}">${bigNum}</div>` : `<div class="pl-num text">${esc(p.name)}</div>`}
        <div class="pl-name">${bigNum ? esc(p.name) : ''}${progNames.length ? `<small>${progNames.map(esc).join(' · ')} na programação dos cursos</small>` : ''}</div>
        <div class="pl-qr"><div class="pl-qr-box">${qr}</div><span>Aponte a câmera: caminho até aqui no mapa da escola</span></div>
      </aside>
      <section class="pl-main">
        <header class="pl-head"><img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá"><div><b>${esc(D.event.name)} · ${esc(D.event.edition)}</b><span>${esc(map.title)}</span></div></header>
        <div class="pl-body ${(() => { const n = uses.length + svcs.length; return n <= 3 ? 'few' : n >= 8 ? 'many dense' : n >= 6 ? 'many' : ''; })()}">${courses}${services}${!courses && !services ? '<p class="pl-empty">Sem atividade cadastrada neste local.</p>' : ''}</div>
        <footer class="pl-foot"><span>${esc(D.event.place)} · ${esc(D.event.datesLabel)}</span><span>www.tce.ap.gov.br/tce-na-comunidade</span><span class="note">Cursos: inscrição pelo site da ESCON · Serviços gratuitos: sem inscrição, por ordem de chegada</span></footer>
      </section>
    </article>`;
  }

  // ---- página ----
  const sheets = [];
  for (const v of venues) for (const p of placesFor(v)) if (!only.length || only.includes(p.id)) { const h = placa(p); if (h) sheets.push(h); }
  root.innerHTML = `
    <div class="pl-tools">
      <div class="pl-tools-l"><b>Placas de porta</b><span>${sheets.length} folha${sheets.length === 1 ? '' : 's'} A4 paisagem · imprimir sem margens, em cores</span></div>
      <div class="pl-tools-r">
        <a class="${venues.length === 2 ? 'on' : ''}" href="placas.html">Todas</a>
        ${Object.values(D.maps).map((m) => `<a class="${venues.length === 1 && venues[0] === m.venue ? 'on' : ''}" href="placas.html?local=${m.venue}">${esc(m.short)}</a>`).join('')}
        <button onclick="window.print()">${I('download')}Imprimir / PDF</button>
      </div>
    </div>
    <div class="pl-sheets">${sheets.join('')}</div>`;

  // Na tela, cada folha é reduzida para caber na largura disponível (na impressão sai em tamanho real).
  function fit() {
    const w = root.clientWidth - 2; const z = Math.min(1, w / 1123);
    root.style.setProperty('--z', z.toFixed(4));
  }
  fit(); window.addEventListener('resize', fit);
})();
