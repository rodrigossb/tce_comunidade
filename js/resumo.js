/* Resumo da organização: programação de cursos por dia (com sala da programação e número na planta),
   serviços por bloco com salas em cada local, uso de cada sala da planta e pendências. Só leitura. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc; const M = window.TCEMap;
  const root = document.getElementById('resumo');
  const ROOMS = window.TCE_COURSE_ROOMS || {};
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const roomChip = (p, extra) => (p ? `<span class="room ${p.kind}">${I(p.kind === 'tenda' ? 'tent' : 'door')}${esc(M.placeLabel(p))}${extra ? ` · ${esc(extra)}` : ''}</span>` : `<span class="room none">${I('door')}sem planta</span>`);
  const all = T.allSessions();
  const days = T.eventDays();
  const svcDay = (venue) => T.serviceDays().find((d) => d.venue === venue);

  // ---- 1. Cursos por dia ----
  function coursesByDay() {
    let h = '';
    for (const d of days) {
      const list = all.filter((x) => x.date === d); const sd = T.serviceDayOf(d);
      h += `<tr class="day"><td colspan="7">${esc(cap(T.fmtDate(d)))}${sd ? ` · dia de serviços gratuitos no ${esc(sd.place)}` : ''} · ${list.length} aula${list.length === 1 ? '' : 's'}</td></tr>`;
      for (const k of T.SHIFT_ORDER) {
        const l = list.filter((x) => x.shift === k); if (!l.length) continue;
        h += `<tr class="shift"><td colspan="7">${esc(T.SHIFTS[k].label)} · ${T.fmtTime(T.SHIFTS[k].start)} às ${T.fmtTime(T.SHIFTS[k].end)}</td></tr>`;
        for (const x of l) { const pl = T.courseRoomPlace(x); h += `<tr><td class="num">${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}</td><td><b>${esc(T.title(x.course))}</b>${x.label ? ` <span class="muted">· ${esc(x.label)}</span>` : ''}<br><span class="tiny muted">Para: ${esc(x.course.audience)}</span></td><td>${esc(D.venues[x.venue].short)}</td><td>${esc(x.room || '—')}</td><td>${roomChip(pl)}</td><td class="num">${x.course.seats}</td><td class="num">${x.course.hours}h</td></tr>`; }
      }
    }
    return `<table><thead><tr><th>Horário</th><th>Curso</th><th>Local</th><th>Sala (programação)</th><th>Sala na planta</th><th>Vagas</th><th>CH</th></tr></thead><tbody>${h}</tbody></table>`;
  }

  // ---- 2. Cursos (lista A–Z, com todas as aulas) ----
  function coursesAZ() {
    const cs = [...D.courses].sort((a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'));
    return `<table><thead><tr><th>Curso</th><th>Público</th><th>Aulas (dia · hora · local · sala = planta)</th><th>Vagas</th><th>CH</th><th>Inscrição</th></tr></thead><tbody>${cs.map((c) => `<tr><td><b>${esc(c.title)}</b><br><span class="tiny muted">nº ${c.id} · ${c.tags.map((t) => esc(D.tags[t])).join(', ')}</span></td><td class="tiny">${esc(c.audience)}</td><td>${all.filter((x) => x.course === c).map((x) => { const pl = T.courseRoomPlace(x); return `<div>${esc(T.fmtDate(x.date, 'wd'))} ${T.fmtTime(x.time)} · ${esc(D.venues[x.venue].short)}${x.room ? ` · ${esc(x.room)} = ` : ' '}${pl ? esc(M.placeLabel(pl)) : (x.room ? '?' : '')}${x.label ? ` (${esc(x.label)})` : ''}</div>`; }).join('')}</td><td class="num">${c.seats}</td><td class="num">${c.hours}h</td><td class="tiny"><a href="${esc(c.link)}" target="_blank" rel="noopener">ESCON ${c.id}</a></td></tr>`).join('')}</tbody></table>`;
  }

  // ---- 3. Serviços por bloco ----
  function services() {
    return D.services.map((s) => `<div class="svc" style="--c:${s.color}"><h3><i>${I(s.icon)}</i>${s.num ? `${s.num}. ` : ''}${esc(s.title)}</h3><p class="tiny muted">${esc(s.summary)}</p>
      ${['manga', 'jn'].map((v) => { const ids = T.placesOf(s, v); const sd = svcDay(v); return `<div class="rooms"><b class="tiny">${esc(T.fmtDate(sd.date, 'wd'))} · ${esc(sd.place)}:</b>${ids.length ? ids.map((id) => roomChip(T.placeInfo(id), T.placeInfo(id) ? T.placeInfo(id).name : '')).join('') : '<span class="room none">sem sala definida</span>'}</div>`; }).join('')}
      <ul>${s.items.map((it) => { const only = T.itemOnly(it); const w = ['manga', 'jn'].map((v) => T.itemWhere(it, v).map((id) => T.placeInfo(id)).filter(Boolean)).flat(); return `<li>${esc(T.itemText(it))}${w.length ? ' ' + w.map((p) => roomChip(p)).join(' ') : ''}${only ? `<span class="only">só ${esc(T.fmtDate(only, 'wdm'))} · Joaquim Nabuco</span>` : ''}</li>`; }).join('')}</ul>
      ${s.detail ? `<p class="tiny muted">${esc(s.detail)}</p>` : ''}
      <p class="partners"><b>Quem atende:</b> ${s.partners.map(esc).join(' · ')}</p></div>`).join('');
  }

  // ---- 4. Salas da planta e o que acontece em cada uma ----
  function plans() {
    return Object.values(D.maps).map((m) => {
      const sd = svcDay(m.venue);
      const rows = m.places.filter((p) => !p.hide).map((p) => {
        const svcs = D.services.filter((s) => T.placesOf(s, m.venue).includes(p.id)).map((s) => s.short);
        const courseUses = all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });
        const byCourse = {}; for (const x of courseUses) (byCourse[x.course.id] = byCourse[x.course.id] || { c: x.course, room: x.room, when: [] }).when.push(`${T.fmtDate(x.date, 'wd')} ${T.fmtTime(x.time)}`);
        return `<div>${roomChip(p)}<div><b>${esc(p.name)}</b>${svcs.length ? `<small>${esc(T.fmtDate(sd.date, 'wd'))} (serviços): ${svcs.map(esc).join(', ')}</small>` : ''}${Object.values(byCourse).map((u) => `<small>Cursos (${esc(u.room)}): ${esc(T.title(u.c, true))} · ${u.when.join(', ')}</small>`).join('')}${!svcs.length && !courseUses.length ? '<small class="muted">sem uso cadastrado</small>' : ''}</div></div>`;
      }).join('');
      const dePara = Object.entries(ROOMS[m.venue] || {}).map(([k, id]) => { const p = T.placeInfo(id); return `<div><span class="room">${esc(k)}</span><div><b>= ${p ? esc(M.placeLabel(p)) : esc(id)}</b></div></div>`; }).join('');
      return `<h3>${I('map')}${esc(m.title)} · serviços em ${esc(T.fmtDate(sd.date, 'wdlong'))}</h3>
        <div class="plan"><div><div id="plan-${m.venue}" class="tcemap"></div><p class="tiny muted">Acessos: ${m.entrances.map((e) => esc(e.label)).join(' · ')}.</p><h4 class="tiny" style="margin:.8rem 0 .3rem">DE → PARA das salas dos cursos</h4><div class="legend-grid">${dePara || '<span class="muted tiny">sem cursos com sala neste local</span>'}</div></div>
        <div class="legend-grid">${rows}</div></div>`;
    }).join('');
  }

  // ---- 5. Pendências / observações ----
  const pend = [
    'Curso 109 (Brinquedistas): a tabela oficial traz link administrativo; o site usa escon/cursos/109.',
    'Laboratório I – Joaquim Nabuco, 05/11 às 14h: dois cursos no mesmo horário e sala (125 Tecnologia e Direito das Mulheres × 145 Videomaker).',
    'Formação de Cuidador, 03/11 de manhã: a tabela diz só "Manga", sem sala.',
    'Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).',
    'Extensão de Cílios (127): cabeçalho diz 05 e 06/11, tabela lista 04, 05 e 06/11 (mantidos os três).',
    'Gestão Financeira nas Escolas (112): na Escola Jorge Iaparrá (Manga), sem sala definida; cabeçalho diz 1 ocorrência, tabela lista 8h e 14h.',
    'Serviços sem sala na planta: TRE (título de eleitor), AMPREV, CGE, cinema do SESC, Marinha (informada na quadra).',
    'Salas 08, 09, 11, 13, 20 e 24 da Joaquim Nabuco são salas de curso de 03 a 06/11 e viram atendimentos de serviço em 07/11.',
  ];

  const nCourses = D.courses.length; const nSess = all.length; const nMapped = all.filter((x) => T.courseRoomPlace(x)).length;
  const nItems = D.services.reduce((n, s) => n + s.items.length, 0);
  root.innerHTML = `
    <header class="rs-head"><img src="img/tce-logo.png" alt="TCE/AP"><div class="t"><h1>${esc(D.event.name)} · ${esc(D.event.edition)}<br><span class="muted" style="font-weight:600;font-size:.8em">Resumo da organização: cursos, serviços e salas</span></h1><small>${esc(D.event.place)} · ${esc(D.event.datesLabel)} · gerado em ${new Date().toLocaleString('pt-BR')} a partir dos dados publicados no site</small></div>
      <div class="rs-tools"><button onclick="window.print()">${I('download')}Imprimir / PDF</button><a href="index.html">${I('phone')}App</a><a href="totem.html?local=jn&descanso=0">${I('map')}Totem</a><a href="atendimento.html">${I('ticket')}Atendimento</a></div></header>
    <nav class="rs-toc"><a href="#s1">1. Cursos por dia</a><a href="#s2">2. Cursos A–Z</a><a href="#s3">3. Serviços e salas</a><a href="#s4">4. Plantas e uso das salas</a><a href="#s5">5. Pendências</a></nav>
    <div class="rs-kpis"><div><b>${nCourses}</b><span>cursos</span></div><div><b>${nSess}</b><span>aulas (${nMapped} com sala na planta)</span></div><div><b>${D.services.length}</b><span>blocos de serviços</span></div><div><b>${nItems}</b><span>atendimentos listados</span></div><div><b>${Object.keys(D.venues).length}</b><span>locais</span></div><div><b>2</b><span>dias de serviços: ${esc(T.serviceDaysLabel('wd'))}</span></div></div>
    <h2 id="s1">${I('calendar')}1. Programação de cursos por dia</h2><p class="tiny muted">"Sala (programação)" é como está na tabela da Escola de Contas; "Sala na planta" é o número da planta de ambientação (DE → PARA validado em 31/10). Cursos gratuitos, inscrição pelo site da ESCON.</p>${coursesByDay()}
    <h2 id="s2">${I('graduation')}2. Cursos em ordem alfabética</h2>${coursesAZ()}
    <h2 id="s3">${I('handshake')}3. Serviços gratuitos e salas</h2><p class="tiny muted">Sem inscrição, por ordem de chegada. ${esc(T.serviceDaysLabel())}. Itens com o selo "só sáb 07/11" acontecem apenas na Joaquim Nabuco.</p>${services()}
    <h2 id="s4">${I('map')}4. Plantas e uso de cada sala</h2>${plans()}
    <h2 id="s5">${I('info')}5. Pendências e observações</h2><ul class="pend">${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <p class="tiny muted" style="margin-top:2rem">Fontes: "Tabela com links COM AJUSTES FINAIS LEON.pdf" (29/10), "SERVICOS ATUALIZADOS.docx" (30/10), "Relação de parceiros da IX edição", "Planta de ambientação" (arq. Niucéia Fêrnandes). Código e dados: github.com/rodrigossb/tce_comunidade.</p>`;
  for (const m of Object.values(D.maps)) M.render(document.getElementById(`plan-${m.venue}`), m.venue, { showAll: true, scale: 1.1 });
})();
