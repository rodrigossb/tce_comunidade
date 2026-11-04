'use client';
/* Atendimento (equipe): controle de senhas por serviço. Três funções: Triagem (quantas senhas entregues),
   Porta da sala (senha chamada aguardando na porta; entrou/não veio chama a próxima automaticamente) e Painel.
   Porte do js/atendimento.js do site antigo para React: mesmas telas e classes CSS; fala com o servidor por
   server actions (app/actions.js). Guarda configuração no aparelho (localStorage) e tem fila offline. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { whyLabel, PATTERNS, DEFAULT_CFG, normalizeCfg, ticketLabel } from '@tce/core/fila';
import { placeLabel } from '@tce/core/map';
import { mergeExtras, withoutDisabled, placeOf } from '@/lib/filas-extra';
import Icon from './Icon';
import * as A from '@/app/actions';

const D = T.D;
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const LS = 'tce_at';
const VER = '2.0';
const ACTIONS = { setIssued: A.setIssued, setQueueConfig: A.setQueueConfig, call: A.call, setStatus: A.setStatus, endCall: A.endCall, recall: A.recall, advance: A.advance, addExtraQueue: A.addExtraQueue, removeExtraQueue: A.removeExtraQueue, setQueueEnabled: A.setQueueEnabled, setCursor: A.setCursor };
const EXTRA_BLANK = { service_id: '', name: '', kind: 'sala', num: '', n_total: String(DEFAULT_CFG.n_total), p_total: String(DEFAULT_CFG.p_total), pattern: DEFAULT_CFG.pattern, issued_n: '', issued_p: '' };
const CFG_KEYS = ['n_prefix', 'p_prefix', 'n_from', 'p_from', 'n_total', 'p_total', 'pattern'];
const cfgForm = (cfg) => { const o = {}; for (const k of CFG_KEYS) o[k] = String((cfg || DEFAULT_CFG)[k] ?? ''); return o; };
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
  const [qmap, setQmap] = useState({}); // porta: fila de cada sala aberta { [place_id]: getQueue() }
  const [sync, setSync] = useState('ok');
  const [pending, setPending] = useState(0);
  const [clock, setClock] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [numAsk, setNumAsk] = useState(null); // { title, cb, kinds?: labels { n, p }, kind: 'n' | 'p' } (kinds → escolhe a série)
  const [numVal, setNumVal] = useState('');
  const [busy, setBusy] = useState(false); // evita toque duplo nos botões de chamada
  const toastT = useRef(null); const issuedT = useRef({}); const numInput = useRef(null);
  const [cfgOpen, setCfgOpen] = useState(null); // triagem: formulário de configuração aberto { place_id, service_id, form } ou { all: true, form }
  const [extraForm, setExtraForm] = useState(null); // triagem: formulário de novo serviço/sala (null = fechado)
  const [adjust, setAdjust] = useState(null); // porta: formulário "ajustar número atual" { place_id, normal, prio } (null = fechado)
  const [adding, setAdding] = useState(false); // porta: escolhendo mais uma sala para a mesma tela
  const extrasRef = useRef([]); extrasRef.current = (data && data.extras) || []; // filas criadas no dia (vêm com o estado)
  const disabledRef = useRef([]); disabledRef.current = (data && data.disabled) || []; // filas desativadas na triagem (ids de ambiente)

  // ---------- início ----------
  useEffect(() => {
    const s = load(LS, {}); if (!s.device) s.device = Math.random().toString(36).slice(2, 10);
    delete s.pin; // o PIN agora fica num cookie httpOnly
    if (!Array.isArray(s.rooms)) s.rooms = s.place && s.service ? [{ id: s.place, service_id: s.service }] : []; // versões antigas: uma sala só
    delete s.place; delete s.service;
    save(LS, s); setStRaw(s); setClock(T.now());
    const out = load(LS + '_out', []); setPending(out.length); if (out.length) setSync('off');
    if (s.role) A.whoami().then((r) => { if (r && r.status === 401) setSt({ role: null, msg: 'PIN recusado. Entre de novo.' }); }).catch(() => { /* sem rede: mantém */ });
  }, [setSt]);
  useEffect(() => { const id = setInterval(() => { const c = T.now(); setClock((p) => (p && p.time === c.time && p.date === c.date ? p : c)); }, 1000); return () => clearInterval(id); }, []);

  // ---------- dia e local ----------
  const dayDefault = (c) => (T.serviceDayOf(c.date) || T.nextServiceDay(c.date) || T.serviceDays()[T.serviceDays().length - 1]);
  const ctxOf = (s, c) => { const d = T.serviceDays().find((x) => x.date === s.day) || dayDefault(c || T.now()); return { day: d.date, venue: d.venue, place: d.place }; };
  const svc = (id) => T.serviceById(id);
  const placeName = (id) => { const p = placeOf(id, extrasRef.current); return p ? (p.kind === 'area' && !p.num ? p.name : `${placeLabel(p)} · ${p.name}`) : id; };
  const allQueues = () => mergeExtras(T.ticketQueuesOf(ctxOf(stRef.current).venue), extrasRef.current); // filas fixas (D.senhas) + extras criadas na triagem
  const queues = () => withoutDisabled(allQueues(), disabledRef.current); // só as ativas (as desativadas somem da triagem, da porta e da TV)
  const disabledQueues = () => { const off = new Set(disabledRef.current); const out = []; for (const g of allQueues()) for (const p of g.places) if (off.has(p.id)) out.push(Object.assign({ svc: g.service }, p)); return out; };
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
      if (s.mode === 'porta' && s.rooms && s.rooms.length) { const list = await Promise.all(s.rooms.map((r) => A.getQueue(c.day, c.venue, r.service_id, r.id))); const m = {}; s.rooms.forEach((r, i) => { m[r.id] = fail(list[i]); }); setQmap(m); }
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
  const rooms = (st && st.rooms) || [];
  const screen = !st ? 'loading' : !st.role ? 'pin' : !st.local ? 'local' : !st.mode ? 'role' : st.mode === 'triagem' ? 'triagem' : st.mode === 'painel' ? 'painel' : (!rooms.length || adding) ? 'porta-setup' : 'porta';
  const pollKey = st ? `${screen}|${st.day}|${rooms.map((r) => r.id).join(',')}` : '';
  useEffect(() => {
    // porta-setup (lista de salas) também: as filas criadas/desativadas na triagem vêm com o estado do servidor.
    if (!['triagem', 'painel', 'porta', 'porta-setup'].includes(screen)) return undefined;
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
  // Entregues por sala e série ('n' | 'p'): o aparelho mostra o que acabou de digitar até o servidor confirmar.
  const issuedOf = (pid) => ((data && data.issued) || []).find((x) => x.place_id === pid) || null;
  const cnt = (pid, kind) => { const c = ctxOf(st); const l = st.local && st.local[`${c.day}|${pid}|${kind}`]; const r = issuedOf(pid); return l != null && (!r || l.ts >= r.ts) ? l.count : r ? r[kind] || 0 : 0; };
  function setIssued(id, sid, kind, count) {
    const c = ctxOf(st); count = Math.max(0, Math.min(100000, count)); const device = st.device; const key = `${id}|${kind}`;
    setSt((prev) => ({ local: Object.assign({}, prev.local, { [`${c.day}|${id}|${kind}`]: { count, ts: Date.now() } }) }));
    clearTimeout(issuedT.current[key]);
    issuedT.current[key] = setTimeout(() => run(async () => { await post('setIssued', { day: c.day, venue: c.venue, service_id: sid, place_id: id, kind, count, device }); await refresh(); }), 700);
  }
  // Configuração da fila (séries N/P e ordem de chamada): a última gravada no servidor, senão a padrão.
  const cfgOf = (pid, sid) => { const r = ((data && data.configs) || []).find((x) => x.place_id === pid && x.service_id === sid); return r || DEFAULT_CFG; };
  const openCfg = (p, sid) => setCfgOpen(cfgOpen && cfgOpen.place_id === p.id ? null : { place_id: p.id, service_id: sid, name: p.name, form: cfgForm(cfgOf(p.id, sid)) });
  const openCfgAll = () => setCfgOpen(cfgOpen && cfgOpen.all ? null : { all: true, form: cfgForm(((data && data.configs) || [])[0] || DEFAULT_CFG) });
  function saveCfg() {
    const o = cfgOpen; if (!o) return; const c = ctxOf(st);
    const { cfg, error } = normalizeCfg(o.form); if (error) { toast(error, 'alert'); return; }
    if (o.all && !confirm(`Aplicar esta configuração a TODAS as salas de ${c.place} hoje? (${cfg.n_prefix || 'comuns'} ${cfg.n_from}… até ${cfg.n_total} · ${cfg.p_prefix || 'prioritárias'} ${cfg.p_from}… até ${cfg.p_total})`)) return;
    run(async () => { const r = await post('setQueueConfig', Object.assign({ day: c.day, venue: c.venue, service_id: o.service_id, place_id: o.place_id, all: !!o.all, device: st.device }, cfg)); if (r) { toast(o.all ? `Configuração aplicada a ${r.count} salas` : `${o.name}: configuração gravada`); setCfgOpen(null); } await refresh(); });
  }
  const cfgSummary = (cfg) => `${cfg.n_prefix || '#'} ${cfg.n_from}–${cfg.n_from + cfg.n_total - 1}${cfg.p_total ? ` · ${cfg.p_prefix || '#'} ${cfg.p_from}–${cfg.p_from + cfg.p_total - 1}` : ' · sem prioritárias'} · ${PATTERNS.find((x) => x.id === cfg.pattern)?.short || cfg.pattern}`;
  // Novo serviço/sala na triagem (fila extra): nome, pilar, tipo e número; já nasce com o padrão de senhas e prioritárias.
  function saveExtra() {
    const f = extraForm; if (!f) return; const c = ctxOf(st);
    if (!f.service_id) { toast('Escolha o serviço (pilar) em que a sala entra', 'alert'); return; }
    if (f.name.trim().length < 2) { toast('Informe o nome do atendimento', 'alert'); return; }
    const { cfg, error } = normalizeCfg(f); if (error) { toast(error, 'alert'); return; }
    for (const k of ['issued_n', 'issued_p']) { const v = f[k].trim(); if (v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 0)) { toast('Quantidade de senhas entregues inválida', 'alert'); return; } }
    run(async () => { const r = await post('addExtraQueue', Object.assign({ day: c.day, venue: c.venue, service_id: f.service_id, name: f.name.trim(), kind: f.kind, num: f.num.trim(), issued_n: f.issued_n.trim(), issued_p: f.issued_p.trim(), device: st.device }, cfg)); if (r) { toast(`${f.name.trim()} criado`); setExtraForm(null); } await refresh(); });
  }
  // Porta: "o número atual é X" — corrige a sequência quando a porta avançou errado (0 = recomeçar do 1). Texto livre,
  // validado só ao gravar; as chamadas anteriores ficam no histórico e deixam de contar para a próxima senha.
  function openAdjust(room) { const plan = qmap[room.id] && qmap[room.id].plan; setAdjust({ place_id: room.id, service_id: room.service_id, normal: String((plan && plan.normal.last) || 0), prio: String((plan && plan.prio.last) || 0) }); }
  function saveAdjust() {
    const f = adjust; if (!f) return; const c = ctxOf(st);
    const normal = Number(f.normal.trim() === '' ? 0 : f.normal.trim()); if (!Number.isInteger(normal) || normal < 0) { toast('Última comum inválida (0 = recomeçar do início)', 'alert'); return; }
    const prio = Number(f.prio.trim() === '' ? 0 : f.prio.trim()); if (!Number.isInteger(prio) || prio < 0) { toast('Última prioritária inválida', 'alert'); return; }
    run(async () => { const r = await post('setCursor', { day: c.day, venue: c.venue, service_id: f.service_id, place_id: f.place_id, normal, prio, device: st.device }); if (r) { toast('Número atual ajustado'); setAdjust(null); } await refresh(); });
  }
  const setEnabled = (p, sid, enabled) => { const c = ctxOf(st); run(async () => { await post('setQueueEnabled', { day: c.day, venue: c.venue, service_id: sid, place_id: p.id, enabled, device: st.device }); toast(enabled ? `${p.name} reativado` : `${p.name} desativado: saiu da porta e da TV`); await refresh(); }); };
  const removeExtra = (p) => { if (!confirm(`Remover "${p.name}" da triagem, da porta e da TV? As chamadas já feitas ficam no histórico.`)) return; run(async () => { await post('removeExtraQueue', p.extra_id); toast(`${p.name} removido`); await refresh(); }); };
  function askNumber(title, value, cb, kinds, kind) { setNumAsk({ title, cb, kinds: kinds || null, kind: kind || 'n' }); setNumVal(String(value)); }
  useEffect(() => { if (numAsk && numInput.current) { numInput.current.focus(); numInput.current.select(); } }, [numAsk]);
  function numKey(k) {
    if (k === 'ok') { const v = Number(numVal); const cb = numAsk && numAsk.cb; const kind = numAsk && numAsk.kind; setNumAsk(null); if (cb && Number.isInteger(v) && v >= 0) cb(v, kind); }
    else if (k === 'back') setNumVal((v) => v.slice(0, -1));
    else setNumVal((v) => (v === '0' ? '' : v) + k);
  }
  const act = {
    home: () => setSt({ mode: null }),
    logout: () => { run(async () => { await A.logout(); }); setSt({ role: null, local: null, mode: null, rooms: [] }); setPinBuf(''); },
    day: (day) => { const d = T.serviceDays().find((x) => x.date === day); setSt({ day, local: d ? d.venue : null }); setData(null); setQmap({}); },
    // Local do aparelho = dia de serviços daquele local; escolher outro zera as salas (são de outro local).
    local: (venue) => { const d = T.serviceDays().find((x) => x.venue === venue); if (!d) return; setSt({ local: venue, day: d.date, mode: null, rooms: [] }); setData(null); setQmap({}); },
    localClear: () => setSt({ local: null, mode: null, rooms: [] }),
    mode: (mode) => { setAdding(false); setSt({ mode }); },
    placeClear: () => { setAdding(false); setSt({ rooms: [] }); setQmap({}); },
    // Porta: abre a sala (ou acrescenta mais uma à mesma tela, quando veio de "adicionar sala").
    place: (id, s) => { setSt((prev) => ({ rooms: (adding ? (prev.rooms || []).filter((r) => r.id !== id) : []).concat([{ id, service_id: s }]) })); setAdding(false); },
    roomAdd: () => setAdding(true),
    roomRemove: (id) => { setSt((prev) => ({ rooms: (prev.rooms || []).filter((r) => r.id !== id) })); setQmap((m) => { const n = Object.assign({}, m); delete n[id]; return n; }); },
    // Chamada: ticket + série (priority 1 = P). A chamada já é a entrada na sala.
    call: (room, ticket, priority) => { const c = ctxOf(st); setBusy(true); run(async () => { try { await post('call', { day: c.day, venue: c.venue, service_id: room.service_id, place_id: room.id, ticket, priority: priority ? 1 : 0, status: 'served', device: st.device }); await refresh(); } finally { setBusy(false); } }); },
    callOther: (room) => { const q = qmap[room.id]; const plan = q && q.plan; const cfg = (plan && plan.cfg) || DEFAULT_CFG; askNumber('Qual senha você vai chamar?', plan && plan.normal.next != null ? plan.normal.next : 1, (v, kind) => { const c = ctxOf(st); run(async () => { await post('call', { day: c.day, venue: c.venue, service_id: room.service_id, place_id: room.id, ticket: v, priority: kind === 'p' ? 1 : 0, status: 'served', device: st.device }); await refresh(); }); }, plan && plan.has_prio ? { n: cfg.n_prefix || 'Comum', p: cfg.p_prefix || 'Prioridade' } : null, 'n'); },
    status: (id, status) => { setBusy(true); run(async () => { try { await post('setStatus', id, status); await refresh(); } finally { setBusy(false); } }); },
    // "Chamar a próxima": a senha que estava na sala sai (entrou, ou não veio) e a próxima é chamada, numa só gravação.
    resolve: (room, id, status, nxt) => { const c = ctxOf(st); setBusy(true); run(async () => { try { await post('advance', { day: c.day, venue: c.venue, service_id: room.service_id, place_id: room.id, ticket: nxt.ticket, priority: nxt.priority ? 1 : 0, device: st.device, prev_id: id, prev_status: status }); await refresh(); } finally { setBusy(false); } }); },
    end: (id) => run(async () => { await post('endCall', id); await refresh(); }),
    recall: (id) => { if (busy) return; setBusy(true); run(async () => { try { const r = await post('recall', id); if (r) toast('Chamada repetida na TV', 'megaphone'); await refresh(); } finally { setBusy(false); } }); },
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
  // Formulário de configuração da fila (séries N/P e ordem): usado por sala e para "todas as salas".
  function cfgFormView(o) {
    const f = o.form; const set = (k, v) => setCfgOpen((x) => Object.assign({}, x, { form: Object.assign({}, x.form, { [k]: v }) }));
    const inp = (k, props) => <input type="text" inputMode={k.endsWith('prefix') ? 'text' : 'numeric'} value={f[k]} autoComplete="off" autoCapitalize="characters" onFocus={(e) => e.target.select()} onChange={(e) => set(k, e.target.value)} {...props} />;
    return (
      <form className="tri-new-form tri-cfg" onSubmit={(e) => { e.preventDefault(); saveCfg(); }}>
        <h3 className="tri-h" style={{ '--c': '#1f3b9a' }}>{I('sliders')}{o.all ? 'Padrão de senhas para todas as salas' : `${o.name}: padrão de senhas`}</h3>
        <p className="tiny muted">Duas séries de senhas, numeradas de forma independente. Informe a letra (prefixo), o primeiro número e quantas existem de cada. {o.all ? 'Vale para todas as salas ativas deste local hoje (sobrescreve o que já foi configurado).' : 'Vale só para esta sala.'}</p>
        <div className="cfg-grid">
          <span className="cfg-h">Série</span><span className="cfg-h">Prefixo</span><span className="cfg-h">Começa em</span><span className="cfg-h">Total possível</span>
          <span className="cfg-k n">Comuns</span>{inp('n_prefix', { maxLength: 3, placeholder: 'N' })}{inp('n_from')}{inp('n_total')}
          <span className="cfg-k p">{I('star')}Prioritárias</span>{inp('p_prefix', { maxLength: 3, placeholder: 'P' })}{inp('p_from')}{inp('p_total', { placeholder: '0 = sem' })}
        </div>
        <label>Ordem de chamada na porta<select value={f.pattern} onChange={(e) => set('pattern', e.target.value)}>{PATTERNS.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.short})</option>)}</select></label>
        <p className="tiny muted">A porta sugere a próxima senha nessa ordem, mas pode chamar a próxima comum ou prioritária quando precisar (ex.: duas prioridades seguidas). Senhas já impressas numa sequência única: comuns de 1 a 79 e prioritárias de 80 a 100 → comuns começam em 1 (total 79) e prioritárias começam em 80 (total 21).</p>
        <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => setCfgOpen(null)}>Cancelar</button><button type="submit" className="btn btn-primary" data-act="cfg-save">{I('check')}{o.all ? 'Aplicar a todas' : 'Gravar'}</button></div>
      </form>
    );
  }
  function viewTriagem() {
    const c = ctxOf(st);
    const statOf = (sid, pid) => { const s = data && data.stats.services.find((x) => x.service_id === sid); return s ? s.places.find((p) => p.place_id === pid) : null; };
    // Contador de uma série: − / total digitado / +1, com "de N" (total possível) ao lado.
    const counter = (p, sid, kind, cfg) => { const n = cnt(p.id, kind); const total = cfg[`${kind}_total`]; const pre = cfg[`${kind}_prefix`] || (kind === 'p' ? 'P' : 'N'); const over = total && n > total; return (
      <div className={`tri-cnt ${kind}`} data-kind={kind}>
        <span className="tri-cnt-k">{kind === 'p' ? I('star') : null}{pre}<small>{kind === 'p' ? 'prioritárias' : 'comuns'}</small></span>
        <button className="minus" data-id={p.id} aria-label="Menos uma" onClick={() => setIssued(p.id, sid, kind, n - 1)}>{I('x')}</button>
        <button className="cnt" data-id={p.id} aria-label="Digitar o total entregue" onClick={() => askNumber(`${p.name}: ${pre} entregues`, n, (v) => setIssued(p.id, sid, kind, v))}><b>{n}</b><small>{I('sliders')}digitar</small></button>
        <button className="plus" data-id={p.id} onClick={() => setIssued(p.id, sid, kind, n + 1)}>+1</button>
        <span className={`tri-cnt-of ${over ? 'over' : ''}`}>{total ? `de ${total}` : 'sem limite'}{over ? ' · acima do total' : ''}</span>
      </div>
    ); };
    return (
      <>
        {top('Triagem · senhas', `${c.place} · ${T.fmtDate(c.day, 'wdlong')}`, act.home)}
        <p className="page-lead">Uma fila por sala/instituição, com duas séries: <b>comuns (N)</b> e <b>prioritárias (P)</b>. Toque em <b>+1</b> a cada senha entregue; para lançar de uma vez, toque no número e <b>digite o total já entregue</b>. Em <b>padrão</b> você define a letra, o primeiro número, o total possível e a ordem de chamada.</p>
        <div className="tri-all">
          <button type="button" className="btn btn-ghost" data-act="cfg-all" onClick={openCfgAll}>{I('sliders')}Padrão de senhas para todas as salas</button>
          {cfgOpen && cfgOpen.all ? cfgFormView(cfgOpen) : null}
        </div>
        {queues().map((g) => (
          <div key={g.service.id}>
            <h3 className="tri-h" style={{ '--c': g.service.color }}>{I(g.service.icon)}{g.service.title}</h3>
            <div className="tri">
              {g.places.map((p) => { const stt = statOf(g.service.id, p.id); const cfg = cfgOf(p.id, g.service.id); const open = cfgOpen && cfgOpen.place_id === p.id; return (
                <div key={p.id} className="tri-row tri-row2" style={{ '--c': g.service.color }}>
                  <span className="ic">{I(p.kind === 'tenda' ? 'tent' : 'door')}</span>
                  <span className="nm"><b>{p.name}</b><small>{placeLabel(p)}{stt ? ` · ${stt.called} chamada${stt.called === 1 ? '' : 's'} · ${stt.served} atendida${stt.served === 1 ? '' : 's'}` : ''}{p.extra ? <> · criado na triagem · <button type="button" className="link rm" data-act="extra-rm" onClick={() => removeExtra(p)}>remover</button></> : null} · <button type="button" className="link off" data-act="queue-off" data-id={p.id} onClick={() => { if (confirm(`Desativar "${p.name}" hoje? Some da porta da sala e da TV até ser reativado aqui.`)) setEnabled(p, g.service.id, false); }}>desativar</button></small></span>
                  <button type="button" className={`tri-cfg-btn ${open ? 'on' : ''}`} data-act="cfg" data-id={p.id} onClick={() => openCfg(p, g.service.id)} title="Padrão de senhas desta sala">{I('sliders')}<span>padrão</span><small>{cfgSummary(cfg)}</small></button>
                  {counter(p, g.service.id, 'n', cfg)}
                  {cfg.p_total || cnt(p.id, 'p') ? counter(p, g.service.id, 'p', cfg) : null}
                  {open ? <div className="tri-cfg-wrap">{cfgFormView(cfgOpen)}</div> : null}
                </div>
              ); })}
            </div>
          </div>
        ))}
        {disabledQueues().length ? (
          <div className="tri-off">
            <h3 className="tri-h" style={{ '--c': '#64748b' }}>{I('x')}Desativados hoje ({disabledQueues().length})</h3>
            <p className="tiny muted">Não aparecem na porta da sala nem na TV. Toque em reativar para voltar.</p>
            <div className="tri">{disabledQueues().map((p) => (
              <div key={p.id} className="tri-row off" style={{ '--c': '#94a3b8' }}>
                <span className="ic">{I(p.kind === 'tenda' ? 'tent' : 'door')}</span>
                <span className="nm"><b>{p.name}</b><small>{placeLabel(p)} · {p.svc.short}</small></span>
                <button type="button" className="btn btn-primary sm" data-act="queue-on" data-id={p.id} onClick={() => setEnabled(p, p.svc.id, true)}>{I('check')}Reativar</button>
              </div>
            ))}</div>
          </div>
        ) : null}
        <div className="tri-new">
          {!extraForm ? (
            <button type="button" className="btn btn-ghost" data-act="extra-new" onClick={() => setExtraForm(Object.assign({}, EXTRA_BLANK, { service_id: (queues()[0] || { service: { id: '' } }).service.id }))}>{I('calendarplus')}Novo serviço / sala</button>
          ) : (
            <form className="tri-new-form" onSubmit={(e) => { e.preventDefault(); saveExtra(); }}>
              <h3 className="tri-h" style={{ '--c': '#1f3b9a' }}>{I('calendarplus')}Novo serviço / sala</h3>
              <p className="tiny muted">Para um atendimento que não estava na planta. Ele entra na triagem, na porta da sala e na TV deste local, hoje.</p>
              <label>Atendimento<input type="text" value={extraForm.name} autoComplete="off" placeholder="ex.: Fisioterapia" maxLength={60} onChange={(e) => setExtraForm((f) => Object.assign({}, f, { name: e.target.value }))} /></label>
              <label>Serviço (pilar)<select value={extraForm.service_id} onChange={(e) => setExtraForm((f) => Object.assign({}, f, { service_id: e.target.value }))}><option value="">escolha…</option>{D.services.filter((x) => (D.senhas && D.senhas.services ? D.senhas.services.includes(x.id) : true)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
              <div className="row2">
                <label>Tipo<select value={extraForm.kind} onChange={(e) => setExtraForm((f) => Object.assign({}, f, { kind: e.target.value }))}><option value="sala">Sala</option><option value="tenda">Tenda</option><option value="area">Outro ambiente</option></select></label>
                <label>Número / identificação<input type="text" value={extraForm.num} autoComplete="off" placeholder="ex.: 19 ou A" maxLength={8} onChange={(e) => setExtraForm((f) => Object.assign({}, f, { num: e.target.value }))} /></label>
              </div>
              <div className="row2">
                <label>Comuns (N) possíveis<input type="text" inputMode="numeric" value={extraForm.n_total} autoComplete="off" onChange={(e) => setExtraForm((f) => Object.assign({}, f, { n_total: e.target.value }))} /></label>
                <label>Prioritárias (P) possíveis<input type="text" inputMode="numeric" value={extraForm.p_total} autoComplete="off" placeholder="0 = sem" onChange={(e) => setExtraForm((f) => Object.assign({}, f, { p_total: e.target.value }))} /></label>
              </div>
              <div className="row2">
                <label>N já entregues<input type="text" inputMode="numeric" value={extraForm.issued_n} autoComplete="off" placeholder="0" onChange={(e) => setExtraForm((f) => Object.assign({}, f, { issued_n: e.target.value }))} /></label>
                <label>P já entregues<input type="text" inputMode="numeric" value={extraForm.issued_p} autoComplete="off" placeholder="0" onChange={(e) => setExtraForm((f) => Object.assign({}, f, { issued_p: e.target.value }))} /></label>
              </div>
              <label>Ordem de chamada<select value={extraForm.pattern} onChange={(e) => setExtraForm((f) => Object.assign({}, f, { pattern: e.target.value }))}>{PATTERNS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
              <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => setExtraForm(null)}>Cancelar</button><button type="submit" className="btn btn-primary" data-act="extra-save">{I('check')}Criar</button></div>
            </form>
          )}
        </div>
      </>
    );
  }
  function viewPortaSetup() {
    const c = ctxOf(st); const open = new Set(rooms.map((r) => r.id));
    return (
      <>
        {top(adding ? 'Adicionar sala à tela' : 'Porta da sala', adding ? `Escolha mais uma sala para chamar nesta mesma tela · ${c.place}` : `Em qual sala/atendimento você está? · ${c.place}`, adding ? () => setAdding(false) : act.home)}
        {!data ? <p className="door-hint">{I('hourglass')} buscando as salas criadas na triagem…</p> : null}
        {adding ? <p className="page-lead">Você pode cuidar de mais de uma sala no mesmo aparelho: cada sala fica num cartão, com a sua própria fila e os seus próprios botões.</p> : null}
        {queues().map((g) => (
          <div key={g.service.id}>
            <h3 className="tri-h" style={{ '--c': g.service.color }}>{I(g.service.icon)}{g.service.title}</h3>
            <div className="roles compact">
              {g.places.map((p) => <button key={p.id} className={`role ${open.has(p.id) ? 'is-open' : ''}`} style={{ '--c': g.service.color }} data-act="place" data-id={p.id} disabled={adding && open.has(p.id)} onClick={() => act.place(p.id, g.service.id)}><i>{I(p.kind === 'tenda' ? 'tent' : 'door')}</i><span><b>{p.name}</b><small>{placeLabel(p)}{open.has(p.id) ? ' · já está na tela' : ''}</small></span>{I('right')}</button>)}
            </div>
          </div>
        ))}
        <div className="roles compact"><button className="role" style={{ '--c': '#64748b' }} data-act="place" data-id="outro" onClick={() => act.place('outro', 'acolhida')}><i>{I('pin')}</i><span><b>Outro local</b><small>sem sala definida na planta</small></span>{I('right')}</button></div>
      </>
    );
  }
  // Cartão de uma sala na porta: senha na sala, próxima sugerida (pela ordem), próxima N / próxima P, falta, ferramentas.
  function roomCard(room, multi) {
    const s = svc(room.service_id) || D.services[0]; const qd = queueById(room.id); const q = qmap[room.id] || null; const calls = (q && q.calls) || []; const cur = calls[0] || null;
    const plan = q && q.plan ? q.plan : null; const cfg = (plan && plan.cfg) || DEFAULT_CFG; const lbl = (t, pr) => ticketLabel(t, pr, cfg);
    const nxt = plan && plan.next && plan.next.ticket != null ? plan.next : { ticket: 1, priority: false, why: '' };
    const issued = q && q.issued ? q.issued.n + q.issued.p : null;
    const atDoor = cur && (cur.status === 'called' || (cur.status === 'served' && !cur.ended_at)) ? cur : null;
    const serving = calls.find((x) => x.status === 'served' && !x.ended_at && (!atDoor || x.id !== atDoor.id)) || null;
    const svcStat = data && data.stats.services.find((x) => x.service_id === s.id); const plStat = svcStat ? svcStat.places.find((p) => p.place_id === room.id) : null;
    const called = plStat ? plStat.called : calls.length;
    const go = (t) => (atDoor ? act.resolve(room, atDoor.id, 'served', t) : act.call(room, t.ticket, t.priority));
    // Botões explícitos: a seguinte de cada série; quando acabou o que a triagem lançou, ainda deixa chamar (contagem atrasada), avisando.
    const alt = (pr) => { if (!plan) return null; const sr = pr ? plan.prio : plan.normal; const n = sr.next != null ? sr.next : sr.over; return n == null ? null : { ticket: n, priority: pr, why: sr.next != null ? '' : 'sem-registro' }; };
    const altN = alt(false); const altP = plan && plan.has_prio ? alt(true) : null;
    const nextBtn = (
      <button className="door-next big" data-act={atDoor ? 'advance' : 'call'} disabled={busy || !q} onClick={() => go(nxt)}>
        <span className="dn-top">{I('megaphone')}{atDoor ? 'Chamar a próxima' : 'Chamar a senha'}</span>
        <span className="dn-num">{lbl(nxt.ticket, nxt.priority)}</span>
        {plan && plan.has_prio ? <span className={`dn-type ${nxt.priority ? 'p' : 'n'}`}>{nxt.priority ? I('star') : null}{nxt.priority ? 'Prioridade' : 'Comum'}</span> : null}
        <small>{atDoor ? `a senha ${lbl(atDoor.ticket, atDoor.priority)} foi atendida` : 'a chamada já registra a entrada na sala'}{nxt.why ? ` · ${whyLabel(nxt.why)}` : ''}</small>
      </button>
    );
    // Exceções à ordem: chamar explicitamente a próxima comum ou a próxima prioritária (ex.: duas prioridades seguidas).
    const altRow = plan && plan.has_prio ? (
      <div className="door-alt">
        <button className={`alt n ${!nxt.priority ? 'is-next' : ''} ${altN && altN.why ? 'over' : ''}`} data-act="call-n" disabled={busy || !altN} onClick={() => altN && go(altN)}><small>próxima comum</small><b>{altN ? lbl(altN.ticket, false) : '—'}</b><em>{plan.normal.left ? `faltam ${plan.normal.left}` : 'além do lançado'}</em></button>
        <button className={`alt p ${nxt.priority ? 'is-next' : ''} ${altP && altP.why ? 'over' : ''}`} data-act="call-p" disabled={busy || !altP} onClick={() => altP && go(altP)}><small>{I('star')}próxima prioridade</small><b>{altP ? lbl(altP.ticket, true) : '—'}</b><em>{plan.prio.left ? `faltam ${plan.prio.left}` : 'além do lançado'}</em></button>
      </div>
    ) : null;
    const adj = adjust && adjust.place_id === room.id ? (
      <form className="tri-new-form door-adjust" onSubmit={(e) => { e.preventDefault(); saveAdjust(); }}>
        <h3 className="tri-h" style={{ '--c': s.color }}>{I('sliders')}Qual é o número atual?</h3>
        <p className="door-hint" style={{ textAlign: 'left' }}>Informe a <b>última senha já chamada</b> de cada série; a próxima será a seguinte. Use <b>0</b> para recomeçar do início. As chamadas anteriores ficam no histórico.</p>
        <div className="row2">
          <label>Última comum ({cfg.n_prefix || 'N'})<input type="text" inputMode="numeric" value={adjust.normal} autoComplete="off" autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setAdjust((f) => Object.assign({}, f, { normal: e.target.value }))} /></label>
          {plan && plan.has_prio ? <label>Última prioritária ({cfg.p_prefix || 'P'})<input type="text" inputMode="numeric" value={adjust.prio} autoComplete="off" onFocus={(e) => e.target.select()} onChange={(e) => setAdjust((f) => Object.assign({}, f, { prio: e.target.value }))} /></label> : null}
        </div>
        <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => setAdjust(null)}>Cancelar</button><button type="submit" className="btn btn-primary" data-act="adjust-save" disabled={busy}>{I('check')}Gravar</button></div>
      </form>
    ) : null;
    return (
      <section key={room.id} className={`door room-card ${multi ? 'multi' : ''}`} style={{ '--c': s.color }} data-room={room.id}>
        {multi ? <header className="room-head"><i>{I(qd && qd.kind === 'tenda' ? 'tent' : 'door')}</i><span><b>{qd ? qd.name : placeName(room.id)}</b><small>{qd ? placeLabel(qd) + ' · ' : ''}{s.title}</small></span><button type="button" className="icon-btn" data-act="room-rm" aria-label="Tirar esta sala da tela" onClick={() => act.roomRemove(room.id)}>{I('x')}</button></header> : null}
        {atDoor ? (
          <>
            <div className="door-now door-call compact"><small>{I('megaphone')}Na sala agora{atDoor.priority ? <i className="prio">Prioridade</i> : null}</small><button type="button" className="door-num" data-act="recall" disabled={busy} onClick={() => act.recall(atDoor.id)} title="Chamar novamente na TV"><b>{lbl(atDoor.ticket, atDoor.priority)}</b><em>{I('megaphone')}toque para chamar de novo</em></button>
              <span className="st called">entrou às {fmtT(atDoor.called_at)}{atDoor.recalled_at ? ` · repetida às ${fmtT(atDoor.recalled_at)}` : ''}</span></div>
            {nextBtn}
            {altRow}
            <div className="door-res"><button className="ghost" data-act="recall" disabled={busy} onClick={() => act.recall(atDoor.id)}>{I('megaphone')}<span>Chamar de novo<small>a TV anuncia {lbl(atDoor.ticket, atDoor.priority)} outra vez</small></span></button><button className="no" data-act="resolve" data-status="absent" disabled={busy} onClick={() => act.resolve(room, atDoor.id, 'absent', nxt)}>{I('x')}<span>Não veio<small>registra a falta e chama {lbl(nxt.ticket, nxt.priority)}</small></span></button></div>
          </>
        ) : (
          <>
            <div className="door-now idle"><small>{cur ? 'Nenhuma senha aguardando na porta' : 'Nenhuma senha chamada ainda'}</small><b>—</b></div>
            {nextBtn}
            {altRow}
            {!multi ? <p className="door-hint">A chamada aparece na TV (e por voz) e a pessoa entra na sala. Ao terminar, toque em "Chamar a próxima".</p> : null}
          </>
        )}
        {serving ? (
          <div className="door-serving"><span className="lbl">{I('check')}Em atendimento</span><b>{lbl(serving.ticket, serving.priority)}</b><small>entrou às {fmtT(serving.status_at)} · há {Math.max(0, Math.round((Date.now() - serving.status_at) / 60000))} min</small><button className="link" data-act="end" onClick={() => act.end(serving.id)}>finalizar</button></div>
        ) : (cur && !atDoor ? <div className="door-serving muted"><span className="lbl">{cur.status === 'served' ? I('check') : I('x')}Última</span><b>{lbl(cur.ticket, cur.priority)}</b><small>{cur.status === 'served' ? `entrou às ${fmtT(cur.status_at)}` : 'não compareceu'}</small></div> : null)}
        <div className="door-tools">
          <button className="btn btn-ghost" data-act="call-other" onClick={() => act.callOther(room)}>{I('ticket')}Outro número</button>
          <button className="btn btn-ghost" data-act="adjust" onClick={() => (adjust && adjust.place_id === room.id ? setAdjust(null) : openAdjust(room))}>{I('sliders')}Ajustar número</button>
          {cur ? <button className="btn btn-ghost" data-act="undo" onClick={() => act.undo(cur.id)}>{I('back')}Desfazer</button> : null}
        </div>
        {adj}
        <div className="door-kpi"><div><small>Entregues</small><b>{issued == null ? '—' : issued}</b></div><div><small>Chamadas</small><b>{called}</b></div><div><small>Aguardando</small><b>{issued == null ? '—' : Math.max(0, issued - called)}</b></div></div>
        {calls.length > 1 ? (
          <details className="door-hist" open={!multi}>
            <summary>Últimas chamadas</summary>
            <ul className="hist">{calls.slice(1, multi ? 5 : 9).map((x) => <li key={x.id}><b>{lbl(x.ticket, x.priority)}</b><span className={`badge ${x.status}`}>{x.status === 'served' ? 'entrou' : x.status === 'absent' ? 'faltou' : 'sem registro'}</span><time>{fmtT(x.called_at)}</time>{x.status === 'called' ? <button className="link" onClick={() => act.status(x.id, 'served')}>entrou</button> : null}</li>)}</ul>
          </details>
        ) : null}
      </section>
    );
  }
  function viewPorta() {
    const c = ctxOf(st); const multi = rooms.length > 1; const r0 = rooms[0]; const s0 = svc(r0.service_id) || D.services[0]; const qd0 = queueById(r0.id);
    const title = multi ? `${rooms.length} salas nesta tela` : (qd0 ? qd0.name : placeName(r0.id));
    const sub = multi ? rooms.map((r) => { const q = queueById(r.id); return q ? q.name : placeName(r.id); }).join(' · ') : `${qd0 ? placeLabel(qd0) + ' · ' : ''}${s0.title} · ${c.place}`;
    return (
      <>
        {top(title, sub, act.placeClear)}
        <div className={`door-rooms ${multi ? 'multi' : ''}`}>{rooms.map((r) => roomCard(r, multi))}</div>
        <div className="door-add"><button type="button" className="btn btn-ghost" data-act="room-add" onClick={act.roomAdd}>{I('calendarplus')}Adicionar outra sala a esta tela</button><small>para quem cuida de mais de uma porta ao mesmo tempo</small></div>
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
            {numAsk.kinds ? <div className="kind-pick" role="radiogroup" aria-label="Série da senha"><button type="button" className={`kp n ${numAsk.kind === 'n' ? 'on' : ''}`} data-kind="n" onClick={() => setNumAsk((a) => Object.assign({}, a, { kind: 'n' }))}>{numAsk.kinds.n}<small>comum</small></button><button type="button" className={`kp p ${numAsk.kind === 'p' ? 'on' : ''}`} data-kind="p" onClick={() => setNumAsk((a) => Object.assign({}, a, { kind: 'p' }))}>{I('star')}{numAsk.kinds.p}<small>prioridade</small></button></div> : null}
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
