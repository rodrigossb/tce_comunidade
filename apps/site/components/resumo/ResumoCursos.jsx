'use client';
import { useEffect, useMemo, useState } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import Icon from '@/components/Icon';
import { useMounted } from '@/lib/hooks';
import { parseAny, groupsOf, groupKey } from '@/lib/inscritos';

const D = T.D;
const PANEL = 'https://servicos.tce.ap.gov.br/escon/admin/painel/oiapoque';
const LS_DATA = 'tce_inscritos';
const LS_KEY = 'tce_painel_k';
const VENUE_ORDER = ['jn', 'manga', 'sebrae', 'auditorio', 'iaparra'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };

// ---------- página ----------
export default function ResumoCursos() {
  const mounted = useMounted();
  return <div className="rs">{mounted ? <Doc /> : <p className="rs-loading">Montando o resumo…</p>}</div>;
}

function Doc() {
  const [enr, setEnr] = useState(() => load(LS_DATA, null));
  const [key, setKey] = useState(() => T.params.get('k') || load(LS_KEY, ''));
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => T.allSessions(), []);
  const days = useMemo(() => [...new Set(all.map((x) => x.date))].sort(), [all]);
  const today = T.fmtDate(T.now().date, 'wdlong') + ' ' + T.now().time;

  const apply = (byId, source) => {
    const n = Object.keys(byId).length;
    if (!n) { setMsg('Não reconheci nenhum curso nesse conteúdo. Confira se copiou a tabela do painel inteira (nome ou código do curso e os números).'); return false; }
    const data = { byId, updatedAt: Date.now(), source }; save(LS_DATA, data); setEnr(data);
    setMsg(`${n} curso${n > 1 ? 's' : ''} com dados de inscrição (${source === 'painel' ? 'lidos do painel' : 'colados'}).`); return true;
  };
  async function fetchPanel(k) {
    const kk = String(k || '').trim(); if (!kk) { setMsg('Informe a chave do painel (o trecho depois de ?k= no endereço).'); return; }
    setBusy(true); setMsg('Lendo o painel da ESCON…');
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000); // sem resposta em 12 s: desiste e orienta a colar
      const res = await fetch(`${PANEL}?k=${encodeURIComponent(kk)}`, { cache: 'no-store', signal: ctl.signal }).finally(() => clearTimeout(timer));
      const text = await res.text();
      if (!res.ok) throw new Error(`painel respondeu ${res.status}`);
      save(LS_KEY, kk);
      if (apply(parseAny(text), 'painel')) history.replaceState(null, '', location.pathname); // tira a chave do endereço
    } catch (e) {
      const why = e.name === 'AbortError' ? 'sem resposta em 12 s' : /Failed to fetch|NetworkError|Load failed/i.test(e.message || '') ? 'bloqueado pelo navegador (CORS) ou sem acesso à rede do TCE' : e.message;
      setMsg(`Não consegui ler o painel direto daqui (${why}). Abra o painel em outra aba, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole no campo abaixo.`);
    } finally { setBusy(false); }
  }
  useEffect(() => {
    // 1º: inscritos.json publicado com o site (gerado no servidor a partir do painel); 2º: chave para ler o painel direto.
    fetch('inscritos.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((pub) => {
      if (pub && pub.byId && Object.keys(pub.byId).length) {
        setEnr((cur) => { if (cur && cur.updatedAt > pub.updatedAt) return cur; const data = { byId: pub.byId, updatedAt: pub.updatedAt, source: 'publicado', painelInfo: pub.painelInfo || '' }; save(LS_DATA, data); return data; });
      }
    }).catch(() => {});
    if (key) fetchPanel(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = (enr && enr.byId) || {};
  /** Números de um curso (todas as turmas) ou de uma turma (sess): vagas, inscritos, restantes, % e se há dado.
      Chaves por turma (curso@local@idESCON) vêm do painel; a chave só por código vem de tabelas coladas. */
  const info = (c, sess) => {
    const groups = groupsOf(c); const gs = sess ? groups.filter((g) => g.key === groupKey(c, sess)) : groups;
    const entries = gs.map((g) => byId[g.key] || null); const generic = byId[c.id];
    const out = { has: false, vagas: 0, inscritos: 0, restantes: 0, over: 0, pct: null };
    if (!entries.some(Boolean) && generic && (generic.inscritos != null || generic.restantes != null)) {
      const v = generic.vagas ?? c.seats * gs.length; const i = generic.inscritos ?? Math.max(0, v - generic.restantes);
      return { has: true, vagas: v, inscritos: i, restantes: generic.restantes ?? Math.max(0, v - i), over: Math.max(0, i - v), pct: v ? Math.round((100 * i) / v) : null };
    }
    gs.forEach((g, k) => {
      const e = entries[k]; const v = (e && e.vagas) || c.seats; out.vagas += v;
      if (e && (e.inscritos != null || e.restantes != null)) { out.has = true; const i = e.inscritos ?? Math.max(0, v - e.restantes); out.inscritos += i; out.restantes += e.restantes ?? Math.max(0, v - i); out.over += Math.max(0, i - v); }
      else out.restantes += v;
    });
    if (!out.has) return { has: false, vagas: out.vagas, inscritos: null, restantes: null, over: 0, pct: null };
    out.pct = out.vagas ? Math.round((100 * out.inscritos) / out.vagas) : null; return out;
  };
  const totals = (courses) => courses.reduce((a, c) => { const i = info(c); a.vagas += i.vagas || 0; if (i.has) { a.inscritos += i.inscritos || 0; a.restantes += i.restantes || 0; a.com++; } return a; }, { vagas: 0, inscritos: 0, restantes: 0, com: 0 });
  const tot = totals(D.courses);
  const Bar = ({ i }) => (i.pct == null ? <span className="nd">sem dado</span> : <><span className={`bar ${i.restantes <= 0 ? 'full' : i.pct < 30 ? 'low' : ''}`}><i style={{ width: `${Math.min(100, i.pct)}%` }} /></span> {i.pct}%{i.restantes <= 0 ? <span className="full-tag">{i.over ? `lotado +${i.over}` : 'lotado'}</span> : null}</>);
  const Num = ({ v }) => <td className="n">{v == null ? '—' : v}</td>;
  const room = (x) => { const p = T.courseRoomPlace(x); return <>{x.room || <span className="muted">sem sala</span>}{p ? <> <span className={`room ${p.kind} sm`}>{M.placeLabel(p)}</span></> : null}</>; };

  return (
    <>
      <div className="rs-tools"><button onClick={() => window.print()}><Icon name="download" />Imprimir / PDF</button><a href="resumo.html"><Icon name="list" />Resumo geral</a><a href="index.html"><Icon name="phone" />App</a></div>
      <section className="cover">
        <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
        <p className="kicker">Resumo de cursos e inscrições</p>
        <h1>{D.event.name}<br /><span>{D.event.edition}</span></h1>
        <p className="sub">{D.event.place} · {D.event.datesLabel}</p>
        <div className="kpis">
          <div className="kpi"><small>Cursos</small><b>{D.courses.length}</b><em>{all.length} aulas</em></div>
          <div className="kpi"><small>Vagas</small><b>{tot.vagas}</b><em>soma das turmas</em></div>
          <div className="kpi"><small>Inscritos</small><b>{tot.com ? tot.inscritos : '—'}</b><em>{tot.com ? `${tot.com} de ${D.courses.length} cursos com dado` : 'sem dados do painel'}</em></div>
          <div className="kpi"><small>Vagas restantes</small><b>{tot.com ? tot.restantes : '—'}</b><em>{tot.com ? `${D.courses.filter((c) => info(c).restantes === 0).length} lotado(s)` : ''}</em></div>
          <div className="kpi"><small>Ocupação</small><b>{tot.com && tot.vagas ? `${Math.round((100 * tot.inscritos) / D.courses.filter((c) => info(c).has).reduce((n, c) => n + info(c).vagas, 0))}%` : '—'}</b><em>inscritos ÷ vagas (cursos com dado)</em></div>
          <div className="kpi"><small>Painel ESCON</small><b style={{ fontSize: '1rem' }}>{enr ? `${T.fmtDate(T.partsOf(new Date(enr.updatedAt)).date, 'wd')} ${T.partsOf(new Date(enr.updatedAt)).time}` : 'não lido'}</b><em>{enr ? (enr.painelInfo ? `números do painel de ${enr.painelInfo}` : enr.source === 'painel' ? 'lido do painel' : enr.source === 'publicado' ? 'publicado com o site' : 'colado') : 'informe a chave abaixo'}</em></div>
        </div>
        <div className={`src ${enr ? 'ok' : 'warn'}`}>
          <Icon name={enr ? 'check' : 'info'} />
          <input type="password" placeholder="Chave do painel (?k=…)" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
          <button disabled={busy} onClick={() => fetchPanel(key)}>{busy ? 'Lendo…' : 'Atualizar do painel'}</button>
          <a className="ghost" href={`${PANEL}${key ? `?k=${encodeURIComponent(key)}` : ''}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>Abrir o painel <Icon name="external" /></a>
          {msg ? <p className="msg">{msg}</p> : <p className="msg">Os inscritos são lidos pelo seu navegador no painel administrativo da ESCON; a chave fica só neste aparelho. Se o navegador bloquear a leitura, copie o conteúdo do painel e cole abaixo.</p>}
          <details open={!enr}><summary>Colar o conteúdo do painel</summary>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Abra o painel, Ctrl+A, Ctrl+C e cole aqui (tabela, texto ou HTML)." />
            <div style={{ marginTop: '.4rem', display: 'flex', gap: '.5rem' }}><button onClick={() => { if (apply(parseAny(paste), 'colado')) setPaste(''); }}>Usar dados colados</button>{enr ? <button className="ghost" onClick={() => { localStorage.removeItem(LS_DATA); setEnr(null); setMsg('Dados de inscrição apagados deste aparelho.'); }}>Limpar</button> : null}</div>
          </details>
        </div>
        <p className="version">Versão gerada em {today} · dados dos cursos do site · inscrições do painel ESCON{enr ? ` (${T.partsOf(new Date(enr.updatedAt)).time})` : ''} · www.tce.ap.gov.br/tce-na-comunidade</p>
      </section>

      {days.map((d, di) => {
        const sess = all.filter((x) => x.date === d);
        const venues = VENUE_ORDER.filter((v) => sess.some((x) => x.venue === v));
        const dayCourses = [...new Set(sess.map((x) => x.course))];
        const dt = totals(dayCourses);
        return (
          <section className="sec day" key={d} id={`d${d.slice(8)}`}>
            <h2><span className="n">{di + 1}.</span> {cap(T.fmtDate(d))}<span className="h2sub">{dayCourses.length} cursos · {sess.length} aulas · {dt.vagas} vagas{dt.com ? ` · ${dt.inscritos} inscritos e ${dt.restantes} restantes em ${dt.com} de ${dayCourses.length} cursos com dado` : ''}</span></h2>
            {venues.map((v) => {
              const rows = sess.filter((x) => x.venue === v);
              return (
                <div className="venue" key={v}>
                  <h3>{D.venues[v].name} <small>{D.venues[v].city}</small></h3>
                  <table className="t6"><thead><tr><th className="c-hora">Hora</th><th className="c-id">Cód.</th><th>Curso</th><th className="c-local">Sala</th><th>Público</th><th className="n c-num">Vagas</th><th className="n c-num">Inscritos</th><th className="n c-num">Restam</th><th className="c-bar">Ocupação</th></tr></thead>
                    <tbody>{rows.map((x, k) => { const i = info(x.course, x); return (
                      <tr key={k}><td>{T.fmtTime(x.time)}–{T.fmtTime(T.sessionEnd(x))}</td><td className="num">{x.course.id}</td><td><b>{T.title(x.course)}</b>{x.course.sessions.length > 1 ? <span className="muted tiny"> · {x.course.sessions.length} encontros</span> : null}</td><td>{room(x)}</td><td className="aud">{x.course.audience}</td><Num v={i.vagas} /><Num v={i.inscritos} /><Num v={i.restantes} /><td><Bar i={i} /></td></tr>); })}</tbody>
                  </table>
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="sec" id="az">
        <h2><span className="n">{days.length + 1}.</span> Cursos de A a Z<span className="h2sub">{D.courses.length} cursos · {tot.vagas} vagas{tot.com ? ` · ${tot.inscritos} inscritos e ${tot.restantes} restantes em ${tot.com} cursos com dado` : ''}</span></h2>
        <table className="t6"><thead><tr><th className="c-id">Cód.</th><th>Curso</th><th>Quando</th><th className="c-local">Local</th><th className="n c-num">Vagas</th><th className="n c-num">Inscritos</th><th className="n c-num">Restam</th><th className="c-bar">Ocupação</th></tr></thead>
          <tbody>{[...D.courses].sort((a, b) => T.title(a).localeCompare(T.title(b), 'pt-BR')).map((c) => { const i = info(c); const first = c.sessions[0]; return (
            <tr key={c.id}><td className="num">{c.id}</td><td><b>{T.title(c)}</b><span className="muted tiny"> · {c.hours}h</span></td><td>{c.sessions.map((s, k) => <span key={k}>{k ? '; ' : ''}{T.fmtDate(s.date, 'wd')} {T.fmtTime(s.time)}</span>)}</td><td>{D.venues[first.venue].short}{first.room ? ` · ${first.room}` : ''}</td><Num v={i.vagas} /><Num v={i.inscritos} /><Num v={i.restantes} /><td><Bar i={i} /></td></tr>); })}</tbody>
          <tfoot><tr className="tot"><td /><td>Total</td><td /><td /><td className="n">{tot.vagas}</td><td className="n">{tot.com ? tot.inscritos : '—'}</td><td className="n">{tot.com ? tot.restantes : '—'}</td><td /></tr></tfoot>
        </table>
      </section>

      <section className="sec" id="alerta">
        <h2><span className="n">{days.length + 2}.</span> Atenção</h2>
        {!enr ? <p className="lead">Sem dados de inscrição ainda. Leia o painel (chave) ou cole o conteúdo na capa para ver cursos lotados, quase lotados e com poucas inscrições.</p> : (
          <>
            <Alerta title="Lotados" list={D.courses.filter((c) => info(c).has && info(c).restantes <= 0)} info={info} empty="Nenhum curso lotado." />
            <Alerta title="Quase lotados (até 3 vagas)" list={D.courses.filter((c) => { const i = info(c); return i.has && i.restantes > 0 && i.restantes <= 3; })} info={info} empty="Nenhum." />
            <Alerta title="Baixa procura (menos de 30% das vagas)" list={D.courses.filter((c) => { const i = info(c); return i.has && i.pct != null && i.pct < 30; })} info={info} empty="Nenhum." />
            <Alerta title="Sem dado no painel" list={D.courses.filter((c) => !info(c).has)} info={info} empty="Todos os cursos têm dado de inscrição." />
          </>
        )}
        <h3>Observações</h3>
        <ul className="tiny muted">
          <li>Vagas: número cadastrado no site do evento (ou o do painel, quando informado). Restantes: do painel ou vagas − inscritos.</li>
          <li>Cursos com mais de um encontro aparecem em cada dia com os mesmos números (é a mesma turma). Cursos com turmas em locais diferentes (Cuidador, Tecnologia e Direito das Mulheres, Videomaker, Cidadania Conectada) têm os números por turma nas tabelas por dia e somados na lista A–Z.</li>
          <li>O painel da ESCON informa só os inscritos; as vagas são as cadastradas no site (por turma). Inscritos acima das vagas aparecem como "lotado +N".</li>
          <li>Laboratório II – Joaquim Nabuco, 05/11 às 14h: Videomaker (145, movido em 02/11) e Rios do Saber (156) no mesmo horário; confirmar a divisão do laboratório.</li>
        </ul>
      </section>
    </>
  );
}

function Alerta({ title, list, info, empty }) {
  return (
    <>
      <h3>{title} <small>{list.length}</small></h3>
      {list.length ? <ul className="tiny">{list.map((c) => { const i = info(c); return <li key={c.id}><b>{c.id}</b> {T.title(c)} — {c.sessions.map((s) => `${T.fmtDate(s.date, 'wd')} ${T.fmtTime(s.time)}`).join('; ')} · {D.venues[c.sessions[0].venue].short}{i.has ? ` · ${i.inscritos ?? '?'}/${i.vagas} inscritos` : ''}</li>; })}</ul> : <p className="tiny muted">{empty}</p>}
    </>
  );
}
