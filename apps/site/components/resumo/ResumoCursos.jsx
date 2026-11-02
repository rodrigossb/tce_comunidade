'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import Icon from '@/components/Icon';
import { useMounted } from '@/lib/hooks';
import { parseAny, groupsOf, groupKey } from '@/lib/inscritos';

const D = T.D;
const PANEL = 'https://servicos.tce.ap.gov.br/escon/admin/painel/oiapoque';
const PANEL_API = 'https://servicos.tce.ap.gov.br/escon/admin/api/public/painel/oiapoque'; // JSON (mesma chave ?k=)
const LS_DATA = 'tce_inscritos';
const LS_KEY = 'tce_painel_k';
const API = () => (T.params.get('api') || D.event.apiUrl || '').replace(/\/$/, '');
const USERSCRIPT = 'coletor-inscritos.user.js';
// Bookmarklet: na página do painel, lê os cartões e envia para a API (pede o token na primeira vez e guarda no navegador).
const BOOKMARKLET = `javascript:(()=>{const A='${'https://dev.gerenciahub.com.br/tce-senhas/api/inscritos'}';let t=localStorage.getItem('tce_inscritos_token')||prompt('Token do coletor de inscritos:');if(!t)return;localStorage.setItem('tce_inscritos_token',t);const post=(b)=>fetch(A,{method:'POST',headers:{'Content-Type':'application/json','X-Token':t},body:JSON.stringify(b)}).then(r=>r.json().then(j=>{if(!r.ok){if(/token/.test(j.error||''))localStorage.removeItem('tce_inscritos_token');throw new Error(j.error||r.status);}alert('Inscritos enviados: '+j.cursos+' turmas (painel '+(j.painelInfo||'?')+').'+(j.semCorrespondencia&&j.semCorrespondencia.length?' Sem correspondência: '+j.semCorrespondencia.join(' | '):''));}));const viaApi=()=>fetch('/escon/admin/api/public/painel/oiapoque'+location.search,{credentials:'include',headers:{Accept:'application/json'}}).then(r=>{if(!r.ok)throw new Error('api '+r.status);return r.text();}).then(x=>{JSON.parse(x);return post({json:x,source:'bookmarklet-api'});});if(/\\/api\\/public\\/painel\\//.test(location.pathname)){post({json:document.body.innerText,source:'bookmarklet-api'}).catch(e=>alert('Falha: '+e.message));return;}const c=[...document.querySelectorAll('li.po-cartao')].map(l=>({title:(l.querySelector('h3')||{}).textContent||'',date:(l.querySelector('.po-data')||{}).textContent||'',inscritos:Number(((l.querySelector('.po-inscritos strong')||{}).textContent||'').replace(/\\D/g,''))})).filter(x=>x.title);const m=document.body.innerText.match(/N[úu]meros de (\\d{1,2}) de (\\w+),? [àa]s (\\d{1,2}:\\d{2})/i);const pi=m?m[1].padStart(2,'0')+'/'+({novembro:'11',dezembro:'12',outubro:'10'}[m[2].toLowerCase()]||m[2])+' '+m[3]:'';viaApi().catch(()=>post({cards:c,painelInfo:pi,source:'bookmarklet'})).catch(e=>alert('Falha: '+e.message));})();`;
const VENUE_ORDER = ['jn', 'manga', 'sebrae', 'auditorio', 'iaparra'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sameSet = (a, b) => !!a && !!b && a.size === b.size && [...a].every((x) => b.has(x));
/** ?local= → Set de locais (ou null = todos). Aceita ids (jn, manga, sebrae, auditorio, iaparra), vários com vírgula,
    e as cidades: "oiapoque" (Joaquim Nabuco, SEBRAE e auditório) e "manga" (Distrito do Manga e Escola Jorge Iaparrá). */
function venueFilter(q) {
  const out = new Set();
  for (const raw of String(q || '').toLowerCase().split(/[,+ ]+/).filter(Boolean)) {
    const k = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (D.venues[k]) out.add(k);
    if (k === 'nabuco' || k === 'joaquim') out.add('jn');
    if (k === 'oiapoque') for (const v of Object.values(D.venues)) if (v.city === 'Oiapoque') out.add(v.id);
    if (k === 'manga') for (const v of Object.values(D.venues)) if (/manga/i.test(v.city)) out.add(v.id);
  }
  return out.size ? out : null;
}
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };

// ---------- página ----------
/** variant: undefined = resumo de cursos (por dia, A–Z, totais, atenção); 'total' = resumo total (totais e turmas por local). */
export default function ResumoCursos({ variant }) {
  const mounted = useMounted();
  return <div className="rs">{mounted ? <Doc variant={variant} /> : <p className="rs-loading">Montando o resumo…</p>}</div>;
}

function Doc({ variant }) {
  const total = variant === 'total'; const page = total ? 'resumo-total.html' : 'resumo-cursos.html';
  const [enr, setEnr] = useState(() => load(LS_DATA, null));
  const [key, setKey] = useState(() => T.params.get('k') || load(LS_KEY, ''));
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // O React recusa href="javascript:" no render; o favorito recebe o endereço depois de montar.
  const bmRef = useRef(null);
  useEffect(() => { if (bmRef.current) bmRef.current.setAttribute('href', BOOKMARKLET); }, []);
  // ?local=jn | manga | sebrae | auditorio | iaparra (vários com vírgula; "oiapoque" = todos os locais de Oiapoque, "manga" inclui a escola do Manga).
  const sel = useMemo(() => venueFilter(T.params.get('local')), []);
  const inSel = (x) => !sel || sel.has(x.venue);
  const all = useMemo(() => T.allSessions().filter(inSel), [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => [...new Set(all.map((x) => x.date))].sort(), [all]);
  const courses = useMemo(() => D.courses.filter((c) => c.sessions.some(inSel)), [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const selLabel = sel ? VENUE_ORDER.filter((v) => sel.has(v)).map((v) => D.venues[v].name).join(' e ') : '';
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
      // Primeiro a API pública (JSON); se ela falhar, a página HTML do painel.
      let res; let text;
      try { res = await fetch(`${PANEL_API}?k=${encodeURIComponent(kk)}`, { cache: 'no-store', signal: ctl.signal, headers: { Accept: 'application/json' } }); text = await res.text(); if (!res.ok || !/^\s*[[{]/.test(text)) throw new Error('api'); }
      catch (e1) { if (e1.name === 'AbortError') throw e1; res = await fetch(`${PANEL}?k=${encodeURIComponent(kk)}`, { cache: 'no-store', signal: ctl.signal }); text = await res.text(); }
      clearTimeout(timer);
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
    const take = (pub, source) => { if (pub && pub.byId && Object.keys(pub.byId).length) setEnr((cur) => { if (cur && cur.updatedAt >= pub.updatedAt) return cur; const data = { byId: pub.byId, updatedAt: pub.updatedAt, source, painelInfo: pub.painelInfo || '' }; save(LS_DATA, data); return data; }); };
    // a) API do tce-senhas (alimentada pelo coletor dentro da rede do TCE, ao vivo); b) inscritos.json publicado com o site.
    if (API()) fetch(`${API()}/api/inscritos`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).then((pub) => take(pub, 'coletor')).catch(() => {});
    fetch('inscritos.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((pub) => take(pub, 'publicado')).catch(() => {});
    if (key) fetchPanel(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = (enr && enr.byId) || {};
  /** Números de um curso (todas as turmas) ou de uma turma (sess): vagas, inscritos, restantes, % e se há dado.
      Chaves por turma (curso@local@idESCON) vêm do painel; a chave só por código vem de tabelas coladas. */
  const info = (c, sess) => {
    const groups = groupsOf(c); const gs = sess ? groups.filter((g) => g.key === groupKey(c, sess)) : sel ? groups.filter((g) => sel.has(g.venue)) : groups;
    return calc(c, gs);
  };
  /** Números de um conjunto de turmas (gs) do curso c. */
  const calc = (c, gs) => {
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
  /** Soma as turmas de cada curso que passam em `pick(g)` (todas, se não houver pick): cursos, turmas, vagas, inscritos, restantes. */
  const sumBy = (list, pick) => {
    const a = { cursos: 0, turmas: 0, vagas: 0, inscritos: 0, restantes: 0, com: 0, vagasCom: 0, lotados: 0, pct: null };
    for (const c of list) {
      const gs = pick ? groupsOf(c).filter(pick) : sel ? groupsOf(c).filter((g) => sel.has(g.venue)) : groupsOf(c);
      if (!gs.length) continue;
      const i = calc(c, gs); a.cursos++; a.turmas += gs.length; a.vagas += i.vagas || 0;
      if (i.has) { a.inscritos += i.inscritos || 0; a.restantes += i.restantes || 0; a.vagasCom += i.vagas || 0; a.com++; if (i.restantes <= 0) a.lotados++; }
    }
    a.pct = a.com && a.vagasCom ? Math.round((100 * a.inscritos) / a.vagasCom) : null; return a;
  };
  const totals = (list) => sumBy(list);
  const tot = totals(courses);
  const totOfRows = (rows) => { const keys = new Set(rows.map((x) => groupKey(x.course, x))); return sumBy([...new Set(rows.map((x) => x.course))], (g) => keys.has(g.key)); };
  const TotRow = ({ t, label, lead = 1, tail = 1 }) => <tr className="tot"><td colSpan={lead}>{label}</td><td className="n">{t.vagas}</td><td className="n">{t.com ? t.inscritos : '—'}</td><td className="n">{t.com ? t.restantes : '—'}</td>{tail ? <td className="muted tiny">{t.com ? `${t.pct}% · ${t.com} de ${t.cursos} cursos com dado` : 'sem dado'}</td> : null}</tr>;
  const Bar = ({ i }) => (i.pct == null ? <span className="nd">sem dado</span> : <><span className={`bar ${i.restantes <= 0 ? 'full' : i.pct < 30 ? 'low' : ''}`}><i style={{ width: `${Math.min(100, i.pct)}%` }} /></span> {i.pct}%{i.restantes <= 0 ? <span className="full-tag">{i.over ? `lotado +${i.over}` : 'lotado'}</span> : null}</>);
  const Num = ({ v }) => <td className="n">{v == null ? '—' : v}</td>;
  const room = (x) => { const p = T.courseRoomPlace(x); return <>{x.room || <span className="muted">sem sala</span>}{p && M.placeLabel(p) !== x.room ? <> <span className={`room ${p.kind} sm`}>{M.placeLabel(p)}</span></> : null}</>; };

  const totais = (num) => (
      <section className="sec" id="totais">
        <h2><span className="n">{num}.</span> Totais{sel ? ` · ${selLabel}` : ''}<span className="h2sub">vagas, inscritos e vagas restantes por local e por dia · turmas de mais de um dia contam uma vez por local</span></h2>
        <div className="tot-grid">
          <table className="t6 tt"><thead><tr><th>Local</th><th className="n c-num">Cursos</th><th className="n c-num">Turmas</th><th className="n c-num">Vagas</th><th className="n c-num">Inscritos</th><th className="n c-num">Restam</th><th className="c-bar">Ocupação</th></tr></thead>
            <tbody>{VENUE_ORDER.filter((v) => all.some((x) => x.venue === v)).map((v) => { const t = sumBy(courses, (g) => g.venue === v); return <tr key={v}><td><b>{D.venues[v].name}</b><span className="muted tiny"> · {D.venues[v].city}</span></td><Num v={t.cursos} /><Num v={t.turmas} /><Num v={t.vagas} /><Num v={t.com ? t.inscritos : null} /><Num v={t.com ? t.restantes : null} /><td><Bar i={{ pct: t.pct, restantes: t.com ? t.restantes : 1, over: 0 }} /></td></tr>; })}</tbody>
            <tfoot><tr className="tot"><td>Total geral{sel ? ` (${selLabel})` : ''}</td><td className="n">{tot.cursos}</td><td className="n">{tot.turmas}</td><td className="n">{tot.vagas}</td><td className="n">{tot.com ? tot.inscritos : '—'}</td><td className="n">{tot.com ? tot.restantes : '—'}</td><td><Bar i={{ pct: tot.pct, restantes: tot.com ? tot.restantes : 1, over: 0 }} /></td></tr></tfoot>
          </table>
          <table className="t6 tt"><thead><tr><th>Dia</th><th className="n c-num">Cursos</th><th className="n c-num">Aulas</th><th className="n c-num">Vagas</th><th className="n c-num">Inscritos</th><th className="n c-num">Restam</th><th className="c-bar">Ocupação</th></tr></thead>
            <tbody>{days.map((d) => { const rows = all.filter((x) => x.date === d); const t = totOfRows(rows); return <tr key={d}><td><b>{cap(T.fmtDate(d))}</b></td><Num v={t.cursos} /><Num v={rows.length} /><Num v={t.vagas} /><Num v={t.com ? t.inscritos : null} /><Num v={t.com ? t.restantes : null} /><td><Bar i={{ pct: t.pct, restantes: t.com ? t.restantes : 1, over: 0 }} /></td></tr>; })}</tbody>
          </table>
        </div>
        <p className="tiny muted">Na tabela por dia, um curso de vários encontros entra em cada um dos seus dias; por isso a soma dos dias é maior que o total geral. Vagas restantes nunca ficam negativas: inscritos acima das vagas aparecem como "lotado +N" nas tabelas.</p>
      </section>
  );
  const fullBody = (
    <>
      {days.map((d, di) => {
        const sess = all.filter((x) => x.date === d);
        const venues = VENUE_ORDER.filter((v) => sess.some((x) => x.venue === v));
        const dayCourses = [...new Set(sess.map((x) => x.course))];
        const dt = totOfRows(sess);
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
                    <tfoot><TotRow t={totOfRows(rows)} label={`Total · ${D.venues[v].short}, ${T.fmtDate(d, 'wd')}`} lead={5} /></tfoot>
                  </table>
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="sec" id="az">
        <h2><span className="n">{days.length + 1}.</span> Cursos de A a Z{sel ? ` · ${selLabel}` : ''}<span className="h2sub">{courses.length} cursos · {tot.turmas} turmas · {tot.vagas} vagas{tot.com ? ` · ${tot.inscritos} inscritos e ${tot.restantes} restantes em ${tot.com} cursos com dado` : ''}</span></h2>
        <table className="t6"><thead><tr><th className="c-id">Cód.</th><th>Curso</th><th>Quando</th><th className="c-local">Local</th><th className="n c-num">Vagas</th><th className="n c-num">Inscritos</th><th className="n c-num">Restam</th><th className="c-bar">Ocupação</th></tr></thead>
          <tbody>{[...courses].sort((a, b) => T.title(a).localeCompare(T.title(b), 'pt-BR')).map((c) => { const i = info(c); const ss = c.sessions.filter(inSel); const first = ss[0]; return (
            <tr key={c.id}><td className="num">{c.id}</td><td><b>{T.title(c)}</b><span className="muted tiny"> · {c.hours}h</span></td><td>{ss.map((s, k) => <span key={k}>{k ? '; ' : ''}{T.fmtDate(s.date, 'wd')} {T.fmtTime(s.time)}</span>)}</td><td>{D.venues[first.venue].short}{first.room ? ` · ${first.room}` : ''}</td><Num v={i.vagas} /><Num v={i.inscritos} /><Num v={i.restantes} /><td><Bar i={i} /></td></tr>); })}</tbody>
          <tfoot><TotRow t={tot} label="Total" lead={4} /></tfoot>
        </table>
      </section>

      {totais(days.length + 2)}

      <section className="sec" id="alerta">
        <h2><span className="n">{days.length + 3}.</span> Atenção</h2>
        {!enr ? <p className="lead">Sem dados de inscrição ainda. Leia o painel (chave) ou cole o conteúdo na capa para ver cursos lotados, quase lotados e com poucas inscrições.</p> : (
          <>
            <Alerta title="Lotados" list={courses.filter((c) => info(c).has && info(c).restantes <= 0)} info={info} empty="Nenhum curso lotado." />
            <Alerta title="Quase lotados (até 3 vagas)" list={courses.filter((c) => { const i = info(c); return i.has && i.restantes > 0 && i.restantes <= 3; })} info={info} empty="Nenhum." />
            <Alerta title="Baixa procura (menos de 30% das vagas)" list={courses.filter((c) => { const i = info(c); return i.has && i.pct != null && i.pct < 30; })} info={info} empty="Nenhum." />
            <Alerta title="Sem dado no painel" list={courses.filter((c) => !info(c).has)} info={info} empty="Todos os cursos têm dado de inscrição." />
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
  const totalBody = (
    <>
      {totais(1)}
      {VENUE_ORDER.filter((v) => all.some((x) => x.venue === v)).map((v, vi) => {
        // Uma linha por turma do local (turma = curso@local@idESCON), em ordem do primeiro encontro.
        const rows = [];
        for (const c of courses) for (const g of groupsOf(c).filter((x) => x.venue === v)) { const ss = c.sessions.filter((s) => groupKey(c, s) === g.key); rows.push({ c, g, ss, i: calc(c, [g]) }); }
        rows.sort((x, y) => x.ss[0].date.localeCompare(y.ss[0].date) || T.toMin(x.ss[0].time) - T.toMin(y.ss[0].time) || T.title(x.c).localeCompare(T.title(y.c), 'pt-BR'));
        const t = sumBy(courses, (g) => g.venue === v);
        return (
          <section className="sec venue-sec" key={v} id={`l-${v}`}>
            <h2><span className="n">{vi + 2}.</span> {D.venues[v].name}<span className="h2sub">{D.venues[v].city} · {t.cursos} cursos · {t.turmas} turmas · {t.vagas} vagas{t.com ? ` · ${t.inscritos} inscritos e ${t.restantes} restantes` : ''}</span></h2>
            <table className="t6"><thead><tr><th className="c-quando">Quando</th><th className="c-id">Cód.</th><th>Curso</th><th className="c-local">Sala</th><th className="n c-num">Vagas</th><th className="n c-num">Inscritos</th><th className="n c-num">Restam</th><th className="c-bar">Ocupação</th></tr></thead>
              <tbody>{rows.map(({ c, g, ss, i }) => <tr key={g.key}><td>{ss.map((s, k) => <span key={k} className="when">{T.fmtDate(s.date, 'wd')} {T.fmtTime(s.time)}</span>)}</td><td className="num">{c.id}</td><td><b>{T.title(c)}</b>{ss[0].label ? <span className="muted tiny"> · {ss[0].label}</span> : null}{ss.length > 1 ? <span className="muted tiny"> · {ss.length} encontros</span> : null}</td><td>{room(ss[0])}</td><Num v={i.vagas} /><Num v={i.inscritos} /><Num v={i.restantes} /><td><Bar i={i} /></td></tr>)}</tbody>
              <tfoot><TotRow t={t} label={`Total · ${D.venues[v].short}`} lead={4} /></tfoot>
            </table>
          </section>
        );
      })}
      <section className="sec" id="obs">
        <h3>Observações</h3>
        <ul className="tiny muted">
          <li>Uma linha por turma: cursos com encontros em vários dias aparecem uma vez, com todos os dias na coluna "Quando". Cursos com turmas em locais diferentes (Cuidador, Tecnologia e Direito das Mulheres, Videomaker, Cidadania Conectada) aparecem em cada local com os números daquela turma.</li>
          <li>Vagas: número cadastrado no site do evento (ou o do painel, quando informado). Restantes: do painel ou vagas − inscritos; nunca negativas (inscritos acima das vagas aparecem como "lotado +N").</li>
          <li>Inscritos: painel administrativo da ESCON, via coletor dentro da rede do TCE (ao vivo) ou publicado com o site.</li>
        </ul>
      </section>
    </>
  );

  return (
    <>
      <div className="rs-tools"><button onClick={() => window.print()}><Icon name="download" />Imprimir / PDF</button><a href="resumo.html"><Icon name="list" />Resumo geral</a>{total ? <a href="resumo-cursos.html"><Icon name="graduation" />Resumo de cursos</a> : <a href="resumo-total.html"><Icon name="layers" />Resumo total</a>}<a href="index.html"><Icon name="phone" />App</a></div>
      <div className="rs-tools rs-locais"><span className="muted tiny">Local:</span><a href={page} className={sel ? '' : 'on'}>Todos</a>{VENUE_ORDER.filter((v) => T.allSessions().some((x) => x.venue === v)).map((v) => <a key={v} href={`${page}?local=${v}`} className={sameSet(sel, venueFilter(v)) ? 'on' : ''}>{D.venues[v].short}</a>)}</div>
      <section className="cover">
        <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
        <p className="kicker">{total ? 'Resumo total · cursos, vagas e inscritos por local' : 'Resumo de cursos e inscrições'}{sel ? ` · ${selLabel}` : ''}</p>
        <h1>{D.event.name}<br /><span>{D.event.edition}</span></h1>
        <p className="sub">{sel ? `${selLabel} · ` : `${D.event.place} · `}{D.event.datesLabel}</p>
        <div className="kpis">
          <div className="kpi"><small>Cursos</small><b>{courses.length}</b><em>{tot.turmas} turmas · {all.length} aulas</em></div>
          <div className="kpi"><small>Vagas</small><b>{tot.vagas}</b><em>soma das turmas</em></div>
          <div className="kpi"><small>Inscritos</small><b>{tot.com ? tot.inscritos : '—'}</b><em>{tot.com ? `${tot.com} de ${courses.length} cursos com dado` : 'sem dados do painel'}</em></div>
          <div className="kpi"><small>Vagas restantes</small><b>{tot.com ? tot.restantes : '—'}</b><em>{tot.com ? `${tot.lotados} lotado(s)` : ''}</em></div>
          <div className="kpi"><small>Ocupação</small><b>{tot.pct != null ? `${tot.pct}%` : '—'}</b><em>inscritos ÷ vagas (cursos com dado)</em></div>
          <div className="kpi"><small>Painel ESCON</small><b style={{ fontSize: '1rem' }}>{enr ? `${T.fmtDate(T.partsOf(new Date(enr.updatedAt)).date, 'wd')} ${T.partsOf(new Date(enr.updatedAt)).time}` : 'não lido'}</b><em>{enr ? `${enr.painelInfo ? `painel de ${enr.painelInfo} · ` : ''}${enr.source === 'coletor' ? 'via coletor (ao vivo)' : enr.source === 'publicado' ? 'publicado com o site' : enr.source === 'painel' ? 'lido do painel' : 'colado'}` : 'sem leitura'}</em></div>
        </div>
        <div className={`src ${enr ? 'ok' : 'warn'}`}>
          <Icon name={enr ? 'check' : 'info'} />
          <input type="password" placeholder="Chave do painel (?k=…)" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
          <button disabled={busy} onClick={() => fetchPanel(key)}>{busy ? 'Lendo…' : 'Atualizar do painel'}</button>
          <a className="ghost" href={`${PANEL}${key ? `?k=${encodeURIComponent(key)}` : ''}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>Abrir o painel <Icon name="external" /></a>
          {msg ? <p className="msg">{msg}</p> : <p className="msg">Os inscritos são lidos pelo seu navegador no painel administrativo da ESCON; a chave fica só neste aparelho. Se o navegador bloquear a leitura, copie o conteúdo do painel e cole abaixo.</p>}
          <details><summary>Atualização automática (coletor)</summary>
            <p className="msg">O painel da ESCON só abre de dentro da rede do TCE, então a coleta roda do lado de quem tem acesso e envia para a API do controle de senhas; esta página lê de lá ao vivo. Duas opções:</p>
            <ol className="msg" style={{ paddingLeft: '1.2rem', display: 'grid', gap: '.3rem' }}>
              <li><b>Favorito “Enviar inscritos”</b>: arraste este botão para a barra de favoritos → <a ref={bmRef} href="#enviar-inscritos" onClick={(e) => e.preventDefault()} style={{ fontWeight: 700, border: '1px solid var(--navy)', borderRadius: 8, padding: '.15rem .5rem', textDecoration: 'none', color: 'var(--navy)' }}>Enviar inscritos</a>. Com o painel aberto, clique no favorito: ele pede o token uma vez e envia os números na hora.</li>
              <li><b>Automático a cada 30 min</b>: instale a extensão Tampermonkey e abra <a href={USERSCRIPT}>{USERSCRIPT}</a> para instalar o script; deixe uma aba do painel aberta (ex.: no computador da TV) e ele envia sozinho ao abrir e a cada 30 minutos.</li>
              <li><b>Servidor dentro do TCE</b>: <code>node apps/senhas/scripts/inscritos-coletor.mjs</code> (ver README).</li>
            </ol>
          </details>
          <details open={!enr}><summary>Colar o conteúdo do painel</summary>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Abra o painel, Ctrl+A, Ctrl+C e cole aqui (tabela, texto ou HTML)." />
            <div style={{ marginTop: '.4rem', display: 'flex', gap: '.5rem' }}><button onClick={() => { if (apply(parseAny(paste), 'colado')) setPaste(''); }}>Usar dados colados</button>{enr ? <button className="ghost" onClick={() => { localStorage.removeItem(LS_DATA); setEnr(null); setMsg('Dados de inscrição apagados deste aparelho.'); }}>Limpar</button> : null}</div>
          </details>
        </div>
        <p className="version">Versão gerada em {today} · dados dos cursos do site · inscrições do painel ESCON{enr ? ` (${T.partsOf(new Date(enr.updatedAt)).time})` : ''} · www.tce.ap.gov.br/tce-na-comunidade</p>
      </section>

      {total ? totalBody : fullBody}
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
