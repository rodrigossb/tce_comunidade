'use client';
import { useMemo, useState } from 'react';
import { TCE as T } from '@tce/core';
import { lanchesBoard } from '@tce/core/lanches';
import Icon from '@/components/Icon';
import { useMounted } from '@/lib/hooks';
import { useInscritos, inscritosSourceLabel } from '@/lib/useInscritos';
import { VENUE_ORDER, cap, sameSet, venueFilter, venuesLabel, dayFilter } from '@/lib/resumo-util';

const D = T.D;
const PAGE = 'lanches.html';
const shiftLabel = (s) => T.SHIFTS[s].label;
const shiftWindow = (s) => `${T.fmtTime(T.SHIFTS[s].start)}–${T.fmtTime(T.SHIFTS[s].end)}`;

/** Painel de lanches: alunos inscritos por local, dia e turno, para a fornecedora de alimentação. */
export default function Lanches() {
  const mounted = useMounted();
  return <div className="rs lk">{mounted ? <Doc /> : <p className="rs-loading">Montando o painel…</p>}</div>;
}

function Doc() {
  const [enr] = useInscritos();
  const [copied, setCopied] = useState('');
  // ?local= (jn, manga, sebrae, auditorio, iaparra, oiapoque; vários com vírgula) · ?dia=04 (ou 04/11, 2026-11-04) · ?margem=10 (%)
  const sel = useMemo(() => venueFilter(T.params.get('local')), []);
  const dsel = useMemo(() => dayFilter(T.params.get('dia')), []);
  const margem = Math.max(0, Math.min(100, Number(T.params.get('margem')) || 0));
  const sessions = useMemo(() => T.allSessions().filter((s) => (!sel || sel.has(s.venue)) && (!dsel || dsel.has(s.date))), [sel, dsel]);
  const byId = (enr && enr.byId) || {};
  const b = useMemo(() => lanchesBoard({ byId, sessions, margem }), [byId, sessions, margem]);
  const selLabel = venuesLabel(sel);
  const now = T.now(); const today = `${T.fmtDate(now.date, 'wdlong')} ${now.time}`;
  const allDays = useMemo(() => [...new Set(T.allSessions().map((x) => x.date))].sort(), []);
  const qs = (over) => { const p = new URLSearchParams(); const cur = { local: T.params.get('local') || '', dia: T.params.get('dia') || '', margem: margem || '', ...over }; for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v); const s = p.toString(); return PAGE + (s ? `?${s}` : ''); };
  const comDado = b.total.turmas - b.total.estimadas;

  /** Quantidade de uma célula/total: lanches, "*" se há turma estimada, e o valor com margem quando ?margem=. */
  const Qty = ({ t, strong }) => (!t || !t.turmas ? <span className="muted">—</span> : <><b className={strong ? 'big' : ''}>{t.lanches}</b>{t.estimadas ? <sup className="est" title={`${t.estimadas} turma(s) sem dado no painel: contadas pelas vagas`}>*</sup> : null}{margem ? <small className="mg">+{margem}% = {t.comMargem}</small> : null}</>);

  const copyText = () => {
    const L = [`${D.event.name} · ${D.event.edition} · LANCHES (alunos por turno)${selLabel ? ` · ${selLabel}` : ''}`];
    for (const v of b.venues) {
      L.push('', D.venues[v].name.toUpperCase());
      for (const d of b.days) { const vd = b.byVenueDay[`${v}|${d}`]; if (!vd) continue; L.push(`  ${cap(T.fmtDate(d, 'wdlong'))}: ${b.shifts.filter((s) => vd.shifts[s].turmas).map((s) => `${shiftLabel(s).toLowerCase()} ${vd.shifts[s].lanches}${vd.shifts[s].estimadas ? '*' : ''}`).join(' · ')} = ${vd.lanches}${margem ? ` (com ${margem}%: ${vd.comMargem})` : ''}`); }
      L.push(`  Total ${D.venues[v].short}: ${b.byVenue[v].lanches}${margem ? ` (com ${margem}%: ${b.byVenue[v].comMargem})` : ''}`);
    }
    L.push('', `TOTAL GERAL: ${b.total.lanches}${margem ? ` (com ${margem}%: ${b.total.comMargem})` : ''}`, `* turma ainda sem inscritos no painel: contada pelas vagas (teto).`, `Fonte: ${inscritosSourceLabel(enr)} · gerado ${today}`);
    navigator.clipboard?.writeText(L.join('\n')).then(() => { setCopied('Texto copiado: é só colar no WhatsApp ou e-mail.'); setTimeout(() => setCopied(''), 4000); }).catch(() => setCopied('Não consegui copiar; selecione a tabela e copie.'));
  };

  return (
    <>
      <div className="rs-tools"><button onClick={() => window.print()}><Icon name="download" />Imprimir / PDF</button><button onClick={copyText}><Icon name="copy" />Copiar texto</button><a href="resumo-total.html"><Icon name="layers" />Resumo total</a><a href="resumo-cursos.html"><Icon name="graduation" />Cursos e inscritos</a><a href="index.html"><Icon name="phone" />App</a></div>
      <div className="rs-tools rs-locais"><span className="muted tiny">Local:</span><a href={qs({ local: '' })} className={sel ? '' : 'on'}>Todos</a>{VENUE_ORDER.filter((v) => T.allSessions().some((x) => x.venue === v)).map((v) => <a key={v} href={qs({ local: v })} className={sameSet(sel, venueFilter(v)) ? 'on' : ''}>{D.venues[v].short}</a>)}</div>
      <div className="rs-tools rs-locais"><span className="muted tiny">Dia:</span><a href={qs({ dia: '' })} className={dsel ? '' : 'on'}>Todos</a>{allDays.map((d) => <a key={d} href={qs({ dia: d.slice(8) })} className={dsel && dsel.size === 1 && dsel.has(d) ? 'on' : ''}>{cap(T.fmtDate(d, 'wd'))}</a>)}{copied ? <span className="tiny ok">{copied}</span> : null}</div>

      <section className="cover">
        <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
        <p className="kicker">Lanches · alunos inscritos por local, dia e turno{selLabel ? ` · ${selLabel}` : ''}</p>
        <h1>{D.event.name}<br /><span>{D.event.edition}</span></h1>
        <p className="sub">{selLabel ? `${selLabel} · ` : `${D.event.place} · `}{D.event.datesLabel}</p>
        <div className="kpis">
          <div className="kpi main"><small>Lanches previstos</small><b>{b.total.lanches}</b><em>{margem ? `com margem de ${margem}%: ${b.total.comMargem}` : 'um por aluno, por turno'}</em></div>
          {b.shifts.map((s) => <div className="kpi" key={s}><small>{shiftLabel(s)} <span className="muted">{shiftWindow(s)}</span></small><b>{b.byShift[s].lanches}</b><em>{b.byShift[s].turmas} turma{b.byShift[s].turmas > 1 ? 's' : ''}{b.byShift[s].estimadas ? ` · ${b.byShift[s].estimadas} estimada(s)` : ''}</em></div>)}
          <div className="kpi"><small>Dias · locais</small><b>{b.days.length} · {b.venues.length}</b><em>{b.total.turmas} turmas-turno</em></div>
          <div className="kpi"><small>Inscritos no painel</small><b>{comDado} <span className="muted">/ {b.total.turmas}</span></b><em>{b.total.estimadas ? `${b.total.estimadas} turma(s) pelas vagas (*)` : 'todas as turmas com dado'}</em></div>
          <div className="kpi"><small>Painel ESCON</small><b style={{ fontSize: '1rem' }}>{enr ? `${T.fmtDate(T.partsOf(new Date(enr.updatedAt)).date, 'wd')} ${T.partsOf(new Date(enr.updatedAt)).time}` : 'não lido'}</b><em>{enr ? inscritosSourceLabel(enr).split(' · ').slice(1).join(' · ') : 'quantidades pelas vagas'}</em></div>
        </div>
        {!enr ? <p className="warn-box"><Icon name="alert" /> Ainda sem leitura do painel de inscrições neste aparelho: as quantidades abaixo são as <b>vagas</b> de cada turma (teto). Abra <a href="resumo-cursos.html">Cursos e inscritos</a> para carregar o painel e volte aqui.</p> : null}
        <p className="version">Gerado em {today} · inscrições do painel ESCON ({inscritosSourceLabel(enr)}) · www.tce.ap.gov.br/tce-na-comunidade/lanches.html</p>
      </section>

      <section className="sec" id="quadro">
        <h2><span className="n">1.</span> Quadro de entregas por local, dia e turno<span className="h2sub">quantidade de lanches = alunos inscritos em aula naquele turno{margem ? ` · margem de ${margem}% arredondada para cima` : ''}</span></h2>
        <table className="qd">
          <thead><tr><th>Local</th><th>Dia</th>{b.shifts.map((s) => <th key={s} className="n">{shiftLabel(s)}<small>{shiftWindow(s)}</small></th>)}<th className="n">Total do dia</th></tr></thead>
          <tbody>
            {b.venues.map((v) => {
              const rows = b.days.filter((d) => b.byVenueDay[`${v}|${d}`]);
              return rows.map((d, k) => { const vd = b.byVenueDay[`${v}|${d}`]; return (
                <tr key={`${v}|${d}`} className={k === rows.length - 1 ? 'last' : ''}>
                  {k === 0 ? <td rowSpan={rows.length} className="venue-cell"><b>{D.venues[v].name}</b>{D.venues[v].city !== D.venues[v].name ? <span className="muted tiny">{D.venues[v].city}</span> : null}<span className="vt">Total: <b>{b.byVenue[v].lanches}</b>{margem ? <small className="mg">+{margem}% = {b.byVenue[v].comMargem}</small> : null}</span></td> : null}
                  <td className="day-cell">{cap(T.fmtDate(d, 'wdlong'))}</td>
                  {b.shifts.map((s) => <td key={s} className="n"><Qty t={vd.shifts[s]} /></td>)}
                  <td className="n tot-cell"><Qty t={vd} strong /></td>
                </tr>); });
            })}
          </tbody>
          <tfoot><tr className="tot"><td colSpan={2}>Total geral{selLabel ? ` · ${selLabel}` : ''}</td>{b.shifts.map((s) => <td key={s} className="n"><Qty t={b.byShift[s]} /></td>)}<td className="n tot-cell"><Qty t={b.total} strong /></td></tr></tfoot>
        </table>
        {b.total.estimadas ? <p className="tiny muted">* Inclui turma(s) ainda sem inscritos no painel, contadas pelas vagas (teto); o número cai quando o painel for lido.</p> : null}
      </section>

      {b.venues.length > 1 ? (
        <section className="sec" id="dias">
          <h2><span className="n">2.</span> Produção por dia<span className="h2sub">todos os locais somados · para planejar a produção</span></h2>
          <table className="qd pd">
            <thead><tr><th>Dia</th>{b.shifts.map((s) => <th key={s} className="n">{shiftLabel(s)}<small>{shiftWindow(s)}</small></th>)}<th className="n">Total do dia</th><th>Locais</th></tr></thead>
            <tbody>{b.days.map((d) => { const t = b.byDay[d]; return <tr key={d}><td className="day-cell">{cap(T.fmtDate(d, 'wdlong'))}</td>{b.shifts.map((s) => <td key={s} className="n"><Qty t={t.shifts[s]} /></td>)}<td className="n tot-cell"><Qty t={t} strong /></td><td className="tiny">{b.venues.filter((v) => b.byVenueDay[`${v}|${d}`]).map((v) => `${D.venues[v].short} ${b.byVenueDay[`${v}|${d}`].lanches}`).join(' · ')}</td></tr>; })}</tbody>
            <tfoot><tr className="tot"><td>Total geral</td>{b.shifts.map((s) => <td key={s} className="n"><Qty t={b.byShift[s]} /></td>)}<td className="n tot-cell"><Qty t={b.total} strong /></td><td /></tr></tfoot>
          </table>
        </section>
      ) : null}

      <section className="sec" id="detalhe">
        <h2><span className="n">{b.venues.length > 1 ? 3 : 2}.</span> Detalhe das turmas<span className="h2sub">o que compõe cada quantidade: turno, horário, curso, sala e inscritos</span></h2>
        {b.venues.map((v) => b.days.filter((d) => b.byVenueDay[`${v}|${d}`]).map((d) => { const vd = b.byVenueDay[`${v}|${d}`]; return (
          <div className="venue" key={`${v}|${d}`}>
            <h3>{D.venues[v].name} · {cap(T.fmtDate(d, 'wdlong'))} <small>{b.shifts.filter((s) => vd.shifts[s].turmas).map((s) => `${shiftLabel(s).toLowerCase()} ${vd.shifts[s].lanches}`).join(' · ')} · total {vd.lanches}</small></h3>
            <table className="dt">
              <thead><tr><th className="c-hora">Horário</th><th className="c-id">Cód.</th><th>Curso</th><th className="c-sala">Sala</th><th className="n c-num">Inscritos</th><th className="n c-num">Vagas</th><th className="n c-num">Lanches</th></tr></thead>
              <tbody>
                {b.shifts.filter((s) => vd.shifts[s].turmas).map((s) => { const cell = b.cellOf(v, d, s); return [
                  <tr className="shift" key={`${s}-h`}><td colSpan={6}>{shiftLabel(s)} · {shiftWindow(s)} · primeira aula {T.fmtTime(cell.start)}{cell.estimadas ? ` · ${cell.estimadas} turma(s) pelas vagas` : ''}</td><td className="n"><b>{cell.lanches}</b>{margem ? <small className="mg">+{margem}% = {cell.comMargem}</small> : null}</td></tr>,
                  ...cell.rows.map((r) => <tr key={r.key + r.sess.time}><td>{T.fmtTime(r.sess.time)}–{T.fmtTime(T.sessionEnd(r.sess))}</td><td className="num">{r.course.id}</td><td><b>{T.title(r.course)}</b>{r.sess.label ? <span className="muted tiny"> · {r.sess.label}</span> : null}{r.course.sessions.length > 1 ? <span className="muted tiny"> · {r.course.sessions.length} encontros</span> : null}</td><td>{r.sess.room || <span className="muted">sem sala</span>}</td><td className="n">{r.i.has ? r.i.inscritos : <span className="nd">sem dado</span>}</td><td className="n">{r.i.vagas}</td><td className="n"><b>{r.lanches}</b>{r.estimado ? <sup className="est">*</sup> : null}</td></tr>),
                ]; })}
              </tbody>
              <tfoot><tr className="tot"><td colSpan={6}>Total · {D.venues[v].short}, {T.fmtDate(d, 'wd')}</td><td className="n"><Qty t={vd} /></td></tr></tfoot>
            </table>
          </div>
        ); }))}
      </section>

      <section className="sec" id="criterios">
        <h3>Critérios</h3>
        <ul className="tiny muted">
          <li><b>Um lanche por aluno em cada turno</b> em que ele tem aula: quem estuda de manhã e à tarde no mesmo dia conta duas vezes; cursos de vários dias contam em cada dia.</li>
          <li>Quantidade = <b>inscritos</b> na última leitura do painel da ESCON. Turma ainda sem dado entra com as <b>vagas</b> (teto) e aparece com <b>*</b>; a página se atualiza sozinha a cada abertura.</li>
          <li>Inscrições continuam abertas até o início de cada curso: combinar com a fornecedora a data e hora de corte de cada entrega (ex.: véspera, 17h).</li>
          <li>Turnos: manhã {shiftWindow('manha')}, tarde {shiftWindow('tarde')}, noite {shiftWindow('noite')}. A coluna "primeira aula" no detalhe mostra quando a entrega precisa estar no local.</li>
          <li>Margem de segurança: acrescente <code>?margem=10</code> ao endereço para ver as quantidades com 10% a mais (arredondado para cima). Filtros: <code>?local=manga</code>, <code>?dia=04</code>.</li>
          <li>Só alunos dos cursos; não inclui equipe, instrutores nem o público dos serviços.</li>
        </ul>
      </section>
    </>
  );
}
