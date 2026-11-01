/* Resumo da organização: cursos por dia (com sala da programação e número na planta), cursos A–Z,
   serviços por bloco com a sala de cada atendimento, plantas com legenda por sala e pendências. Só leitura. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc; const M = window.TCEMap;
  const root = document.getElementById('resumo');
  const ROOMS = window.TCE_COURSE_ROOMS || {};
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const all = T.allSessions();
  const days = T.eventDays();
  const svcDay = (venue) => T.serviceDays().find((d) => d.venue === venue);
  const VENUES = ['manga', 'jn'];

  const chip = (p, cls) => (p ? `<span class="room ${p.kind} ${cls || ''}">${esc(M.placeLabel(p))}</span>` : `<span class="room none">sem planta</span>`);
  const dot = (s) => `<i class="dot" style="--c:${s.color}"></i>`;
  // Serviços que atendem em uma sala (respeita a sala reservada a um bloco, ex.: quadra = Feiras).
  const servicesAt = (p) => D.services.filter((s) => (!p.svc || p.svc === s.id) && T.placesOf(s, p.venue).includes(p.id));
  const itemsAt = (s, p) => s.items.filter((it) => T.itemWhere(it, p.venue).includes(p.id));

  // ---- 1. Cursos por dia ----
  function coursesByDay() {
    let h = '';
    for (const d of days) {
      const list = all.filter((x) => x.date === d); const sd = T.serviceDayOf(d);
      h += `<tr class="day"><td colspan="4">${esc(cap(T.fmtDate(d)))} · ${list.length} aula${list.length === 1 ? '' : 's'}${sd ? ` · <span class="svcday">serviços gratuitos no ${esc(sd.place)}</span>` : ''}</td></tr>`;
      for (const k of T.SHIFT_ORDER) {
        const l = list.filter((x) => x.shift === k); if (!l.length) continue;
        h += `<tr class="shift"><td colspan="4">${esc(T.SHIFTS[k].label)}</td></tr>`;
        for (const x of l) {
          const pl = T.courseRoomPlace(x);
          h += `<tr><td class="num">${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}</td><td><b>${esc(T.title(x.course))}</b>${x.label ? ` <span class="muted">· ${esc(x.label)}</span>` : ''}<div class="tiny muted">${esc(x.course.audience)}</div></td><td>${esc(D.venues[x.venue].short)}<div class="where">${chip(pl)}${x.room ? `<span class="tiny muted">${esc(x.room)}</span>` : ''}</div></td><td class="num">${x.course.seats}</td></tr>`;
        }
      }
    }
    return `<table class="t1"><thead><tr><th>Horário</th><th>Curso</th><th>Local · sala</th><th>Vagas</th></tr></thead><tbody>${h}</tbody></table>`;
  }

  // ---- 2. Cursos A–Z ----
  function coursesAZ() {
    const cs = [...D.courses].sort((a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'));
    return `<table class="t2"><thead><tr><th>Curso</th><th>Aulas</th><th>Inscrição</th></tr></thead><tbody>${cs.map((c) => `<tr><td><b>${esc(c.title)}</b><div class="tiny muted">${esc(c.audience)} · ${c.seats} vagas · ${c.hours}h</div></td><td>${all.filter((x) => x.course === c).map((x) => { const pl = T.courseRoomPlace(x); return `<div class="sess">${esc(T.fmtDate(x.date, 'wd'))} ${T.fmtTime(x.time)} · ${esc(D.venues[x.venue].short)} ${chip(pl, 'sm')}${x.room && !pl ? `<span class="tiny muted">${esc(x.room)}</span>` : ''}${x.label ? ` <span class="tiny muted">(${esc(x.label)})</span>` : ''}</div>`; }).join('')}</td><td class="tiny"><a href="${esc(c.link)}" target="_blank" rel="noopener">ESCON ${c.id}</a></td></tr>`).join('')}</tbody></table>`;
  }

  // ---- 3. Serviços: por bloco, a sala de cada atendimento em cada local ----
  function services() {
    return D.services.map((s) => {
      const cols = VENUES.map((v) => {
        const sd = svcDay(v);
        const ids = T.placesOf(s, v).map((id) => T.placeInfo(id)).filter(Boolean);
        const placed = new Set();
        const rows = ids.map((p) => { const its = itemsAt(s, p); its.forEach((it) => placed.add(it)); return `<tr><td>${chip(p)}<div class="tiny muted">${esc(p.name)}</div></td><td>${its.length ? its.map((it) => `<div>${esc(T.itemText(it))}${onlyBadge(it)}</div>`).join('') : '<span class="tiny muted">todos os atendimentos do bloco</span>'}</td></tr>`; });
        const loose = s.items.filter((it) => !placed.has(it) && (!T.itemOnly(it) || T.itemOnly(it) === sd.date));
        if (loose.length) rows.push(`<tr><td>${ids.length ? '<span class="room none">nas salas acima</span>' : '<span class="room none">sem sala definida</span>'}</td><td>${loose.map((it) => `<div>${esc(T.itemText(it))}${onlyBadge(it)}</div>`).join('')}</td></tr>`);
        return `<div class="svc-venue"><h4>${esc(cap(T.fmtDate(sd.date, 'wdm')))} · ${esc(sd.place)}</h4><table><tbody>${rows.join('')}</tbody></table></div>`;
      }).join('');
      return `<section class="svc" style="--c:${s.color}"><h3><i>${I(s.icon)}</i>${s.num ? `${s.num}. ` : ''}${esc(s.title)}</h3><div class="svc-cols">${cols}</div><p class="partners"><b>Quem atende:</b> ${s.partners.map(esc).join(' · ')}</p></section>`;
    }).join('');
  }
  const onlyBadge = (it) => (T.itemOnly(it) ? `<span class="only">só ${esc(T.fmtDate(T.itemOnly(it), 'wdm'))}</span>` : '');

  // ---- 4. Plantas: mapa + legenda sala a sala ----
  function plans() {
    return Object.values(D.maps).map((m) => {
      const sd = svcDay(m.venue);
      const used = D.services.filter((s) => m.places.some((p) => !p.hide && servicesAt(Object.assign({ venue: m.venue }, p)).includes(s)));
      const rows = m.places.filter((p) => !p.hide).map((p0) => {
        const p = Object.assign({ venue: m.venue }, p0);
        const svcs = servicesAt(p);
        const uses = all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });
        const byCourse = {}; for (const x of uses) (byCourse[x.course.id] = byCourse[x.course.id] || { c: x.course, room: x.room, when: [] }).when.push(`${T.fmtDate(x.date, 'wd')} ${T.fmtTime(x.time)}`);
        const svcCell = svcs.map((s) => { const its = itemsAt(s, p).map(T.itemText); return `<div>${dot(s)}<b>${esc(s.short)}</b>${its.length ? `<span class="tiny muted"> · ${esc(its.join('; '))}</span>` : ''}</div>`; }).join('');
        const crsCell = Object.values(byCourse).map((u) => `<div><b>${esc(T.title(u.c, true))}</b><span class="tiny muted"> · ${esc(u.room)} · ${u.when.join(', ')}</span></div>`).join('');
        return `<tr data-place="${p.id}" style="--c:${svcs[0] ? svcs[0].color : ''}"><td>${chip(p)}<div class="tiny muted">${esc(p.name)}</div></td><td>${svcCell || '<span class="tiny muted">—</span>'}</td><td>${crsCell || '<span class="tiny muted">—</span>'}</td></tr>`;
      }).join('');
      const dePara = Object.entries(ROOMS[m.venue] || {}).map(([k, id]) => { const p = T.placeInfo(id); return `<span>${esc(k)} → <b>${p ? esc(M.placeLabel(p)) : esc(id)}</b></span>`; }).join('');
      return `<section class="plan" data-venue="${m.venue}"><h3>${I('map')}${esc(m.title)}</h3>
        <div class="plan-grid"><div class="plan-map"><div id="plan-${m.venue}" class="tcemap"></div>
          <div class="map-legend">${used.map((s) => `<span>${dot(s)}${esc(s.short)}</span>`).join('')}<span><i class="dot" style="--c:#0b1b3d"></i>só cursos / sem serviço</span></div>
          ${dePara ? `<p class="tiny muted"><b>Salas dos cursos (programação → planta):</b> ${dePara}</p>` : ''}</div>
          <table class="t4"><thead><tr><th>Sala</th><th>Serviços · ${esc(T.fmtDate(sd.date, 'wdm'))}</th><th>Cursos · demais dias</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }).join('');
  }
  // Pinta cada marcador com a cor do bloco de serviço que atende ali; passar o mouse na linha destaca a sala.
  function paintPlans() {
    for (const m of Object.values(D.maps)) {
      const el = document.getElementById(`plan-${m.venue}`);
      M.render(el, m.venue, { showAll: true, scale: 1.25 });
      el.querySelectorAll('.mk[data-place]').forEach((g) => {
        const p = T.placeInfo(g.dataset.place); const s = p && servicesAt(p)[0];
        if (s) { g.classList.add('svcmk'); g.style.setProperty('--c', s.color); }
      });
      const sec = el.closest('.plan');
      sec.querySelectorAll('tr[data-place]').forEach((tr) => {
        const g = el.querySelector(`.mk[data-place="${tr.dataset.place}"]`); if (!g) return;
        tr.addEventListener('mouseenter', () => g.classList.add('hot')); tr.addEventListener('mouseleave', () => g.classList.remove('hot'));
        g.addEventListener('click', () => { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600); });
      });
    }
  }

  // ---- 5. Pendências ----
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
      <div class="rs-tools"><button onclick="window.print()">${I('download')}Imprimir / PDF</button><a href="index.html">${I('phone')}App</a><a href="totem.html?local=jn&descanso=0">${I('map')}Totem</a><a href="atendimento.html">${I('ticket')}Atendimento</a></div></header>
    <nav class="rs-toc"><a href="#s1">1. Cursos por dia</a><a href="#s2">2. Cursos A–Z</a><a href="#s3">3. Serviços e salas</a><a href="#s4">4. Plantas</a><a href="#s5">5. Pendências</a></nav>
    <h2 id="s1">${I('calendar')}1. Cursos por dia</h2><p class="lead">Número escuro = sala na planta; em cinza, o nome da sala na tabela da Escola de Contas. Inscrição pelo site da ESCON.</p>${coursesByDay()}
    <h2 id="s2">${I('graduation')}2. Cursos A–Z</h2>${coursesAZ()}
    <h2 id="s3">${I('handshake')}3. Serviços e salas</h2><p class="lead">Sem inscrição, por ordem de chegada. Para cada bloco, a sala de cada atendimento em cada local. "Só sáb 07/11" = acontece apenas na Joaquim Nabuco.</p>${services()}
    <h2 id="s4">${I('map')}4. Plantas</h2><p class="lead">Cor do ponto = bloco de serviço que atende na sala no dia de serviços. Passe o mouse na lista para destacar a sala; toque no ponto para ir à linha.</p>${plans()}
    <h2 id="s5">${I('info')}5. Pendências</h2><ul class="pend">${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="tiny muted" style="margin-top:2rem">Fontes: "Tabela com links COM AJUSTES FINAIS LEON.pdf" (29/10), "SERVICOS ATUALIZADOS.docx" (30/10), "Relação de parceiros da IX edição", "Planta de ambientação" (arq. Niucéia Fêrnandes). Código e dados: github.com/rodrigossb/tce_comunidade.</p>`;
  paintPlans();
})();
