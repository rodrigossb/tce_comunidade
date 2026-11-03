'use client';
/* Mapa dos locais do evento + lugares cadastrados pela equipe (escolas, restaurantes, hotéis…).
   - Pinos numerados (Leaflet + OpenStreetMap), cor por tipo; cartões com endereço, o que acontece ali e botões de rota
     (Google Maps e Waze abrem o app do celular com o destino preenchido; "outro app" usa geo:).
   - "Minha localização" mostra a distância em linha reta até cada lugar.
   - Locais fixos do evento vêm de D.geo (packages/core/src/data.js); os demais da API do tce-senhas (GET /api/lugares,
     público; POST/DELETE com X-Pin da equipe). Cópia local em localStorage para abrir mesmo sem a API.
   - Cadastro: formulário com nome, tipo, endereço, telefone, coordenadas (digitar, usar o GPS, marcar no mapa ou buscar
     pelo endereço no OpenStreetMap) e observação. O PIN fica só na sessão do navegador. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { PLACE_KINDS, normalizeLugar, parseCoord } from '@tce/core/lugares';
import Icon from '@/components/Icon';

const D = T.D;
const API = () => (T.params.get('api') || D.event.apiUrl || '').replace(/\/$/, '');
const LS_LUGARES = 'tce_lugares'; const SS_PIN = 'tce_lugares_pin';
const gmaps = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
const waze = (p) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes&zoom=17`;
const geoUri = (p) => `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${encodeURIComponent(p.name)})`;
const km = (a, b) => { const R = 6371; const r = (x) => (x * Math.PI) / 180; const dLat = r(b.lat - a.lat); const dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0).replace('.', ',')} km`);
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const ls = { get: (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } } };
const ss = { get: (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* */ } } };
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** O que acontece num local do evento: dias com cursos (e quantos) e dia de serviços. */
function agenda(p) {
  if (!p.venues || !p.venues.length) return { lines: [] };
  const sess = T.allSessions().filter((x) => p.venues.includes(x.venue));
  const days = [...new Set(sess.map((x) => x.date))].sort();
  const courses = new Set(sess.map((x) => x.course.id));
  const svc = T.serviceDays().find((d) => p.venues.includes(d.venue));
  const out = [];
  if (days.length) out.push({ icon: 'graduation', text: `${courses.size} curso${courses.size === 1 ? '' : 's'} · ${days.length === 1 ? cap(T.fmtDate(days[0], 'wdm')) : `${T.fmtDate(days[0], 'wdm')} a ${T.fmtDate(days[days.length - 1], 'wdm')}`}` });
  if (svc) out.push({ icon: 'handshake', text: `Serviços gratuitos · ${cap(T.fmtDate(svc.date, 'wdm'))}, sem inscrição` });
  return { lines: out };
}
/** Lugar da API → mesmo formato dos pinos fixos. */
const fromApi = (l) => ({ id: `l${l.id}`, lid: l.id, venues: [], name: l.name, kind: l.kind, city: '', address: l.address || '', lat: l.lat, lng: l.lng, approx: false, note: l.note || '', phone: l.phone || '', builtin: false });

export default function MapaEventos() {
  const mapEl = useRef(null); const mapRef = useRef(null); const layer = useRef(null); const markers = useRef({}); const meMarker = useRef(null); const tmpMarker = useRef(null); const pickRef = useRef(null);
  const [sel, setSel] = useState('');
  const [filter, setFilter] = useState('');
  const [me, setMe] = useState(null); const [geoMsg, setGeoMsg] = useState('');
  const [ready, setReady] = useState(false);
  const [extra, setExtra] = useState([]); const [apiState, setApiState] = useState('');
  const [form, setForm] = useState(null); // null = fechado; { id?, name, kind, address, phone, lat, lng, note }
  const [formMsg, setFormMsg] = useState(''); const [saving, setSaving] = useState(false); const [picking, setPicking] = useState(false);
  const [pin, setPin] = useState('');
  useEffect(() => { setExtra((ls.get(LS_LUGARES, { lugares: [] }) || {}).lugares || []); setPin(ss.get(SS_PIN)); }, []);

  const places = useMemo(() => D.geo.map((p) => Object.assign({ builtin: true }, p)).concat(extra.map(fromApi)), [extra]);
  const agendas = useMemo(() => Object.fromEntries(places.map((p) => [p.id, agenda(p)])), [places]);
  const shown = filter ? places.filter((p) => (filter === 'evento' ? p.builtin : p.kind === filter)) : places;
  const kindsPresent = Object.keys(PLACE_KINDS).filter((k) => places.some((p) => !p.builtin && p.kind === k));

  // ---- API do tce-senhas: lista de lugares cadastrados ----
  const loadApi = async () => {
    const api = API(); if (!api) { setApiState('sem-api'); return; }
    try { const r = await fetch(`${api}/api/lugares`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(r.status); const j = await r.json(); const list = Array.isArray(j.lugares) ? j.lugares : []; setExtra(list); ls.set(LS_LUGARES, { lugares: list, updatedAt: Date.now() }); setApiState('ok'); }
    catch { setApiState('offline'); }
  };
  useEffect(() => { loadApi(); }, []);

  // ---- Leaflet (só no navegador): mapa uma vez; pinos sempre que a lista muda ----
  useEffect(() => {
    let alive = true;
    import('leaflet').then((mod) => {
      if (!alive || !mapEl.current || mapRef.current) return;
      const L = mod.default || mod;
      const map = L.map(mapEl.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      layer.current = L.layerGroup().addTo(map);
      map.on('click', (e) => { if (pickRef.current) pickRef.current(e.latlng); });
      mapRef.current = { L, map };
      const want = D.geo.find((p) => p.id === (T.params.get('local') || '')) || null;
      if (want) { map.setView([want.lat, want.lng], 16); setSel(want.id); } else map.fitBounds(L.latLngBounds(D.geo.map((p) => [p.lat, p.lng])).pad(0.18));
      setReady(true);
    }).catch(() => setGeoMsg('Não foi possível carregar o mapa. Os botões de rota funcionam mesmo assim.'));
    return () => { alive = false; if (mapRef.current) { mapRef.current.map.remove(); mapRef.current = null; } };
  }, []);
  useEffect(() => {
    const r = mapRef.current; if (!r || !ready || !layer.current) return;
    const { L } = r; layer.current.clearLayers(); markers.current = {};
    shown.forEach((p) => {
      const i = places.indexOf(p) + 1; const k = PLACE_KINDS[p.kind] || PLACE_KINDS.outro; const color = p.builtin ? (p.approx ? '#e0a800' : '#1f3b9a') : k.color;
      const icon = L.divIcon({ className: 'me-pin-wrap', html: `<div class="me-pin${p.builtin ? '' : ' extra'}" style="background:${color}"><b>${i}</b></div>`, iconSize: [38, 46], iconAnchor: [19, 44], popupAnchor: [0, -40] });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(layer.current);
      m.bindPopup(`<div class="me-pop"><b>${i}. ${esc(p.name)}</b><small>${esc(k.label)}${p.address ? ` · ${esc(p.address)}` : ''}</small><div class="me-pop-btns"><a href="${gmaps(p)}" target="_blank" rel="noopener">Google Maps</a><a href="${waze(p)}" target="_blank" rel="noopener">Waze</a></div></div>`, { maxWidth: 280 });
      m.on('click', () => setSel(p.id));
      markers.current[p.id] = m;
    });
  }, [shown, places, ready]);

  const focus = (p) => { setSel(p.id); const r = mapRef.current; if (!r) return; r.map.flyTo([p.lat, p.lng], 16, { duration: .8 }); const m = markers.current[p.id]; if (m) setTimeout(() => m.openPopup(), 850); document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const fitAll = (list) => { const r = mapRef.current; if (!r || !list.length) return; if (list.length === 1) { focus(list[0]); return; } r.map.flyToBounds(r.L.latLngBounds(list.map((p) => [p.lat, p.lng])).pad(0.18), { duration: .8 }); };
  const showAll = () => { setSel(''); setFilter(''); fitAll(places); };
  const showCity = (city) => fitAll(places.filter((p) => p.builtin && p.city === city));
  const pickFilter = (k) => { setFilter(k); setSel(''); fitAll(k ? places.filter((p) => (k === 'evento' ? p.builtin : p.kind === k)) : places); };
  const locate = (onDone) => {
    if (!navigator.geolocation) { setGeoMsg('Este navegador não informa a localização.'); return; }
    setGeoMsg('Procurando sua localização…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setMe(here); setGeoMsg('');
      const r = mapRef.current;
      if (r) { if (meMarker.current) meMarker.current.remove(); meMarker.current = r.L.marker([here.lat, here.lng], { icon: r.L.divIcon({ className: 'me-pin-wrap', html: '<div class="me-here"><i></i></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), title: 'Você está aqui' }).addTo(r.map).bindPopup('Você está aqui'); }
      if (onDone) onDone(here); else if (r) r.map.flyToBounds(r.L.latLngBounds([[here.lat, here.lng], ...places.map((p) => [p.lat, p.lng])]).pad(0.15), { duration: .8 });
    }, (err) => setGeoMsg(err.code === 1 ? 'Permissão de localização negada. Os botões de rota funcionam mesmo assim.' : 'Não consegui obter sua localização agora.'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };

  // ---- cadastro ----
  const blank = { name: '', kind: 'restaurante', address: '', phone: '', lat: '', lng: '', note: '' };
  const openForm = (p) => { setFormMsg(''); setForm(p ? { id: p.lid, name: p.name, kind: p.kind, address: p.address, phone: p.phone || '', lat: String(p.lat), lng: String(p.lng), note: p.note || '' } : blank); setTimeout(() => document.getElementById('cadastro')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const closeForm = () => { setForm(null); setPicking(false); pickRef.current = null; if (tmpMarker.current) { tmpMarker.current.remove(); tmpMarker.current = null; } };
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCoords = (lat, lng) => setForm((f) => ({ ...f, lat: String(Math.round(lat * 1e6) / 1e6), lng: String(Math.round(lng * 1e6) / 1e6) }));
  // marcador provisório (arrastável) acompanha as coordenadas digitadas
  useEffect(() => {
    const r = mapRef.current; if (!r || !ready) return;
    if (!form) { if (tmpMarker.current) { tmpMarker.current.remove(); tmpMarker.current = null; } return; }
    const lat = parseCoord(form.lat); const lng = parseCoord(form.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { if (tmpMarker.current) { tmpMarker.current.remove(); tmpMarker.current = null; } return; }
    if (!tmpMarker.current) {
      tmpMarker.current = r.L.marker([lat, lng], { draggable: true, icon: r.L.divIcon({ className: 'me-pin-wrap', html: '<div class="me-pin tmp"><b>?</b></div>', iconSize: [38, 46], iconAnchor: [19, 44] }), title: 'Novo lugar (arraste para ajustar)' }).addTo(r.map);
      tmpMarker.current.on('dragend', () => { const ll = tmpMarker.current.getLatLng(); setCoords(ll.lat, ll.lng); });
    } else tmpMarker.current.setLatLng([lat, lng]);
  }, [form && form.lat, form && form.lng, !!form, ready]);
  const pickOnMap = () => {
    if (picking) { setPicking(false); pickRef.current = null; return; }
    setPicking(true); setFormMsg('Toque no mapa no ponto exato do lugar. Depois, arraste o pino "?" se precisar ajustar.');
    pickRef.current = (ll) => { setCoords(ll.lat, ll.lng); setPicking(false); pickRef.current = null; setFormMsg('Ponto marcado. Confira os campos e salve.'); };
    document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const useGps = () => locate((here) => { setCoords(here.lat, here.lng); setFormMsg('Coordenadas preenchidas com a sua posição atual.'); const r = mapRef.current; if (r) r.map.flyTo([here.lat, here.lng], 17, { duration: .8 }); });
  const geocode = async () => {
    const q = (form.address || '').trim(); if (q.length < 4) { setFormMsg('Digite o endereço antes de buscar.'); return; }
    setFormMsg('Buscando o endereço no OpenStreetMap…');
    try {
      const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(/oiapoque/i.test(q) ? q : `${q}, Oiapoque, Amapá`)}`;
      const r = await fetch(u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }); const j = await r.json();
      if (!Array.isArray(j) || !j.length) { setFormMsg('Endereço não encontrado no mapa. Marque o ponto no mapa ou use o GPS no local.'); return; }
      setCoords(Number(j[0].lat), Number(j[0].lon)); setFormMsg(`Encontrado: ${j[0].display_name}. Confira o pino "?" no mapa e ajuste se precisar.`);
      const m = mapRef.current; if (m) m.map.flyTo([Number(j[0].lat), Number(j[0].lon)], 17, { duration: .8 });
    } catch { setFormMsg('Não consegui consultar o OpenStreetMap agora. Marque o ponto no mapa ou use o GPS.'); }
  };
  const save = async (e) => {
    e.preventDefault(); if (!form) return;
    let body; try { body = normalizeLugar(form); } catch (er) { setFormMsg(er.message); return; }
    const api = API(); if (!api) { setFormMsg('Esta página não tem o endereço da API do tce-senhas; não dá para salvar.'); return; }
    if (!pin) { setFormMsg('Informe o PIN da equipe para salvar.'); return; }
    setSaving(true); setFormMsg('Salvando…');
    try {
      const r = await fetch(`${api}/api/lugares`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pin': pin }, body: JSON.stringify(Object.assign(body, { device: 'mapa' })), signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { ss.set(SS_PIN, ''); setPin(''); setFormMsg('PIN recusado.'); return; }
      if (!r.ok) { setFormMsg(`Não salvou: ${j.error || r.status}`); return; }
      ss.set(SS_PIN, pin); const list = Array.isArray(j.lugares) ? j.lugares : extra; setExtra(list); ls.set(LS_LUGARES, { lugares: list, updatedAt: Date.now() });
      closeForm(); setApiState('ok'); const saved = list.find((l) => l.id === j.id); if (saved) setTimeout(() => focus(fromApi(saved)), 100);
    } catch { setFormMsg('Sem conexão com o tce-senhas. Tente de novo em instantes.'); }
    finally { setSaving(false); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Excluir "${p.name}" do mapa?`)) return;
    const api = API(); let usePin = pin; if (!usePin) { usePin = (window.prompt('PIN da equipe para excluir:') || '').trim(); if (!usePin) return; }
    try {
      const r = await fetch(`${api}/api/lugares?id=${p.lid}`, { method: 'DELETE', headers: { 'X-Pin': usePin }, signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { ss.set(SS_PIN, ''); setPin(''); setGeoMsg('PIN recusado.'); return; }
      if (!r.ok) { setGeoMsg(`Não excluiu: ${j.error || r.status}`); return; }
      ss.set(SS_PIN, usePin); setPin(usePin); const list = Array.isArray(j.lugares) ? j.lugares : extra.filter((l) => l.id !== p.lid); setExtra(list); ls.set(LS_LUGARES, { lugares: list, updatedAt: Date.now() }); setSel('');
    } catch { setGeoMsg('Sem conexão com o tce-senhas.'); }
  };
  const cities = [...new Set(D.geo.map((p) => p.city))];

  return (
    <main className="me">
      <header className="me-head">
        <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
        <div>
          <p className="me-kicker"><span>IX</span> TCE na Comunidade · {D.event.datesLabel}</p>
          <h1>Mapa dos locais do evento</h1>
          <p className="me-sub">Toque num lugar para ver no mapa. Os botões abrem a rota no Google Maps ou no Waze, já com o destino preenchido.</p>
        </div>
      </header>
      <nav className="me-tools" aria-label="Atalhos">
        <a href="index.html"><Icon name="phone" />App do evento</a>
        <button type="button" onClick={showAll} className={!filter ? 'on' : ''}><Icon name="map" />Todos</button>
        <button type="button" onClick={() => pickFilter('evento')} className={filter === 'evento' ? 'on' : ''}><Icon name="star" />Locais do evento</button>
        {kindsPresent.map((k) => <button key={k} type="button" onClick={() => pickFilter(k)} className={filter === k ? 'on' : ''} style={{ '--k': PLACE_KINDS[k].color }}><Icon name={PLACE_KINDS[k].icon} />{PLACE_KINDS[k].label}{PLACE_KINDS[k].label.endsWith('a') || PLACE_KINDS[k].label.endsWith('e') ? 's' : k === 'hotel' ? 's' : ''}</button>)}
        {cities.map((c) => <button key={c} type="button" onClick={() => showCity(c)}><Icon name="pin" />{c}</button>)}
        <button type="button" onClick={() => locate()} className="me-locate"><Icon name="compass" />Minha localização</button>
        <button type="button" onClick={() => (form ? closeForm() : openForm(null))} className="me-add"><Icon name={form ? 'x' : 'calendarplus'} />{form ? 'Fechar cadastro' : 'Cadastrar lugar'}</button>
        {geoMsg ? <span className="me-msg">{geoMsg}</span> : null}
      </nav>
      <div id="mapa" className={`me-map${picking ? ' picking' : ''}`} ref={mapEl} role="region" aria-label="Mapa com os locais do evento">{!ready ? <div className="me-loading">Carregando o mapa…</div> : null}{picking ? <div className="me-pickhint">Toque no mapa para marcar o lugar</div> : null}</div>
      {form ? (
        <form id="cadastro" className="me-form" onSubmit={save}>
          <h2><Icon name="calendarplus" />{form.id ? 'Editar lugar' : 'Cadastrar novo lugar'}</h2>
          <div className="me-grid">
            <label className="wide">Nome<input value={form.name} onChange={(e) => setF('name', e.target.value)} maxLength={120} placeholder="ex.: Restaurante Beira Rio" required /></label>
            <label>Tipo<select value={form.kind} onChange={(e) => setF('kind', e.target.value)}>{Object.entries(PLACE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label>Telefone <small>(opcional)</small><input value={form.phone} onChange={(e) => setF('phone', e.target.value)} maxLength={40} inputMode="tel" placeholder="(96) 9xxxx-xxxx" /></label>
            <label className="wide">Endereço<span className="me-inline"><input value={form.address} onChange={(e) => setF('address', e.target.value)} maxLength={200} placeholder="Rua, número – bairro, Oiapoque/AP" /><button type="button" className="me-mini" onClick={geocode}><Icon name="search" />Buscar no mapa</button></span></label>
            <label>Latitude<input value={form.lat} onChange={(e) => setF('lat', e.target.value)} inputMode="decimal" placeholder="3,8436" required /></label>
            <label>Longitude<input value={form.lng} onChange={(e) => setF('lng', e.target.value)} inputMode="decimal" placeholder="-51,8342" required /></label>
            <div className="me-geo-btns wide">
              <button type="button" className={`me-mini${picking ? ' on' : ''}`} onClick={pickOnMap}><Icon name="map" />{picking ? 'Cancelar marcação' : 'Marcar no mapa'}</button>
              <button type="button" className="me-mini" onClick={useGps}><Icon name="compass" />Usar minha localização (GPS)</button>
              <small>Dica: estando no local, "Usar minha localização" é o jeito mais rápido. O pino "?" pode ser arrastado para ajustar.</small>
            </div>
            <label className="wide">Observação <small>(opcional)</small><input value={form.note} onChange={(e) => setF('note', e.target.value)} maxLength={300} placeholder="ex.: almoço de 11h às 14h · estacionamento na lateral" /></label>
            <label>PIN da equipe<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" placeholder="PIN do tce-senhas" required /></label>
          </div>
          {formMsg ? <p className="me-form-msg">{formMsg}</p> : null}
          <div className="me-form-act">
            <button type="submit" className="me-btn gm" disabled={saving}><Icon name="check" />{saving ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Salvar lugar'}</button>
            <button type="button" className="me-btn other" onClick={closeForm}>Cancelar</button>
            <small>Fica no servidor do tce-senhas e aparece para todos neste mapa. {apiState === 'offline' ? 'Atenção: o servidor não respondeu agora.' : ''}</small>
          </div>
        </form>
      ) : null}
      <section className="me-list" aria-label="Lugares">
        {shown.map((p) => { const i = places.indexOf(p) + 1; const a = agendas[p.id]; const dist = me ? km(me, p) : null; const k = PLACE_KINDS[p.kind] || PLACE_KINDS.outro; return (
          <article key={p.id} id={`local-${p.id}`} className={`me-card${sel === p.id ? ' on' : ''}`}>
            <button type="button" className="me-card-head" onClick={() => focus(p)} aria-label={`Ver ${p.name} no mapa`}>
              <span className={`me-num${p.builtin && p.approx ? ' approx' : ''}`} style={p.builtin ? undefined : { background: k.color }}>{i}</span>
              <span className="me-card-t"><b>{p.name}</b><small className="me-kind"><Icon name={k.icon} />{p.builtin ? 'Local do evento' : k.label}{p.builtin && p.city ? ` · ${p.city}` : ''}</small>{p.address ? <small><Icon name="pin" />{p.address}</small> : null}</span>
              {dist != null ? <span className="me-dist"><Icon name="footprints" />{fmtKm(dist)}<small>em linha reta</small></span> : null}
            </button>
            <ul className="me-agenda">
              {a.lines.map((l, j) => <li key={j}><Icon name={l.icon} />{l.text}</li>)}
              {p.phone ? <li><Icon name="phone" /><a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a></li> : null}
              {p.note ? <li className="note"><Icon name="info" />{p.note}</li> : null}
              {p.approx ? <li className="warn"><Icon name="alert" />Ponto aproximado (quadra/rua): confira a fachada ao chegar.</li> : null}
            </ul>
            <div className="me-btns">
              <a className="me-btn gm" href={gmaps(p)} target="_blank" rel="noopener noreferrer"><Icon name="compass" />Rota no Google Maps</a>
              <a className="me-btn wz" href={waze(p)} target="_blank" rel="noopener noreferrer"><Icon name="next" />Rota no Waze</a>
              <a className="me-btn other" href={geoUri(p)}><Icon name="external" />Outro app de mapas</a>
              {p.builtin ? <a className="me-btn ghost" href={`index.html#local/${p.venues[0]}`}><Icon name="list" />Programação deste local</a>
                : <span className="me-edit"><button type="button" onClick={() => openForm(p)}><Icon name="sliders" />Editar</button><button type="button" className="del" onClick={() => remove(p)}><Icon name="x" />Excluir</button></span>}
            </div>
          </article>); })}
        {!shown.length ? <p className="me-empty">Nenhum lugar deste tipo cadastrado ainda. Use "Cadastrar lugar".</p> : null}
      </section>
      <footer className="me-foot">
        <p>{D.event.organizer} · {D.event.tagline}. Mapa © colaboradores do OpenStreetMap. As coordenadas das escolas vêm do OpenStreetMap; SEBRAE e Auditório estão marcados pelo endereço da rua. {extra.length ? `${extra.length} lugar${extra.length === 1 ? '' : 'es'} cadastrado${extra.length === 1 ? '' : 's'} pela equipe` : 'Nenhum lugar extra cadastrado ainda'}{apiState === 'offline' ? ' · servidor do tce-senhas fora do ar: mostrando a última cópia deste aparelho' : ''}.</p>
        <p>Dica: no celular, "Rota no Waze" e "Rota no Google Maps" abrem o aplicativo instalado. Sem o app, o Google Maps abre no navegador.</p>
      </footer>
    </main>
  );
}
