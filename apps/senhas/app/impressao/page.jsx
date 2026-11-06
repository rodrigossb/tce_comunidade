// Módulo de impressão (/tce-senhas/impressao?local=jn&dia=AAAA-MM-DD&servicos=consulta,pilar-1&salas=jn-r09,jn-x8
// &serie=np|n|p&de=25&ate=48&previsao=com|todas&inativas=1&formato=senhas|lista). Filtros em quatro passos: local/dia/formato,
// categorias (serviços/pilares), atendimentos (salas, agrupadas por categoria) e faixa de senhas (série e intervalo de números,
// com atalhos de uma folha). Página renderizada no servidor a partir do banco local (db.state): precisa do cookie do
// PIN de um perfil com painel (administração ou equipe). Formato "senhas" (padrão): as senhas previstas de cada sala para
// recortar, no modelo do evento — A4 retrato, 24 por folha (4 × 6) com linhas de corte tracejadas; cada senha traz o nome
// do atendimento em caixa alta, o número grande ("01"…"50") e a sala em destaque ("SALA 08"); as prioritárias levam tarja
// preta "PRIORIDADE", borda cheia e numeração "P01"…; cada sala começa em folha nova. Formato "lista": tabela por serviço.
import { TCE as T } from '@tce/core';
import * as db from '@/lib/db';
import { currentRole } from '@/lib/auth';
import { can, ROLE_LABEL } from '@/lib/roles';
import { parseParams, previsao, paramsOf, rangeText, PREVISAO, FORMATOS, SERIES, PRESETS, pagesOf, ticketsOf } from '@/lib/impressao';
import PrintForm from '@/components/print/PrintForm';
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
  const withTickets = (g) => g.places.filter((p) => p.mode !== 'contagem'); // só contagem: a quantidade lançada já é o atendimento, não há senhas para recortar
  const range = { serie: f.serie, de: f.de, ate: f.ate }; const rangeOn = f.serie !== 'np' || !!f.de || !!f.ate;
  const tk = (p) => ticketsOf(p, range);
  // senhas que de fato saem no papel (depois da faixa): salas sem nenhuma senha na faixa não geram folha
  const printable = r ? r.groups.map((g) => ({ g, places: withTickets(g).filter((p) => tk(p).length) })).filter((x) => x.places.length) : [];
  const out = printable.reduce((a, x) => { for (const p of x.places) { const t = tk(p); a.total += t.length; a.p += t.filter((y) => y.prio).length; a.rooms += 1; a.pages += pagesOf(p, undefined, range).length; } return a; }, { total: 0, p: 0, rooms: 0, pages: 0 });
  const nPages = out.pages;
  const nCount = r ? r.groups.reduce((a, g) => a + g.places.filter((p) => p.mode === 'contagem').length, 0) : 0;
  const roomName = (id) => { const x = r && r.rooms.find((y) => y.id === id); return x ? `${x.name} (${(KIND[x.kind] || 'ambiente').toLowerCase()} ${x.num || '—'})` : id; };
  const sum = [
    f.svcs.length ? `categorias: ${f.svcs.map((id) => (D.services.find((s) => s.id === id) || { short: id }).short).join(', ')}` : 'todas as categorias',
    f.salas.length ? `atendimentos: ${f.salas.map(roomName).join(', ')}` : 'todos os atendimentos',
    rangeOn ? `faixa: ${rangeText(f)}` : 'todas as senhas',
    f.previsao === 'todas' ? 'todas as salas' : 'só salas com previsão', f.inativas ? 'inclui desativadas' : '',
  ].filter(Boolean).join(' · ');
  const summary = f.formato === 'senhas'
    ? (out.total ? `${out.total} senhas · ${nPages} ${nPages === 1 ? 'folha' : 'folhas'} A4 · ${out.rooms} ${out.rooms === 1 ? 'sala' : 'salas'}` : 'Nenhuma senha com esses filtros')
    : (r ? `${r.total.count} ${r.total.count === 1 ? 'sala' : 'salas'} · ${r.total.total} senhas previstas` : '');
  const roomsBySvc = r ? r.services.map((s) => ({ s, list: r.rooms.filter((x) => x.service_id === s.id) })).filter((x) => x.list.length) : [];
  return (
    <main className="pr">
      <PrintForm summary={summary} clearHref={`${BP}/impressao?local=${f.venue}&dia=${f.day}${f.formato === 'lista' ? '&formato=lista' : ''}`}>
        <fieldset className="pr-fs">
          <legend><span className="pr-n">1</span>Local, dia e formato</legend>
          <div className="pr-row">
            <label>Local
              <select name="local" id="f-local" defaultValue={f.venue}>{Object.keys(D.maps || {}).map((v) => <option key={v} value={v}>{D.venues[v] ? D.venues[v].name : v}</option>)}</select>
            </label>
            <label>Dia
              <select name="dia" id="f-dia" defaultValue={f.day}>{days.map((d) => <option key={d} value={d}>{T.fmtDate(d, 'wdlong')}{d === T.now().date ? ' · hoje' : ''}</option>)}</select>
            </label>
            <label>Formato
              <select name="formato" id="f-formato" defaultValue={f.formato}>{FORMATOS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
            <label>Salas
              <select name="previsao" id="f-previsao" defaultValue={f.previsao}>{PREVISAO.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
            <label className="chk"><input type="checkbox" name="inativas" value="1" id="f-inativas" defaultChecked={f.inativas} /> incluir salas desativadas</label>
          </div>
        </fieldset>
        <fieldset className="pr-fs">
          <legend><span className="pr-n">2</span>Categorias de serviço <small>nenhuma marcada = todas</small></legend>
          <div className="pr-chips">
            {(r ? r.services : D.services).map((s) => <label key={s.id} className="pr-chip" style={{ '--c': s.color }}><input type="checkbox" name="svc" value={s.id} id={`f-svc-${s.id}`} defaultChecked={f.svcs.includes(s.id)} /> {s.short}</label>)}
          </div>
        </fieldset>
        <fieldset className="pr-fs">
          <legend><span className="pr-n">3</span>Atendimentos (salas) <small>nenhum marcado = todos da categoria; um atendimento marcado entra mesmo sem previsão</small></legend>
          {roomsBySvc.length ? <div className="pr-rooms" id="f-rooms">
            {roomsBySvc.map(({ s, list }) => (
              <div key={s.id} className="pr-rgroup" data-svc={s.id} style={{ '--c': s.color }}>
                <span className="pr-rgroup-h"><i />{s.short}</span>
                {list.map((x) => (
                  <label key={x.id} className={`pr-chip room ${x.disabled ? 'off' : ''}`} title={x.disabled ? 'Sala desativada na triagem neste dia' : x.has ? `${x.n} comuns e ${x.p} prioritárias previstas` : 'Sem previsão de senhas lançada na triagem'}>
                    <input type="checkbox" name="sala" value={x.id} id={`f-sala-${x.id}`} defaultChecked={f.salas.includes(x.id)} />
                    <b>{x.name}</b>
                    <small>{KIND[x.kind] || 'Ambiente'} {x.num || '—'}{x.disabled ? ' · desativada' : x.has ? ` · ${x.n} N + ${x.p} P` : ' · sem previsão'}</small>
                  </label>
                ))}
              </div>
            ))}
            <p className="pr-hint pr-rooms-none" hidden>Nenhum atendimento nas categorias marcadas.</p>
          </div> : <p className="pr-hint">Sem salas neste local e dia.</p>}
        </fieldset>
        <fieldset className="pr-fs">
          <legend><span className="pr-n">4</span>Faixa de senhas <small>só nas senhas para recortar; em branco = todas</small></legend>
          <div className="pr-range">
            <div className="pr-seg" role="radiogroup" aria-label="Série">
              {SERIES.map((o) => <label key={o.id}><input type="radio" name="serie" value={o.id} id={`f-serie-${o.id}`} defaultChecked={f.serie === o.id} /><span>{o.label}</span></label>)}
            </div>
            <div className="pr-nums">
              <label>do nº <input type="number" name="de" id="f-de" min="1" step="1" inputMode="numeric" placeholder="1" defaultValue={f.de || ''} /></label>
              <label>até o nº <input type="number" name="ate" id="f-ate" min="1" step="1" inputMode="numeric" placeholder="último" defaultValue={f.ate || ''} /></label>
              <span className="pr-presets" aria-label="Atalhos: uma folha">
                {PRESETS.map((x) => <button key={x.folha} type="button" className={`btn btn-ghost sm ${f.de === x.de && f.ate === x.ate ? 'on' : ''}`} data-de={x.de} data-ate={x.ate} title={`Só a ${x.folha}ª folha de cada sala (${x.label})`}>{x.label}<small>{x.folha}ª folha</small></button>)}
                <button type="button" className={`btn btn-ghost sm ${!f.de && !f.ate ? 'on' : ''}`} data-de="" data-ate="" title="Sem limite de números">Todas</button>
              </span>
            </div>
            <p className="pr-hint">Os números valem dentro de cada série (comuns 01, 02… e prioritárias P01, P02…). Exemplo: para reimprimir só a segunda metade das comuns de uma sala, marque a sala no passo 3, "Só comuns" e do nº 51 até o 100.</p>
          </div>
        </fieldset>
      </PrintForm>

      {f.formato === 'senhas' && printable.length ? (
        <div className="tk-wrap">
          <p className="pr-lead tk-screen">{out.total} senhas em {nPages} {nPages === 1 ? 'folha' : 'folhas'} A4 ({out.total - out.p} comuns e {out.p} prioritárias, {out.rooms} {out.rooms === 1 ? 'sala' : 'salas'}; cada sala começa em folha nova). Recorte pelas linhas tracejadas.{nCount ? ` ${nCount} ${nCount === 1 ? 'sala em só contagem não tem senhas' : 'salas em só contagem não têm senhas'} (a quantidade lançada na triagem já é o atendimento realizado).` : ''} Filtro: {sum}.</p>
          {printable.map(({ g, places }) => places.map((p) => pagesOf(p, undefined, range).map((pg, i, all) => (
            <div key={`${p.id}-${i}`} className="tk-page">
              <div className="tk-screen tk-cap"><b>{p.name}</b> · {KIND[p.kind] || 'Ambiente'} {p.num || '—'} · {g.service.title} · folha {i + 1} de {all.length} · {tk(p).length} senhas{rangeOn ? ` (${rangeText(f)})` : ''}</div>
              <div className="tk-grid">
                {pg.map((t) => (
                  <div key={t.label} className={`tk ${t.prio ? 'prio' : ''}`}>
                    <div className="tk-in">
                      {t.prio ? <span className="tk-bar">PRIORIDADE</span> : null}
                      <span className="tk-name">{p.name}</span>
                      <span className="tk-num">{t.label}</span>
                      {Number(p.num) > 0 ? <span className="tk-room">{KIND[p.kind] || 'Ambiente'} {p.num}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))))}
        </div>
      ) : null}

      {f.formato === 'lista' || !r || !printable.length ? <header className="pr-head">
        <div className="pr-brand"><img src={`${BP}/img/tce-mark.png`} alt="" width="36" height="36" /><div><small>TCE na Comunidade · 9ª edição · controle de senhas</small><h1>{title}</h1></div></div>
        <p className="pr-lead">{venue.name}. Senhas <b>previstas</b> por sala para o dia (campo "senhas por dia" da triagem): comuns (N) e prioritárias (P) são séries separadas. Não são senhas entregues nem chamadas. Filtro: {sum}.</p>
      </header> : null}

      {error ? <p className="pr-empty">Não foi possível ler o banco: {error}</p> : null}
      {r && !r.groups.length ? <p className="pr-empty">Nenhuma sala com previsão de senhas para {T.fmtDate(f.day, 'wdlong')} em {venue.short || venue.name} com esses filtros. Troque para "Todas as salas" para ver a planta inteira com o padrão.</p> : null}
      {f.formato === 'senhas' && r && r.groups.length && !printable.length ? <p className="pr-empty">Nenhuma senha na faixa escolhida ({rangeText(f) || 'todas'}) para as salas filtradas: as salas selecionadas têm {r.total.n} comuns e {r.total.p} prioritárias previstas. Ajuste a faixa no passo 4 ou clique em "Todas".</p> : null}

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
