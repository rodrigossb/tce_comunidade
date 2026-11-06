// Módulo de impressão: previsão de senhas por sala para um dia/local (/tce-senhas/impressao?local=jn&dia=AAAA-MM-DD
// &servicos=consulta,pilar-1&previsao=com|todas&inativas=1). Página renderizada no servidor a partir do banco local
// (db.state): precisa do cookie do PIN de um perfil com painel (administração ou equipe). Imprime limpo (@media print).
import { TCE as T } from '@tce/core';
import * as db from '@/lib/db';
import { currentRole } from '@/lib/auth';
import { can, ROLE_LABEL } from '@/lib/roles';
import { parseParams, previsao, paramsOf, PREVISAO } from '@/lib/impressao';
import PrintBar from '@/components/print/PrintBar';
import '@/components/print/print.css';

export const dynamic = 'force-dynamic';
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const D = T.D;
const KIND = { sala: 'Sala', tenda: 'Tenda', area: 'Ambiente' };
export const metadata = { title: 'Previsão de senhas · TCE na Comunidade', robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
  const sp = (await searchParams) || {};
  const role = await currentRole();
  if (!can(role, 'painel')) {
    return (
      <main className="pr">
        <h1>Previsão de senhas</h1>
        <p className="pr-lead">Esta página usa o acesso do app de atendimento. Entre com o PIN da <b>administração</b> ou da <b>equipe</b> em <a href={`${BP}/`}>{BP || '/'}</a> e volte aqui.</p>
      </main>
    );
  }
  const f = parseParams(sp, T.now().date);
  let state; let error = null;
  try { state = db.state(f.day, f.venue); } catch (e) { error = e.message || 'erro'; }
  const r = state ? previsao(state, f) : null;
  const venue = D.venues[f.venue] || { name: f.venue, short: f.venue };
  const days = T.eventDays(); if (!days.includes(f.day)) days.push(f.day); days.sort();
  const title = `Previsão de senhas · ${venue.short || venue.name} · ${T.fmtDate(f.day, 'wdlong')}`;
  const sum = [f.svcs.length ? `serviços: ${f.svcs.map((id) => (D.services.find((s) => s.id === id) || { short: id }).short).join(', ')}` : 'todos os serviços', f.previsao === 'todas' ? 'todas as salas' : 'só com previsão lançada', f.inativas ? 'inclui desativadas' : ''].filter(Boolean).join(' · ');
  return (
    <main className="pr">
      <form method="get" className="pr-filters" id="filtros">
        <div className="pr-row">
          <label>Local
            <select name="local" id="f-local" defaultValue={f.venue}>{Object.keys(D.maps || {}).map((v) => <option key={v} value={v}>{D.venues[v] ? D.venues[v].name : v}</option>)}</select>
          </label>
          <label>Dia
            <select name="dia" id="f-dia" defaultValue={f.day}>{days.map((d) => <option key={d} value={d}>{T.fmtDate(d, 'wdlong')}{d === T.now().date ? ' · hoje' : ''}</option>)}</select>
          </label>
          <label>Previsão
            <select name="previsao" id="f-previsao" defaultValue={f.previsao}>{PREVISAO.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <label className="chk"><input type="checkbox" name="inativas" value="1" id="f-inativas" defaultChecked={f.inativas} /> incluir salas desativadas</label>
        </div>
        <fieldset className="pr-svcs">
          <legend>Serviços <small>(nenhum marcado = todos)</small></legend>
          {(r ? r.services : D.services).map((s) => <label key={s.id} style={{ '--c': s.color }}><input type="checkbox" name="svc" value={s.id} id={`f-svc-${s.id}`} defaultChecked={f.svcs.includes(s.id)} /> {s.short}</label>)}
        </fieldset>
        <PrintBar />
      </form>

      <header className="pr-head">
        <div className="pr-brand"><img src={`${BP}/img/tce-mark.png`} alt="" width="36" height="36" /><div><small>TCE na Comunidade · 9ª edição · controle de senhas</small><h1>{title}</h1></div></div>
        <p className="pr-lead">{venue.name}. Quantidades de senhas lançadas na triagem para o dia: comuns (N) e prioritárias (P) são séries separadas. Filtro: {sum}.</p>
      </header>

      {error ? <p className="pr-empty">Não foi possível ler o banco: {error}</p> : null}
      {r && !r.groups.length ? <p className="pr-empty">Nenhuma sala com previsão lançada para {T.fmtDate(f.day, 'wdlong')} em {venue.short || venue.name} com esses filtros. Troque para "Todas as salas" para ver a planta inteira com o padrão.</p> : null}

      {r && r.groups.length ? (
        <>
          <div className="pr-totals">
            <div><small>Salas</small><b>{r.total.count}</b></div>
            <div className="n"><small>Comuns (N)</small><b>{r.total.n}</b></div>
            <div className="p"><small>Prioritárias (P)</small><b>{r.total.p}</b></div>
            <div><small>Total de senhas</small><b>{r.total.total}</b></div>
          </div>
          {r.groups.map((g) => (
            <section key={g.service.id} className="pr-sec" style={{ '--c': g.service.color }}>
              <h2><i />{g.service.title}<span>{g.sub.count} {g.sub.count === 1 ? 'sala' : 'salas'} · {g.sub.n} N · {g.sub.p} P</span></h2>
              <table>
                <thead><tr><th>Sala</th><th>Atendimento</th><th>Ordem</th><th className="num">Comuns</th><th className="num">Priorit.</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {g.places.map((p) => (
                    <tr key={p.id} className={p.disabled ? 'off' : ''}>
                      <td><span className="pr-room"><small>{KIND[p.kind] || 'Ambiente'}</small><b>{p.num || '—'}</b></span></td>
                      <td className="who"><b>{p.name}</b><small>{[p.extra ? 'criado na triagem' : 'sala da planta', p.disabled ? 'desativada' : '', p.zero ? 'lançado com zero' : '', p.default ? 'sem previsão · padrão' : '', p.mode === 'contagem' ? 'só contagem' : ''].filter(Boolean).join(' · ')}</small></td>
                      <td className="ord">{p.pattern}</td>
                      <td className="num n">{p.n}</td>
                      <td className="num p">{p.p}</td>
                      <td className="num t">{p.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Subtotal · {g.service.short}</td><td className="num n">{g.sub.n}</td><td className="num p">{g.sub.p}</td><td className="num t">{g.sub.total}</td></tr></tfoot>
              </table>
            </section>
          ))}
          <table className="pr-total">
            <tbody><tr><td>Total · {venue.name} · {T.fmtDate(f.day, 'wdlong')}</td><td className="num n">{r.total.n} N</td><td className="num p">{r.total.p} P</td><td className="num t">{r.total.total}</td></tr></tbody>
          </table>
        </>
      ) : null}
      <p className="pr-foot">Emitido em {T.fmtDate(T.now().date, 'wdlong')} às {T.now().time} por {ROLE_LABEL[role] || role} · fonte: banco do app de senhas (fila_cfg do dia). Link: {`${BP}/impressao?${paramsOf(f)}`}</p>
    </main>
  );
}
