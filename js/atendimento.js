/* Atendimento (equipe): controle de senhas por serviço. Três funções: Triagem (quantas senhas entregues),
   Porta da sala (qual senha está sendo chamada; entrou ou faltou) e Painel (acompanhamento).
   Fala com a API em event.apiUrl (server/senhas.js). Guarda PIN e configuração no aparelho; fila offline. */
(function () {
  'use strict';
  const T = window.TCE; const D = T.D; const I = T.icon; const esc = T.esc; const M = window.TCEMap;
  const root = document.getElementById('app');
  const API = (T.params.get('api') || D.event.apiUrl || '').replace(/\/$/, '');
  const LS = 'tce_at';
  const VER = (document.querySelector('script[src*="atendimento.js"]') || { src: '' }).src.split('?v=')[1] || '0';
  const st = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })();
  if (!st.device) st.device = Math.random().toString(36).slice(2, 10);
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch { /* */ } };
  let clock = T.now(); let pinBuf = ''; let data = null; let queue = null; let timer = null; let syncState = 'ok'; let pending = 0;

  // ---------- dia e local ----------
  const dayDefault = () => (T.serviceDayOf(clock.date) || T.nextServiceDay(clock.date) || T.serviceDays()[T.serviceDays().length - 1]);
  const ctx = () => { const d = T.serviceDays().find((x) => x.date === st.day) || dayDefault(); return { day: d.date, venue: d.venue, place: d.place }; };
  const svc = (id) => T.serviceById(id);
  const placeName = (id) => { const p = T.placeInfo(id); return p ? (p.kind === 'area' && !p.num ? p.name : `${M.placeLabel(p)} · ${p.name}`) : id; };
  const fmtT = (ms) => T.partsOf(new Date(ms)).time;

  // ---------- API ----------
  async function api(path, opts) {
    const o = opts || {};
    const res = await fetch(`${API}${path}`, { method: o.method || 'GET', headers: Object.assign({ 'X-Pin': st.pin || '' }, o.body ? { 'Content-Type': 'application/json' } : {}), body: o.body ? JSON.stringify(o.body) : undefined, cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(j.error || `erro ${res.status}`); e.status = res.status; throw e; }
    return j;
  }
  // Fila offline: gravações que falharam por rede ficam no aparelho e são reenviadas.
  const outbox = () => { try { return JSON.parse(localStorage.getItem(LS + '_out')) || []; } catch { return []; } };
  const setOutbox = (l) => { try { localStorage.setItem(LS + '_out', JSON.stringify(l)); } catch { /* */ } pending = l.length; };
  async function post(path, body) {
    try { const r = await api(path, { method: 'POST', body }); syncState = 'ok'; return r; }
    catch (e) { if (e.status) { toast(e.message, 'alert'); syncState = 'err'; throw e; } setOutbox(outbox().concat([{ path, body }])); syncState = 'off'; toast('Sem rede: guardado no aparelho, envio depois', 'info'); return null; }
  }
  async function flush() {
    const l = outbox(); if (!l.length) return; const rest = [];
    for (const it of l) { try { await api(it.path, { method: 'POST', body: it.body }); } catch (e) { if (!e.status) rest.push(it); } }
    setOutbox(rest); if (!rest.length) syncState = 'ok';
  }

  // ---------- telas ----------
  const top = (title, sub, back) => `<div class="at-top">${back ? `<button class="btn btn-ghost" data-act="${back}">${I('back')}Voltar</button>` : ''}<div class="where"><span>${title}</span><small>${sub}</small></div><span class="sync ${syncState}" title="Sincronização"><i></i>${syncState === 'ok' ? 'sincronizado' : syncState === 'off' ? `${pending} pendente${pending > 1 ? 's' : ''}` : 'erro'}</span></div>`;

  function viewPin() {
    return `<div class="pin"><div class="pin-card"><span class="logo-chip big"><img src="img/tce-mark.png" alt=""></span><h1>Atendimento</h1><p>Controle de senhas dos serviços gratuitos.<br>Digite o PIN da equipe para entrar.</p></div><div class="pin-dots">${[0, 1, 2, 3, 4, 5].map((k) => `<i class="${k < pinBuf.length ? 'on' : ''}" ${k >= 4 && pinBuf.length < 5 ? 'style="display:none"' : ''}></i>`).join('')}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}">${n}</button>`).join('')}<button class="soft" data-key="clear" aria-label="Apagar">${I('back')}</button><button data-key="0">0</button><button class="go" data-key="ok">Entrar</button></div>
      <p class="tiny muted" id="pin-msg">${esc(st.msg || 'PIN de 4 dígitos (equipe) ou 6 dígitos (gestão).')}</p><p class="tiny muted">${esc(D.event.name)} · ${esc(D.event.edition)} · versão ${esc(VER)}</p></div>`;
  }
  function viewRole() {
    const c = ctx();
    return `${top(`Olá, ${st.role === 'gestor' ? 'gestão' : 'equipe'}`, `${esc(c.place)} · ${esc(T.fmtDate(c.day, 'wdlong'))}`)}
      <div class="chips">${T.serviceDays().map((d) => `<button class="chip ${d.date === c.day ? 'on' : ''}" data-act="day" data-day="${d.date}">${I('calendar')}${esc(T.fmtDate(d.date, 'wd'))} · ${esc(d.place)}</button>`).join('')}</div>
      <h2 style="margin:.8em 0 .2em">O que você vai fazer?</h2>
      <div class="roles">
        <button class="role" style="--c:#fbbf24" data-act="mode" data-mode="triagem"><i>${I('ticket')}</i><span><b>Triagem · entrega de senhas</b><small>Informe quantas senhas de cada serviço já foram entregues</small></span>${I('right')}</button>
        <button class="role" style="--c:#16a34a" data-act="mode" data-mode="porta"><i>${I('door')}</i><span><b>Porta da sala · chamada</b><small>Registre a senha chamada e se a pessoa entrou ou não compareceu</small></span>${I('right')}</button>
        <button class="role" style="--c:#1f3b9a" data-act="mode" data-mode="painel"><i>${I('layers')}</i><span><b>Painel · acompanhamento</b><small>Senhas entregues, atendidas, faltas e tempo médio por serviço e sala</small></span>${I('right')}</button>
      </div>
      <p class="tiny muted">Aparelho ${esc(st.device)} · <button class="link" data-act="logout">sair</button></p>`;
  }
  function viewTriagem() {
    const c = ctx(); const issued = (data && data.issued) || [];
    const cnt = (id) => { const l = (st.local && st.local[`${c.day}|${id}`]); const r = issued.find((x) => x.service_id === id); return l != null && (!r || l.ts >= r.ts) ? l.count : r ? r.count : 0; };
    return `${top('Triagem · senhas entregues', `${esc(c.place)} · ${esc(T.fmtDate(c.day, 'wdlong'))}`, 'home')}
      <p class="page-lead">Toque em <b>+1</b> a cada senha entregue. Para lançar de uma vez, toque no número e <b>digite o total já entregue</b>.</p>
      <div class="tri">${D.services.map((s) => { const n = cnt(s.id); const stt = data && data.stats.services.find((x) => x.service_id === s.id); return `<div class="tri-row" style="--c:${s.color}"><span class="ic">${I(s.icon)}</span><span class="nm"><b>${esc(s.short)}</b><small>${stt ? `${stt.called} chamada${stt.called === 1 ? '' : 's'} · ${stt.served} atendida${stt.served === 1 ? '' : 's'}` : 'sem chamadas ainda'}</small></span><button class="minus" data-act="issued" data-id="${s.id}" data-delta="-1" aria-label="Menos um">${I('x')}</button><button class="cnt" data-act="issued-set" data-id="${s.id}" aria-label="Digitar o total entregue"><b>${n}</b><small>${I('sliders')}digitar</small></button><button class="plus" data-act="issued" data-id="${s.id}" data-delta="1">+1</button></div>`; }).join('')}</div>`;
  }
  function viewPortaSetup() {
    const c = ctx(); const s = st.service ? svc(st.service) : null;
    if (!s) return `${top('Porta da sala', 'Qual serviço você vai registrar?', 'home')}<div class="roles">${D.services.map((x) => `<button class="role" style="--c:${x.color}" data-act="svc" data-id="${x.id}"><i>${I(x.icon)}</i><span><b>${esc(x.title)}</b><small>${esc(x.summary)}</small></span>${I('right')}</button>`).join('')}</div>`;
    const ids = T.placesOf(s, c.venue);
    return `${top(`Porta da sala · ${esc(s.short)}`, 'Em qual sala você está?', 'svc-clear')}<div class="roles">${ids.map((id) => { const p = T.placeInfo(id); return `<button class="role" style="--c:${s.color}" data-act="place" data-id="${id}"><i>${I(p && p.kind === 'tenda' ? 'tent' : 'door')}</i><span><b>${esc(placeName(id))}</b></span>${I('right')}</button>`; }).join('')}<button class="role" style="--c:#64748b" data-act="place" data-id="outro"><i>${I('pin')}</i><span><b>Outro local</b><small>sem sala definida na planta</small></span>${I('right')}</button></div>`;
  }
  function viewPorta() {
    const c = ctx(); const s = svc(st.service); const calls = (queue && queue.calls) || []; const cur = calls[0] || null;
    const issued = queue && queue.issued ? queue.issued.count : null; const last = queue && queue.last_ticket != null ? queue.last_ticket : (cur ? cur.ticket : 0);
    const next = (last || 0) + 1; const inService = cur && cur.status === 'served' && !cur.ended_at;
    const svcStat = data && data.stats.services.find((x) => x.service_id === s.id);
    const called = svcStat ? svcStat.called : calls.length;
    return `${top(`${esc(placeName(st.place))}`, `${esc(s.title)} · ${esc(c.place)}`, 'place-clear')}
      <div class="door">
        ${cur ? `<div class="door-now"><small>${cur.status === 'called' ? 'Chamando agora' : cur.status === 'served' ? (inService ? 'Em atendimento' : 'Atendida') : 'Não compareceu'}</small><b>${cur.ticket ?? '—'}</b><span class="st ${cur.status}">${cur.status === 'called' ? `${I('megaphone')}chamada às ${fmtT(cur.called_at)}` : cur.status === 'served' ? `${I('check')}entrou às ${fmtT(cur.status_at)}${inService ? ` · há ${Math.max(0, Math.round((Date.now() - cur.status_at) / 60000))} min` : ''}` : `${I('x')}faltou`}</span></div>` : `<div class="door-now idle"><small>Nenhuma senha chamada ainda</small><b>—</b></div>`}
        ${cur && cur.status === 'called'
          ? `<p class="door-hint">Senha <b>${cur.ticket ?? '—'}</b> foi chamada. A pessoa…</p><div class="door-res"><button class="ok" data-act="status" data-id="${cur.id}" data-status="served">${I('check')}<span>Entrou</span></button><button class="no" data-act="status" data-id="${cur.id}" data-status="absent">${I('x')}<span>Não veio</span></button></div>`
          : `<p class="door-hint">Próxima: <b>senha ${next}</b>. Um toque registra a chamada e o resultado.</p><div class="door-res big"><button class="ok" data-act="call" data-ticket="${next}" data-status="served">${I('check')}<span>Entrou<small>senha ${next}</small></span></button><button class="no" data-act="call" data-ticket="${next}" data-status="absent">${I('x')}<span>Não veio<small>senha ${next}</small></span></button></div>`}
        <div class="door-tools">${inService ? `<button class="btn btn-ghost" data-act="end" data-id="${cur.id}">${I('flag')}Finalizar atendimento</button>` : ''}<button class="btn btn-ghost" data-act="call-other">${I('ticket')}Outro número</button>${cur ? `<button class="btn btn-ghost" data-act="undo" data-id="${cur.id}">${I('back')}Desfazer</button>` : ''}</div>
        <div class="door-kpi"><div><small>Entregues</small><b>${issued == null ? '—' : issued}</b></div><div><small>Chamadas</small><b>${called}</b></div><div><small>Aguardando</small><b>${issued == null ? '—' : Math.max(0, issued - called)}</b></div></div>
        ${calls.length > 1 ? `<h3 style="margin:.4em 0 .2em">Últimas chamadas</h3><ul class="hist">${calls.slice(1, 9).map((x) => `<li><b>${x.ticket ?? '—'}</b><span class="badge ${x.status}">${x.status === 'served' ? 'entrou' : x.status === 'absent' ? 'faltou' : 'sem registro'}</span><time>${fmtT(x.called_at)}</time>${x.status === 'called' ? `<button class="link" data-act="status" data-id="${x.id}" data-status="served">entrou</button>` : ''}</li>`).join('')}</ul>` : ''}
      </div>`;
  }
  function viewPainel() {
    const c = ctx(); const S = data && data.stats; if (!S) return `${top('Painel', 'carregando…', 'home')}`;
    const t = S.total; const hours = Object.keys(S.per_hour).map(Number).sort((a, b) => a - b); const max = Math.max(1, ...hours.map((h) => S.per_hour[h]));
    const chart = hours.length ? `<div class="chart"><b style="font-family:var(--font-display)">Chamadas por hora</b><svg viewBox="0 0 ${Math.max(300, hours.length * 46)} 150">${hours.map((h, k) => { const v = S.per_hour[h]; const bh = Math.round((v / max) * 100); return `<rect x="${k * 46 + 8}" y="${120 - bh}" width="30" height="${bh}" rx="4"/><text class="lbl" x="${k * 46 + 23}" y="${114 - bh}" text-anchor="middle">${v}</text><text x="${k * 46 + 23}" y="140" text-anchor="middle">${h}h</text>`; }).join('')}</svg></div>` : '';
    return `${top('Painel de acompanhamento', `${esc(c.place)} · ${esc(T.fmtDate(c.day, 'wdlong'))} · atualiza a cada 15 s`, 'home')}
      <div class="chips">${T.serviceDays().map((d) => `<button class="chip ${d.date === c.day ? 'on' : ''}" data-act="day" data-day="${d.date}">${I('calendar')}${esc(T.fmtDate(d.date, 'wd'))} · ${esc(d.place)}</button>`).join('')}${st.role === 'gestor' ? `<a class="chip" href="${API}/api/export.csv?day=${c.day}" data-act="csv">${I('download')}Exportar CSV</a>` : ''}</div>
      <div class="kpis"><div class="kpi hi"><small>Senhas entregues</small><b>${t.issued}</b><em>triagem</em></div><div class="kpi"><small>Chamadas</small><b>${t.called}</b><em>${t.not_called} aguardando chamada</em></div><div class="kpi"><small>Atendidas</small><b>${t.served}</b><em>${t.in_service} em atendimento agora</em></div><div class="kpi"><small>Não compareceram</small><b>${t.absent}</b><em>${t.absent_rate == null ? '—' : `${t.absent_rate}% das chamadas`}</em></div><div class="kpi"><small>Tempo médio de atendimento</small><b>${t.avg_min == null ? '—' : `${t.avg_min} min`}</b><em>${t.samples} atendimento${t.samples === 1 ? '' : 's'} medido${t.samples === 1 ? '' : 's'}</em></div><div class="kpi"><small>Sem registro de resultado</small><b>${t.pending_result}</b><em>chamadas sem entrou/faltou</em></div></div>
      ${chart}
      <h2 style="margin:1.2em 0 .5em">Por serviço</h2>
      <div class="stack">${D.services.map((s) => { const x = S.services.find((y) => y.service_id === s.id) || { issued: 0, called: 0, served: 0, absent: 0, pending_result: 0, not_called: 0, in_service: 0, places: [], avg_min: null, est_wait_min: null }; const base = Math.max(1, x.issued, x.called); const w = (n) => `${Math.round((100 * n) / base)}%`;
        return `<div class="svc-stat" style="--c:${s.color}"><div class="hd"><i>${I(s.icon)}</i><b>${esc(s.title)}</b><small>${x.avg_min == null ? 'sem média' : `média ${x.avg_min} min`}</small></div><div class="bar"><i class="s" style="width:${w(x.served)}"></i><i class="a" style="width:${w(x.absent)}"></i><i class="p" style="width:${w(x.pending_result)}"></i></div><div class="nums"><span>entregues <b>${x.issued}</b></span><span>chamadas <b>${x.called}</b></span><span>atendidas <b>${x.served}</b></span><span>faltas <b>${x.absent}</b></span><span>aguardando <b>${x.not_called}</b></span>${x.est_wait_min != null ? `<span>espera estimada <b>${x.est_wait_min} min</b></span>` : ''}</div>${x.places.length ? `<div class="rooms">${x.places.map((p) => `<span class="${p.current && p.current.status === 'served' && p.current.in_service_min != null ? 'live' : ''}">${esc(placeName(p.place_id).split(' · ')[0])}: senha <b>${p.current ? p.current.ticket ?? '—' : '—'}</b> · ${p.served} atend.${p.avg_min != null ? ` · ${p.avg_min} min` : ''}</span>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
  }
  function viewNum(title, value) {
    return `<div class="sheet-root" id="sheet-root"><div class="sheet numpad-sheet"><div class="sheet-head"><span class="kicker">${I('ticket')}${esc(title)}</span><button class="icon-btn" data-close aria-label="Fechar">${I('x')}</button></div><div class="sheet-body"><input class="bigin" id="num" type="number" inputmode="numeric" value="${value}" min="0" max="100000"><div class="keypad" style="margin:1em auto">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-num="${n}">${n}</button>`).join('')}<button class="soft" data-num="back" aria-label="Apagar">${I('back')}</button><button data-num="0">0</button><button class="go" data-num="ok">OK</button></div></div></div></div>`;
  }

  // ---------- render ----------
  function render() {
    const screen = !st.role ? 'pin' : !st.mode ? 'role' : st.mode === 'triagem' ? 'triagem' : st.mode === 'painel' ? 'painel' : (!st.service || !st.place) ? 'porta-setup' : 'porta';
    const html = { pin: viewPin, role: viewRole, triagem: viewTriagem, painel: viewPainel, 'porta-setup': viewPortaSetup, porta: viewPorta }[screen]();
    root.innerHTML = `<header class="app-head"><button class="app-brand" data-act="home"><span class="logo-chip"><img src="img/tce-mark.png" alt=""></span><span><b>Atendimento · ${esc(D.event.name)}</b><small>${esc(D.event.edition)} · controle de senhas</small></span></button><div class="app-head-right">${T.isSimulated() ? '<span class="demo-pill">demo</span>' : ''}<div class="app-clock">${clock.time}<small>${esc(T.fmtDate(clock.date, 'wd'))}</small></div></div></header><div class="app-body"><main class="app-main">${html}</main></div><div id="sheet"></div><div id="toast"></div>`;
    schedule(screen);
  }
  function schedule(screen) {
    clearTimeout(timer);
    const need = ['triagem', 'painel', 'porta'].includes(screen);
    if (!need) return;
    const ms = screen === 'painel' ? 15000 : 10000;
    timer = setTimeout(() => refresh().then(render), ms);
  }
  async function refresh() {
    if (!st.role) return;
    const c = ctx();
    try {
      await flush();
      if (st.mode === 'porta' && st.service && st.place) queue = await api(`/api/queue?day=${c.day}&venue=${c.venue}&service=${st.service}&place=${st.place}`);
      data = await api(`/api/${st.mode === 'painel' ? 'stats' : 'state'}?day=${c.day}&venue=${c.venue}`);
      if (syncState !== 'off') syncState = 'ok';
    } catch (e) { if (e.status === 401) { st.role = null; st.msg = 'PIN recusado. Entre de novo.'; save(); } else if (!e.status) syncState = 'off'; else syncState = 'err'; }
  }
  function toast(msg, icon) { const el = document.getElementById('toast'); if (!el) return; el.innerHTML = `<div class="toast">${I(icon || 'check')}${esc(msg)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => { el.innerHTML = ''; }, 2600); }

  // ---------- ações ----------
  async function setIssued(id, count) {
    const c = ctx(); count = Math.max(0, Math.min(100000, count));
    st.local = st.local || {}; st.local[`${c.day}|${id}`] = { count, ts: Date.now() }; save(); render();
    clearTimeout(setIssued.t[id]); setIssued.t[id] = setTimeout(() => post('/api/issued', { day: c.day, venue: c.venue, service_id: id, count, device: st.device }).then(() => refresh()).then(render), 700);
  }
  setIssued.t = {};
  const curCount = (id) => { const el = document.querySelector(`.cnt[data-id="${id}"] b`); return el ? Number(el.textContent) || 0 : 0; };
  let numCb = null;
  function askNumber(title, value, cb) { numCb = cb; document.getElementById('sheet').innerHTML = viewNum(title, value); const inp = document.getElementById('num'); inp.focus(); inp.select(); }
  function closeNum() { document.getElementById('sheet').innerHTML = ''; numCb = null; }

  document.addEventListener('click', async (e) => {
    const el = (s) => e.target.closest(s); let b;
    if ((b = el('[data-key]'))) {
      const k = b.dataset.key;
      if (k === 'clear') pinBuf = pinBuf.slice(0, -1); else if (k === 'ok') { await login(); return; } else if (pinBuf.length < 6) pinBuf += k;
      if (pinBuf.length === 4 || pinBuf.length === 6) { render(); if (pinBuf.length === 6) await login(); return; }
      render(); return;
    }
    if ((b = el('[data-num]'))) { const inp = document.getElementById('num'); const k = b.dataset.num; if (k === 'ok') { const v = Number(inp.value); const cb = numCb; closeNum(); if (cb && Number.isInteger(v) && v >= 0) cb(v); } else if (k === 'back') inp.value = inp.value.slice(0, -1); else inp.value = (inp.value === '0' ? '' : inp.value) + k; return; }
    if (el('[data-close]') || (el('#sheet-root') && !el('.sheet'))) { closeNum(); return; }
    if (!(b = el('[data-act]'))) return;
    const a = b.dataset.act; const c = ctx();
    if (a === 'home') { st.mode = null; save(); render(); return; }
    if (a === 'logout') { st.role = null; st.pin = ''; st.mode = null; save(); pinBuf = ''; render(); return; }
    if (a === 'day') { st.day = b.dataset.day; save(); data = null; queue = null; await refresh(); render(); return; }
    if (a === 'mode') { st.mode = b.dataset.mode; save(); render(); await refresh(); render(); return; }
    if (a === 'svc') { st.service = b.dataset.id; st.place = null; save(); render(); return; }
    if (a === 'svc-clear') { st.service = null; st.place = null; save(); render(); return; }
    if (a === 'place-clear') { st.place = null; save(); render(); return; }
    if (a === 'place') { st.place = b.dataset.id; save(); render(); await refresh(); render(); return; }
    if (a === 'issued') { const id = b.dataset.id; setIssued(id, curCount(id) + Number(b.dataset.delta)); return; }
    if (a === 'issued-set') { const id = b.dataset.id; askNumber(`${svc(id).short}: total de senhas entregues`, curCount(id), (v) => setIssued(id, v)); return; }
    if (a === 'call') { const t = Number(b.dataset.ticket); b.disabled = true; await post('/api/call', { day: c.day, venue: c.venue, service_id: st.service, place_id: st.place, ticket: t, status: b.dataset.status || undefined, device: st.device }); await refresh(); render(); return; }
    if (a === 'call-other') { askNumber('Qual senha você vai chamar?', (queue && queue.last_ticket != null ? queue.last_ticket + 1 : 1), async (v) => { await post('/api/call', { day: c.day, venue: c.venue, service_id: st.service, place_id: st.place, ticket: v, device: st.device }); await refresh(); render(); }); return; }
    if (a === 'status') { await post(`/api/call/${b.dataset.id}/status`, { status: b.dataset.status }); await refresh(); render(); return; }
    if (a === 'end') { await post(`/api/call/${b.dataset.id}/end`, {}); await refresh(); render(); return; }
    if (a === 'undo') { if (!confirm('Desfazer a última chamada?')) return; await post(`/api/call/${b.dataset.id}/status`, { status: 'undo' }); await refresh(); render(); return; }
    if (a === 'csv') { e.preventDefault(); try { const res = await fetch(b.href, { headers: { 'X-Pin': st.pin } }); const blob = await res.blob(); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `atendimentos-${c.day}.csv`; document.body.appendChild(l); l.click(); l.remove(); } catch { toast('Não foi possível exportar', 'alert'); } return; }
  });
  async function login() {
    if (!pinBuf) return;
    st.pin = pinBuf; save();
    try { const r = await api('/api/login'); st.role = r.role; st.msg = ''; pinBuf = ''; save(); render(); }
    catch (e) { st.pin = ''; st.role = null; st.msg = e.status === 401 ? 'PIN incorreto. Tente de novo.' : 'Sem conexão com o servidor. Verifique a internet.'; pinBuf = ''; save(); render(); }
  }

  // ---------- início ----------
  setInterval(() => { const c = T.now(); if (c.time !== clock.time) { clock = c; const el = document.querySelector('.app-clock'); if (el) el.innerHTML = `${clock.time}<small>${esc(T.fmtDate(clock.date, 'wd'))}</small>`; } }, 1000);
  window.addEventListener('online', () => refresh().then(render));
  pending = outbox().length; if (pending) syncState = 'off';
  render();
  if (st.role) refresh().then(render);
})();
