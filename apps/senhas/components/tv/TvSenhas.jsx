'use client';
/* TV das senhas (16:9, lida a distância). Mesmo esqueleto da TV "pátio" do Painel Escolar Digital
   (cabeçalho com marca + relógio, quadro fixo em tela cheia no visual do "horários full" e rodapé),
   mas o quadro é de SALAS × SENHAS: um cartão por sala com a senha atual em destaque máximo, o serviço,
   o estado (chamando / em atendimento) e quantas pessoas aguardam; à direita, as últimas chamadas.
   Nova chamada: sobreposição grande por alguns segundos (+ voz com ?voz=1; o Chrome só toca som depois de um toque/tecla na
   página, por isso aparece o botão "Ativar som" até a primeira interação; estado da voz no rodapé).
   Som: campainha e áudios prontos (public/voz) passam pelo MESMO AudioContext, com um ruído inaudível em loop que mantém a
   saída de áudio da TV acordada — TVs/soundbars silenciam os primeiros ~0,5 s de um fluxo de áudio novo, o que cortava o
   começo de "Senha vinte e três" quando cada arquivo tocava num <audio> separado. Sem Web Audio, cai para <audio> e depois
   para a síntese de voz do navegador.
   Parâmetros: ?local=jn ?dia=AAAA-MM-DD ?grupo=entrada|fundos ?salas=03,04 ?servicos=pilar-1 ?voz=1 ?zoom=1.1 ?pagina=10 ?t=&d=
   Dia mostrado = o do app de atendimento (dia de serviços de hoje, senão o próximo). Atualização em tempo real por SSE.
   Teclas: F tela cheia · +/-/0 escala. Recarrega às 4h (só sem voz) e se ficar sem resposta por muito tempo. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { TCEMap as M } from '@tce/core/map';
import Icon from '@/components/Icon';
import { selectQueues } from '@/lib/tv-grupos';
import { extraQueues, placeOf } from '@/lib/filas-extra';
import { pickVoice, voiceState, voiceLabel, clipsFor } from '@/lib/voz';

const D = T.D;
const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
const BUILD = process.env.NEXT_PUBLIC_BUILD || 'dev';
const POLL_MS = 4000;
const FLASH_MS = 7000; // cada chamada fica em destaque por 7 s; chamadas simultâneas entram numa fila e saem uma por vez
const PAGE_SECS_DEFAULT = 10;
const MAX_PER_PAGE = { landscape: 30, portrait: 12 };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtT = (ms) => (ms ? T.partsOf(new Date(ms)).time : '');
const asScale = (v) => { const n = Number(v); return n > 0 ? (n > 5 ? n / 100 : n) : 0; };
const roomWord = (p) => (p.kind === 'sala' ? 'Sala' : p.kind === 'tenda' ? 'Tenda' : p.num ? 'Ambiente' : '');
const roomBig = (p) => (p.num ? `${roomWord(p)} ${p.num}` : p.name);
const speakable = (p) => (p.num ? `${roomWord(p).toLowerCase()} ${Number(p.num)}` : p.name);
const svcName = (p) => p.name; // o que a pessoa procura: a especialidade/atendimento da sala
const roomLine = (p) => (p.num ? roomBig(p) : roomWord(p)); // "Sala 04" (ou "Tenda"/"Ambiente" se não houver número)
/** Senha com a letra da série ("N 12" / "P 3"): prefixos configurados na triagem por sala (labels do quadro), senão N/P. */
const Tk = ({ ticket, priority, labels }) => { if (ticket == null) return <>—</>; const pre = labels ? labels[priority ? 'p' : 'n'] : ''; return <>{pre ? <i className="sq-kind">{pre}</i> : null}{ticket}</>; };

export default function TvSenhas() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="tv tv-dark"><div className="tv-msg"><div className="spinner" /><p>Carregando o painel…</p></div></div>;
  return <Board />;
}

function Board() {
  const sp = useMemo(() => new URLSearchParams(location.search), []);
  const [clock, setClock] = useState(() => T.now());
  useEffect(() => { const id = setInterval(() => setClock(T.now()), 1000); return () => clearInterval(id); }, []);
  // Dia mostrado = o mesmo do app de atendimento (T.ticketDay): o dia de serviços de hoje; outro dia do evento → hoje
  // (filas criadas na triagem); fora do evento → o próximo/último dia de serviços. ?dia=AAAA-MM-DD força outro.
  const day = useMemo(() => { const q = sp.get('dia'); if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q; const d = T.ticketDay(clock.date, D.maps && D.maps[sp.get('local')] ? sp.get('local') : null); return d ? d.date : clock.date; }, [sp, clock.date]);
  const sel = useMemo(() => selectQueues(sp, day), [sp, day]);
  const venue = sel.venue; const venueName = D.venues[venue] ? D.venues[venue].name : venue;
  const voice = sp.get('voz') === '1';
  // ---- voz: o Chrome (sobretudo em TV/Android) só deixa falar depois de um gesto do usuário na página ----
  const [voices, setVoices] = useState(null); // null = ainda não lidas
  const [unlocked, setUnlocked] = useState(false);
  const [voiceErr, setVoiceErr] = useState('');
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  // Áudios prontos (public/voz, gerados por scripts/gerar-voz.mjs): caminho preferido, funciona em TV sem speechSynthesis.
  const [manifest, setManifest] = useState(null);
  useEffect(() => { if (!voice) return; fetch(`${BP}/voz/manifest.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => { if (m && m.numbers) setManifest(m); }).catch(() => {}); }, [voice]);
  const player = useRef(null); // <audio> de reserva (quando não há Web Audio ou a decodificação falha)
  const playing = useRef(false);
  const audio = useRef(null); // AudioContext único: campainha + áudios prontos (criado no gesto que libera o som)
  const bufs = useRef(new Map()); // arquivo -> AudioBuffer decodificado
  const keep = useRef(null); // fonte em loop que mantém a saída de áudio da TV aberta
  const ensureCtx = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
      if (!audio.current) audio.current = new Ctx();
      const ctx = audio.current; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!keep.current) { // ruído a -80 dB em loop: inaudível, mas impede a TV de "dormir" a saída entre um anúncio e outro
        const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 1e-4;
        const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.connect(ctx.destination); src.start(); keep.current = src;
      }
      return ctx;
    } catch (e) { console.warn('[tv] Web Audio indisponível:', e); return null; }
  }, []);
  /** Campainha de dois tons: toca mesmo em aparelho sem motor de voz; precisa do mesmo gesto inicial. */
  const chime = useCallback((at) => {
    const ctx = ensureCtx(); if (!ctx) return 0;
    const t = at || ctx.currentTime;
    [[880, 0], [1175, 0.22]].forEach(([f, dt]) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.45, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5); o.connect(g); g.connect(ctx.destination); o.start(t + dt); o.stop(t + dt + 0.55); });
    return t;
  }, [ensureCtx]);
  /** Baixa e decodifica um áudio pronto (com cache). */
  const loadBuf = useCallback(async (file) => {
    const ctx = audio.current; if (bufs.current.has(file)) return bufs.current.get(file);
    const r = await fetch(`${BP}/voz/${file}`); if (!r.ok) throw new Error(`${file}: ${r.status}`);
    const ab = await r.arrayBuffer();
    const buf = await new Promise((res, rej) => { try { const pr = ctx.decodeAudioData(ab, res, rej); if (pr && pr.then) pr.then(res, rej); } catch (e) { rej(e); } });
    if (bufs.current.size > 150) bufs.current.delete(bufs.current.keys().next().value);
    bufs.current.set(file, buf); return buf;
  }, []);
  /** Toca os arquivos em sequência no AudioContext, começando em `at` (tempo do contexto); resolve quando o último termina. */
  const playViaCtx = useCallback(async (files, at) => {
    const ctx = ensureCtx(); if (!ctx) throw new Error('sem Web Audio');
    const list = await Promise.all(files.map(loadBuf));
    let t = Math.max(ctx.currentTime + 0.05, at || 0);
    for (const b of list) { const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(t); t += b.duration + 0.1; }
    await new Promise((res) => setTimeout(res, Math.max(0, (t - ctx.currentTime) * 1000) + 80));
  }, [ensureCtx, loadBuf]);
  const unlockedRef = useRef(false);
  const [banner, setBanner] = useState(''); // aviso grande e temporário com o estado do som (legível na TV)
  const bannerT = useRef(null);
  const showBanner = useCallback((text, ms = 8000) => { setBanner(text); clearTimeout(bannerT.current); bannerT.current = setTimeout(() => setBanner(''), ms); }, []);
  /** Reserva: <audio> tocando um arquivo após o outro; rejeita se algum falhar. */
  const playViaElement = useCallback((files) => new Promise((resolve, reject) => {
    if (!player.current) { try { player.current = new Audio(); player.current.preload = 'auto'; } catch { player.current = null; } }
    const a = player.current; if (!a || !files || !files.length) { reject(new Error('sem áudio')); return; }
    let i = 0;
    const done = (err) => { a.onended = a.onerror = null; if (err) reject(err); else resolve(); };
    const step = () => { if (i >= files.length) { done(); return; } a.src = `${BP}/voz/${files[i++]}`; a.onended = step; a.onerror = () => done(new Error('áudio falhou')); a.play().catch(done); };
    step();
  }), []);
  const speak = useCallback((text) => {
    if (!supported) return;
    try {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; u.rate = 0.95; u.volume = 1;
      const v = pickVoice(synth.getVoices()); if (v) u.voice = v;
      u.onerror = (e) => { const code = (e && e.error) || 'desconhecido'; if (code === 'interrupted' || code === 'canceled') return; console.warn('[tv] voz falhou:', code); setVoiceErr(code); if (code === 'not-allowed') { unlockedRef.current = false; setUnlocked(false); } showBanner(voiceLabel(`error:${code}`)); };
      u.onstart = () => setVoiceErr('');
      // Chrome/Android: cancel() imediatamente seguido de speak() costuma engolir a fala; só cancela se há algo falando e espera um pouco.
      if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(() => synth.speak(u), 250); } else synth.speak(u);
    } catch (e) { console.warn('[tv] voz indisponível:', e); setVoiceErr('exception'); }
  }, [supported, showBanner]);
  /** Anúncio completo: campainha e, 0,8 s depois, os áudios prontos (ou a síntese de voz com `text` se não houver/falhar). */
  const announce = useCallback(async (files, text) => {
    playing.current = true;
    try {
      const t0 = chime();
      if (files && audio.current) { try { await playViaCtx(files, t0 + 0.8); return; } catch (e) { console.warn('[tv] Web Audio falhou, usando <audio>:', e.message); } }
      await new Promise((res) => setTimeout(res, 700));
      if (files) { try { await playViaElement(files); return; } catch (e) { console.warn('[tv] áudio pronto falhou:', e.message); } }
      if (text) speak(text);
    } finally { playing.current = false; }
  }, [chime, playViaCtx, playViaElement, speak]);
  // Libera o som: precisa rodar de forma síncrona dentro do gesto (toque/tecla), por isso usa ref e não o estado.
  const unlock = useCallback(() => {
    if (!voice || unlockedRef.current) return;
    unlockedRef.current = true; setUnlocked(true); setVoiceErr('');
    ensureCtx(); // dentro do gesto: cria/resume o AudioContext e liga o loop que mantém a saída de áudio da TV acordada
    try { player.current = new Audio(); player.current.preload = 'auto'; } catch { player.current = null; }
    announce(manifest ? ['x-som.mp3'] : null, 'Som ativado. As senhas serão anunciadas.');
    // Pré-carrega as frases das salas desta TV e os avisos, para o anúncio não esperar download/decodificação.
    if (manifest && audio.current) { const pre = ['x-novamente.mp3', ...sel.queues.map((q) => `p-${q.place.id}.mp3`).filter((f) => manifest.places && manifest.places.includes(f.slice(2, -4)))]; pre.forEach((f) => loadBuf(f).catch(() => {})); }
    setTimeout(() => { const vs = supported ? window.speechSynthesis.getVoices() : []; showBanner(`Som ativado · ${voiceLabel(voiceState({ wanted: true, supported, voices: vs, unlocked: true, lastError: '', clips: !!manifest }), pickVoice(vs))}`); }, 2500);
  }, [voice, supported, manifest, sel, ensureCtx, announce, loadBuf, showBanner]);
  useEffect(() => {
    if (!voice) return;
    const load = () => setVoices(supported ? window.speechSynthesis.getVoices() : []);
    load(); if (supported) window.speechSynthesis.addEventListener('voiceschanged', load);
    // Já houve interação nesta página (ex.: tecla F para tela cheia)? Então o som já está liberado.
    if (navigator.userActivation && navigator.userActivation.hasBeenActive) { unlockedRef.current = true; setUnlocked(true); }
    else showBanner('Som: aperte OK no controle (ou toque na tela) para ativar os anúncios das senhas', 12000);
    const gesture = () => unlock();
    window.addEventListener('pointerdown', gesture); window.addEventListener('keydown', gesture);
    return () => { if (supported) window.speechSynthesis.removeEventListener('voiceschanged', load); window.removeEventListener('pointerdown', gesture); window.removeEventListener('keydown', gesture); };
  }, [voice, supported, unlock, showBanner]);
  const vState = voiceState({ wanted: voice, supported, voices, unlocked, lastError: voiceErr, clips: unlocked && !!manifest });
  const vLabel = voiceLabel(vState, voices ? pickVoice(voices) : null);
  const [zoom, setZoom] = useState(() => Math.min(1.6, Math.max(0.6, asScale(sp.get('zoom')) || 1)));
  const pageSecs = Math.min(60, Math.max(4, Number(sp.get('pagina')) || PAGE_SECS_DEFAULT));
  const [portrait, setPortrait] = useState(false);
  useEffect(() => { const m = () => setPortrait(window.innerHeight > window.innerWidth); m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m); }, []);

  // ---- dados: polling leve do quadro público ----
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const lastOk = useRef(Date.now());
  const take = useCallback((j) => { lastOk.current = Date.now(); setOffline(false); setData((prev) => (prev && JSON.stringify(prev.places) === JSON.stringify(j.places) && JSON.stringify(prev.recent) === JSON.stringify(j.recent) && JSON.stringify(prev.extras || []) === JSON.stringify(j.extras || []) && JSON.stringify(prev.disabled || []) === JSON.stringify(j.disabled || []) ? Object.assign(prev, { now: j.now }) : j)); }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BP}/api/tv?local=${encodeURIComponent(venue)}&dia=${day}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(String(r.status));
      take(await r.json());
    } catch { setOffline(true); }
  }, [venue, day, take]);
  // Tempo real: SSE empurra o quadro a cada mudança; o polling fica como rede de segurança (e cobre proxies sem SSE).
  useEffect(() => {
    refresh(); const id = setInterval(refresh, POLL_MS);
    let es = null;
    try {
      es = new EventSource(`${BP}/api/tv/stream?local=${encodeURIComponent(venue)}&dia=${day}`);
      es.addEventListener('board', (e) => { try { take(JSON.parse(e.data)); } catch { /* ignora */ } });
      es.addEventListener('ping', () => { lastOk.current = Date.now(); });
    } catch { /* navegador sem EventSource: só polling */ }
    return () => { clearInterval(id); if (es) es.close(); };
  }, [refresh, take, venue, day]);

  // ---- vigília: recarga de madrugada, travamento, teclas ----
  useEffect(() => {
    // Recarga de madrugada só sem voz: recarregar perde a liberação de som dada pelo controle (o dia muda sozinho pelo relógio; o SSE mantém os dados).
    const wd = setInterval(() => { const d = new Date(); if (d.getHours() === 4 && d.getMinutes() < 2 && !voice) location.reload(); if (Date.now() - lastOk.current > 15 * 60 * 1000) location.reload(); }, 60000);
    const fs = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'f') fs();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(1.6, Math.round((z + 0.05) * 100) / 100));
      if (e.key === '-') setZoom((z) => Math.max(0.6, Math.round((z - 0.05) * 100) / 100));
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', fs);
    return () => { clearInterval(wd); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', fs); };
  }, [voice]);

  // ---- linhas do quadro: cada fila selecionada com a situação vinda do banco ----
  const rows = useMemo(() => {
    const byPlace = new Map();
    for (const p of (data && data.places) || []) { const cur = byPlace.get(p.place_id); if (!cur || ((p.current && p.current.called_at) || 0) > ((cur.current && cur.current.called_at) || 0)) byPlace.set(p.place_id, Object.assign({}, p, { waiting: (cur ? cur.waiting : 0) + p.waiting })); }
    const svcIdx = (s) => D.services.findIndex((x) => x.id === s.id);
    const numOf = (p) => (p.num ? Number(p.num) || 0 : 999);
    // Ordem: serviço (é o que está na senha impressa) e, dentro dele, sala/tenda por número.
    // Filas extras criadas na triagem entram quando a TV não está limitada a salas específicas (?salas=); ?servicos= filtra também elas.
    const svcFilter = new Set(String(sp.get('servicos') || '').split(/[,;+ ]+/).filter(Boolean));
    const extra = sp.get('salas') ? [] : extraQueues((data && data.extras) || [], svcFilter);
    const off = new Set((data && data.disabled) || []); // filas desativadas na triagem
    const fixed = sel.queues.map((q) => ({ service: q.service, place: placeOf(q.place.id, data && data.extras) || q.place })); // nome/sala editados na triagem
    return fixed.concat(extra).filter((q) => !off.has(q.place.id)).map((q) => ({ key: q.place.id, place: q.place, service: q.service, stat: byPlace.get(q.place.id) || null }))
      .sort((a, b) => svcIdx(a.service) - svcIdx(b.service) || numOf(a.place) - numOf(b.place) || String(a.place.name).localeCompare(String(b.place.name), 'pt-BR'));
  }, [sel, data, sp]);
  const selected = useMemo(() => new Set(rows.map((r) => r.key)), [rows]);
  const recent = useMemo(() => ((data && data.recent) || []).filter((c) => selected.has(c.place_id)), [data, selected]);
  const waitingTotal = rows.reduce((n, r) => n + (r.stat ? r.stat.waiting : 0), 0);
  const inService = rows.filter((r) => r.stat && r.stat.current && r.stat.current.status === 'served' && r.stat.in_service > 0).length;

  // ---- nova chamada: sobreposição + voz, uma por vez (fila) ----
  const [flash, setFlash] = useState(null);
  const seen = useRef(null);
  const queue = useRef([]); // chamadas aguardando a vez na tela
  const showing = useRef(false);
  const timer = useRef(null);
  const next = useCallback(() => {
    // Só avança quando a anterior saiu da tela e a voz terminou de falar.
    if (voice && (playing.current || (supported && window.speechSynthesis.speaking))) { timer.current = setTimeout(next, 300); return; }
    const c = queue.current.shift();
    if (!c) { showing.current = false; setFlash(null); return; }
    showing.current = true;
    setFlash({ id: `${c.id}:${c.again ? Date.now() : 0}`, ticket: c.ticket, place: c.place, service: c.service, again: c.again, priority: c.priority, until: Date.now() + FLASH_MS });
    if (voice) { // campainha e, depois dela, a voz: áudios prontos; se não houver (senha > 300, sala nova, falha), síntese do navegador
      const text = `${c.priority ? 'Senha prioritária. ' : ''}${c.place ? `Senha ${c.ticket}. ${c.place.num ? `${svcName(c.place)}, ${speakable(c.place)}` : svcName(c.place)}.` : `Senha ${c.ticket}.`}`;
      announce(clipsFor({ ticket: c.ticket, placeId: c.place && c.place.id, again: c.again, priority: c.priority }, manifest), text);
    }
    timer.current = setTimeout(() => { setFlash(null); timer.current = setTimeout(next, 400); }, FLASH_MS);
  }, [voice, supported, manifest, announce]);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(bannerT.current); }, []);
  useEffect(() => {
    if (!data) return;
    // Cada anúncio tem uma chave id:repetição; a primeira carga só memoriza (não anuncia o passado), mesmo sem chamadas ainda.
    const stamp = (c) => Math.max(c.called_at || 0, c.recalled_at || 0);
    const keyOf = (c) => `${c.id}:${c.recalled_at || 0}`;
    if (seen.current == null) { seen.current = new Set(recent.map(keyOf)); return; }
    const fresh = recent.filter((c) => !seen.current.has(keyOf(c))).sort((a, b) => stamp(a) - stamp(b));
    if (!fresh.length) return;
    for (const c of fresh) {
      seen.current.add(keyOf(c));
      if (c.ticket == null || Date.now() - stamp(c) > 60000) continue; // chamada antiga (ex.: recarga) não pisca
      queue.current.push({ id: c.id, ticket: c.ticket, place: placeOf(c.place_id, data && data.extras), service: D.services.find((x) => x.id === c.service_id), again: !!c.recalled_at, priority: !!c.priority });
    }
    if (!showing.current && queue.current.length) next();
  }, [data, recent, next]);

  // ---- páginas (quando há mais salas do que cabe) ----
  const per = MAX_PER_PAGE[portrait ? 'portrait' : 'landscape'];
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const [cycle, setCycle] = useState(0);
  useEffect(() => { if (pages <= 1) { setCycle(0); return; } const id = setInterval(() => setCycle((c) => c + 1), pageSecs * 1000); return () => clearInterval(id); }, [pages, pageSecs]);
  const page = pages > 1 ? cycle % pages : 0;
  const shown = rows.slice(page * per, page * per + per);
  const n = shown.length;
  const cols = portrait ? (n <= 1 ? 1 : n <= 6 ? 2 : 3) : n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const rowsN = Math.max(1, Math.ceil(n / cols));
  // Escala do texto dos cartões pelo número de linhas (o número da senha cresce com a altura do cartão, via cqh no CSS).
  const fs = Math.round(Math.min(1.5, Math.max(0.72, 2.8 / rowsN)) * 100) / 100;

  const sd = T.serviceDayOf(clock.date);
  const subtitle = [D.event.edition, venueName, sd ? 'Serviços gratuitos · hoje' : day !== clock.date ? `Serviços gratuitos · ${T.fmtDate(day, 'wd')}` : 'Serviços gratuitos'].join(' · ');
  const stateOf = (r) => {
    const c = r.stat && r.stat.current; if (!c || c.ticket == null) return { k: 'idle', label: r.stat && r.stat.called ? 'sem senha' : 'aguardando início' };
    if (c.status === 'called') return { k: 'calling', label: 'chamando' };
    if (c.status === 'served') return r.stat.in_service > 0 ? { k: 'serving', label: 'em atendimento' } : { k: 'done', label: 'atendida' };
    if (c.status === 'absent') return { k: 'absent', label: 'não compareceu' };
    return { k: 'idle', label: '' };
  };
  const latestId = recent[0] ? recent[0].id : null;
  const lblOf = (pid) => (data && data.labels && data.labels[pid]) || (data && data.default_labels) || { n: 'N', p: 'P' };

  return (
    <div className={`tv tv-dark sq ${portrait ? 'portrait' : 'landscape'}`} style={{ '--tv-zoom': zoom }}>
      <header className="tv-head">
        <div className="tv-brand"><span className="tv-mark"><img src={`${BP}/img/tce-mark.png`} alt="" /></span><div><b>TCE NA COMUNIDADE</b><small>{subtitle}{offline ? <span className="tv-live off"><i />sem conexão</span> : T.isSimulated() ? <span className="tv-live demo"><i />demonstração</span> : <span className="tv-live"><i />ao vivo</span>}</small></div></div>
        <div className="tv-clock"><b>{clock.time}</b><small>{T.fmtDate(clock.date, 'wdlong')}</small></div>
      </header>

      <div className="tv-body">
        <main className="sq-board">
          <div className="mb-head">
            <span className="cb-grade"><b>Senhas</b><small><Icon name="ticket" />{sel.title || 'Todas as salas'}{sel.unknown.length ? ` · ignorado: ${sel.unknown.join(', ')}` : ''}</small></span>
            <span className="cb-head-right">
              {inService ? <span className="cb-period">{inService} em atendimento</span> : null}
              {waitingTotal ? <span className="cb-period">{waitingTotal} aguardando</span> : null}
              {pages > 1 ? <span className="cb-page" aria-label={`Página ${page + 1} de ${pages}`}>{Array.from({ length: pages }, (_, k) => <i key={k} className={k === page ? 'on' : ''}>{k + 1}</i>)}</span> : null}
            </span>
          </div>
          {!rows.length ? <p className="cb-empty">{data ? 'Nenhuma sala selecionada para esta TV. Confira os parâmetros ?salas=, ?servicos= ou ?grupo=.' : offline ? 'Sem conexão com o controle de senhas.' : 'Carregando…'}</p> : (
            <div className="sq-grid" key={page} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowsN}, minmax(0, 1fr))`, '--fs': fs }}>
              {shown.map((r) => { const st = stateOf(r); const c = r.stat && r.stat.current; const isLatest = c && latestId != null && c.id === latestId && Date.now() - c.called_at < 60000;
                return (
                  <div key={r.key} className={`sq-card ${st.k} ${isLatest ? 'latest' : ''}`} style={{ '--c': r.service.color }}>
                    <div className="sq-top"><span className="sq-svc" title={`${svcName(r.place)} · ${r.service.title}`}><span>{svcName(r.place)}</span></span></div>
                    <div className="sq-mid"><b className="sq-num">{c && c.ticket != null ? <Tk ticket={c.ticket} priority={c.priority} labels={lblOf(r.key)} /> : '—'}</b>{c && c.priority ? <i className="sq-prio" title="senha prioritária">prioridade</i> : null}</div>
                    {/* embaixo: só a sala (grande) com a categoria minúscula e, à direita, a hora da última chamada; o estado fica na cor/borda do cartão */}
                    <div className="sq-bot">{r.stat && r.stat.seq ? (
                      <div className="sq-seq" title="última chamada → próxima"><span className="n"><em>{lblOf(r.key).n || 'Comuns'}</em><b>{r.stat.seq.normal.last ?? '—'}</b><i>→</i><b>{r.stat.seq.normal.next ?? '—'}</b></span><span className="p"><em>{lblOf(r.key).p || 'Prioridade'}</em><b>{r.stat.seq.prio.last ?? '—'}</b><i>→</i><b>{r.stat.seq.prio.next ?? '—'}</b></span></div>
                    ) : null}<div className="sq-line"><b className="sq-roomname">{roomLine(r.place)}</b><span className="sq-right">{r.stat && r.stat.issued ? <span className="sq-wait">{r.stat.waiting} aguardando</span> : null}{c && c.ticket != null && c.called_at ? <span className="sq-time" title={st.label}>{fmtT(c.called_at)}</span> : null}</span></div></div>
                  </div>
                ); })}
            </div>
          )}
          {pages > 1 ? <div className="tv-progress" key={`p${page}`} style={{ animationDuration: `${pageSecs}s` }} /> : null}
        </main>

        <aside className="sq-side">
          <div className="sq-recent">
            <span className="mb-title"><Icon name="list" />Chamadas anteriores</span>
            {recent.length > 1 ? <ol>{recent.slice(1, portrait ? 4 : 6).map((c) => { const p = placeOf(c.place_id, data && data.extras); const s = D.services.find((x) => x.id === c.service_id); return (
              <li key={c.id} className={c.status} style={{ '--c': s ? s.color : '#94a3b8' }}><b><Tk ticket={c.ticket} priority={c.priority} labels={lblOf(c.place_id)} /></b><span><strong>{p ? svcName(p) : c.place_id}</strong><small>{p ? roomLine(p) : ''}</small></span><em>{fmtT(c.called_at)}</em></li>
            ); })}</ol> : <p className="sq-none">{recent.length ? 'Só uma chamada até agora.' : 'Nenhuma chamada ainda hoje.'}</p>}
          </div>
          {(() => {
            const c = recent[0]; if (!c) return <div className="sq-now idle"><small className="sq-now-k"><Icon name="ticket" />Senha atual</small><b className="sq-now-num">—</b><div className="sq-now-room"><b>Aguardando</b><span>a primeira chamada do dia</span></div></div>;
            const p = placeOf(c.place_id, data && data.extras); const s = D.services.find((x) => x.id === c.service_id);
            const k = c.status === 'called' ? 'calling' : c.status === 'served' ? 'serving' : c.status === 'absent' ? 'absent' : 'done';
            const label = k === 'calling' ? 'chamando' : k === 'serving' ? 'em atendimento' : k === 'absent' ? 'não compareceu' : 'atendida';
            return (
              <div className={`sq-now ${k}`} style={{ '--c': s ? s.color : '#fbbf24' }}>
                <small className="sq-now-k"><Icon name={k === 'calling' ? 'megaphone' : 'ticket'} />Senha atual · <em>{label}</em> · {fmtT(c.called_at)}</small>
                <div className="sq-now-svc">{p ? svcName(p) : c.place_id}</div>
                {c.priority ? <i className="sq-prio now">Senha prioritária</i> : null}
                <b className="sq-now-num"><Tk ticket={c.ticket} priority={c.priority} labels={lblOf(c.place_id)} /></b>
                <div className="sq-now-room"><b>{p ? roomLine(p) : ''}</b></div>
              </div>
            );
          })()}
        </aside>
      </div>

      <footer className="tv-foot"><span>{D.event.organizer} · {D.event.datesLabel} <span className="tv-build">· v{BUILD}{voice ? ' · voz=1' : ''}</span></span><span className="tv-foot-msg">Fique atento ao número da sua senha e à sala · atendimento por ordem de chegada</span>{vLabel ? <span className={`tv-voice ${vState === 'ready' ? 'ok' : vState === 'locked' || vState.startsWith('error') || vState === 'novoice' ? 'warn' : ''}`} title={vLabel}><Icon name="megaphone" />{vLabel}</span> : null}</footer>

      {voice && !unlocked ? (
        <button type="button" className="tv-sound" autoFocus onClick={unlock}>
          <Icon name="megaphone" /><span><b>Ativar som</b><small>pressione OK ou qualquer seta no controle da TV (ou toque na tela) para liberar os anúncios por voz</small></span>
        </button>
      ) : null}
      {banner ? <div className="tv-banner" role="status"><Icon name="megaphone" />{banner}</div> : null}
      {flash ? (
        <div className="sq-flash" role="alert" key={flash.id} style={{ '--c': flash.service ? flash.service.color : '#fbbf24' }}>
          <div className="sq-flash-box">
            <small><Icon name="megaphone" />{flash.again ? 'Chamando novamente' : 'Chamando agora'}{flash.priority ? <i className="sq-flash-prio">Prioridade</i> : null}</small>
            <div className="sq-flash-row">
              <span className="sq-flash-col num"><em>senha</em><b><Tk ticket={flash.ticket} priority={flash.priority} labels={lblOf(flash.place ? flash.place.id : '')} /></b></span>
              {(() => { const name = flash.place ? svcName(flash.place) : flash.place_id; const L = String(name).length; return <span className="sq-flash-col svc" style={{ '--svcfs': L > 30 ? '2.8em' : L > 20 ? '3.4em' : '4em' }}><em>serviço</em><b>{name}</b></span>; })()}
              {flash.place && flash.place.num ? <span className="sq-flash-col room"><em>{roomWord(flash.place)}</em><b>{flash.place.num}</b></span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
