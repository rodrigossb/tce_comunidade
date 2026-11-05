'use client';
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import { TCE_COURSE_ROOMS as ROOMS } from '@tce/core/salas-cursos';
import Icon from '@/components/Icon';
import PlanMap from '@/components/PlanMap';
import SyncInscritos from './SyncInscritos';

const D = T.D;
const MemoMap = memo(PlanMap);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const VENUE_ORDER = ['jn', 'manga', 'sebrae', 'auditorio', 'camara', 'ifap', 'iaparra'];
const svcDay = (venue) => T.serviceDays().find((d) => d.venue === venue);
const at = (sd, long) => `${sd.venue === 'jn' ? 'na' : 'no'} ${(long && sd.placeLong) || sd.place}`; // "na Escola…" / "no Distrito…"
const servicesAt = (p) => D.services.filter((s) => (!p.svc || p.svc === s.id) && T.placesOf(s, p.venue).includes(p.id));
const itemsAt = (s, p) => s.items.filter((it) => T.itemWhere(it, p.venue).includes(p.id));
const roomsOf = (venue) => (D.maps[venue] ? D.maps[venue].places.filter((p) => !p.hide).map((p) => Object.assign({ venue }, p)) : []);
const roomSort = (a, b) => (Number(a.num) || 999) - (Number(b.num) || 999) || String(a.num).localeCompare(String(b.num));
const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;

const Chip = ({ p, cls }) => (p ? <span className={`room ${p.kind} ${cls || ''}`}>{M.placeLabel(p)}</span> : null);
const Dot = ({ s }) => <i className="dot" style={{ '--c': s.color }} />;
const OnlyBadge = ({ it }) => (T.itemOnly(it) ? <span className="only">só {T.fmtDate(T.itemOnly(it), 'wdm')}</span> : T.itemWhenLabel(it) ? <span className="only">{T.itemWhenLabel(it)}</span> : null);
const H2 = ({ num, text, sub }) => <h2><span className="n">{num}.</span> {text}{sub ? <span className="h2sub">{sub}</span> : null}</h2>;
/** Lista "a; b; c" de itens com selo "só dia" (equivalente ao join('; ') do site antigo). */
const ItemList = ({ its }) => its.map((it, i) => <Fragment key={i}>{i ? '; ' : ''}{T.itemText(it)}<OnlyBadge it={it} /></Fragment>);

// ---- Capa + sumário ----
function Cover({ all, days, today }) {
  const nMapped = all.filter((x) => T.courseRoomPlace(x)).length;
  const venuesUsed = VENUE_ORDER.filter((v) => all.some((x) => x.venue === v) || svcDay(v));
  return (
    <section className="cover">
      <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
      <p className="kicker">Resumo da organização</p>
      <h1>{D.event.name}<br /><span>{D.event.edition}</span></h1>
      <p className="sub">{D.event.place} · {D.event.datesLabel}</p>
      <p className="facts">{D.courses.length} cursos gratuitos · {all.length} aulas ({nMapped} com sala na planta) · {D.services.length} blocos de serviços gratuitos em {T.serviceDaysLabel('wdm')} · {venuesUsed.length} locais</p>
      <nav className="toc"><h3>Sumário</h3><ol>
        <li><a href="#s1"><span>1</span>Visão geral — dias × locais e blocos de serviços</a></li>
        <li><a href="#s2"><span>2</span>Programação por dia e local</a><ol>{days.map((d, i) => { const sd = T.serviceDayOf(d); return <li key={d}><a href={`#d${d.slice(8)}`}><span>2.{i + 1}</span>{cap(T.fmtDate(d))}{sd ? <> <em>· serviços gratuitos {at(sd)}</em></> : null}</a></li>; })}</ol></li>
        <li><a href="#s3"><span>3</span>Plantas e uso de cada sala</a></li>
        <li><a href="#s4"><span>4</span>Cursos de A a Z</a></li>
        <li><a href="#s5"><span>5</span>Pendências e fontes</a></li></ol></nav>
      <div className="legend-note"><h3>Como ler este documento</h3><ul>
        <li><span className="room">Sala 08</span> é o número da sala na planta de ambientação. Ao lado, em cinza, o nome usado na programação da Escola de Contas (ex.: Sala I).</li>
        <li><span className="room tenda">Tenda 07</span> e <span className="room area">Ambiente 16</span> são tendas e espaços abertos da planta.</li>
        <li>Cursos: inscrição pelo site da ESCON. Serviços: sem inscrição, por ordem de chegada.</li>
        <li><span className="only">só sáb 07/11</span> marca atendimentos que acontecem apenas na Escola Joaquim Nabuco.</li></ul></div>
      <p className="version">Versão gerada em {today} a partir dos dados publicados no site · www.tce.ap.gov.br/tce-na-comunidade</p>
    </section>
  );
}

// ---- 1. Visão geral ----
function Overview({ all, days }) {
  const vs = VENUE_ORDER.filter((v) => all.some((x) => x.venue === v) || svcDay(v));
  return (
    <section className="sec" id="s1"><H2 num={1} text="Visão geral" />
      <h3>Dias e locais</h3>
      <div className="ovwrap"><table className="ov"><thead><tr><th>Dia</th>{vs.map((v) => <th key={v}>{D.venues[v].short}</th>)}</tr></thead><tbody>
        {days.map((d) => <tr key={d}><th>{cap(T.fmtDate(d, 'wdm'))}</th>{vs.map((v) => { const n = all.filter((x) => x.date === d && x.venue === v).length; const sd = T.serviceDayOf(d); const svc = sd && sd.venue === v; return <td key={v} className={n || svc ? 'has' : ''}>{n ? plural(n, 'aula') : ''}{svc ? <span className="svcday">serviços gratuitos</span> : null}{!n && !svc ? <span className="muted">—</span> : null}</td>; })}</tr>)}
      </tbody></table></div>
      <h3>Blocos de serviços gratuitos e suas salas</h3>
      <table className="tsvc"><thead><tr><th>Bloco de serviços</th><th>{cap(T.fmtDate(svcDay('manga').date, 'wdm'))} · Manga</th><th>{cap(T.fmtDate(svcDay('jn').date, 'wdm'))} · Joaquim Nabuco</th><th>Quem atende</th></tr></thead><tbody>
        {D.services.map((s) => <tr key={s.id}><td><b><Dot s={s} />{s.num ? `${s.num}. ` : ''}{s.title}</b><span className="aud">{s.summary}</span></td>{['manga', 'jn'].map((v) => { const ids = T.placesOf(s, v).map((id) => T.placeInfo(id)).filter(Boolean).sort(roomSort); return <td key={v} className="chips">{ids.length ? ids.map((p, i) => <Fragment key={p.id}>{i ? ' ' : ''}<Chip p={p} cls="sm" /></Fragment>) : <span className="muted">sem sala definida</span>}</td>; })}<td className="aud-cell">{s.partners.join(' · ')}</td></tr>)}
      </tbody></table></section>
  );
}

// ---- 2. Programação por dia e local ----
function SessionsTable({ list }) {
  const rows = [];
  for (const k of T.SHIFT_ORDER) {
    const l = list.filter((x) => x.shift === k); if (!l.length) continue;
    rows.push(<tr key={`s-${k}`} className="shift"><td colSpan={4}>{T.SHIFTS[k].label}</td></tr>);
    for (const x of l) {
      const pl = T.courseRoomPlace(x);
      rows.push(<tr key={`${k}-${x.course.id}-${x.date}-${x.time}-${x.room}`}><td className="num">{T.fmtTime(x.time)}–{T.fmtTime(T.sessionEnd(x))}</td><td><b>{T.title(x.course)}</b>{x.label ? <> <span className="muted">· {x.label}</span></> : null}<span className="aud">{x.course.audience}</span></td><td className="sala">{pl ? <Chip p={pl} /> : <span className="room none">—</span>}{x.room && !(pl && M.placeLabel(pl) === x.room) ? <span className="prog">{x.room}</span> : null}</td><td className="num">{x.course.seats}</td></tr>);
    }
  }
  return <table className="t1"><thead><tr><th>Horário</th><th>Curso · público</th><th>Sala</th><th>Vagas</th></tr></thead><tbody>{rows}</tbody></table>;
}
function ServicesTable({ venue, date }) {
  const rows = []; const placed = new Set();
  for (const p of roomsOf(venue).sort(roomSort)) {
    const svcs = servicesAt(p); if (!svcs.length) continue;
    svcs.forEach((s, i) => {
      const its = itemsAt(s, p); its.forEach((it) => placed.add(it));
      rows.push(<tr key={`${p.id}-${s.id}`} style={{ '--c': s.color }}>{i === 0 ? <td rowSpan={svcs.length}><Chip p={p} /><span className="prog">{p.name}</span></td> : null}<td className="svcname"><b><Dot s={s} />{s.short}</b></td><td>{its.length ? <ItemList its={its} /> : <span className="muted">atendimentos do bloco</span>}</td></tr>);
    });
  }
  const loose = D.services.map((s) => ({ s, its: s.items.filter((it) => !placed.has(it) && (!T.itemOnly(it) || T.itemOnly(it) === date)) })).filter((r) => r.its.length);
  loose.forEach((r, i) => rows.push(<tr key={`loose-${r.s.id}`} className="loose" style={{ '--c': r.s.color }}>{i === 0 ? <td rowSpan={loose.length}><span className="room none">sem sala definida</span></td> : null}<td className="svcname"><b><Dot s={r.s} />{r.s.short}</b></td><td><ItemList its={r.its} /></td></tr>));
  return <table className="t3"><thead><tr><th>Sala</th><th>Bloco</th><th>Atendimentos</th></tr></thead><tbody>{rows}</tbody></table>;
}
function DaySections({ all, days }) {
  return days.map((d, i) => {
    const sd = T.serviceDayOf(d);
    // Local com serviços gratuitos (tabela longa) fica por último, para não deixar um local sozinho na página seguinte.
    const venues = VENUE_ORDER.filter((v) => all.some((x) => x.date === d && x.venue === v) || (sd && sd.venue === v)).sort((a, b) => (sd && sd.venue === a ? 1 : 0) - (sd && sd.venue === b ? 1 : 0));
    const n = all.filter((x) => x.date === d).length;
    return (
      <section key={d} className="day" id={`d${d.slice(8)}`}>
        {i === 0 ? <div className="sec" id="s2"><H2 num={2} text="Programação por dia e local" /><p className="lead">Cada dia começa em uma nova página. Em cada local: os cursos do dia por turno e, nos dias de serviços gratuitos, os atendimentos sala a sala.</p></div> : null}
        <div className="dayhead"><h2><span className="n">2.{i + 1}</span> {cap(T.fmtDate(d))}</h2><p>{plural(n, 'aula')} em {plural(venues.filter((v) => all.some((x) => x.date === d && x.venue === v)).length, 'local', 'locais')}{sd ? ` · serviços gratuitos ${at(sd, true)}` : ''}</p></div>
        {venues.map((v) => {
          const list = all.filter((x) => x.date === d && x.venue === v); const isSvc = sd && sd.venue === v; const ven = D.venues[v];
          return (
            <section key={v} className="venue"><h3>{ven.name}<small>{ven.city}{list.length ? ` · ${plural(list.length, 'aula')}` : ''}</small>{isSvc ? <span className="svcday">serviços gratuitos</span> : null}</h3>
              {list.length ? <SessionsTable list={list} /> : null}
              {isSvc ? <><h4>Serviços gratuitos · sala a sala <span className="muted">(números da planta, seção 3)</span></h4><ServicesTable venue={v} date={d} /></> : null}
            </section>
          );
        })}
      </section>
    );
  });
}

// ---- 3. Plantas ----
function Plan({ m, i, all }) {
  const sd = svcDay(m.venue);
  const mapRef = useRef(null); const secRef = useRef(null);
  const [hot, setHot] = useState(null);
  const unused = [];
  const rows = roomsOf(m.venue).sort(roomSort).map((p) => {
    const svcs = servicesAt(p);
    const uses = all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });
    if (!svcs.length && !uses.length) { unused.push(p); return null; }
    const byCourse = {}; for (const x of uses) (byCourse[x.course.id] = byCourse[x.course.id] || { c: x.course, when: [] }).when.push(T.fmtDate(x.date, 'wd'));
    return (
      <tr key={p.id} data-place={p.id} onMouseEnter={() => setHot(p.id)} onMouseLeave={() => setHot((h) => (h === p.id ? null : h))}>
        <td><Chip p={p} /><span className="prog">{p.name}</span></td>
        <td>{svcs.length ? svcs.map((s) => <div key={s.id}><Dot s={s} />{s.short}</div>) : <span className="muted">—</span>}</td>
        <td>{Object.keys(byCourse).length ? Object.values(byCourse).map((u) => <div key={u.c.id}><b>{T.title(u.c, true)}</b> <span className="muted">{[...new Set(u.when)].join(', ')}</span></div>) : <span className="muted">—</span>}</td>
      </tr>
    );
  }).filter(Boolean);
  const used = D.services.filter((s) => roomsOf(m.venue).some((p) => servicesAt(p).includes(s)));
  const dePara = Object.entries(ROOMS[m.venue] || {});
  // Cor do marcador = primeiro bloco de serviço que atende na sala (classe svcmk + --c), como no paintPlans antigo.
  useEffect(() => {
    const el = mapRef.current; if (!el) return;
    el.querySelectorAll('.mk[data-place]').forEach((g) => { const p = T.placeInfo(g.dataset.place); const s = p && servicesAt(p)[0]; if (s) { g.classList.add('svcmk'); g.style.setProperty('--c', s.color); } });
  });
  useEffect(() => {
    const el = mapRef.current; if (!el) return;
    el.querySelectorAll('.mk.hot').forEach((g) => g.classList.remove('hot'));
    if (hot) { const g = el.querySelector(`.mk[data-place="${hot}"]`); if (g) g.classList.add('hot'); }
  }, [hot]);
  const pick = (id) => {
    const tr = secRef.current && secRef.current.querySelector(`tr[data-place="${id}"]`); if (!tr) return;
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600);
  };
  return (
    <section className="plan" data-venue={m.venue} ref={secRef}>
      {i === 0 ? <div className="sec" id="s3"><H2 num={3} text="Plantas e uso de cada sala" /><p className="lead">Cor do ponto = bloco de serviço que atende na sala no dia de serviços; ponto azul-escuro = sala só de cursos ou sem uso cadastrado. Na tela, passe o mouse na lista para destacar a sala e toque no ponto para ir à linha.</p></div> : null}
      <h3>{m.title}<small>serviços em {T.fmtDate(sd.date, 'wdlong')} · acessos: {m.entrances.map((e) => e.label).join(', ')}</small></h3>
      <div className="plan-grid"><div className="plan-map"><div ref={mapRef}><MemoMap venue={m.venue} showAll scale={1.25} onPick={pick} /></div>
        <div className="map-legend">{used.map((s) => <span key={s.id}><Dot s={s} />{s.short}</span>)}<span><i className="dot" style={{ '--c': '#0b1b3d' }} />só cursos / sem serviço</span></div>
        {dePara.length ? <p className="tiny muted depara"><b>Salas dos cursos (programação → planta):</b> {dePara.map(([k, id]) => { const p = T.placeInfo(id); return <span key={k}>{k} → <b>{p ? M.placeLabel(p) : id}</b></span>; })}</p> : null}
        {unused.length ? <p className="tiny muted depara"><b>Sem uso cadastrado:</b> {unused.map((p) => `${M.placeLabel(p)} (${p.name})`).join(' · ')}</p> : null}</div>
        <table className="t4"><thead><tr><th>Sala</th><th>Serviços · {T.fmtDate(sd.date, 'wdm')}</th><th>Cursos · demais dias</th></tr></thead><tbody>{rows}</tbody></table></div>
    </section>
  );
}

// ---- 4. Cursos A–Z ----
function IndexAZ({ all }) {
  const cs = [...D.courses].sort((a, b) => T.title(a, true).localeCompare(T.title(b, true), 'pt-BR'));
  return (
    <section className="sec" id="s4"><H2 num={4} text="Cursos de A a Z" sub={`${D.courses.length} cursos · inscrição pelo site da ESCON`} />
      <table className="t2"><thead><tr><th>Curso</th><th>Público</th><th>Aulas · local · sala</th><th>Vagas</th><th>CH</th><th>ESCON</th></tr></thead><tbody>
        {cs.map((c) => <tr key={c.id}><td><b>{c.title}</b><span className="aud">{c.tags.map((t) => D.tags[t]).join(', ')}</span></td><td className="aud-cell">{c.audience}</td><td>{all.filter((x) => x.course === c).map((x, k) => { const pl = T.courseRoomPlace(x); return <div key={k} className="sess">{T.fmtDate(x.date, 'wd')} {T.fmtTime(x.time)} · {D.venues[x.venue].short}{pl ? <> <Chip p={pl} cls="sm" /></> : x.room ? <> <span className="muted">{x.room}</span></> : null}{x.label ? <> <span className="muted">({x.label})</span></> : null}</div>; })}</td><td className="num">{c.seats}</td><td className="num">{c.hours}h</td><td className="num"><a href={c.link} target="_blank" rel="noopener">{c.id}</a></td></tr>)}
      </tbody></table></section>
  );
}

// ---- 5. Pendências e fontes ----
const PEND = [
  ['Cursos', 'Curso 109 (Brinquedistas): a tabela oficial traz link administrativo; o site usa escon/cursos/109.'],
  ['Salas', 'Laboratórios I e II – Joaquim Nabuco (Salas 01 e 02), 05/11: o Rios do Saber (156, até 100 participantes) ocupa os dois laboratórios manhã e tarde (informado em 05/11). À tarde a tabela ainda traz Tecnologia e Direito das Mulheres (125, Lab I) e Videomaker (145, Lab II). Confirmar onde ficam essas turmas. O curso 152 (Controle Social e Ouvidoria, Lab I 8h) foi cancelado em 05/11.'],
  ['Salas', 'Tomada de Contas (122), 05/11: saiu da Joaquim Nabuco (Sala V); manhã na Câmara Municipal de Oiapoque (Av. Veiga Cabral, 390, pino aproximado) e tarde no IFAP – Campus Avançado Oiapoque (Rua Joaquim Caetano da Silva, 870). Informado em 05/11.'],
  ['Cursos', 'Como vender pela internet (150): 06/11 no SEBRAE; em 05/11 o horário mudou de 14h para 19h (até 22h).'],
  ['Cursos', 'Cidadania Conectada: duas turmas com links diferentes (154 em 05/11 e 158 em 07/11).'],
  ['Cursos', 'Extensão de Cílios (127): cabeçalho diz 05 e 06/11, tabela lista 04, 05 e 06/11 (mantidos os três).'],
  ['Salas', 'Gestão Financeira nas Escolas (112): na Escola Jorge Iaparrá (Manga), sem sala definida; cabeçalho diz 1 ocorrência, tabela lista 8h e 14h.'],
  ['Serviços', 'Serviços sem sala na planta: TRE (título de eleitor), AMPREV, CGE, cinema do SESC, Marinha (informada na quadra).'],
  ['Salas', 'Salas 08, 09, 11, 13, 20 e 24 da Joaquim Nabuco são salas de curso de 03 a 06/11 e viram atendimentos de serviço em 07/11.'],
];
function Pendencias() {
  return (
    <section className="sec" id="s5"><H2 num={5} text="Pendências e fontes" />
      <table className="t5"><thead><tr><th>Nº</th><th>Tema</th><th>Pendência</th></tr></thead><tbody>{PEND.map((p, i) => <tr key={i}><td className="num">{i + 1}</td><td><span className="tag">{p[0]}</span></td><td>{p[1]}</td></tr>)}</tbody></table>
      <h3>Fontes</h3><ul className="fontes"><li>"Tabela com links COM AJUSTES FINAIS LEON.pdf" (Escola de Contas, 29/10/2026) — programação dos cursos.</li><li>"SERVICOS ATUALIZADOS.docx" (30/10/2026) — blocos de serviços; itens destacados = só 07/11 na Joaquim Nabuco.</li><li>"Relação de parceiros da IX edição" — instituições por bloco.</li><li>"Planta de ambientação" (arq. Niucéia Fêrnandes) — numeração das salas, tendas e ambientes.</li><li>Código e dados: github.com/rodrigossb/tce_comunidade · site: www.tce.ap.gov.br/tce-na-comunidade</li></ul></section>
  );
}

export default function Resumo() {
  const all = useMemo(() => T.allSessions(), []);
  const days = useMemo(() => T.eventDays(), []);
  const today = useMemo(() => new Date().toLocaleDateString('pt-BR'), []);
  return (
    <>
      <div className="rs-tools"><button onClick={() => window.print()}><Icon name="download" />Imprimir / PDF</button><a href="resumo-cursos.html"><Icon name="graduation" />Cursos e inscritos</a><a href="lanches.html"><Icon name="store" />Lanches</a><a href="index.html"><Icon name="phone" />App</a><a href="totem.html?local=jn&descanso=0"><Icon name="map" />Totem</a><a href="placas.html"><Icon name="door" />Placas de porta</a><a href="mapa-eventos.html"><Icon name="compass" />Mapa dos locais</a></div>
      <SyncInscritos />
      <Cover all={all} days={days} today={today} />
      <Overview all={all} days={days} />
      <DaySections all={all} days={days} />
      {Object.values(D.maps).map((m, i) => <Plan key={m.venue} m={m} i={i} all={all} />)}
      <IndexAZ all={all} />
      <Pendencias />
    </>
  );
}
