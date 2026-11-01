/* Resumo da organização, organizado por dia e local: em cada dia, cada local com seus cursos (sala da
   programação e número na planta) e, nos dias de serviços, os atendimentos sala a sala. Depois as plantas
   com legenda, um índice A–Z dos cursos e as pendências. Só leitura; pensado para imprimir em A4. */
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

  const chip = (p, cls) => (p ? `<span class="room ${p.kind} ${cls || ''}">${esc(M.placeLabel(p))}</span>` : '');
  const dot = (s) => `<i class="dot" style="--c:${s.color}"></i>`;
  const servicesAt = (p) => D.services.filter((s) => (!p.svc || p.svc === s.id) && T.placesOf(s, p.venue).includes(p.id));
  const itemsAt = (s, p) => s.items.filter((it) => T.itemWhere(it, p.venue).includes(p.id));
  const onlyBadge = (it) => (T.itemOnly(it) ? `<span class="only">só ${esc(T.fmtDate(T.itemOnly(it), 'wdm'))}</span>` : '');
  const roomsOf = (venue) => (D.maps[venue] ? D.maps[venue].places.filter((p) => !p.hide).map((p) => Object.assign({ venue }, p)) : []);
  const roomSort = (a, b) => (Number(a.num) || 999) - (Number(b.num) || 999) || String(a.num).localeCompare(String(b.num));

  // ---- Visão geral: dias × locais ----
  function overview() {
    const vs = VENUE_ORDER.filter((v) => all.some((x) => x.venue === v) || svcDay(v));
    const rows = days.map((d) => `<tr><th>${esc(cap(T.fmtDate(d, 'wdm')))}</th>${vs.map((v) => { const n = all.filter((x) => x.date === d && x.venue === v).length; const sd = T.serviceDayOf(d); const svc = sd && sd.venue === v; return `<td class="${n || svc ? 'has' : ''}">${n ? `${n} aula${n > 1 ? 's' : ''}` : ''}${svc ? `<span class="svcday">serviços gratuitos</span>` : ''}${!n && !svc ? '<span class="muted">—</span>' : ''}</td>`; }).join('')}</tr>`).join('');
    return `<div class="ovwrap"><table class="ov"><thead><tr><th>Dia</th>${vs.map((v) => `<th>${esc(D.venues[v].short)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---- Cursos de um dia em um local ----
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
    return `<table class="t1"><thead><tr><th>Horário</th><th>Curso · público</th><th>Sala (planta · programação)</th><th>Vagas</th></tr></thead><tbody>${h}</tbody></table>`;
  }

  // ---- Serviços de um dia em um local, sala a sala ----
  function servicesTable(venue, date) {
    const rows = []; const placed = new Set();
    for (const p of roomsOf(venue).sort(roomSort)) {
      const svcs = servicesAt(p); if (!svcs.length) continue;
      const cells = svcs.map((s) => { const its = itemsAt(s, p); its.forEach((it) => placed.add(it)); return `<div>${dot(s)}<b>${esc(s.short)}</b>${its.length ? ` · ${its.map((it) => esc(T.itemText(it)) + onlyBadge(it)).join('; ')}` : ''}</div>`; }).join('');
      rows.push(`<tr><td>${chip(p)}<span class="prog">${esc(p.name)}</span></td><td>${cells}</td></tr>`);
    }
    const loose = D.services.map((s) => ({ s, its: s.items.filter((it) => !placed.has(it) && (!T.itemOnly(it) || T.itemOnly(it) === date)) })).filter((r) => r.its.length);
    if (loose.length) rows.push(`<tr class="loose"><td><span class="room none">sem sala definida</span></td><td>${loose.map((r) => `<div>${dot(r.s)}<b>${esc(r.s.short)}</b> · ${r.its.map((it) => esc(T.itemText(it)) + onlyBadge(it)).join('; ')}</div>`).join('')}</td></tr>`);
    return `<table class="t3"><thead><tr><th>Sala</th><th>Serviço · atendimentos</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function daySections() {
    return days.map((d) => {
      const sd = T.serviceDayOf(d);
      const venues = VENUE_ORDER.filter((v) => all.some((x) => x.date === d && x.venue === v) || (sd && sd.venue === v));
      const n = all.filter((x) => x.date === d).length;
      const blocks = venues.map((v) => {
        const list = all.filter((x) => x.date === d && x.venue === v); const isSvc = sd && sd.venue === v;
        return `<section class="venue"><h3>${I('pin')}${esc(D.venues[v].name)}${isSvc ? `<span class="svcday">serviços gratuitos</span>` : ''}<span class="muted tiny">${list.length ? `${list.length} aula${list.length > 1 ? 's' : ''}` : ''}</span></h3>
          ${list.length ? sessionsTable(list) : ''}
          ${isSvc ? `<h4>Serviços gratuitos · sala a sala${D.maps[v] ? ` <span class="muted">(números da planta, seção "Plantas")</span>` : ''}</h4>${servicesTable(v, d)}` : ''}</section>`;
      }).join('');
      return `<section class="day" id="d${d.slice(8)}"><h2>${I('calendar')}${esc(cap(T.fmtDate(d)))}<span class="h2sub">${n} aula${n === 1 ? '' : 's'}${sd ? ` · serviços gratuitos no ${esc(sd.place)}` : ''}</span></h2>${blocks}</section>`;
    }).join('');
  }

  // ---- Plantas: mapa + legenda sala a sala ----
  function plans() {
    return Object.values(D.maps).map((m) => {
      const sd = svcDay(m.venue);
      const rows = roomsOf(m.venue).sort(roomSort).map((p) => {
        const svcs = servicesAt(p);
        const uses = all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });
        const byCourse = {}; for (const x of uses) (byCourse[x.course.id] = byCourse[x.course.id] || { c: x.course, when: [] }).when.push(`${T.fmtDate(x.date, 'wd')} ${T.fmtTime(x.time)}`);
        return `<tr data-place="${p.id}"><td>${chip(p)}<span class="prog">${esc(p.name)}</span></td><td>${svcs.map((s) => `<div>${dot(s)}${esc(s.short)}</div>`).join('') || '<span class="muted">—</span>'}</td><td>${Object.values(byCourse).map((u) => `<div><b>${esc(T.title(u.c, true))}</b> <span class="muted">${u.when.join(', ')}</span></div>`).join('') || '<span class="muted">—</span>'}</td></tr>`;
      }).join('');
      const used = D.services.filter((s) => roomsOf(m.venue).some((p) => servicesAt(p).includes(s)));
      const dePara = Object.entries(ROOMS[m.venue] || {}).map(([k, id]) => { const p = T.placeInfo(id); return `<span>${esc(k)} → <b>${p ? esc(M.placeLabel(p)) : esc(id)}</b></span>`; }).join('');
      return `<section class="plan" data-venue="${m.venue}"><h3>${I('map')}${esc(m.title)}</h3>
        <div class="plan-grid"><div class="plan-map"><div id="plan-${m.venue}" class="tcemap"></div>
          <div class="map-legend">${used.map((s) => `<span>${dot(s)}${esc(s.short)}</span>`).join('')}<span><i class="dot" style="--c:#0b1b3d"></i>só cursos / sem serviço</span></div>
          ${dePara ? `<p class="tiny muted"><b>Salas dos cursos (programação → planta):</b> ${dePara}</p>` : ''}</div>
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

  // ---- Índice A–Z dos cursos ----
  function indexAZ() {
    const cs = [...D.courses].sort((a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'));
    return `<div class="az">${cs.map((c) => `<p><b>${esc(c.title)}</b> <span class="muted">· ESCON ${c.id} · ${c.seats} vagas · ${c.hours}h</span><br>${all.filter((x) => x.course === c).map((x) => { const pl = T.courseRoomPlace(x); return `${esc(T.fmtDate(x.date, 'wd'))} ${T.fmtTime(x.time)} ${esc(D.venues[x.venue].short)}${pl ? ` ${chip(pl, 'sm')}` : x.room ? ` <span class="muted">${esc(x.room)}</span>` : ''}`; }).join(' · ')}</p>`).join('')}</div>`;
  }

  const pend = [
    'Curso 109 (Brinquedistas): a tabela oficial traz link administrativo; o site usa escon/cursos/109.',
    'Laboratório I – Joaquim Nabuco (Sala 01), 05/11 às 14h: dois cursos no mesmo horário e sala (125 Tecnologia e Direito das Mulheres × 145 Videomaker).',
    'Formação de Cuidador, 03/11 de manhã: a tabela diz só "Manga", sem sala.',
    'Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).',
    'Extensão de Cílios (127): cabeçalho diz 05 e 06/11, tabela lista 04, 05 e 06/11 (mantidos os três).',
    'Gestão Financeira nas Escolas (112): na Escola Jorge Iaparrá (Manga), sem sala definida; cabeçalho diz 1 ocorrência, tabela lista 8h e 14h.',
    'Serviços sem sala na planta: TRE (título de eleitor), AMPREV, CGE, cinema do SESC, Marinha (informada na quadra).',
    'Salas 08, 09, 11, 13, 20 e 24 da Joaquim Nabuco são salas de curso de 03 a 06/11 e viram atendimentos de serviço em 07/11.',
  ];

  const nMapped = all.filter((x) => T.courseRoomPlace(x)).length;
  root.innerHTML = `
    <header class="rs-head"><img src="img/tce-logo.png" alt="TCE/AP"><div class="t"><h1>${esc(D.event.name)} · ${esc(D.event.edition)} — resumo da organização</h1><small>${esc(D.event.place)} · ${esc(D.event.datesLabel)} · ${D.courses.length} cursos, ${all.length} aulas (${nMapped} com sala na planta) · ${D.services.length} blocos de serviços em ${esc(T.serviceDaysLabel('wdm'))} · gerado em ${new Date().toLocaleDateString('pt-BR')}</small></div>
      <div class="rs-tools"><button onclick="window.print()">${I('download')}Imprimir / PDF</button><a href="index.html">${I('phone')}App</a><a href="totem.html?local=jn&descanso=0">${I('map')}Totem</a></div></header>
    <nav class="rs-toc">${days.map((d) => `<a href="#d${d.slice(8)}">${esc(T.fmtDate(d, 'wdm'))}</a>`).join('')}<a href="#plantas">Plantas</a><a href="#az">Cursos A–Z</a><a href="#pend">Pendências</a></nav>
    <section class="ovsec"><h2>${I('calendar')}Visão geral</h2>${overview()}
      <p class="lead">Nas tabelas, o número escuro (ex.: <span class="room">Sala 08</span>) é a sala na planta de ambientação; ao lado, em cinza, o nome usado na programação da Escola de Contas. Cursos: inscrição pelo site da ESCON. Serviços: sem inscrição, por ordem de chegada; "só sáb 07/11" = acontece apenas na Joaquim Nabuco. Cores dos serviços: ${D.services.map((s) => `<span class="nowrap">${dot(s)}${esc(s.short)}</span>`).join(' ')}.</p></section>
    ${daySections()}
    <section class="plansec" id="plantas"><h2>${I('map')}Plantas</h2><p class="lead">Cor do ponto = bloco de serviço que atende na sala no dia de serviços. Na tela, passe o mouse na lista para destacar a sala; toque no ponto para ir à linha.</p>${plans()}</section>
    <section id="az"><h2>${I('graduation')}Cursos A–Z</h2>${indexAZ()}</section>
    <section id="pend"><h2>${I('info')}Pendências</h2><ul class="pend">${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="tiny muted">Fontes: "Tabela com links COM AJUSTES FINAIS LEON.pdf" (29/10), "SERVICOS ATUALIZADOS.docx" (30/10), "Relação de parceiros da IX edição", "Planta de ambientação" (arq. Niucéia Fêrnandes). Código e dados: github.com/rodrigossb/tce_comunidade.</p></section>`;
  paintPlans();
})();
