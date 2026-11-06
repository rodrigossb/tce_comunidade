'use client';
/* Atendimento (equipe): controle de senhas por serviço. Três funções: Triagem (quantas senhas entregues),
   Porta da sala (senha chamada aguardando na porta; entrou/não veio chama a próxima automaticamente) e Painel.
   Porte do js/atendimento.js do site antigo para React: mesmas telas e classes CSS; fala com o servidor por
   server actions (app/actions.js). Guarda configuração no aparelho (localStorage) e tem fila offline. */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { whyLabel, PATTERNS, MODES, DEFAULT_CFG, normalizeCfg, ticketLabel } from '@tce/core/fila';
import { placeLabel } from '@tce/core/map';
import { mergeExtras, withoutDisabled, placeOf, fixedQueues } from '@/lib/filas-extra';
import { can, ROLE_LABEL } from '@/lib/roles';
import { hourOf, filterData, filterDays, SHIFT_FILTERS } from '@/lib/dash-stats';
import Icon from './Icon';
import * as A from '@/app/actions';

const D = T.D;
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const LS = 'tce_at';
const VER = '2.2';
const KIND_LABEL = { sala: 'Sala', tenda: 'Tenda', area: 'Ambiente' };
/** Texto livre da triagem ("o que é oferecido") → itens: uma linha ou ponto e vírgula por item. */
const splitOffer = (txt) => String(txt || '').split(/\n|;/).map((x) => x.trim()).filter(Boolean);
const ACTIONS = { setIssued: A.setIssued, setQueueConfig: A.setQueueConfig, call: A.call, setStatus: A.setStatus, endCall: A.endCall, recall: A.recall, advance: A.advance, addExtraQueue: A.addExtraQueue, removeExtraQueue: A.removeExtraQueue, setQueueEnabled: A.setQueueEnabled, setCursor: A.setCursor, setQueueInfo: A.setQueueInfo, setQueueMode: A.setQueueMode, setDayEnabled: A.setDayEnabled };
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
  const [infoOpen, setInfoOpen] = useState(null); // triagem: edição de nome/sala/oferta { place_id, service_id, form: { name, kind, num, offer } }
  const issuedChain = useRef(Promise.resolve()); // envios de "entregues" em fila, na ordem
  const [cfgOpen, setCfgOpen] = useState(null); // triagem: formulário de configuração aberto { place_id, service_id, form } ou { all: true, form }
  const [extraForm, setExtraForm] = useState(null); // triagem: formulário de novo serviço/sala (null = fechado)
  const [adjust, setAdjust] = useState(null); // porta: formulário "ajustar número atual" { place_id, normal, prio } (null = fechado)
  const [adding, setAdding] = useState(false); // porta: escolhendo mais uma sala para a mesma tela
  const [picking, setPicking] = useState(false); // triagem/porta: escolhendo os serviços que este aparelho lança (botão "Serviços")
  const [pickSel, setPickSel] = useState([]);
  // painel: filtros (dia e local além dos do aparelho, turno, serviços, só com movimento, ordem). Só em memória.
  const PF0 = { day: null, venue: null, shift: 'all', svcs: [], only: false, sort: 'planta', open: false };
  const [pf, setPfRaw] = useState(PF0); const pfRef = useRef(pf); pfRef.current = pf;
  const setPf = (patch) => setPfRaw((p) => Object.assign({}, p, typeof patch === 'function' ? patch(p) : patch));
  const extrasRef = useRef([]); extrasRef.current = (data && data.extras) || []; // filas criadas no dia (vêm com o estado)
  const disabledRef = useRef([]); disabledRef.current = (data && data.disabled) || []; // filas desativadas na triagem (ids de ambiente)
  const daysOffRef = useRef([]); daysOffRef.current = (data && data.days_off) || []; // dias sem atendimento neste local (marcados pela administração)

  // ---------- início ----------
  useEffect(() => {
    const s = load(LS, {}); if (!s.device) s.device = Math.random().toString(36).slice(2, 10);
    delete s.pin; // o PIN agora fica num cookie httpOnly
    if (!Array.isArray(s.rooms)) s.rooms = s.place && s.service ? [{ id: s.place, service_id: s.service }] : []; // versões antigas: uma sala só
    delete s.place; delete s.service;
    // Versões antigas guardavam a contagem local em `local` (que também era o local do aparelho) — era a causa de a contagem "voltar".
    if (s.local && typeof s.local !== 'string') { const d = T.serviceDays().find((x) => x.date === s.day); s.local = d ? d.venue : null; }
    if (s.local && !(D.maps && D.maps[s.local])) s.local = null;
    if (!s.mem || typeof s.mem !== 'object') s.mem = {};
    delete s.day;
    save(LS, s); setStRaw(s); setClock(T.now());
    const out = load(LS + '_out', []); setPending(out.length); if (out.length) setSync('off');
    if (s.role) A.whoami().then((r) => { if (r && r.status === 401) setSt({ role: null, msg: 'PIN recusado. Entre de novo.' }); }).catch(() => { /* sem rede: mantém */ });
  }, [setSt]);
  useEffect(() => { const id = setInterval(() => { const c = T.now(); setClock((p) => (p && p.time === c.time && p.date === c.date ? p : c)); }, 1000); return () => clearInterval(id); }, []);

  // ---------- dia e local ----------
  // Dia de trabalho (T.ticketDay): dia de serviços de hoje → ele; outro dia do evento → hoje, só com as filas criadas na
  // triagem; fora do evento → o próximo/último dia de serviços. O local é o escolhido no aparelho (st.local).
  const ctxOf = (s) => { const d = T.ticketDay(T.now().date, s && s.local && D.maps && D.maps[s.local] ? s.local : null) || T.serviceDays()[0]; return { day: d.date, venue: d.venue, place: d.place, placeLong: d.placeLong || d.place, service_day: d.service_day !== false }; };
  const svc = (id) => T.serviceById(id);
  const placeName = (id) => { const p = placeOf(id, extrasRef.current); return p ? (p.kind === 'area' && !p.num ? p.name : `${placeLabel(p)} · ${p.name}`) : id; };
  const allQueues = () => { const c = ctxOf(stRef.current); return mergeExtras(fixedQueues(c.venue, c.day), extrasRef.current); }; // filas fixas da planta (só no dia de serviços do local) + extras criadas na triagem
  const queues = () => withoutDisabled(allQueues(), disabledRef.current); // só as ativas (as desativadas somem da triagem, da porta e da TV)
  const disabledQueues = () => { const off = new Set(disabledRef.current); const out = []; for (const g of allQueues()) for (const p of g.places) if (off.has(p.id)) out.push(Object.assign({ svc: g.service }, p)); return out; };
  // Perfil (lib/roles.js): o que este PIN pode fazer. Serviços deste aparelho (st.svcs): null = ainda não escolheu; [] = todos.
  const canDo = (cap) => can(st && st.role, cap);
  const allowedModes = () => ['triagem', 'porta', 'painel'].filter((m) => canDo(m === 'triagem' ? 'issue' : m === 'porta' ? 'door' : 'painel'));
  const visibleQueues = () => { const sel = st && Array.isArray(st.svcs) && st.svcs.length ? new Set(st.svcs) : null; return sel ? queues().filter((g) => sel.has(g.service.id)) : queues(); };
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
      const f = pfRef.current; // painel: dia/local escolhidos nos filtros (padrão: os do aparelho)
      setData(fail(await (s.mode === 'painel' ? A.getStats(f.day || c.day, f.venue || c.venue) : A.getState(c.day, c.venue))));
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
  const screen = !st ? 'loading' : !st.role ? 'pin' : !st.local || !(D.maps && D.maps[st.local]) ? 'local' : !st.mode ? 'role' : (st.mode === 'triagem' || st.mode === 'porta') && (st.svcs == null || picking) ? 'svc-pick' : st.mode === 'triagem' ? 'triagem' : st.mode === 'painel' ? 'painel' : (!rooms.length || adding) ? 'porta-setup' : 'porta';
  // Perfil com uma função só (triagem ou porta) entra direto nela; "voltar" leva à escolha do local.
  useEffect(() => { if (screen === 'role' && allowedModes().length === 1) setSt({ mode: allowedModes()[0] }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  const goHome = () => (allowedModes().length === 1 ? act.localClear() : act.home());
  const pollKey = st ? `${screen}|${ctxOf(st).day}|${st.local}|${rooms.map((r) => r.id).join(',')}|${pf.day || ''}|${pf.venue || ''}` : '';
  // Saindo do painel, o dia/local dos filtros voltam aos do aparelho (os outros filtros ficam para a próxima vez).
  useEffect(() => { if (screen !== 'painel') setPfRaw((p) => (p.day || p.venue ? Object.assign({}, p, { day: null, venue: null }) : p)); }, [screen]);
  useEffect(() => {
    // porta-setup (lista de salas) também: as filas criadas/desativadas na triagem vêm com o estado do servidor.
    if (!['triagem', 'painel', 'porta', 'porta-setup', 'svc-pick'].includes(screen)) return undefined;
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
  // Entregues por sala e série ('n' | 'p'). O que o aparelho digitou (st.mem) vale enquanto o envio não foi confirmado
  // (pending) e até o servidor refletir aquele envio (srv = ts devolvido); depois vale o servidor (outro aparelho pode
  // ter lançado). Nunca compara relógio do aparelho com o do servidor.
  const issuedOf = (pid) => ((data && data.issued) || []).find((x) => x.place_id === pid) || null;
  const cnt = (pid, kind) => { const c = ctxOf(st); const l = st.mem && st.mem[`${c.day}|${pid}|${kind}`]; const r = issuedOf(pid); if (l && (l.pending || !r || (l.srv && r.ts < l.srv))) return l.count; return r ? r[kind] || 0 : 0; };
  function setIssued(id, sid, kind, count) {
    const c = ctxOf(st); count = Math.max(0, Math.min(100000, count)); const device = st.device; const key = `${c.day}|${id}|${kind}`;
    // Aviso de limite: ao chegar no total possível da série e a cada senha acima dele (não bloqueia: a contagem pode estar atrasada).
    const cfgL = cfgOf(id, sid); const total = Number(cfgL[`${kind}_total`]) || 0; const pre = cfgL[`${kind}_prefix`] || (kind === 'p' ? 'P' : 'N');
    if (total && count === total) { toast(`${pre}: limite de ${total} atingido`, 'alert'); try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch { /* sem vibração */ } }
    else if (total && count > total) { toast(`${pre}: ${count - total} acima do limite de ${total}`, 'alert'); try { navigator.vibrate && navigator.vibrate(200); } catch { /* sem vibração */ } }
    setSt((prev) => ({ mem: Object.assign({}, prev.mem, { [key]: { count, pending: true } }) }));
    clearTimeout(issuedT.current[key]);
    // Envios em fila, um por vez e na ordem: dois toques seguidos nunca chegam trocados ao servidor.
    issuedT.current[key] = setTimeout(() => { issuedChain.current = issuedChain.current.then(() => run(async () => {
      const r = await post('setIssued', { day: c.day, venue: c.venue, service_id: sid, place_id: id, kind, count, device });
      setSt((prev) => { const cur = prev.mem && prev.mem[key]; if (!cur || cur.count !== count) return {}; return { mem: Object.assign({}, prev.mem, { [key]: r ? { count, pending: false, srv: r.ts } : cur }) }; });
      await refresh();
    })); }, 500);
  }
  // Configuração da fila (séries N/P e ordem de chamada): a última gravada no servidor, senão a padrão.
  const cfgOf = (pid, sid) => { const r = ((data && data.configs) || []).find((x) => x.place_id === pid && x.service_id === sid); return r || DEFAULT_CFG; };
  // Modo da fila hoje: 'chamada' (porta + TV) ou 'contagem' (só as senhas entregues contam como atendimentos; sem porta nem TV).
  const modeOf = (pid, sid) => (cfgOf(pid, sid).mode === 'contagem' ? 'contagem' : 'chamada');
  const toggleMode = (p, sid) => { const c = ctxOf(st); const next = modeOf(p.id, sid) === 'contagem' ? 'chamada' : 'contagem'; const msg = next === 'contagem' ? `"${p.name}" hoje passa a SÓ CONTAGEM: as senhas entregues contam como atendimentos; a fila some da porta e da TV. Confirmar?` : `"${p.name}" hoje volta a CHAMADA NA PORTA: aparece na porta e na TV. Confirmar?`; if (!confirm(msg)) return; run(async () => { await post('setQueueMode', { day: c.day, venue: c.venue, service_id: sid, place_id: p.id, mode: next, device: st.device }); toast(next === 'contagem' ? `${p.name}: só contagem hoje` : `${p.name}: chamada na porta hoje`); await refresh(); }); };
  const openCfg = (p, sid) => setCfgOpen(cfgOpen && cfgOpen.place_id === p.id ? null : { place_id: p.id, service_id: sid, name: p.name, form: cfgForm(cfgOf(p.id, sid)) });
  const openCfgAll = () => setCfgOpen(cfgOpen && cfgOpen.all ? null : { all: true, form: cfgForm(((data && data.configs) || [])[0] || DEFAULT_CFG) });
  function saveCfg() {
    const o = cfgOpen; if (!o) return; const c = ctxOf(st);
    const { cfg, error } = normalizeCfg(o.form); if (error) { toast(error, 'alert'); return; }
    if (o.all && !confirm(`Aplicar esta configuração a TODAS as salas de ${c.place} hoje? (${cfg.n_prefix || 'comuns'} ${cfg.n_from}… até ${cfg.n_total} · ${cfg.p_prefix || 'prioritárias'} ${cfg.p_from}… até ${cfg.p_total})`)) return;
    run(async () => { const r = await post('setQueueConfig', Object.assign({ day: c.day, venue: c.venue, service_id: o.service_id, place_id: o.place_id, all: !!o.all, device: st.device }, cfg)); if (r) { toast(o.all ? `Configuração aplicada a ${r.count} salas` : `${o.name}: configuração gravada`); setCfgOpen(null); } await refresh(); });
  }
  const cfgSummary = (cfg) => `${cfg.n_prefix || '#'} ${cfg.n_from}–${cfg.n_from + cfg.n_total - 1}${cfg.p_total ? ` · ${cfg.p_prefix || '#'} ${cfg.p_from}–${cfg.p_from + cfg.p_total - 1}` : ' · sem prioritárias'} · ${PATTERNS.find((x) => x.id === cfg.pattern)?.short || cfg.pattern}`;
  // Triagem edita uma fila (fixa ou extra): nome do atendimento, tipo/número da sala e o que é oferecido (texto livre; em
  // branco vale o que está na programação para o dia). Fica no servidor: vale para triagem, porta, TV e painel.
  // Dias da agenda (hoje até o fim do evento) e turnos usados na oferta.
  // Dias desativados pela administração (perfil com `days`): somem das listas de dias de quem não é administração.
  const dayOff = (d) => daysOffRef.current.includes(d);
  const schedDays = (c) => { const all = (data && data.days) || T.eventDays().filter((d) => d >= c.day); const ds = canDo('days') ? all : all.filter((d) => !dayOff(d)); return ds.length ? ds : [c.day]; };
  const setDayEnabled = (d, enabled) => { const c = ctxOf(st); const msg = enabled ? `Reativar ${T.fmtDate(d, 'wdlong')} em ${c.place}? O dia volta a aparecer para toda a equipe.` : `Desativar ${T.fmtDate(d, 'wdlong')} em ${c.place}? O dia some das listas de dias da triagem, do painel e do dashboard para quem não é administração (o que já foi registrado nele não muda).`; if (!confirm(msg)) return; run(async () => { await post('setDayEnabled', { day: d, venue: c.venue, enabled, device: st.device }); toast(enabled ? `${T.fmtDate(d, 'wd')}: dia reativado` : `${T.fmtDate(d, 'wd')}: sem atendimento`); await refresh(); }); };
  /** Administração: faixa com os dias do evento deste local para desativar/reativar (toque no dia). */
  const daysAdminView = (c) => { if (!canDo('days')) return null; const all = (data && data.days) || T.eventDays().filter((d) => d >= c.day); return (
    <div className="tri-days">
      <span className="tri-days-h">{I('calendar')}<b>Dias de atendimento</b><small>toque num dia para desativar ou reativar</small></span>
      <div className="chips scroll">{all.map((d) => <button key={d} type="button" className={`chip ${dayOff(d) ? 'off' : 'on'}`} data-day-toggle={d} onClick={() => setDayEnabled(d, dayOff(d))} title={dayOff(d) ? 'desativado: toque para reativar' : 'ativo: toque para desativar'}>{I(dayOff(d) ? 'x' : 'check')}{T.fmtDate(d, 'wd')}{d === c.day ? <small>hoje</small> : null}{dayOff(d) ? <small>sem atendimento</small> : null}</button>)}</div>
    </div>
  ); };
  const OFFER_SHIFTS = ['manha', 'tarde'];
  // Itens do que é oferecido numa fila: editados na triagem (p.items), texto simples (p.offer) ou a programação do serviço.
  const offerItemsOf = (p, service, c) => {
    if (Array.isArray(p.items)) return p.items;
    if (p.offer) return splitOffer(p.offer).map((t) => ({ t }));
    const all = (service && service.items) || []; const here = all.filter((it) => T.itemWhere(it, c.venue).includes(p.id));
    return (here.length ? here : all).map((it) => (typeof it === 'string' ? { t: it } : { t: it.t, when: it.when || (it.only ? { [it.only]: true } : null) }));
  };
  const openInfo = (p, sid) => {
    if (infoOpen && infoOpen.place_id === p.id) { setInfoOpen(null); return; }
    const c = ctxOf(st); const days = schedDays(c); const service = svc(sid);
    const items = offerItemsOf(p, service, c).map((it) => ({ t: it.t, when: it.when ? JSON.parse(JSON.stringify(it.when)) : null }));
    const cd = (data && data.cfg_days && data.cfg_days[p.id]) || {}; const cur = cfgOf(p.id, sid);
    const totals = {}; for (const d of days) { const v = cd[d] || (d === c.day ? cur : null); totals[d] = { n: v ? String(v.n_total) : '', p: v ? String(v.p_total) : '', mode: v ? v.mode || 'chamada' : 'chamada' }; }
    setInfoOpen({ place_id: p.id, service_id: sid, days, orig: JSON.parse(JSON.stringify(totals)), form: { name: p.name || '', kind: p.kind || 'sala', num: p.num || '', all: items.every((it) => !it.when), items, totals } });
  };
  function saveInfo() {
    const o = infoOpen; if (!o) return; const c = ctxOf(st); const f = o.form;
    if (f.name.trim().length < 2) { toast('Informe o nome do atendimento', 'alert'); return; }
    const items = f.items.filter((it) => it.t.trim()).map((it) => (f.all || !it.when ? { t: it.t.trim() } : { t: it.t.trim(), when: it.when }));
    const totals = {};
    for (const d of Object.keys(f.totals)) { const t = {}; for (const k of ['n', 'p']) { const v = String(f.totals[d][k]).trim(); if (v === (o.orig[d] ? o.orig[d][k] : '')) continue; if (v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 0)) { toast(`Senhas por dia inválidas (${T.fmtDate(d, 'wd')})`, 'alert'); return; } t[k] = v; } if (f.totals[d].mode !== (o.orig[d] ? o.orig[d].mode : 'chamada')) t.mode = f.totals[d].mode; if (Object.keys(t).length) totals[d] = t; }
    run(async () => { const r = await post('setQueueInfo', { day: c.day, venue: c.venue, service_id: o.service_id, place_id: o.place_id, name: f.name.trim(), kind: f.kind, num: f.num.trim(), items, totals, device: st.device }); if (r) { toast(`${r.name}: alterado`); setInfoOpen(null); } await refresh(); });
  }
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
    // Local do aparelho (o dia é o de trabalho, T.ticketDay); escolher outro zera as salas (são de outro local).
    local: (venue) => { if (!(D.maps && D.maps[venue])) return; setSt({ local: venue, mode: null, rooms: [] }); setData(null); setQmap({}); },
    localClear: () => setSt({ local: null, mode: null, rooms: [] }),
    mode: (mode) => { setAdding(false); setPicking(false); setSt({ mode }); },
    // Serviços que este aparelho lança (triagem e porta): [] = todos. Guardado no aparelho; o botão "Serviços" reabre a escolha.
    svcs: (ids) => { setSt({ svcs: ids }); setPicking(false); },
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
  const svcBtn = () => <button type="button" className="btn btn-ghost sm" data-act="svcs" title="Escolher os serviços deste aparelho" onClick={() => { setPickSel(Array.isArray(st.svcs) ? st.svcs : []); setPicking(true); }}>{I('sliders')}Serviços{st && Array.isArray(st.svcs) && st.svcs.length ? ` (${st.svcs.length})` : ''}</button>;
  const top = (title, sub, back, extra) => (
    <div className="at-top">
      {back ? <button className="btn btn-ghost" onClick={back}>{I('back')}Voltar</button> : null}
      <div className="where"><span>{title}</span><small>{sub}</small></div>
      {extra || null}
      <span className={`sync ${sync}`} title="Sincronização"><i></i>{sync === 'ok' ? 'sincronizado' : sync === 'off' ? `${pending} pendente${pending > 1 ? 's' : ''}` : 'erro'}</span>
    </div>
  );

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
        {top(`Olá, ${ROLE_LABEL[st.role] || 'equipe'}`, 'Em que local você está?')}
        <h2 style={{ margin: '.8em 0 .2em' }}>Escolha o local</h2>
        <p className="page-lead">Tudo o que você lançar (senhas entregues e chamadas) vale para o local escolhido aqui, no dia de hoje.</p>
        <div className="roles">
          {Object.keys(D.maps || {}).map((venue) => { const v = D.venues[venue]; const sd = T.serviceDays().find((d) => d.venue === venue); const td = T.ticketDay(clock ? clock.date : T.now().date, venue); const today = !!(clock && td && td.date === clock.date); return (
            <button key={venue} className="role" style={{ '--c': today ? '#16a34a' : '#1f3b9a' }} data-act="local" data-id={venue} onClick={() => act.local(venue)}><i>{I('pin')}</i><span><b>{v ? v.name : venue}</b><small>{today ? (td.service_day ? `Hoje · dia de serviços gratuitos` : `Hoje${sd ? ` · serviços gratuitos ${T.fmtDate(sd.date, 'wd')}` : ''}`) : sd ? `Serviços gratuitos · ${T.fmtDate(sd.date, 'wdlong')}` : ''}</small></span>{I('right')}</button>
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
        {top(`Olá, ${ROLE_LABEL[st.role] || 'equipe'}`, `${c.place} · ${T.fmtDate(c.day, 'wdlong')}`)}
        <div className="local-line"><span>{I('pin')}<b>{D.venues[c.venue] ? D.venues[c.venue].name : c.place}</b> · {T.fmtDate(c.day, 'wd')}</span><button className="btn btn-ghost sm" data-act="local-clear" onClick={act.localClear}>Trocar local</button></div>
        <h2 style={{ margin: '.8em 0 .2em' }}>O que você vai fazer?</h2>
        <div className="roles">
          {canDo('issue') ? <button className="role" style={{ '--c': '#fbbf24' }} data-mode="triagem" onClick={() => act.mode('triagem')}><i>{I('ticket')}</i><span><b>Triagem · entrega de senhas</b><small>Informe quantas senhas de cada serviço já foram entregues</small></span>{I('right')}</button> : null}
          {canDo('door') ? <button className="role" style={{ '--c': '#16a34a' }} data-mode="porta" onClick={() => act.mode('porta')}><i>{I('door')}</i><span><b>Porta da sala · chamada</b><small>Registre a senha chamada e se a pessoa entrou ou não compareceu</small></span>{I('right')}</button> : null}
          {canDo('painel') ? <button className="role" style={{ '--c': '#1f3b9a' }} data-mode="painel" onClick={() => act.mode('painel')}><i>{I('layers')}</i><span><b>Painel · acompanhamento</b><small>Senhas entregues, atendidas, faltas e tempo médio por serviço e sala</small></span>{I('right')}</button> : null}
        </div>
        <p className="tiny muted">Aparelho {st.device} · <button className="link" data-act="logout" onClick={act.logout}>sair</button></p>
      </>
    );
  }
  // Triagem/porta: quais serviços este aparelho lança (filtra as filas mostradas; [] = todos). Reaberta pelo botão "Serviços".
  function viewSvcPick() {
    const c = ctxOf(st); const groups = queues(); const sel = new Set(pickSel);
    const tog = (id) => setPickSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id])));
    return (
      <>
        {top(st.mode === 'porta' ? 'Porta da sala · serviços' : 'Triagem · serviços', `${c.place} · ${T.fmtDate(c.day, 'wdlong')}`, st.svcs == null ? goHome : () => setPicking(false))}
        <h2 style={{ margin: '.8em 0 .2em' }}>Quais serviços você vai lançar?</h2>
        <p className="page-lead">Marque um ou mais serviços: só as filas deles aparecem neste aparelho. Dá para mudar depois no botão <b>Serviços</b>, no alto da tela.</p>
        <div className="roles compact">
          {groups.map((g) => <button key={g.service.id} type="button" className={`role ${sel.has(g.service.id) ? 'is-open' : ''}`} style={{ '--c': g.service.color }} data-act="svc-pick" data-id={g.service.id} aria-pressed={sel.has(g.service.id)} onClick={() => tog(g.service.id)}><i>{I(sel.has(g.service.id) ? 'check' : g.service.icon)}</i><span><b>{g.service.title}</b><small>{g.places.length} {g.places.length === 1 ? 'sala' : 'salas'} · {g.places.map((p) => p.name).slice(0, 3).join(', ')}{g.places.length > 3 ? '…' : ''}</small></span></button>)}
        </div>
        <div className="actions" style={{ display: 'flex', gap: '.6em', flexWrap: 'wrap', margin: '1em 0' }}>
          <button type="button" className="btn btn-ghost" data-act="svc-all" onClick={() => act.svcs([])}>{I('list')}Todos os serviços</button>
          <button type="button" className="btn btn-primary" data-act="svc-ok" disabled={!sel.size} onClick={() => act.svcs([...sel])}>{I('check')}Continuar{sel.size ? ` (${sel.size})` : ''}</button>
        </div>
        {!groups.length ? <p className="tiny muted">Nenhuma fila ativa hoje neste local. {canDo('manage') ? 'Crie o serviço/sala na triagem.' : 'Peça à administração para criar o serviço/sala.'}</p> : null}
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
    const c = ctxOf(st); const nowShift = T.shiftOf((clock || T.now()).time);
    const statOf = (sid, pid) => { const s = data && data.stats.services.find((x) => x.service_id === sid); return s ? s.places.find((p) => p.place_id === pid) : null; };
    // Contador de uma série: letra · −1 · total (toque para digitar) · +1 · "de N".
    const counter = (p, sid, kind, cfg) => { const n = cnt(p.id, kind); const total = Number(cfg[`${kind}_total`]) || 0; const pre = cfg[`${kind}_prefix`] || (kind === 'p' ? 'P' : 'N'); const over = total && n > total; const full = total && n === total; const near = total && !full && !over && total - n <= Math.max(3, Math.ceil(total * 0.1)); return (
      <div className={`tri-cnt ${kind} ${over ? 'is-over' : full ? 'is-full' : near ? 'is-near' : ''}`} data-kind={kind}>
        <span className="tri-cnt-k">{kind === 'p' ? I('star') : null}{pre}<small>{kind === 'p' ? 'priorit.' : 'comuns'}</small></span>
        <button className="minus" data-id={p.id} aria-label="Menos uma" onClick={() => setIssued(p.id, sid, kind, n - 1)}>{I('x')}</button>
        <button className="cnt" data-id={p.id} aria-label="Digitar o total entregue" onClick={() => askNumber(`${p.name}: ${pre} entregues`, n, (v) => setIssued(p.id, sid, kind, v))}><b>{n}</b><small>digitar</small></button>
        <button className="plus" data-id={p.id} onClick={() => setIssued(p.id, sid, kind, n + 1)}>+1</button>
        <span className={`tri-cnt-of ${over ? 'over' : full ? 'full' : near ? 'near' : ''}`}>{!total ? 'sem limite' : over ? <>{I('alert')}+{n - total} acima<small>de {total}</small></> : full ? <>{I('alert')}limite<small>{total} de {total}</small></> : near ? <>faltam {total - n}<small>de {total}</small></> : `de ${total}`}</span>
      </div>
    ); };
    // O que é oferecido: agenda por dia/turno (T.offerSlots) — o turno atual em destaque, os próximos com menos ênfase.
    const days = schedDays(c);
    const shiftShort = (k) => (k === 'manha' ? 'manhã' : k === 'tarde' ? 'tarde' : 'noite');
    const slotLabel = (sl) => `${sl.date === c.day ? 'hoje' : T.fmtDate(sl.date, 'wd')} ${shiftShort(sl.shift)}`;
    // Grupos consolidados (T.slotGroups): dias/turnos seguidos com a mesma oferta viram uma linha só ("todos os dias", "sex 06 e sáb 07").
    const offerView = (p, service) => { const items = offerItemsOf(p, service, c); const groups = T.slotGroups(T.offerSlots(items, days, c.day, nowShift).filter((x) => !x.past), c.day, days); const nowG = groups.find((x) => x.now); const next = groups.filter((x) => !x.now).slice(0, 3); return (
      <div className="tri-offer-wrap">
        {nowG ? <><small className="tri-offer-h">{I('clock')}Agora{nowG.label === 'hoje ' + shiftShort(nowShift) ? ` · ${nowG.label}` : ` · ${nowG.label}`}</small><ul className="tri-offer" aria-label="O que é oferecido agora">{nowG.items.map((t, k) => <li key={k}><span>{t}</span></li>)}</ul></>
          : items.length ? <p className="tri-offer-empty">Nada programado agora ({slotLabel({ date: c.day, shift: nowShift })}).</p>
          : <p className="tri-offer-empty">Sem descrição do que é oferecido{canDo('manage') ? <> · <button type="button" className="link" onClick={() => openInfo(p, service.id)}>descrever</button></> : null}</p>}
        {next.length ? <p className="tri-next">{next.map((x, k) => <span key={k}><b>{x.label}</b>{x.items.join(', ')}</span>)}</p> : null}
      </div>
    ); };
    const infoFormView = (o, p) => {
      const f = o.form; const setF = (patch) => setInfoOpen((x) => Object.assign({}, x, { form: Object.assign({}, x.form, typeof patch === 'function' ? patch(x.form) : patch) }));
      const setItem = (i, patch) => setF((fm) => ({ items: fm.items.map((it, k) => (k === i ? Object.assign({}, it, patch) : it)) }));
      const fullWhen = () => Object.fromEntries(o.days.map((d) => [d, OFFER_SHIFTS.slice()]));
      const toggle = (i, d, sh) => setF((fm) => ({ items: fm.items.map((it, k) => { if (k !== i) return it; const w = Object.assign({}, it.when || fullWhen()); const cur = w[d] === true ? OFFER_SHIFTS.slice() : Array.isArray(w[d]) ? w[d].slice() : []; const nx = cur.includes(sh) ? cur.filter((x) => x !== sh) : cur.concat([sh]); if (nx.length) w[d] = nx; else delete w[d]; return Object.assign({}, it, { when: w }); }) }));
      const has = (it, d, sh) => !it.when || it.when[d] === true || (Array.isArray(it.when[d]) && it.when[d].includes(sh));
      // Toque no nome do dia: marca/desmarca o dia inteiro (os dois turnos) daquele item.
      const toggleDay = (i, d) => setF((fm) => ({ items: fm.items.map((it, k) => { if (k !== i) return it; const w = Object.assign({}, it.when || fullWhen()); const full = OFFER_SHIFTS.every((sh) => w[d] === true || (Array.isArray(w[d]) && w[d].includes(sh))); if (full) delete w[d]; else w[d] = OFFER_SHIFTS.slice(); return Object.assign({}, it, { when: w }); }) }));
      // Repetir hoje nos demais dias: cada item passa a valer nos outros dias nos mesmos turnos de hoje (quem não vale hoje, não muda).
      const repeatToday = () => setF((fm) => ({ items: fm.items.map((it) => { if (!it.when) return it; const td = it.when[c.day] === true ? OFFER_SHIFTS.slice() : Array.isArray(it.when[c.day]) ? it.when[c.day] : null; if (!td || !td.length) return it; const w = {}; for (const d of o.days) w[d] = td.slice(); return Object.assign({}, it, { when: w }); }) }));
      const setTot = (d, k, v) => setF((fm) => ({ totals: Object.assign({}, fm.totals, { [d]: Object.assign({}, fm.totals[d], { [k]: v }) }) }));
      const service = svc(o.service_id);
      return (
        <form className="tri-new-form tri-info" onSubmit={(e) => { e.preventDefault(); saveInfo(); }}>
          <h3 className="tri-h" style={{ '--c': '#1f3b9a' }}>{I('sliders')}Editar · {p.name}</h3>
          <label>Nome do atendimento<input type="text" value={f.name} autoComplete="off" maxLength={60} onFocus={(e) => e.target.select()} onChange={(e) => setF({ name: e.target.value })} /></label>
          <div className="row2">
            <label>Tipo<select value={f.kind} onChange={(e) => setF({ kind: e.target.value })}><option value="sala">Sala</option><option value="tenda">Tenda</option><option value="area">Outro ambiente</option></select></label>
            <label>Número / identificação<input type="text" value={f.num} autoComplete="off" placeholder="ex.: 19 ou A" maxLength={8} onChange={(e) => setF({ num: e.target.value })} /></label>
          </div>
          <div className="tri-sec"><b>O que é oferecido</b><label className="tri-check"><input type="checkbox" checked={f.all} onChange={(e) => setF({ all: e.target.checked })} />Igual todos os dias e turnos</label></div>
          <div className="tri-items">
            {f.items.map((it, i) => (
              <div key={i} className="tri-item" data-item={i}>
                <div className="tri-item-row"><input type="text" value={it.t} autoComplete="off" placeholder="ex.: Ginecologia" maxLength={80} onChange={(e) => setItem(i, { t: e.target.value })} /><button type="button" className="icon-btn" aria-label="Tirar este item" onClick={() => setF((fm) => ({ items: fm.items.filter((_, k) => k !== i) }))}>{I('x')}</button></div>
                {!f.all ? <div className="tri-when"><button type="button" className={`tw all ${!it.when ? 'on' : ''}`} onClick={() => setItem(i, { when: it.when ? null : {} })}>sempre</button>{o.days.map((d) => <span key={d} className="tw-day"><button type="button" className="tw-dname" title="Marcar o dia inteiro" onClick={() => toggleDay(i, d)}>{d === c.day ? 'hoje' : T.fmtDate(d, 'wd').split(' ')[0]}</button>{OFFER_SHIFTS.map((sh) => <button key={sh} type="button" className={`tw ${has(it, d, sh) ? 'on' : ''}`} data-when={`${d}|${sh}`} onClick={() => toggle(i, d, sh)}>{sh === 'manha' ? 'M' : 'T'}</button>)}</span>)}</div> : null}
              </div>
            ))}
            <div className="tri-item-actions"><button type="button" className="btn btn-ghost sm" data-act="item-add" onClick={() => setF((fm) => ({ items: fm.items.concat([{ t: '', when: null }]) }))}>{I('calendarplus')}Adicionar item</button>{!f.all && o.days.length > 1 ? <button type="button" className="btn btn-ghost sm" data-act="item-repeat" onClick={repeatToday}>{I('copy')}Repetir hoje nos demais dias</button> : null}{service ? <button type="button" className="btn btn-ghost sm" data-act="item-prog" onClick={() => { const its = offerItemsOf({ id: p.id }, service, c).map((x) => ({ t: x.t, when: x.when || null })); setF({ items: its, all: its.every((x) => !x.when) }); }}>{I('list')}Usar a programação</button> : null}</div>
          </div>
          <p className="tiny muted">"Sempre" = em todos os dias e turnos. M = manhã, T = tarde; toque no nome do dia para marcar o dia inteiro. Com "igual todos os dias" marcado, a agenda some. Sem nenhum turno marcado, o item não aparece.</p>
          <div className="tri-sec"><b>Senhas por dia</b><small>total possível de cada série e como o atendimento é registrado</small></div>
          <div className="tri-totals modes"><span className="cfg-h">Dia</span><span className="cfg-h">Comuns (N)</span><span className="cfg-h">Priorit. (P)</span><span className="cfg-h">Registro</span>{o.days.map((d) => <Fragment key={d}><span className="tri-tot-d">{T.fmtDate(d, 'wd')}{d === c.day ? ' · hoje' : ''}</span><input type="text" inputMode="numeric" value={f.totals[d].n} autoComplete="off" placeholder="—" data-tot={`${d}|n`} onChange={(e) => setTot(d, 'n', e.target.value)} /><input type="text" inputMode="numeric" value={f.totals[d].p} autoComplete="off" placeholder="—" data-tot={`${d}|p`} onChange={(e) => setTot(d, 'p', e.target.value)} /><select value={f.totals[d].mode} data-tot={`${d}|mode`} onChange={(e) => setTot(d, 'mode', e.target.value)}>{MODES.map((m) => <option key={m.id} value={m.id}>{m.short}</option>)}</select></Fragment>)}</div>
          <p className="tiny muted"><b>Chamada</b>: as senhas são chamadas na porta e aparecem na TV. <b>Contagem</b>: só a quantidade de senhas entregues conta como atendimentos nas estatísticas; a fila não aparece na porta nem na TV. Prefixo, primeiro número e ordem de chamada ficam em "padrão". Tudo aqui vale de hoje em diante para a triagem, a porta, a TV e o painel; a planta e o site não mudam.</p>
          <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => setInfoOpen(null)}>Cancelar</button><button type="submit" className="btn btn-primary" data-act="info-save">{I('check')}Gravar</button></div>
        </form>
      );
    };
    const manage = canDo('manage'); const qs = visibleQueues(); const off = manage ? disabledQueues() : [];
    const newForm = () => setExtraForm(Object.assign({}, EXTRA_BLANK, { service_id: (qs[0] || { service: { id: '' } }).service.id }));
    const serviceOptions = D.services.filter((x) => (D.senhas && D.senhas.services ? D.senhas.services.includes(x.id) : true));
    return (
      <>
        {top('Triagem · senhas', `${c.place} · ${T.fmtDate(c.day, 'wdlong')}${dayOff(c.day) ? ' · sem atendimento (dia desativado)' : c.service_day ? ' · dia de serviços' : ''}`, goHome, svcBtn())}
        {daysAdminView(c)}
        <p className="page-lead">Toque em <b>+1</b> a cada senha entregue. Toque no número para <b>digitar o total</b>.{manage ? <> Em <b>editar</b> você muda nome, sala e o que é oferecido; em <b>padrão</b>, a numeração e a ordem de chamada.</> : null}</p>
        {qs.map((g) => (
          <div key={g.service.id}>
            <h3 className="tri-h" style={{ '--c': g.service.color }}>{I(g.service.icon)}{g.service.title}</h3>
            <div className="tri">
              {g.places.map((p) => { const stt = statOf(g.service.id, p.id); const cfg = cfgOf(p.id, g.service.id); const openCfgHere = cfgOpen && cfgOpen.place_id === p.id; const openInfoHere = infoOpen && infoOpen.place_id === p.id; return (
                <div key={p.id} className={`tri-card ${p.extra ? 'extra' : ''}`} style={{ '--c': g.service.color }} data-id={p.id}>
                  <div className="tri-head">
                    <span className={`tri-room ${p.kind}`}>{p.num ? <><small>{KIND_LABEL[p.kind] || 'Ambiente'}</small><b>{p.num}</b></> : <>{I(p.kind === 'tenda' ? 'tent' : 'door')}<small>{KIND_LABEL[p.kind] || 'Ambiente'}</small></>}</span>
                    <span className="tri-title"><b>{p.name}</b><small>{[g.service.title !== p.name && g.service.short !== p.name ? g.service.title : '', stt && (stt.called || stt.served) ? `${stt.called} chamada${stt.called === 1 ? '' : 's'} · ${stt.served} atendida${stt.served === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || (p.extra ? 'criado na triagem' : 'sala da planta')}</small></span>
                    {manage ? <button type="button" className={`tri-edit ${openInfoHere ? 'on' : ''}`} data-act="info" data-id={p.id} onClick={() => { setCfgOpen(null); openInfo(p, g.service.id); }}>{I('sliders')}<span>editar</span></button> : <span />}
                  </div>
                  {offerView(p, g.service)}
                  {openInfoHere ? infoFormView(infoOpen, p) : null}
                  {counter(p, g.service.id, 'n', cfg)}
                  {cfg.p_total || cnt(p.id, 'p') ? counter(p, g.service.id, 'p', cfg) : null}
                  {!manage ? <div className="tri-foot"><span className="tri-ro">{I('ticket')}{cfgSummary(cfg)} · {modeOf(p.id, g.service.id) === 'contagem' ? 'só contagem' : 'chamada na porta'}</span></div> : <div className="tri-foot">
                    <button type="button" className={`tri-cfg-btn ${openCfgHere ? 'on' : ''}`} data-act="cfg" data-id={p.id} onClick={() => { setInfoOpen(null); openCfg(p, g.service.id); }} title="Padrão de senhas desta sala">{I('ticket')}<span>padrão</span><small>{cfgSummary(cfg)}</small></button>
                    <button type="button" className={`tri-mode ${modeOf(p.id, g.service.id)}`} data-act="mode" data-id={p.id} onClick={() => toggleMode(p, g.service.id)} title="Como o atendimento é registrado hoje (toque para trocar)">{I(modeOf(p.id, g.service.id) === 'contagem' ? 'list' : 'tv')}<span>{modeOf(p.id, g.service.id) === 'contagem' ? 'só contagem' : 'chamada na porta'}</span><small>hoje · trocar</small></button>
                    <span className="tri-links">
                      <button type="button" className="link off" data-act="queue-off" data-id={p.id} onClick={() => { if (confirm(`Desativar "${p.name}" hoje? Some da porta da sala e da TV até ser reativado aqui.`)) setEnabled(p, g.service.id, false); }}>desativar</button>
                      {p.extra ? <button type="button" className="link rm" data-act="extra-rm" onClick={() => removeExtra(p)}>remover</button> : null}
                    </span>
                  </div>}
                  {openCfgHere ? <div className="tri-cfg-wrap">{cfgFormView(cfgOpen)}</div> : null}
                </div>
              ); })}
            </div>
          </div>
        ))}
        {!qs.length ? (
          <div className="tri-empty">
            <span className="ic">{I('ticket')}</span>
            <b>Nenhuma fila {c.service_day ? 'ativa' : 'criada'} hoje em {c.place}.</b>
            <small>{off.length ? 'Todas as filas da planta estão desativadas hoje (reative abaixo) ou crie uma nova.' : 'Crie a fila do atendimento que vai distribuir senha (ex.: Consulta Médica).'}</small>
            {!extraForm && manage ? <button type="button" className="btn btn-primary" data-act="extra-new" onClick={newForm}>{I('calendarplus')}Criar serviço / sala</button> : null}
          </div>
        ) : null}
        {manage ? <div className="tri-new">
          {!extraForm ? (qs.length ? <button type="button" className="btn btn-ghost" data-act="extra-new" onClick={newForm}>{I('calendarplus')}Novo serviço / sala</button> : null) : (
            <form className="tri-new-form" onSubmit={(e) => { e.preventDefault(); saveExtra(); }}>
              <h3 className="tri-h" style={{ '--c': '#1f3b9a' }}>{I('calendarplus')}Novo serviço / sala</h3>
              <p className="tiny muted">Para um atendimento que não estava na planta. Ele entra na triagem, na porta da sala e na TV deste local, hoje. Depois de criado, dá para editar nome, sala e o que é oferecido.</p>
              <label>Serviço<select value={extraForm.service_id} onChange={(e) => { const sid = e.target.value; const sv = svc(sid); setExtraForm((f) => { const prev = svc(f.service_id); const keep = f.name.trim() && !(prev && f.name === prev.title); return Object.assign({}, f, { service_id: sid, name: keep ? f.name : sv ? sv.title : f.name }); }); }}><option value="">escolha…</option>{serviceOptions.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
              <label>Nome do atendimento (como aparece na TV)<input type="text" value={extraForm.name} autoComplete="off" placeholder="ex.: Consulta Médica" maxLength={60} onChange={(e) => setExtraForm((f) => Object.assign({}, f, { name: e.target.value }))} /></label>
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
        </div> : null}
        {qs.length && manage ? <div className="tri-all">
          <button type="button" className="btn btn-ghost" data-act="cfg-all" onClick={openCfgAll}>{I('ticket')}Padrão de senhas para todas as salas</button>
          {cfgOpen && cfgOpen.all ? cfgFormView(cfgOpen) : null}
        </div> : null}
        {off.length ? (
          <div className="tri-off">
            <h3 className="tri-h" style={{ '--c': '#64748b' }}>{I('x')}Desativados hoje ({off.length})</h3>
            <p className="tiny muted">Não aparecem na porta da sala nem na TV. Toque em reativar para voltar.</p>
            <div className="tri">{off.map((p) => (
              <div key={p.id} className="tri-row off" style={{ '--c': '#94a3b8' }}>
                <span className="ic">{I(p.kind === 'tenda' ? 'tent' : 'door')}</span>
                <span className="nm"><b>{p.name}</b><small>{placeLabel(p)} · {p.svc.short}</small></span>
                <button type="button" className="btn btn-primary sm" data-act="queue-on" data-id={p.id} onClick={() => setEnabled(p, p.svc.id, true)}>{I('check')}Reativar</button>
              </div>
            ))}</div>
          </div>
        ) : null}
      </>
    );
  }
  function viewPortaSetup() {
    const c = ctxOf(st); const open = new Set(rooms.map((r) => r.id));
    return (
      <>
        {top(adding ? 'Adicionar sala à tela' : 'Porta da sala', adding ? `Escolha mais uma sala para chamar nesta mesma tela · ${c.place}` : `Em qual sala/atendimento você está? · ${c.place}`, adding ? () => setAdding(false) : goHome, svcBtn())}
        {!data ? <p className="door-hint">{I('hourglass')} buscando as salas criadas na triagem…</p> : null}
        {adding ? <p className="page-lead">Você pode cuidar de mais de uma sala no mesmo aparelho: cada sala fica num cartão, com a sua própria fila e os seus próprios botões.</p> : null}
        {visibleQueues().map((g) => ({ service: g.service, places: g.places.filter((p) => modeOf(p.id, g.service.id) !== 'contagem') })).filter((g) => g.places.length).map((g) => (
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
    if (qd && modeOf(room.id, room.service_id) === 'contagem') return (
      <section key={room.id} className={`room-card ${multi ? 'multi' : ''}`} style={{ '--c': s.color }}>
        <div className="tri-empty"><span className="ic">{I('list')}</span><b>{qd.name} · só contagem hoje</b><small>A triagem definiu que hoje este atendimento não chama senha: as senhas entregues contam como atendimentos. Nada a lançar aqui.</small>{multi ? <button type="button" className="btn btn-ghost sm" onClick={() => act.roomRemove(room.id)}>{I('x')}Tirar da tela</button> : <button type="button" className="btn btn-ghost sm" onClick={act.placeClear}>{I('back')}Escolher outra sala</button>}</div>
      </section>
    );
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
    const c = ctxOf(st); const day = pf.day || c.day; const venue = pf.venue || c.venue; const vn = D.venues[venue] || {};
    const today = clock.date; const ready = data && data.stats && data.day === day && data.venue === venue;
    const sub = `${vn.short || venue} · ${T.fmtDate(day, 'wdlong')} · atualiza a cada 15 s`;
    // dias para o filtro: dias do evento + dias com registros neste local; locais com planta
    const days = filterDays((data && data.data_days) || [], venue, (data && data.days_off) || []).filter((d) => canDo('days') || !d.off); const venues = Object.keys(D.maps || {}).filter((v) => D.venues[v]);
    const all = ready ? mergeExtras(fixedQueues(venue, day), data.extras || []) : []; const live = ready ? withoutDisabled(all, data.disabled || []) : [];
    const svcList = live.map((g) => g.service);
    const selSvcs = new Set(pf.svcs.filter((id) => svcList.some((x) => x.id === id)));
    const nFilters = (pf.shift !== 'all' ? 1 : 0) + (selSvcs.size ? 1 : 0) + (pf.only ? 1 : 0) + (pf.sort !== 'planta' ? 1 : 0);
    const toggleSvc = (id) => setPf((p) => ({ svcs: p.svcs.includes(id) ? p.svcs.filter((x) => x !== id) : p.svcs.concat([id]) }));
    const filters = (
      <div className="pf">
        <div className="chips scroll pf-days" aria-label="Dia">
          {days.map((d) => <button key={d.date} type="button" className={`chip ${d.date === day ? 'on' : ''} ${d.has_data || d.service_day ? '' : 'dim'} ${d.off ? 'off' : ''}`} data-day={d.date} onClick={() => setPf({ day: d.date })} title={d.off ? 'dia desativado pela administração' : d.service_day ? 'dia de serviços' : d.has_data ? 'tem registros' : 'sem registros'}>{I('calendar')}{T.fmtDate(d.date, 'wd')}{d.off ? <small>desativado</small> : d.date === today ? <small>hoje</small> : d.service_day ? <small>serviços</small> : null}</button>)}
        </div>
        <div className="pf-bar">
          <button type="button" className={`chip ${pf.open ? 'on' : ''}`} data-act="pf-toggle" onClick={() => setPf({ open: !pf.open })}>{I('sliders')}Filtros{nFilters ? <b className="pf-n">{nFilters}</b> : null}</button>
          <div className="pf-sum">
            {venues.length > 1 ? <span className="chip static">{I('pin')}{vn.short || venue}</span> : null}
            {pf.shift !== 'all' ? <span className="chip static">{SHIFT_FILTERS.find((x) => x.id === pf.shift).label}</span> : null}
            {[...selSvcs].map((id) => { const x = svc(id); return x ? <span key={id} className="chip static c" style={{ '--c': x.color }}>{x.short}</span> : null; })}
            {pf.only ? <span className="chip static">só com movimento</span> : null}
          </div>
          {canDo('csv') ? <a className="chip" href={`${BP}/api/export.csv?day=${day}`} download={`atendimentos-${day}.csv`} data-act="csv">{I('download')}CSV</a> : null}
        </div>
        {pf.open ? (
          <div className="pf-more">
            {venues.length > 1 ? <div className="pf-row"><small>Local</small><div className="chips">{venues.map((v) => <button key={v} type="button" className={`chip ${v === venue ? 'on' : ''}`} data-venue={v} onClick={() => setPf({ venue: v, svcs: [] })}>{I('pin')}{D.venues[v].short}</button>)}</div></div> : null}
            <div className="pf-row"><small>Turno</small><div className="chips">{SHIFT_FILTERS.map((x) => <button key={x.id} type="button" className={`chip ${pf.shift === x.id ? 'on' : ''}`} data-shift={x.id} onClick={() => setPf({ shift: x.id })}>{x.label}</button>)}</div></div>
            <div className="pf-row"><small>Serviços</small><div className="chips">{svcList.map((x) => <button key={x.id} type="button" className={`chip ${selSvcs.has(x.id) ? 'on c' : ''}`} style={{ '--c': x.color }} data-svc={x.id} onClick={() => toggleSvc(x.id)}>{I(x.icon)}{x.short}</button>)}{selSvcs.size ? <button type="button" className="chip clear" onClick={() => setPf({ svcs: [] })}>{I('x')}todos</button> : null}</div></div>
            <div className="pf-row"><small>Mostrar</small><div className="chips"><button type="button" className={`chip ${pf.only ? 'on' : ''}`} data-act="pf-only" onClick={() => setPf({ only: !pf.only })}>{I('check')}só salas com movimento</button><button type="button" className={`chip ${pf.sort === 'atend' ? 'on' : ''}`} data-act="pf-sort" onClick={() => setPf({ sort: pf.sort === 'atend' ? 'planta' : 'atend' })}>{I('arrowup')}mais atendidas primeiro</button></div></div>
            {nFilters ? <div className="pf-row"><small></small><div className="chips"><button type="button" className="chip clear" data-act="pf-clear" onClick={() => setPf({ shift: 'all', svcs: [], only: false, sort: 'planta' })}>{I('x')}Limpar filtros</button></div></div> : null}
          </div>
        ) : null}
      </div>
    );
    if (!ready) return <>{top('Painel de acompanhamento', sub, goHome)}{filters}<p className="tri-info">{I('hourglass')}Carregando {T.fmtDate(day, 'wd')} · {vn.short || venue}…</p></>;
    const fd = filterData(data, { svcs: [...selSvcs], shift: pf.shift }); const S = fd.stats; const countOnly = fd.countOnly;
    const empty = { issued: 0, called: 0, served: 0, absent: 0, pending_result: 0, not_called: 0, in_service: 0, avg_min: null, est_wait_min: null, current: null };
    const t = Object.assign({}, empty, { absent_rate: null, samples: 0 }, S.total || {});
    // por hora: chamadas reais + senhas de filas "só contagem" no horário do lançamento (já com os filtros)
    const perHour = {}; for (const e of fd.events) { const h = hourOf(e.called_at); perHour[h] = (perHour[h] || 0) + 1; }
    const hs = Object.keys(perHour).map(Number); const hours = []; if (hs.length) for (let h = Math.min(...hs); h <= Math.max(...hs); h++) hours.push(h);
    const max = Math.max(1, ...hours.map((h) => perHour[h] || 0));
    const groups = (selSvcs.size ? live.filter((g) => selSvcs.has(g.service.id)) : live).map((g) => {
      const x = S.services.find((y) => y.service_id === g.service.id) || Object.assign({ places: [] }, empty);
      let rows = g.places.map((p) => Object.assign({ place: p }, x.places.find((y) => y.place_id === p.id) || empty));
      if (pf.only) rows = rows.filter((r) => r.issued || r.called);
      if (pf.sort === 'atend') rows = rows.slice().sort((a, b) => b.served - a.served || b.issued - a.issued);
      return { g, x, rows };
    }).filter((o) => !pf.only || o.rows.length);
    const sorted = pf.sort === 'atend' ? groups.slice().sort((a, b) => b.x.served - a.x.served || b.x.issued - a.x.issued) : groups;
    const cell = (label, v, extra) => <div><small>{label}</small><b>{v}</b>{extra || null}</div>;
    return (
      <>
        {top('Painel de acompanhamento', sub, goHome)}
        {filters}
        {fd.filtered ? <p className="pf-note">{I('info')}Números do recorte: {pf.shift !== 'all' ? SHIFT_FILTERS.find((x) => x.id === pf.shift).label.toLowerCase() : 'dia todo'}{selSvcs.size ? ` · ${selSvcs.size} serviço${selSvcs.size > 1 ? 's' : ''}` : ''}.</p> : null}
        <div className="kpis">
          <div className="kpi hi"><small>Senhas entregues</small><b>{t.issued}</b><em>triagem</em></div>
          <div className="kpi"><small>Chamadas</small><b>{t.called}</b><em>{t.not_called} aguardando chamada</em></div>
          <div className="kpi"><small>Atendidas</small><b>{t.served}</b><em>{fd.countedTotal ? `${fd.countedTotal} por contagem` : `${t.in_service} em atendimento agora`}</em></div>
          <div className="kpi"><small>Não compareceram</small><b>{t.absent}</b><em>{t.absent_rate == null ? '—' : `${t.absent_rate}% das chamadas`}</em></div>
          <div className="kpi"><small>Tempo médio de atendimento</small><b>{t.avg_min == null ? '—' : `${t.avg_min} min`}</b><em>{t.samples} atendimento{t.samples === 1 ? '' : 's'} medido{t.samples === 1 ? '' : 's'}</em></div>
          <div className="kpi"><small>Sem registro de resultado</small><b>{t.pending_result}</b><em>chamadas sem entrou/faltou</em></div>
        </div>
        {hours.length ? (
          <div className="chart"><b style={{ fontFamily: 'var(--font-display)' }}>Atendimentos por hora</b>{fd.countedTotal ? <small className="pn-leg"> · chamadas + senhas por contagem</small> : null}
            <div className="pn-bars" role="img" aria-label="Atendimentos por hora">{hours.map((h) => { const v = perHour[h] || 0; return <div key={h} className="pn-hb"><span className="pn-hv">{v || ''}</span><i style={{ height: `${Math.max(v ? 3 : 0, Math.round((100 * v) / max))}%` }} /><small>{h}h</small></div>; })}</div>
          </div>
        ) : null}
        <h2 style={{ margin: '1.2em 0 .5em' }}>Por serviço</h2>
        {!sorted.length ? <p className="tri-info">{I('info')}Nada para mostrar com estes filtros.</p> : null}
        <div className="stack">
          {sorted.map(({ g, x, rows }) => { const s = g.service; return (
            <div key={s.id} className="svc-stat" style={{ '--c': s.color }}>
              <div className="hd"><i>{I(s.icon)}</i><b>{s.title}</b><small>{x.issued} entr. · {x.served} atend.{x.avg_min != null ? ` · ${x.avg_min} min` : ''}</small></div>
              <div className="pls">{rows.map((r) => { const base = Math.max(1, r.issued, r.called); const w = (n) => `${Math.round((100 * n) / base)}%`; const live2 = r.current && r.current.status === 'served' && r.current.in_service_min != null; const co = countOnly.has(r.place.id); return (
                <div key={r.place.id} className={`pl ${co ? 'co' : ''}`} data-place={r.place.id}>
                  <div className="pl-h"><div className="pl-who"><b>{r.place.name}</b><small>{placeLabel(r.place)}{co ? <> · <em className="tag-count">{I('list')}contagem</em></> : null}</small></div>{r.current ? <span className={`badge ${live2 ? 'served' : r.current.status}`}>{r.current.ticket ?? '—'}{live2 ? <small> {r.current.in_service_min}′</small> : null}</span> : null}</div>
                  <div className="bar mini"><i className="s" style={{ width: w(r.served) }}></i><i className="a" style={{ width: w(r.absent) }}></i><i className="p" style={{ width: w(r.pending_result) }}></i></div>
                  <div className="pl-n">
                    {cell('Entregues', r.issued)}{cell('Chamadas', co ? '—' : r.called)}{cell('Atendidas', r.served)}{cell('Faltas', co ? '—' : r.absent)}{cell('Aguardando', co ? '—' : r.not_called, r.est_wait_min != null && !co ? <small>~{r.est_wait_min} min</small> : null)}{cell('Média', r.avg_min == null ? '—' : `${r.avg_min}′`)}
                  </div>
                </div>
              ); })}</div>
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
  const body = { pin: viewPin, local: viewLocal, role: viewRole, 'svc-pick': viewSvcPick, triagem: viewTriagem, painel: viewPainel, 'porta-setup': viewPortaSetup, porta: viewPorta }[screen]();
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
