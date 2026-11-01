/* Resumo da organização (documento para a equipe): capa com sumário, visão geral, programação por dia e
   local (cursos com sala da programação e número na planta; nos dias de serviços, atendimentos sala a sala),
   plantas em página paisagem, índice A–Z dos cursos e pendências. Só leitura; impressão em A4. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc; const M = window.TCEMap;
  const root = document.getElementById('resumo');
  const ROOMS = window.TCE_COURSE_ROOMS || {};
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const all = T.allSessions();
  const days = T.eventDays();
  const VENUE_ORDER = ['jn', 'manga', 'sebrae', 'auditorio', 'iaparra'];
  const svcDay = (venue) => T.serviceDays().find((d) => d.venue === venue);
  const at = (sd, long) => `${sd.venue === 'jn' ? 'na' : 'no'} ${(long && sd.placeLong) || sd.place}`; // "na Escola…" / "no Distrito…"
  const today = new Date().toLocaleDateString('pt-BR');

  const chip = (p, cls) => (p ? `<span class="room ${p.kind} ${cls || ''}">${esc(M.placeLabel(p))}</span>` : '');
  const dot = (s) => `<i class="dot" style="--c:${s.color}"></i>`;
  const servicesAt = (p) => D.services.filter((s) => (!p.svc || p.svc === s.id) && T.placesOf(s, p.venue).includes(p.id));
  const itemsAt = (s, p) => s.items.filter((it) => T.itemWhere(it, p.venue).includes(p.id));
  const onlyBadge = (it) => (T.itemOnly(it) ? `<span class="only">só ${esc(T.fmtDate(T.itemOnly(it), 'wdm'))}</span>` : '');
  const roomsOf = (venue) => (D.maps[venue] ? D.maps[venue].places.filter((p) => !p.hide).map((p) => Object.assign({ venue }, p)) : []);
  const roomSort = (a, b) => (Number(a.num) || 999) - (Number(b.num) || 999) || String(a.num).localeCompare(String(b.num));
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;
  const h2 = (num, text, sub) => `<h2><span class="n">${num}.</span> ${esc(text)}${sub ? `<span class="h2sub">${sub}</span>` : ''}</h2>`;

  // ---- Capa + sumário ----
  function cover() {
    const nMapped = all.filter((x) => T.courseRoomPlace(x)).length;
    const venuesUsed = VENUE_ORDER.filter((v) => all.some((x) => x.venue === v) || svcDay(v));
    return `<section class="cover">
      <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá">
      <p class="kicker">Resumo da organização</p>
      <h1>${esc(D.event.name)}<br><span>${esc(D.event.edition)}</span></h1>
      <p class="sub">${esc(D.event.place)} · ${esc(D.event.datesLabel)}</p>
      <p class="facts">${D.courses.length} cursos gratuitos · ${all.length} aulas (${nMapped} com sala na planta) · ${D.services.length} blocos de serviços gratuitos em ${esc(T.serviceDaysLabel('wdm'))} · ${venuesUsed.length} locais</p>
      <nav class="toc"><h3>Sumário</h3><ol>
        <li><a href="#s1"><span>1</span>Visão geral — dias × locais e blocos de serviços</a></li>
        <li><a href="#s2"><span>2</span>Programação por dia e local</a><ol>${days.map((d, i) => `<li><a href="#d${d.slice(8)}"><span>2.${i + 1}</span>${esc(cap(T.fmtDate(d)))}${T.serviceDayOf(d) ? ` <em>· serviços gratuitos ${esc(at(T.serviceDayOf(d)))}</em>` : ''}</a></li>`).join('')}</ol></li>
        <li><a href="#s3"><span>3</span>Plantas e uso de cada sala</a></li>
        <li><a href="#s4"><span>4</span>Cursos de A a Z</a></li>
        <li><a href="#s5"><span>5</span>Pendências e fontes</a></li></ol></nav>
      <div class="legend-note"><h3>Como ler este documento</h3><ul>
        <li><span class="room">Sala 08</span> é o número da sala na planta de ambientação. Ao lado, em cinza, o nome usado na programação da Escola de Contas (ex.: Sala I).</li>
        <li><span class="room tenda">Tenda 07</span> e <span class="room area">Ambiente 16</span> são tendas e espaços abertos da planta.</li>
        <li>Cursos: inscrição pelo site da ESCON. Serviços: sem inscrição, por ordem de chegada.</li>
        <li><span class="only">só sáb 07/11</span> marca atendimentos que acontecem apenas na Escola Joaquim Nabuco.</li></ul></div>
      <p class="version">Versão gerada em ${today} a partir dos dados publicados no site · www.tce.ap.gov.br/tce-na-comunidade</p>
    </section>`;
  }

  // ---- 1. Visão geral ----
  function overview() {
    const vs = VENUE_ORDER.filter((v) => all.some((x) => x.venue === v) || svcDay(v));
    const rows = days.map((d) => `<tr><th>${esc(cap(T.fmtDate(d, 'wdm')))}</th>${vs.map((v) => { const n = all.filter((x) => x.date === d && x.venue === v).length; const sd = T.serviceDayOf(d); const svc = sd && sd.venue === v; return `<td class="${n || svc ? 'has' : ''}">${n ? plural(n, 'aula') : ''}${svc ? `<span class="svcday">serviços gratuitos</span>` : ''}${!n && !svc ? '<span class="muted">—</span>' : ''}</td>`; }).join('')}</tr>`).join('');
    const matrix = `<div class="ovwrap"><table class="ov"><thead><tr><th>Dia</th>${vs.map((v) => `<th>${esc(D.venues[v].short)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const svcRows = D.services.map((s) => `<tr><td><b>${dot(s)}${s.num ? `${s.num}. ` : ''}${esc(s.title)}</b><span class="aud">${esc(s.summary)}</span></td>${['manga', 'jn'].map((v) => { const ids = T.placesOf(s, v).map((id) => T.placeInfo(id)).filter(Boolean).sort(roomSort); return `<td class="chips">${ids.length ? ids.map((p) => chip(p, 'sm')).join(' ') : '<span class="muted">sem sala definida</span>'}</td>`; }).join('')}<td class="aud-cell">${s.partners.map(esc).join(' · ')}</td></tr>`).join('');
    const svcTable = `<table class="tsvc"><thead><tr><th>Bloco de serviços</th><th>${esc(cap(T.fmtDate(svcDay('manga').date, 'wdm')))} · Manga</th><th>${esc(cap(T.fmtDate(svcDay('jn').date, 'wdm')))} · Joaquim Nabuco</th><th>Quem atende</th></tr></thead><tbody>${svcRows}</tbody></table>`;
    return `<section class="sec" id="s1">${h2(1, 'Visão geral')}
      <h3>Dias e locais</h3>${matrix}
      <h3>Blocos de serviços gratuitos e suas salas</h3>${svcTable}</section>`;
  }

  // ---- 2. Programação por dia e local ----
  function sessionsTable(list) {
    let h = '';
    for (const k of T.SHIFT_ORDER) {
      const l = list.filter((x) => x.shift === k); if (!l.length) continue;
      h += `<tr class="shift"><td colspan="4">${esc(T.SHIFTS[k].label)}</td></tr>`;
      for (const x of l) {
        const pl = T.courseRoomPlace(x);
        h += `<tr><td class="num">${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}</td><td><b>${esc(T.title(x.course))}</b>${x.label ? ` <span class="muted">· ${esc(x.label)}</span>` : ''}<span class="aud">${esc(x.course.audience)}</span></td><td class="sala">${pl ? chip(pl) : '<span class="room none">—</span>'}${x.room ? `<span class="prog">${esc(x.room)}</span>` : ''}</td><td class="num">${x.course.seats}</td></tr>`;
      }
    }
    return `<table class="t1"><thead><tr><th>Horário</th><th>Curso · público</th><th>Sala</th><th>Vagas</th></tr></thead><tbody>${h}</tbody></table>`;
  }
  function servicesTable(venue, date) {
    const rows = []; const placed = new Set();
    for (const p of roomsOf(venue).sort(roomSort)) {
      const svcs = servicesAt(p); if (!svcs.length) continue;
      svcs.forEach((s, i) => {
        const its = itemsAt(s, p); its.forEach((it) => placed.add(it));
        rows.push(`<tr style="--c:${s.color}">${i === 0 ? `<td rowspan="${svcs.length}">${chip(p)}<span class="prog">${esc(p.name)}</span></td>` : ''}<td class="svcname"><b>${dot(s)}${esc(s.short)}</b></td><td>${its.length ? its.map((it) => esc(T.itemText(it)) + onlyBadge(it)).join('; ') : '<span class="muted">atendimentos do bloco</span>'}</td></tr>`);
      });
    }
    const loose = D.services.map((s) => ({ s, its: s.items.filter((it) => !placed.has(it) && (!T.itemOnly(it) || T.itemOnly(it) === date)) })).filter((r) => r.its.length);
    loose.forEach((r, i) => rows.push(`<tr class="loose" style="--c:${r.s.color}">${i === 0 ? `<td rowspan="${loose.length}"><span class="room none">sem sala definida</span></td>` : ''}<td class="svcname"><b>${dot(r.s)}${esc(r.s.short)}</b></td><td>${r.its.map((it) => esc(T.itemText(it)) + onlyBadge(it)).join('; ')}</td></tr>`));
    return `<table class="t3"><thead><tr><th>Sala</th><th>Bloco</th><th>Atendimentos</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function daySections() {
    const intro = `<div class="sec" id="s2">${h2(2, 'Programação por dia e local')}<p class="lead">Cada dia começa em uma nova página. Em cada local: os cursos do dia por turno e, nos dias de serviços gratuitos, os atendimentos sala a sala.</p></div>`;
    return days.map((d, i) => {
      const sd = T.serviceDayOf(d);
      // Local com serviços gratuitos (tabela longa) fica por último, para não deixar um local sozinho na página seguinte.
      const venues = VENUE_ORDER.filter((v) => all.some((x) => x.date === d && x.venue === v) || (sd && sd.venue === v)).sort((a, b) => (sd && sd.venue === a ? 1 : 0) - (sd && sd.venue === b ? 1 : 0));
      const n = all.filter((x) => x.date === d).length;
      const blocks = venues.map((v) => {
        const list = all.filter((x) => x.date === d && x.venue === v); const isSvc = sd && sd.venue === v; const ven = D.venues[v];
        return `<section class="venue"><h3>${esc(ven.name)}<small>${esc(ven.city)}${list.length ? ` · ${plural(list.length, 'aula')}` : ''}</small>${isSvc ? `<span class="svcday">serviços gratuitos</span>` : ''}</h3>
          ${list.length ? sessionsTable(list) : ''}
          ${isSvc ? `<h4>Serviços gratuitos · sala a sala <span class="muted">(números da planta, seção 3)</span></h4>${servicesTable(v, d)}` : ''}</section>`;
      }).join('');
      return `<section class="day" id="d${d.slice(8)}">${i === 0 ? intro : ''}<div class="dayhead"><h2><span class="n">2.${i + 1}</span> ${esc(cap(T.fmtDate(d)))}</h2><p>${plural(n, 'aula')} em ${plural(venues.filter((v) => all.some((x) => x.date === d && x.venue === v)).length, 'local', 'locais')}${sd ? ` · serviços gratuitos ${esc(at(sd, true))}` : ''}</p></div>${blocks}</section>`;
    }).join('');
  }

  // ---- 3. Plantas ----
  function plans() {
    const intro = `<div class="sec" id="s3">${h2(3, 'Plantas e uso de cada sala')}<p class="lead">Cor do ponto = bloco de serviço que atende na sala no dia de serviços; ponto azul-escuro = sala só de cursos ou sem uso cadastrado. Na tela, passe o mouse na lista para destacar a sala e toque no ponto para ir à linha.</p></div>`;
    return Object.values(D.maps).map((m, i) => {
      const sd = svcDay(m.venue);
      const unused = [];
      const rows = roomsOf(m.venue).sort(roomSort).map((p) => {
        const svcs = servicesAt(p);
        const uses = all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });
        if (!svcs.length && !uses.length) { unused.push(p); return ''; }
        const byCourse = {}; for (const x of uses) (byCourse[x.course.id] = byCourse[x.course.id] || { c: x.course, when: [] }).when.push(T.fmtDate(x.date, 'wd'));
        return `<tr data-place="${p.id}"><td>${chip(p)}<span class="prog">${esc(p.name)}</span></td><td>${svcs.map((s) => `<div>${dot(s)}${esc(s.short)}</div>`).join('') || '<span class="muted">—</span>'}</td><td>${Object.values(byCourse).map((u) => `<div><b>${esc(T.title(u.c, true))}</b> <span class="muted">${[...new Set(u.when)].join(', ')}</span></div>`).join('') || '<span class="muted">—</span>'}</td></tr>`;
      }).join('');
      const used = D.services.filter((s) => roomsOf(m.venue).some((p) => servicesAt(p).includes(s)));
      const dePara = Object.entries(ROOMS[m.venue] || {}).map(([k, id]) => { const p = T.placeInfo(id); return `<span>${esc(k)} → <b>${p ? esc(M.placeLabel(p)) : esc(id)}</b></span>`; }).join('');
      return `<section class="plan" data-venue="${m.venue}">${i === 0 ? intro : ''}<h3>${esc(m.title)}<small>serviços em ${esc(T.fmtDate(sd.date, 'wdlong'))} · acessos: ${m.entrances.map((e) => esc(e.label)).join(', ')}</small></h3>
        <div class="plan-grid"><div class="plan-map"><div id="plan-${m.venue}" class="tcemap"></div>
          <div class="map-legend">${used.map((s) => `<span>${dot(s)}${esc(s.short)}</span>`).join('')}<span><i class="dot" style="--c:#0b1b3d"></i>só cursos / sem serviço</span></div>
          ${dePara ? `<p class="tiny muted depara"><b>Salas dos cursos (programação → planta):</b> ${dePara}</p>` : ''}
          ${unused.length ? `<p class="tiny muted depara"><b>Sem uso cadastrado:</b> ${unused.map((p) => `${esc(M.placeLabel(p))} (${esc(p.name)})`).join(' · ')}</p>` : ''}</div>
          <table class="t4"><thead><tr><th>Sala</th><th>Serviços · ${esc(T.fmtDate(sd.date, 'wdm'))}</th><th>Cursos · demais dias</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }).join('');
  }
  function paintPlans() {
    for (const m of Object.values(D.maps)) {
      const el = document.getElementById(`plan-${m.venue}`);
      M.render(el, m.venue, { showAll: true, scale: 1.25 });
      el.querySelectorAll('.mk[data-place]').forEach((g) => { const p = T.placeInfo(g.dataset.place); const s = p && servicesAt(p)[0]; if (s) { g.classList.add('svcmk'); g.style.setProperty('--c', s.color); } });
      const sec = el.closest('.plan');
      sec.querySelectorAll('tr[data-place]').forEach((tr) => {
        const g = el.querySelector(`.mk[data-place="${tr.dataset.place}"]`); if (!g) return;
        tr.addEventListener('mouseenter', () => g.classList.add('hot')); tr.addEventListener('mouseleave', () => g.classList.remove('hot'));
        g.addEventListener('click', () => { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600); });
      });
    }
  }

  // ---- 4. Cursos A–Z ----
  function indexAZ() {
    const cs = [...D.courses].sort((a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'));
    return `<section class="sec" id="s4">${h2(4, 'Cursos de A a Z', `${D.courses.length} cursos · inscrição pelo site da ESCON`)}
      <table class="t2"><thead><tr><th>Curso</th><th>Público</th><th>Aulas · local · sala</th><th>Vagas</th><th>CH</th><th>ESCON</th></tr></thead><tbody>${cs.map((c) => `<tr><td><b>${esc(c.title)}</b><span class="aud">${c.tags.map((t) => esc(D.tags[t])).join(', ')}</span></td><td class="aud-cell">${esc(c.audience)}</td><td>${all.filter((x) => x.course === c).map((x) => { const pl = T.courseRoomPlace(x); return `<div class="sess">${esc(T.fmtDate(x.date, 'wd'))} ${T.fmtTime(x.time)} · ${esc(D.venues[x.venue].short)}${pl ? ` ${chip(pl, 'sm')}` : x.room ? ` <span class="muted">${esc(x.room)}</span>` : ''}${x.label ? ` <span class="muted">(${esc(x.label)})</span>` : ''}</div>`; }).join('')}</td><td class="num">${c.seats}</td><td class="num">${c.hours}h</td><td class="num"><a href="${esc(c.link)}" target="_blank" rel="noopener">${c.id}</a></td></tr>`).join('')}</tbody></table></section>`;
  }

  // ---- 5. Pendências e fontes ----
  const pend = [
    ['Cursos', 'Curso 109 (Brinquedistas): a tabela oficial traz link administrativo; o site usa escon/cursos/109.'],
    ['Salas', 'Laboratório I – Joaquim Nabuco (Sala 01), 05/11 às 14h: dois cursos no mesmo horário e sala (125 Tecnologia e Direito das Mulheres × 145 Videomaker).'],
    ['Salas', 'Formação de Cuidador, 03/11 de manhã: a tabela diz só "Manga", sem sala.'],
    ['Cursos', 'Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).'],
    ['Cursos', 'Extensão de Cílios (127): cabeçalho diz 05 e 06/11, tabela lista 04, 05 e 06/11 (mantidos os três).'],
    ['Salas', 'Gestão Financeira nas Escolas (112): na Escola Jorge Iaparrá (Manga), sem sala definida; cabeçalho diz 1 ocorrência, tabela lista 8h e 14h.'],
    ['Serviços', 'Serviços sem sala na planta: TRE (título de eleitor), AMPREV, CGE, cinema do SESC, Marinha (informada na quadra).'],
    ['Salas', 'Salas 08, 09, 11, 13, 20 e 24 da Joaquim Nabuco são salas de curso de 03 a 06/11 e viram atendimentos de serviço em 07/11.'],
  ];
  function pendencias() {
    return `<section class="sec" id="s5">${h2(5, 'Pendências e fontes')}
      <table class="t5"><thead><tr><th>Nº</th><th>Tema</th><th>Pendência</th></tr></thead><tbody>${pend.map((p, i) => `<tr><td class="num">${i + 1}</td><td><span class="tag">${esc(p[0])}</span></td><td>${esc(p[1])}</td></tr>`).join('')}</tbody></table>
      <h3>Fontes</h3><ul class="fontes"><li>"Tabela com links COM AJUSTES FINAIS LEON.pdf" (Escola de Contas, 29/10/2026) — programação dos cursos.</li><li>"SERVICOS ATUALIZADOS.docx" (30/10/2026) — blocos de serviços; itens destacados = só 07/11 na Joaquim Nabuco.</li><li>"Relação de parceiros da IX edição" — instituições por bloco.</li><li>"Planta de ambientação" (arq. Niucéia Fêrnandes) — numeração das salas, tendas e ambientes.</li><li>Código e dados: github.com/rodrigossb/tce_comunidade · site: www.tce.ap.gov.br/tce-na-comunidade</li></ul></section>`;
  }

  root.innerHTML = `
    <div class="rs-tools"><button onclick="window.print()">${I('download')}Imprimir / PDF</button><a href="index.html">${I('phone')}App</a><a href="totem.html?local=jn&descanso=0">${I('map')}Totem</a><a href="placas.html">${I('door')}Placas de porta</a></div>
    ${cover()}${overview()}${daySections()}${plans()}${indexAZ()}${pendencias()}`;
  paintPlans();
})();
