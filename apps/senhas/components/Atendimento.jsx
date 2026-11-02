'use client';
/* Atendimento (equipe): controle de senhas por serviço. Três funções: Triagem (quantas senhas entregues),
   Porta da sala (senha chamada aguardando na porta; entrou/não veio chama a próxima automaticamente) e Painel.
   Porte do js/atendimento.js do site antigo para React: mesmas telas e classes CSS; fala com o servidor por
   server actions (app/actions.js). Guarda configuração no aparelho (localStorage) e tem fila offline. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { placeLabel } from '@tce/core/map';
import Icon from './Icon';
import * as A from '@/app/actions';

const D = T.D;
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const LS = 'tce_at';
const VER = '2.0';
const ACTIONS = { setIssued: A.setIssued, call: A.call, setStatus: A.setStatus, endCall: A.endCall };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };
const fmtT = (ms) => T.partsOf(new Date(ms)).time;
const fail = (r) => { if (r && r.error) { const e = new Error(r.error); e.status = r.status; throw e; } return r; };
const I = (name) => <Icon name={name} />;

export default function Atendimento() {
  const [st, setStRaw] = useState(null); // configuração do aparelho (persistida)
  const stRef = useRef(null); stRef.current = st;
  const setSt = useCallback((patch) => setStRaw((prev) => { const n = Object.assign({}, prev, typeof patch === 'function' ? patch(prev) : patch); save(LS, n); return n; }), []);
  const [pinBuf, setPinBuf] = useState('');
  const [data, setData] = useState(null);
  const [queue, setQueue] = useState(null);
  const [sync, setSync] = useState('ok');
  const [pending, setPending] = useState(0);
  const [clock, setClock] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [numAsk, setNumAsk] = useState(null); // { title, value, cb }
  const [numVal, setNumVal] = useState('');
  const [busy, setBusy] = useState(false); // evita toque duplo nos botões de chamada
  const toastT = useRef(null); const issuedT = useRef({}); const numInput = useRef(null);

  // ---------- início ----------
  useEffect(() => {
    const s = load(LS, {}); if (!s.device) s.device = Math.random().toString(36).slice(2, 10);
    delete s.pin; // o PIN agora fica num cookie httpOnly
    save(LS, s); setStRaw(s); setClock(T.now());
    const out = load(LS + '_out', []); setPending(out.length); if (out.length) setSync('off');
    if (s.role) A.whoami().then((r) => { if (r && r.status === 401) setSt({ role: null, msg: 'PIN recusado. Entre de novo.' }); }).catch(() => { /* sem rede: mantém */ });
  }, [setSt]);
  useEffect(() => { const id = setInterval(() => { const c = T.now(); setClock((p) => (p && p.time === c.time && p.date === c.date ? p : c)); }, 1000); return () => clearInterval(id); }, []);

  // ---------- dia e local ----------
  const dayDefault = (c) => (T.serviceDayOf(c.date) || T.nextServiceDay(c.date) || T.serviceDays()[T.serviceDays().length - 1]);
  const ctxOf = (s, c) => { const d = T.serviceDays().find((x) => x.date === s.day) || dayDefault(c || T.now()); return { day: d.date, venue: d.venue, place: d.place }; };
  const svc = (id) => T.serviceById(id);
  const placeName = (id) => { const p = T.placeInfo(id); return p ? (p.kind === 'area' && !p.num ? p.name : `${placeLabel(p)} · ${p.name}`) : id; };
  const queues = () => T.queuesOf(ctxOf(stRef.current).venue);
  const queueById = (id) => { for (const g of queues()) for (const p of g.places) if (p.id === id) return Object.assign({ svc: g.service }, p); return null; };

  // ---------- servidor (server actions) + fila offline ----------
  const toast = (msg, icon) => { setToastMsg({ msg, icon: icon || 'check' }); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 2600); };
  const flush = useCallback(async () => {
    const l = load(LS + '_out', []); if (!l.length) return; const rest = [];
    for (const it of l) { try { const r = await ACTIONS[it.name](...it.args); if (r && r.error && !r.status) rest.push(it); } catch { rest.push(it); } }
    save(LS + '_out', rest); setPending(rest.length); if (!rest.length) setSync('ok');
  }, []);
  const refresh = useCallback(async () => {
    const s = stRef.current; if (!s || !s.role) return;
    const c = ctxOf(s);
    try {
      await flush();
      if (s.mode === 'porta' && s.service && s.place) setQueue(fail(await A.getQueue(c.day, c.venue, s.service, s.place)));
      setData(fail(await (s.mode === 'painel' ? A.getStats(c.day, c.venue) : A.getState(c.day, c.venue))));
      setSync((p) => (p === 'off' ? p : 'ok'));
    } catch (e) { if (e.status === 401) setSt({ role: null, msg: 'PIN recusado. Entre de novo.' }); else if (!e.status) setSync('off'); else setSync('err'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush, setSt]);
  async function post(name, ...args) {
    try { const r = fail(await ACTIONS[name](...args)); setSync('ok'); return r; }
    catch (e) {
      if (e.status) { if (e.status === 401) setSt({ role: null, msg: 'PIN recusado. Entre de novo.' }); toast(e.message, 'alert'); setSync('err'); throw e; }
      const l = load(LS + '_out', []).concat([{ name, args }]); save(LS + '_out', l); setPending(l.length); setSync('off');
      toast('Sem rede: guardado no aparelho, envio depois', 'info'); return null;
    }
  }
  const run = (fn) => fn().catch(() => { /* já avisado por toast */ });
  useEffect(() => { const on = () => refresh(); window.addEventListener('online', on); return () => window.removeEventListener('online', on); }, [refresh]);

  // ---------- tela atual e atualização periódica ----------
  // Primeiro passo depois do PIN: em que local o aparelho está (cada local tem o seu dia de serviços).
  const screen = !st ? 'loading' : !st.role ? 'pin' : !st.local ? 'local' : !st.mode ? 'role' : st.mode === 'triagem' ? 'triagem' : st.mode === 'painel' ? 'painel' : (!st.service || !st.place) ? 'porta-setup' : 'porta';
  const pollKey = st ? `${screen}|${st.day}|${st.service}|${st.place}` : '';
  useEffect(() => {
    if (!['triagem', 'painel', 'porta'].includes(screen)) return undefined;
    const ms = screen === 'painel' ? 15000 : 10000; let t;
    const tick = async () => { await refresh(); t = setTimeout(tick, ms); };
    refresh(); t = setTimeout(tick, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollKey]);

  // ---------- ações ----------
  async function login(buf) {
    if (!buf) return;
    try { const r = fail(await A.login(buf)); setSt({ role: r.role, msg: '' }); setPinBuf(''); }
    catch (e) { setSt({ role: null, msg: e.status === 401 ? 'PIN incorreto. Tente de novo.' : 'Sem conexão com o servidor. Verifique a internet.' }); setPinBuf(''); }
  }
  function key(k) {
    let b = pinBuf;
    if (k === 'clear') b = b.slice(0, -1); else if (k === 'ok') { login(pinBuf); return; } else if (b.length < 6) b += k;
    setPinBuf(b); if (b.length === 6) login(b);
  }
  const cnt = (pid) => { const c = ctxOf(st); const l = st.local && st.local[`${c.day}|${pid}`]; const r = ((data && data.issued) || []).find((x) => x.place_id === pid); return l != null && (!r || l.ts >= r.ts) ? l.count : r ? r.count : 0; };
  function setIssued(id, sid, count) {
    const c = ctxOf(st); count = Math.max(0, Math.min(100000, count)); const device = st.device;
    setSt((prev) => ({ local: Object.assign({}, prev.local, { [`${c.day}|${id}`]: { count, ts: Date.now() } }) }));
    clearTimeout(issuedT.current[id]);
    issuedT.current[id] = setTimeout(() => run(async () => { await post('setIssued', { day: c.day, venue: c.venue, service_id: sid, place_id: id, count, device }); await refresh(); }), 700);
  }
  function askNumber(title, value, cb) { setNumAsk({ title, cb }); setNumVal(String(value)); }
  useEffect(() => { if (numAsk && numInput.current) { numInput.current.focus(); numInput.current.select(); } }, [numAsk]);
  function numKey(k) {
    if (k === 'ok') { const v = Number(numVal); const cb = numAsk && numAsk.cb; setNumAsk(null); if (cb && Number.isInteger(v) && v >= 0) cb(v); }
    else if (k === 'back') setNumVal((v) => v.slice(0, -1));
    else setNumVal((v) => (v === '0' ? '' : v) + k);
  }
  const act = {
    home: () => setSt({ mode: null }),
    logout: () => { run(async () => { await A.logout(); }); setSt({ role: null, local: null, mode: null, place: null, service: null }); setPinBuf(''); },
    day: (day) => { const d = T.serviceDays().find((x) => x.date === day); setSt({ day, local: d ? d.venue : null }); setData(null); setQueue(null); },
    // Local do aparelho = dia de serviços daquele local; escolher outro zera sala/serviço (são de outro local).
    local: (venue) => { const d = T.serviceDays().find((x) => x.venue === venue); if (!d) return; setSt({ local: venue, day: d.date, mode: null, place: null, service: null }); setData(null); setQueue(null); },
    localClear: () => setSt({ local: null, mode: null, place: null, service: null }),
    mode: (mode) => setSt({ mode }),
    placeClear: () => setSt({ place: null, service: null }),
    place: (id, s) => setSt({ place: id, service: s }),
    call: (ticket, status) => { const c = ctxOf(st); setBusy(true); run(async () => { try { await post('call', { day: c.day, venue: c.venue, service_id: st.service, place_id: st.place, ticket, status: status || undefined, device: st.device }); await refresh(); } finally { setBusy(false); } }); },
    callOther: () => askNumber('Qual senha você vai chamar?', (queue && queue.last_ticket != null ? queue.last_ticket + 1 : 1), (v) => { const c = ctxOf(st); run(async () => { await post('call', { day: c.day, venue: c.venue, service_id: st.service, place_id: st.place, ticket: v, device: st.device }); await refresh(); }); }),
    status: (id, status) => { setBusy(true); run(async () => { try { await post('setStatus', id, status); await refresh(); } finally { setBusy(false); } }); },
    // Resultado da senha que estava na porta (entrou/não veio) e, em seguida, chamada automática da próxima,
    // para a próxima pessoa já ficar aguardando na entrada da sala (a TV mostra "chamando").
    resolve: (id, status, nextTicket) => { const c = ctxOf(st); setBusy(true); run(async () => { try { await post('setStatus', id, status); if (nextTicket != null) await post('call', { day: c.day, venue: c.venue, service_id: st.service, place_id: st.place, ticket: nextTicket, device: st.device }); await refresh(); } finally { setBusy(false); } }); },
    end: (id) => run(async () => { await post('endCall', id); await refresh(); }),
    undo: (id) => { if (!confirm('Desfazer a última chamada?')) return; run(async () => { await post('setStatus', id, 'undo'); await refresh(); }); },
  };

  // ---------- telas ----------
  const top = (title, sub, back) => (
    <div className="at-top">
      {back ? <button className="btn btn-ghost" onClick={back}>{I('back')}Voltar</button> : null}
      <div className="where"><span>{title}</span><small>{sub}</small></div>
      <span className={`sync ${sync}`} title="Sincronização"><i></i>{sync === 'ok' ? 'sincronizado' : sync === 'off' ? `${pending} pendente${pending > 1 ? 's' : ''}` : 'erro'}</span>
    </div>
  );
  const dayChips = (c) => T.serviceDays().map((d) => <button key={d.date} className={`chip ${d.date === c.day ? 'on' : ''}`} onClick={() => act.day(d.date)}>{I('calendar')}{T.fmtDate(d.date, 'wd')} · {d.place}</button>);

  function viewPin() {
    return (
      <div className="pin">
        <div className="pin-card"><span className="logo-chip big"><img src={`${BP}/img/tce-mark.png`} alt="" /></span><h1>Atendimento</h1><p>Controle de senhas dos serviços gratuitos.<br />Digite o PIN da equipe para entrar.</p></div>
        <div className="pin-dots">{[0, 1, 2, 3, 4, 5].map((k) => <i key={k} className={k < pinBuf.length ? 'on' : ''} style={k >= 4 && pinBuf.length < 5 ? { display: 'none' } : undefined}></i>)}</div>
        <div className="keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} data-key={n} onClick={() => key(String(n))}>{n}</button>)}
          <button className="soft" data-key="clear" aria-label="Apagar" onClick={() => key('clear')}>{I('back')}</button>
          <button data-key="0" onClick={() => key('0')}>0</button>
          <button className="go" data-key="ok" onClick={() => key('ok')}>Entrar</button>
        </div>
        <p className="tiny muted" id="pin-msg">{st.msg || 'PIN de 4 dígitos (equipe) ou 6 dígitos (gestão).'}</p>
        <p className="tiny muted">{D.event.name} · {D.event.edition} · versão {VER}</p>
      </div>
    );
  }
  function viewLocal() {
    return (
      <>
        {top(`Olá, ${st.role === 'gestor' ? 'gestão' : 'equipe'}`, 'Em que local você está?')}
        <h2 style={{ margin: '.8em 0 .2em' }}>Escolha o local</h2>
        <p className="page-lead">Tudo o que você lançar (senhas entregues e chamadas) vale para o local e o dia de serviços escolhidos aqui.</p>
        <div className="roles">
          {T.serviceDays().map((d) => { const v = D.venues[d.venue]; const today = clock && d.date === clock.date; return (
            <button key={d.date} className="role" style={{ '--c': today ? '#16a34a' : '#1f3b9a' }} data-act="local" data-id={d.venue} onClick={() => act.local(d.venue)}><i>{I('pin')}</i><span><b>{v ? v.name : d.place}</b><small>{d.placeLong && d.placeLong !== d.place ? `${d.placeLong} · ` : ''}{T.fmtDate(d.date, 'wdlong')}{today ? ' · hoje' : ''}</small></span>{I('right')}</button>
          ); })}
        </div>
        <p className="tiny muted">Aparelho {st.device} · <button className="link" data-act="logout" onClick={act.logout}>sair</button></p>
      </>
    );
  }
  function viewRole() {
    const c = ctxOf(st);
    return (
      <>
        {top(`Olá, ${st.role === 'gestor' ? 'gestão' : 'equipe'}`, `${c.place} · ${T.fmtDate(c.day, 'wdlong')}`)}
        <div className="local-line"><span>{I('pin')}<b>{D.venues[c.venue] ? D.venues[c.venue].name : c.place}</b> · {T.fmtDate(c.day, 'wd')}</span><button className="btn btn-ghost sm" data-act="local-clear" onClick={act.localClear}>Trocar local</button></div>
        <h2 style={{ margin: '.8em 0 .2em' }}>O que você vai fazer?</h2>
        <div className="roles">
          <button className="role" style={{ '--c': '#fbbf24' }} data-mode="triagem" onClick={() => act.mode('triagem')}><i>{I('ticket')}</i><span><b>Triagem · entrega de senhas</b><small>Informe quantas senhas de cada serviço já foram entregues</small></span>{I('right')}</button>
          <button className="role" style={{ '--c': '#16a34a' }} data-mode="porta" onClick={() => act.mode('porta')}><i>{I('door')}</i><span><b>Porta da sala · chamada</b><small>Registre a senha chamada e se a pessoa entrou ou não compareceu</small></span>{I('right')}</button>
          <button className="role" style={{ '--c': '#1f3b9a' }} data-mode="painel" onClick={() => act.mode('painel')}><i>{I('layers')}</i><span><b>Painel · acompanhamento</b><small>Senhas entregues, atendidas, faltas e tempo médio por serviço e sala</small></span>{I('right')}</button>
        </div>
        <p className="tiny muted">Aparelho {st.device} · <button className="link" data-act="logout" onClick={act.logout}>sair</button></p>
      </>
    );
  }
  function viewTriagem() {
    const c = ctxOf(st);
    const statOf = (sid, pid) => { const s = data && data.stats.services.find((x) => x.service_id === sid); return s ? s.places.find((p) => p.place_id === pid) : null; };
    return (
      <>
        {top('Triagem · senhas entregues', `${c.place} · ${T.fmtDate(c.day, 'wdlong')}`, act.home)}
        <p className="page-lead">Uma fila por sala/instituição. Toque em <b>+1</b> a cada senha entregue; para lançar de uma vez, toque no número e <b>digite o total já entregue</b>.</p>
        {queues().map((g) => (
          <div key={g.service.id}>
            <h3 className="tri-h" style={{ '--c': g.service.color }}>{I(g.service.icon)}{g.service.title}</h3>
            <div className="tri">
              {g.places.map((p) => { const n = cnt(p.id); const stt = statOf(g.service.id, p.id); return (
                <div key={p.id} className="tri-row" style={{ '--c': g.service.color }}>
                  <span className="ic">{I(p.kind === 'tenda' ? 'tent' : 'door')}</span>
                  <span className="nm"><b>{p.name}</b><small>{placeLabel(p)}{stt ? ` · ${stt.called} chamada${stt.called === 1 ? '' : 's'} · ${stt.served} atendida${stt.served === 1 ? '' : 's'}` : ''}</small></span>
                  <button className="minus" data-id={p.id} aria-label="Menos um" onClick={() => setIssued(p.id, g.service.id, n - 1)}>{I('x')}</button>
                  <button className="cnt" data-id={p.id} aria-label="Digitar o total entregue" onClick={() => askNumber(`${p.name}: total de senhas entregues`, n, (v) => setIssued(p.id, g.service.id, v))}><b>{n}</b><small>{I('sliders')}digitar</small></button>
                  <button className="plus" data-id={p.id} onClick={() => setIssued(p.id, g.service.id, n + 1)}>+1</button>
                </div>
              ); })}
            </div>
          </div>
        ))}
      </>
    );
  }
  function viewPortaSetup() {
    const c = ctxOf(st);
    return (
      <>
        {top('Porta da sala', `Em qual sala/atendimento você está? · ${c.place}`, act.home)}
        {queues().map((g) => (
          <div key={g.service.id}>
            <h3 className="tri-h" style={{ '--c': g.service.color }}>{I(g.service.icon)}{g.service.title}</h3>
            <div className="roles compact">
              {g.places.map((p) => <button key={p.id} className="role" style={{ '--c': g.service.color }} data-act="place" data-id={p.id} onClick={() => act.place(p.id, g.service.id)}><i>{I(p.kind === 'tenda' ? 'tent' : 'door')}</i><span><b>{p.name}</b><small>{placeLabel(p)}</small></span>{I('right')}</button>)}
            </div>
          </div>
        ))}
        <div className="roles compact"><button className="role" style={{ '--c': '#64748b' }} data-act="place" data-id="outro" onClick={() => act.place('outro', 'acolhida')}><i>{I('pin')}</i><span><b>Outro local</b><small>sem sala definida na planta</small></span>{I('right')}</button></div>
      </>
    );
  }
  function viewPorta() {
    const c = ctxOf(st); const s = svc(st.service) || D.services[0]; const qd = queueById(st.place); const calls = (queue && queue.calls) || []; const cur = calls[0] || null;
    const issued = queue && queue.issued ? queue.issued.count : null; const last = queue && queue.last_ticket != null ? queue.last_ticket : (cur ? cur.ticket : 0);
    const next = (last || 0) + 1; const inService = cur && cur.status === 'served' && !cur.ended_at;
    // Quem está em atendimento agora (entrou e não saiu), mesmo que a última chamada seja outra senha na porta.
    const serving = calls.find((x) => x.status === 'served' && !x.ended_at) || null;
    const atDoor = cur && cur.status === 'called' ? cur : null;
    // Depois de entrou/não veio, a próxima senha é chamada SEMPRE (a contagem da triagem pode estar atrasada; se a senha
    // não existir, basta marcar "Não veio" ou "Desfazer").
    const canAuto = true;
    const svcStat = data && data.stats.services.find((x) => x.service_id === s.id);
    const plStat = svcStat ? svcStat.places.find((p) => p.place_id === st.place) : null;
    const called = plStat ? plStat.called : calls.length;
    return (
      <>
        {top(qd ? qd.name : placeName(st.place), `${qd ? placeLabel(qd) + ' · ' : ''}${s.title} · ${c.place}`, act.placeClear)}
        <div className="door">
          {atDoor ? (
            <>
              <div className="door-now door-call"><small>{I('megaphone')}Chamando · próxima a entrar</small><b>{atDoor.ticket ?? '—'}</b>
                <span className="st called">chamada às {fmtT(atDoor.called_at)} · aguardando na porta</span></div>
              <p className="door-hint">A senha <b>{atDoor.ticket ?? '—'}</b>…</p>
              <div className="door-res big"><button className="ok" data-act="resolve" data-status="served" disabled={busy} onClick={() => act.resolve(atDoor.id, 'served', canAuto ? next : null)}>{I('check')}<span>Entrou{canAuto ? <small>chama a senha {next}</small> : null}</span></button><button className="no" data-act="resolve" data-status="absent" disabled={busy} onClick={() => act.resolve(atDoor.id, 'absent', canAuto ? next : null)}>{I('x')}<span>Não veio{canAuto ? <small>chama a senha {next}</small> : null}</span></button></div>
            </>
          ) : (
            <>
              <div className="door-now idle"><small>{cur ? 'Nenhuma senha aguardando na porta' : 'Nenhuma senha chamada ainda'}</small><b>—</b></div>
              <button className="door-next" data-act="call" disabled={busy} onClick={() => act.call(next)}>{I('megaphone')}Chamar a senha {next}</button>
              <p className="door-hint">A chamada aparece na TV e a pessoa vem aguardar na porta. Depois, cada "Entrou" já chama a seguinte.{issued != null && next > issued ? ' (A triagem registrou menos senhas entregues do que isso.)' : ''}</p>
            </>
          )}
          {serving ? (
            <div className="door-serving"><span className="lbl">{I('check')}Em atendimento</span><b>{serving.ticket ?? '—'}</b><small>entrou às {fmtT(serving.status_at)} · há {Math.max(0, Math.round((Date.now() - serving.status_at) / 60000))} min</small><button className="link" data-act="end" onClick={() => act.end(serving.id)}>finalizar</button></div>
          ) : (cur && cur.status !== 'called' ? <div className="door-serving muted"><span className="lbl">{cur.status === 'served' ? I('check') : I('x')}Última</span><b>{cur.ticket ?? '—'}</b><small>{cur.status === 'served' ? `entrou às ${fmtT(cur.status_at)}` : 'não compareceu'}</small></div> : null)}
          <div className="door-tools">
            <button className="btn btn-ghost" data-act="call-other" onClick={act.callOther}>{I('ticket')}Outro número</button>
            {cur ? <button className="btn btn-ghost" data-act="undo" onClick={() => act.undo(cur.id)}>{I('back')}Desfazer</button> : null}
          </div>
          <div className="door-kpi"><div><small>Entregues</small><b>{issued == null ? '—' : issued}</b></div><div><small>Chamadas</small><b>{called}</b></div><div><small>Aguardando</small><b>{issued == null ? '—' : Math.max(0, issued - called)}</b></div></div>
          {calls.length > 1 ? (
            <>
              <h3 style={{ margin: '.4em 0 .2em' }}>Últimas chamadas</h3>
              <ul className="hist">{calls.slice(1, 9).map((x) => <li key={x.id}><b>{x.ticket ?? '—'}</b><span className={`badge ${x.status}`}>{x.status === 'served' ? 'entrou' : x.status === 'absent' ? 'faltou' : 'sem registro'}</span><time>{fmtT(x.called_at)}</time>{x.status === 'called' ? <button className="link" onClick={() => act.status(x.id, 'served')}>entrou</button> : null}</li>)}</ul>
            </>
          ) : null}
        </div>
      </>
    );
  }
  function viewPainel() {
    const c = ctxOf(st); const S = data && data.stats; if (!S) return top('Painel', 'carregando…', act.home);
    const t = S.total; const hours = Object.keys(S.per_hour).map(Number).sort((a, b) => a - b); const max = Math.max(1, ...hours.map((h) => S.per_hour[h]));
    const empty = { issued: 0, called: 0, served: 0, absent: 0, pending_result: 0, not_called: 0, in_service: 0, avg_min: null, est_wait_min: null, current: null };
    return (
      <>
        {top('Painel de acompanhamento', `${c.place} · ${T.fmtDate(c.day, 'wdlong')} · atualiza a cada 15 s`, act.home)}
        <div className="chips">{dayChips(c)}{st.role === 'gestor' ? <a className="chip" href={`${BP}/api/export.csv?day=${c.day}`} download={`atendimentos-${c.day}.csv`} data-act="csv">{I('download')}Exportar CSV</a> : null}</div>
        <div className="kpis">
          <div className="kpi hi"><small>Senhas entregues</small><b>{t.issued}</b><em>triagem</em></div>
          <div className="kpi"><small>Chamadas</small><b>{t.called}</b><em>{t.not_called} aguardando chamada</em></div>
          <div className="kpi"><small>Atendidas</small><b>{t.served}</b><em>{t.in_service} em atendimento agora</em></div>
          <div className="kpi"><small>Não compareceram</small><b>{t.absent}</b><em>{t.absent_rate == null ? '—' : `${t.absent_rate}% das chamadas`}</em></div>
          <div className="kpi"><small>Tempo médio de atendimento</small><b>{t.avg_min == null ? '—' : `${t.avg_min} min`}</b><em>{t.samples} atendimento{t.samples === 1 ? '' : 's'} medido{t.samples === 1 ? '' : 's'}</em></div>
          <div className="kpi"><small>Sem registro de resultado</small><b>{t.pending_result}</b><em>chamadas sem entrou/faltou</em></div>
        </div>
        {hours.length ? (
          <div className="chart"><b style={{ fontFamily: 'var(--font-display)' }}>Chamadas por hora</b>
            <svg viewBox={`0 0 ${Math.max(300, hours.length * 46)} 150`}>{hours.map((h, k) => { const v = S.per_hour[h]; const bh = Math.round((v / max) * 100); return <g key={h}><rect x={k * 46 + 8} y={120 - bh} width="30" height={bh} rx="4" /><text className="lbl" x={k * 46 + 23} y={114 - bh} textAnchor="middle">{v}</text><text x={k * 46 + 23} y="140" textAnchor="middle">{h}h</text></g>; })}</svg>
          </div>
        ) : null}
        <h2 style={{ margin: '1.2em 0 .5em' }}>Por serviço</h2>
        <div className="stack">
          {queues().map((g) => { const s = g.service; const x = S.services.find((y) => y.service_id === s.id) || Object.assign({ places: [] }, empty);
            const rows = g.places.map((p) => Object.assign({ place: p }, x.places.find((y) => y.place_id === p.id) || empty));
            return (
              <div key={s.id} className="svc-stat" style={{ '--c': s.color }}>
                <div className="hd"><i>{I(s.icon)}</i><b>{s.title}</b><small>{x.issued} entregues · {x.served} atendidas{x.avg_min != null ? ` · ${x.avg_min} min` : ''}</small></div>
                <table className="qt"><thead><tr><th>Sala / instituição</th><th>Entr.</th><th>Cham.</th><th>Atend.</th><th>Faltas</th><th>Aguard.</th><th>Média</th><th>Agora</th></tr></thead>
                  <tbody>{rows.map((r) => { const base = Math.max(1, r.issued, r.called); const w = (n) => `${Math.round((100 * n) / base)}%`; const live = r.current && r.current.status === 'served' && r.current.in_service_min != null; return (
                    <tr key={r.place.id}><td><b>{r.place.name}</b><small>{placeLabel(r.place)}</small><div className="bar mini"><i className="s" style={{ width: w(r.served) }}></i><i className="a" style={{ width: w(r.absent) }}></i><i className="p" style={{ width: w(r.pending_result) }}></i></div></td><td>{r.issued}</td><td>{r.called}</td><td>{r.served}</td><td>{r.absent}</td><td>{r.not_called}{r.est_wait_min != null ? <small>~{r.est_wait_min} min</small> : null}</td><td>{r.avg_min == null ? '—' : `${r.avg_min}′`}</td><td>{r.current ? <span className={`badge ${live ? 'served' : r.current.status}`}>{r.current.ticket ?? '—'}</span> : '—'}</td></tr>
                  ); })}</tbody></table>
              </div>
            ); })}
        </div>
      </>
    );
  }
  function viewNum() {
    return (
      <div className="sheet-root" id="sheet-root" onClick={(e) => { if (e.target === e.currentTarget) setNumAsk(null); }}>
        <div className="sheet numpad-sheet">
          <div className="sheet-head"><span className="kicker">{I('ticket')}{numAsk.title}</span><button className="icon-btn" aria-label="Fechar" onClick={() => setNumAsk(null)}>{I('x')}</button></div>
          <div className="sheet-body">
            <input ref={numInput} className="bigin" id="num" type="number" inputMode="numeric" value={numVal} min="0" max="100000" onChange={(e) => setNumVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') numKey('ok'); }} />
            <div className="keypad" style={{ margin: '1em auto' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} data-num={n} onClick={() => numKey(String(n))}>{n}</button>)}
              <button className="soft" data-num="back" aria-label="Apagar" onClick={() => numKey('back')}>{I('back')}</button>
              <button data-num="0" onClick={() => numKey('0')}>0</button>
              <button className="go" data-num="ok" onClick={() => numKey('ok')}>OK</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!st || !clock) return <div id="app" className="app at"><div className="app-loading">Carregando…</div></div>;
  const body = { pin: viewPin, local: viewLocal, role: viewRole, triagem: viewTriagem, painel: viewPainel, 'porta-setup': viewPortaSetup, porta: viewPorta }[screen]();
  return (
    <div id="app" className="app at">
      <header className="app-head">
        <button className="app-brand" data-act="home" onClick={act.home}><span className="logo-chip"><img src={`${BP}/img/tce-mark.png`} alt="" /></span><span><b>Atendimento · {D.event.name}</b><small>{D.event.edition} · controle de senhas</small></span></button>
        <div className="app-head-right">{T.isSimulated() ? <span className="demo-pill">demo</span> : null}<div className="app-clock">{clock.time}<small>{T.fmtDate(clock.date, 'wd')}</small></div></div>
      </header>
      <div className="app-body"><main className="app-main">{body}</main></div>
      <div id="sheet">{numAsk ? viewNum() : null}</div>
      <div id="toast">{toastMsg ? <div className="toast">{I(toastMsg.icon)}{toastMsg.msg}</div> : null}</div>
    </div>
  );
}
