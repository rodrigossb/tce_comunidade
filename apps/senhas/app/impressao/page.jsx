// Módulo de impressão (/tce-senhas/impressao?local=jn&dia=AAAA-MM-DD&servicos=consulta,pilar-1&previsao=com|todas
// &inativas=1&formato=senhas|lista). Página renderizada no servidor a partir do banco local (db.state): precisa do cookie do
// PIN de um perfil com painel (administração ou equipe). Formato "senhas" (padrão): as senhas previstas de cada sala para
// recortar, no modelo do evento — A4 retrato, 24 por folha (4 × 6) com linhas de corte tracejadas; cada senha traz o nome
// do atendimento em caixa alta, o número grande ("01"…"50") e a legenda "SENHA DE ATENDIMENTO"; as prioritárias levam tarja
// preta "PRIORIDADE", borda cheia e numeração "P01"…; cada sala começa em folha nova. Formato "lista": tabela por serviço.
import { TCE as T } from '@tce/core';
import * as db from '@/lib/db';
import { currentRole } from '@/lib/auth';
import { can, ROLE_LABEL } from '@/lib/roles';
import { parseParams, previsao, paramsOf, PREVISAO, FORMATOS, pagesOf, ticketsOf } from '@/lib/impressao';
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
  const title = `${f.formato === 'lista' ? 'Previsão de senhas' : 'Senhas para recortar'} · ${venue.short || venue.name} · ${T.fmtDate(f.day, 'wdlong')}`;
  const nPages = r ? r.groups.reduce((a, g) => a + g.places.reduce((b, p) => b + pagesOf(p).length, 0), 0) : 0;
  const sum = [f.svcs.length ? `serviços: ${f.svcs.map((id) => (D.services.find((s) => s.id === id) || { short: id }).short).join(', ')}` : 'todos os serviços', f.previsao === 'todas' ? 'todas as salas' : 'só salas com previsão', f.inativas ? 'inclui desativadas' : ''].filter(Boolean).join(' · ');
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
          <label>Formato
            <select name="formato" id="f-formato" defaultValue={f.formato}>{FORMATOS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <label className="chk"><input type="checkbox" name="inativas" value="1" id="f-inativas" defaultChecked={f.inativas} /> incluir salas desativadas</label>
        </div>
        <fieldset className="pr-svcs">
          <legend>Serviços <small>(nenhum marcado = todos)</small></legend>
          {(r ? r.services : D.services).map((s) => <label key={s.id} style={{ '--c': s.color }}><input type="checkbox" name="svc" value={s.id} id={`f-svc-${s.id}`} defaultChecked={f.svcs.includes(s.id)} /> {s.short}</label>)}
        </fieldset>
        <PrintBar />
      </form>

      {f.formato === 'senhas' && r && r.groups.length ? (
        <div className="tk-wrap">
          <p className="pr-lead tk-screen">{r.total.total} senhas em {nPages} {nPages === 1 ? 'folha' : 'folhas'} A4 ({r.total.n} comuns e {r.total.p} prioritárias, {r.total.count} {r.total.count === 1 ? 'sala' : 'salas'}; cada sala começa em folha nova). Recorte pelas linhas tracejadas. Filtro: {sum}.</p>
          {r.groups.map((g) => g.places.map((p) => pagesOf(p).map((pg, i, all) => (
            <div key={`${p.id}-${i}`} className="tk-page">
              <div className="tk-screen tk-cap"><b>{p.name}</b> · {KIND[p.kind] || 'Ambiente'} {p.num || '—'} · {g.service.title} · folha {i + 1} de {all.length} · {ticketsOf(p).length} senhas</div>
              <div className="tk-grid">
                {pg.map((t) => (
                  <div key={t.label} className={`tk ${t.prio ? 'prio' : ''}`}>
                    <div className="tk-in">
                      {t.prio ? <span className="tk-bar">PRIORIDADE</span> : null}
                      <span className="tk-name">{p.name}</span>
                      <span className="tk-num">{t.label}</span>
                      <span className="tk-foot">{p.num ? `${KIND[p.kind] || 'Ambiente'} ${p.num} · ` : ''}SENHA DE ATENDIMENTO</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))))}
        </div>
      ) : null}

      {f.formato === 'lista' || !r || !r.groups.length ? <header className="pr-head">
        <div className="pr-brand"><img src={`${BP}/img/tce-mark.png`} alt="" width="36" height="36" /><div><small>TCE na Comunidade · 9ª edição · controle de senhas</small><h1>{title}</h1></div></div>
        <p className="pr-lead">{venue.name}. Senhas <b>previstas</b> por sala para o dia (campo "senhas por dia" da triagem): comuns (N) e prioritárias (P) são séries separadas. Não são senhas entregues nem chamadas. Filtro: {sum}.</p>
      </header> : null}

      {error ? <p className="pr-empty">Não foi possível ler o banco: {error}</p> : null}
      {r && !r.groups.length ? <p className="pr-empty">Nenhuma sala com previsão de senhas para {T.fmtDate(f.day, 'wdlong')} em {venue.short || venue.name} com esses filtros. Troque para "Todas as salas" para ver a planta inteira com o padrão.</p> : null}

      {f.formato === 'lista' && r && r.groups.length ? (
        <>
          <div className="pr-totals">
            <div><small>Salas com previsão</small><b>{r.total.count}</b></div>
            <div className="n"><small>Comuns previstas (N)</small><b>{r.total.n}</b></div>
            <div className="p"><small>Prioritárias previstas (P)</small><b>{r.total.p}</b></div>
            <div><small>Total previsto</small><b>{r.total.total}</b></div>
          </div>
          {r.groups.map((g) => (
            <section key={g.service.id} className="pr-sec" style={{ '--c': g.service.color }}>
              <h2><i />{g.service.title}<span>{g.sub.count} {g.sub.count === 1 ? 'sala' : 'salas'} · {g.sub.n} N · {g.sub.p} P</span></h2>
              <table>
                <thead><tr><th>Sala</th><th>Atendimento</th><th>Ordem</th><th className="num">Previstas N</th><th className="num">Previstas P</th><th className="num">Total previsto</th></tr></thead>
                <tbody>
                  {g.places.map((p) => (
                    <tr key={p.id} className={p.disabled ? 'off' : ''}>
                      <td><span className="pr-room"><small>{KIND[p.kind] || 'Ambiente'}</small><b>{p.num || '—'}</b></span></td>
                      <td className="who"><b>{p.name}</b><small>{[p.extra ? 'criado na triagem' : 'sala da planta', p.disabled ? 'desativada' : '', p.zero ? 'previsão zero' : '', p.default ? 'sem previsão · padrão do app' : '', p.mode === 'contagem' ? 'só contagem' : ''].filter(Boolean).join(' · ')}</small></td>
                      <td className="ord">{p.pattern}</td>
                      <td className="num n">{p.n}</td>
                      <td className="num p">{p.p}</td>
                      <td className="num t">{p.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Subtotal previsto · {g.service.short}</td><td className="num n">{g.sub.n}</td><td className="num p">{g.sub.p}</td><td className="num t">{g.sub.total}</td></tr></tfoot>
              </table>
            </section>
          ))}
          <table className="pr-total">
            <tbody><tr><td>Total previsto · {venue.name} · {T.fmtDate(f.day, 'wdlong')}</td><td className="num n">{r.total.n} N</td><td className="num p">{r.total.p} P</td><td className="num t">{r.total.total}</td></tr></tbody>
          </table>
        </>
      ) : null}
      <p className={`pr-foot ${f.formato === 'senhas' ? 'tk-screen' : ''}`}>Emitido em {T.fmtDate(T.now().date, 'wdlong')} às {T.now().time} por {ROLE_LABEL[role] || role} · fonte: senhas por dia da triagem (fila_cfg do dia), não inclui entregues. Link: {`${BP}/impressao?${paramsOf(f)}`}</p>
    </main>
  );
}
