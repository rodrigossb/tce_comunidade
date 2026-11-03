'use client';
import { useMemo, useState } from 'react';
import { TCE as T } from '@tce/core';
import { lanchesBoard } from '@tce/core/lanches';
import Icon from '@/components/Icon';
import { useMounted } from '@/lib/hooks';
import { useInscritos, inscritosSourceLabel } from '@/lib/useInscritos';
import SyncInscritos from './SyncInscritos';
import { VENUE_ORDER, cap, sameSet, venueFilter, venuesLabel, dayFilter } from '@/lib/resumo-util';

const D = T.D;
const PAGE = 'lanches.html';
const shiftLabel = (s) => T.SHIFTS[s].label;
const shiftWindow = (s) => `${T.fmtTime(T.SHIFTS[s].start)}–${T.fmtTime(T.SHIFTS[s].end)}`;
const venueCity = (v) => (D.venues[v].city !== D.venues[v].name ? D.venues[v].city : '');

/** Dashboard de lanches: inscritos por local, dia e turno, num quadro único, para a fornecedora de alimentação. */
export default function Lanches() {
  const mounted = useMounted();
  return <div className="rs lk">{mounted ? <Doc /> : <p className="rs-loading">Montando o painel…</p>}</div>;
}

function Doc() {
  const [enr, setEnr] = useInscritos(); // API do tce-senhas (coletor dentro da rede do TCE) → inscritos.json publicado → cópia local
  const [copied, setCopied] = useState('');
  // ?local= (jn, manga, sebrae, auditorio, iaparra, oiapoque; vários com vírgula) · ?dia=04 (ou 04/11, 2026-11-04)
  const sel = useMemo(() => venueFilter(T.params.get('local')), []);
  const dsel = useMemo(() => dayFilter(T.params.get('dia')), []);
  const sessions = useMemo(() => T.allSessions().filter((s) => (!sel || sel.has(s.venue)) && (!dsel || dsel.has(s.date))), [sel, dsel]);
  const byId = (enr && enr.byId) || {};
  const b = useMemo(() => lanchesBoard({ byId, sessions }), [byId, sessions]);
  const selLabel = venuesLabel(sel);
  const now = T.now(); const today = `${T.fmtDate(now.date, 'wdlong')} ${now.time}`;
  const allDays = useMemo(() => [...new Set(T.allSessions().map((x) => x.date))].sort(), []);
  const qs = (over) => { const p = new URLSearchParams(); const cur = { local: T.params.get('local') || '', dia: T.params.get('dia') || '', ...over }; for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v); const s = p.toString(); return PAGE + (s ? `?${s}` : ''); };
  const comDado = b.total.turmas - b.total.estimadas;
  const lastRead = enr ? `${T.fmtDate(T.partsOf(new Date(enr.updatedAt)).date, 'wd')} ${T.partsOf(new Date(enr.updatedAt)).time}` : 'não lido';

  /** Quantidade: inscritos (lanches) e "*" quando há turma ainda sem dado (contada pelas vagas). */
  const Qty = ({ t, big }) => (!t || !t.turmas ? <span className="muted">—</span> : <><b className={big ? 'big' : ''}>{t.lanches}</b>{t.estimadas ? <sup className="est" title={`${t.estimadas} turma(s) sem dado no painel: contadas pelas vagas`}>*</sup> : null}</>);
  const breakdown = (t) => { const sh = t.shifts || b.byShift; return b.shifts.filter((s) => sh[s].turmas).map((s) => `${shiftLabel(s).slice(0, 1)} ${sh[s].lanches}`).join(' · '); }; // o total geral usa byShift

  const copyText = () => {
    const L = [`${D.event.name} · ${D.event.edition} · LANCHES (alunos inscritos por turno)${selLabel ? ` · ${selLabel}` : ''}`];
    for (const v of b.venues) {
      L.push('', `${D.venues[v].name.toUpperCase()} · total ${b.byVenue[v].lanches}`);
      for (const d of b.days) { const vd = b.byVenueDay[`${v}|${d}`]; if (!vd) continue; L.push(`  ${cap(T.fmtDate(d, 'wdlong'))}: ${b.shifts.filter((s) => vd.shifts[s].turmas).map((s) => `${shiftLabel(s).toLowerCase()} ${vd.shifts[s].lanches}${vd.shifts[s].estimadas ? '*' : ''}`).join(' · ')} = ${vd.lanches}`); }
    }
    L.push('', `TOTAL GERAL: ${b.total.lanches}`, `Por dia: ${b.days.map((d) => `${T.fmtDate(d, 'wd')} ${b.byDay[d].lanches}`).join(' · ')}`);
    if (b.total.estimadas) L.push('* turma ainda sem inscritos no painel: contada pelas vagas (teto).');
    L.push(`Fonte: painel ESCON, ${inscritosSourceLabel(enr)} · gerado ${today}`);
    navigator.clipboard?.writeText(L.join('\n')).then(() => { setCopied('Texto copiado: é só colar no WhatsApp ou e-mail.'); setTimeout(() => setCopied(''), 4000); }).catch(() => setCopied('Não consegui copiar; selecione a tabela e copie.'));
  };

  return (
    <>
      <div className="rs-tools"><button onClick={() => window.print()}><Icon name="download" />Imprimir / PDF</button><button onClick={copyText}><Icon name="copy" />Copiar texto</button><a href="resumo-total.html"><Icon name="layers" />Resumo total</a><a href="resumo-cursos.html"><Icon name="graduation" />Cursos e inscritos</a><a href="index.html"><Icon name="phone" />App</a></div>
      <SyncInscritos onData={setEnr} enr={enr} />
      <div className="rs-tools rs-locais"><span className="muted tiny">Local:</span><a href={qs({ local: '' })} className={sel ? '' : 'on'}>Todos</a>{VENUE_ORDER.filter((v) => T.allSessions().some((x) => x.venue === v)).map((v) => <a key={v} href={qs({ local: v })} className={sameSet(sel, venueFilter(v)) ? 'on' : ''}>{D.venues[v].short}</a>)}</div>
      <div className="rs-tools rs-locais"><span className="muted tiny">Dia:</span><a href={qs({ dia: '' })} className={dsel ? '' : 'on'}>Todos</a>{allDays.map((d) => <a key={d} href={qs({ dia: d.slice(8) })} className={dsel && dsel.size === 1 && dsel.has(d) ? 'on' : ''}>{cap(T.fmtDate(d, 'wd'))}</a>)}{copied ? <span className="tiny ok">{copied}</span> : null}</div>

      <header className="head">
        <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
        <div>
          <p className="kicker">Lanches · alunos inscritos por local, dia e turno{selLabel ? ` · ${selLabel}` : ''}</p>
          <h1>{D.event.name} <span>{D.event.edition}</span></h1>
          <p className="sub">{selLabel ? `${selLabel} · ` : `${D.event.place} · `}{D.event.datesLabel} · um lanche por aluno em cada turno de aula</p>
        </div>
      </header>
      <div className="kpis">
        <div className="kpi main"><small>Lanches previstos</small><b>{b.total.lanches}{b.total.estimadas ? <sup className="est">*</sup> : null}</b><em>{b.days.length} dia{b.days.length > 1 ? 's' : ''} · {b.venues.length} loca{b.venues.length > 1 ? 'is' : 'l'} · {b.total.turmas} turmas-turno</em></div>
        {b.shifts.map((s) => <div className="kpi" key={s}><small>{shiftLabel(s)} <span className="muted">{shiftWindow(s)}</span></small><b>{b.byShift[s].lanches}</b><em>{b.byShift[s].turmas} turma{b.byShift[s].turmas > 1 ? 's' : ''}</em></div>)}
        <div className="kpi"><small>Turmas com inscritos</small><b>{comDado} <span className="muted">/ {b.total.turmas}</span></b><em>{b.total.estimadas ? `${b.total.estimadas} ainda pelas vagas (*)` : 'todas com dado do painel'}</em></div>
        <div className="kpi"><small>Painel ESCON</small><b className="sm">{lastRead}</b><em>{enr ? (enr.painelInfo ? `painel de ${enr.painelInfo} · ` : '') + (enr.source === 'coletor' ? 'coletor automático' : enr.source === 'publicado' ? 'publicado com o site' : 'cópia local') : 'quantidades pelas vagas'}</em></div>
      </div>
      {!enr ? <p className="warn-box"><Icon name="alert" /> Ainda sem leitura do painel de inscrições: as quantidades são as <b>vagas</b> de cada turma (teto) até o coletor enviar os dados.</p> : null}

      <table className="ovl">
        <thead><tr><th>Local</th>{b.days.map((d) => <th key={d} className="n">{cap(T.fmtDate(d, 'wd'))}<small>{T.fmtDate(d, 'short')}</small></th>)}<th className="n tot-col">Total</th></tr></thead>
        <tbody>{b.venues.map((v) => <tr key={v}><td><b>{D.venues[v].name}</b>{venueCity(v) ? <span className="muted tiny"> · {venueCity(v)}</span> : null}</td>{b.days.map((d) => { const vd = b.byVenueDay[`${v}|${d}`]; return <td key={d} className="n">{vd ? <><Qty t={vd} /><small>{breakdown(vd)}</small></> : <span className="muted">—</span>}</td>; })}<td className="n tot-col"><Qty t={b.byVenue[v]} big /><small>{breakdown(b.byVenue[v])}</small></td></tr>)}</tbody>
        <tfoot><tr className="tot"><td>Total do dia</td>{b.days.map((d) => <td key={d} className="n"><Qty t={b.byDay[d]} big /><small>{breakdown(b.byDay[d])}</small></td>)}<td className="n tot-col"><Qty t={b.total} big /><small>{breakdown(b.total)}</small></td></tr></tfoot>
      </table>
      <p className="tiny muted legend">M = manhã {shiftWindow('manha')} · T = tarde {shiftWindow('tarde')} · N = noite {shiftWindow('noite')}{b.total.estimadas ? ' · * inclui turma(s) ainda sem inscritos no painel, contadas pelas vagas' : ''}</p>

      {b.venues.map((v) => (
        <section className="sec venue-sec" key={v} id={`l-${v}`}>
          <h2>{D.venues[v].name}{venueCity(v) ? <small>{venueCity(v)}</small> : null}<span className="h2tot"><Qty t={b.byVenue[v]} big /><em>lanches</em></span></h2>
          <table className="dt">
            <thead><tr><th className="c-hora">Horário</th><th className="c-id">Cód.</th><th>Curso</th><th className="c-sala">Sala</th><th className="n c-num">Inscritos</th><th className="n c-num">Vagas</th></tr></thead>
            <tbody>
              {b.days.filter((d) => b.byVenueDay[`${v}|${d}`]).map((d) => { const vd = b.byVenueDay[`${v}|${d}`]; return [
                <tr className="day" key={d}><td colSpan={4}>{cap(T.fmtDate(d, 'wdlong'))}<span className="muted"> · {breakdown(vd)}</span></td><td className="n"><Qty t={vd} big /></td><td className="n muted">{vd.vagas}</td></tr>,
                ...b.shifts.filter((s) => vd.shifts[s].turmas).flatMap((s) => { const cell = b.cellOf(v, d, s); return [
                  <tr className="shift" key={`${d}-${s}`}><td colSpan={4}>{shiftLabel(s)} · {shiftWindow(s)} · primeira aula {T.fmtTime(cell.start)}</td><td className="n"><Qty t={cell} /></td><td className="n muted">{cell.vagas}</td></tr>,
                  ...cell.rows.map((r) => <tr key={`${d}-${s}-${r.key}`}><td>{T.fmtTime(r.sess.time)}–{T.fmtTime(T.sessionEnd(r.sess))}</td><td className="num">{r.course.id}</td><td><b>{T.title(r.course)}</b>{r.sess.label ? <span className="muted tiny"> · {r.sess.label}</span> : null}{r.course.sessions.length > 1 ? <span className="muted tiny"> · {r.course.sessions.length} encontros</span> : null}</td><td>{r.sess.room || <span className="muted">sem sala</span>}</td><td className="n">{r.i.has ? <b>{r.i.inscritos}</b> : <><b>{r.lanches}</b><sup className="est">*</sup></>}</td><td className="n muted">{r.i.vagas}</td></tr>),
                ]; }),
              ]; })}
            </tbody>
            <tfoot><tr className="tot"><td colSpan={4}>Total · {D.venues[v].short}</td><td className="n"><Qty t={b.byVenue[v]} big /></td><td className="n muted">{b.byVenue[v].vagas}</td></tr></tfoot>
          </table>
        </section>
      ))}

      <section className="sec" id="criterios">
        <h3>Critérios</h3>
        <ul className="tiny muted">
          <li><b>Um lanche por aluno em cada turno</b> em que ele tem aula: quem estuda de manhã e à tarde no mesmo dia conta duas vezes; cursos de vários dias contam em cada dia.</li>
          <li>Quantidade = <b>inscritos</b> na última leitura do painel da ESCON (coletor automático dentro da rede do TCE). Turma ainda sem dado entra com as <b>vagas</b> (teto) e aparece com <b>*</b>.</li>
          <li>Inscrições continuam abertas até o início de cada curso: combinar com a fornecedora a data e hora de corte de cada entrega (ex.: véspera, 17h).</li>
          <li>"Primeira aula" é a hora em que a entrega precisa estar no local. Só alunos dos cursos; não inclui equipe, instrutores nem o público dos serviços.</li>
        </ul>
        <p className="version">Gerado em {today} · painel ESCON: {inscritosSourceLabel(enr)} · www.tce.ap.gov.br/tce-na-comunidade/lanches.html</p>
      </section>
    </>
  );
}
