'use client';
/* Mapa dos locais do evento: pinos numerados (Leaflet + OpenStreetMap), cartões com endereço, o que acontece em cada
   local e botões de rota (Google Maps e Waze abrem o app do celular com o destino já preenchido; "outro app" usa geo:).
   "Minha localização" mostra a distância em linha reta até cada local. Dados em D.geo (packages/core/src/data.js). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import Icon from '@/components/Icon';

const D = T.D;
const gmaps = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
const waze = (p) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes&zoom=17`;
const geoUri = (p) => `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${encodeURIComponent(p.name)})`;
const km = (a, b) => { const R = 6371; const r = (x) => (x * Math.PI) / 180; const dLat = r(b.lat - a.lat); const dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0).replace('.', ',')} km`);
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());

/** O que acontece em cada local: dias com cursos (e quantas turmas) e dia de serviços. */
function agenda(p) {
  const sess = T.allSessions().filter((x) => p.venues.includes(x.venue));
  const days = [...new Set(sess.map((x) => x.date))].sort();
  const courses = new Set(sess.map((x) => x.course.id));
  const svc = T.serviceDays().find((d) => p.venues.includes(d.venue));
  const out = [];
  if (days.length) out.push({ icon: 'graduation', text: `${courses.size} curso${courses.size === 1 ? '' : 's'} · ${days.length === 1 ? cap(T.fmtDate(days[0], 'wdm')) : `${T.fmtDate(days[0], 'wdm')} a ${T.fmtDate(days[days.length - 1], 'wdm')}`}` });
  if (svc) out.push({ icon: 'handshake', text: `Serviços gratuitos · ${cap(T.fmtDate(svc.date, 'wdm'))}, sem inscrição` });
  return { days, courses: courses.size, svc, lines: out };
}

export default function MapaEventos() {
  const places = D.geo;
  const mapEl = useRef(null); const mapRef = useRef(null); const markers = useRef({}); const meMarker = useRef(null);
  const [sel, setSel] = useState('');
  const [me, setMe] = useState(null); const [geoMsg, setGeoMsg] = useState('');
  const [ready, setReady] = useState(false);
  const agendas = useMemo(() => Object.fromEntries(places.map((p) => [p.id, agenda(p)])), [places]);

  // ---- Leaflet (só no navegador) ----
  useEffect(() => {
    let alive = true;
    import('leaflet').then((mod) => {
      if (!alive || !mapEl.current || mapRef.current) return;
      const L = mod.default || mod;
      const map = L.map(mapEl.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      places.forEach((p, i) => {
        const icon = L.divIcon({ className: 'me-pin-wrap', html: `<div class="me-pin${p.approx ? ' approx' : ''}"><b>${i + 1}</b></div>`, iconSize: [38, 46], iconAnchor: [19, 44], popupAnchor: [0, -40] });
        const m = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(map);
        m.bindPopup(`<div class="me-pop"><b>${i + 1}. ${p.name}</b><small>${p.address}</small><div class="me-pop-btns"><a href="${gmaps(p)}" target="_blank" rel="noopener">Google Maps</a><a href="${waze(p)}" target="_blank" rel="noopener">Waze</a></div></div>`, { maxWidth: 280 });
        m.on('click', () => setSel(p.id));
        markers.current[p.id] = m;
      });
      mapRef.current = { L, map };
      const want = places.find((p) => p.id === (T.params.get('local') || '')) || null;
      if (want) { map.setView([want.lat, want.lng], 16); setSel(want.id); } else map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])).pad(0.18));
      setReady(true);
    }).catch(() => setGeoMsg('Não foi possível carregar o mapa. Use os botões de rota abaixo.'));
    return () => { alive = false; if (mapRef.current) { mapRef.current.map.remove(); mapRef.current = null; } };
  }, [places]);

  const focus = (p) => { setSel(p.id); const r = mapRef.current; if (!r) return; r.map.flyTo([p.lat, p.lng], 16, { duration: .8 }); const m = markers.current[p.id]; if (m) setTimeout(() => m.openPopup(), 850); document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const showAll = () => { setSel(''); const r = mapRef.current; if (!r) return; r.map.flyToBounds(r.L.latLngBounds(places.map((p) => [p.lat, p.lng])).pad(0.18), { duration: .8 }); };
  const showCity = (city) => { const r = mapRef.current; if (!r) return; const pts = places.filter((p) => p.city === city); if (pts.length === 1) focus(pts[0]); else r.map.flyToBounds(r.L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.35), { duration: .8 }); };
  const locate = () => {
    if (!navigator.geolocation) { setGeoMsg('Este navegador não informa a localização.'); return; }
    setGeoMsg('Procurando sua localização…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setMe(here); setGeoMsg('');
      const r = mapRef.current; if (!r) return;
      if (meMarker.current) meMarker.current.remove();
      meMarker.current = r.L.marker([here.lat, here.lng], { icon: r.L.divIcon({ className: 'me-pin-wrap', html: '<div class="me-here"><i></i></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), title: 'Você está aqui' }).addTo(r.map).bindPopup('Você está aqui');
      r.map.flyToBounds(r.L.latLngBounds([[here.lat, here.lng], ...places.map((p) => [p.lat, p.lng])]).pad(0.15), { duration: .8 });
    }, (err) => setGeoMsg(err.code === 1 ? 'Permissão de localização negada. Os botões de rota funcionam mesmo assim.' : 'Não consegui obter sua localização agora.'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  const cities = [...new Set(places.map((p) => p.city))];

  return (
    <main className="me">
      <header className="me-head">
        <img src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" />
        <div>
          <p className="me-kicker"><span>IX</span> TCE na Comunidade · {D.event.datesLabel}</p>
          <h1>Mapa dos locais do evento</h1>
          <p className="me-sub">Toque num local para ver no mapa. Os botões abrem a rota no Google Maps ou no Waze, já com o destino preenchido.</p>
        </div>
      </header>
      <nav className="me-tools" aria-label="Atalhos">
        <a href="index.html"><Icon name="phone" />App do evento</a>
        <button type="button" onClick={showAll} className={!sel ? 'on' : ''}><Icon name="map" />Todos os locais</button>
        {cities.map((c) => <button key={c} type="button" onClick={() => showCity(c)}><Icon name="pin" />{c}</button>)}
        <button type="button" onClick={locate} className="me-locate"><Icon name="compass" />Minha localização</button>
        {geoMsg ? <span className="me-msg">{geoMsg}</span> : null}
      </nav>
      <div id="mapa" className="me-map" ref={mapEl} role="region" aria-label="Mapa com os locais do evento">{!ready ? <div className="me-loading">Carregando o mapa…</div> : null}</div>
      <section className="me-list" aria-label="Locais">
        {places.map((p, i) => { const a = agendas[p.id]; const dist = me ? km(me, p) : null; return (
          <article key={p.id} id={`local-${p.id}`} className={`me-card${sel === p.id ? ' on' : ''}`}>
            <button type="button" className="me-card-head" onClick={() => focus(p)} aria-label={`Ver ${p.name} no mapa`}>
              <span className={`me-num${p.approx ? ' approx' : ''}`}>{i + 1}</span>
              <span className="me-card-t"><b>{p.name}</b><small><Icon name="pin" />{p.address}</small></span>
              {dist != null ? <span className="me-dist"><Icon name="footprints" />{fmtKm(dist)}<small>em linha reta</small></span> : null}
            </button>
            <ul className="me-agenda">
              {a.lines.map((l, k) => <li key={k}><Icon name={l.icon} />{l.text}</li>)}
              {p.note ? <li className="note"><Icon name="info" />{p.note}</li> : null}
              {p.approx ? <li className="warn"><Icon name="alert" />Ponto aproximado (quadra/rua): confira a fachada ao chegar.</li> : null}
            </ul>
            <div className="me-btns">
              <a className="me-btn gm" href={gmaps(p)} target="_blank" rel="noopener noreferrer"><Icon name="compass" />Rota no Google Maps</a>
              <a className="me-btn wz" href={waze(p)} target="_blank" rel="noopener noreferrer"><Icon name="next" />Rota no Waze</a>
              <a className="me-btn other" href={geoUri(p)}><Icon name="external" />Outro app de mapas</a>
              <a className="me-btn ghost" href={`index.html#local/${p.venues[0]}`}><Icon name="list" />Programação deste local</a>
            </div>
          </article>); })}
      </section>
      <footer className="me-foot">
        <p>{D.event.organizer} · {D.event.tagline}. Mapa © colaboradores do OpenStreetMap. As coordenadas das escolas vêm do OpenStreetMap; SEBRAE e Auditório estão marcados pelo endereço da rua.</p>
        <p>Dica: no celular, "Rota no Waze" e "Rota no Google Maps" abrem o aplicativo instalado. Sem o app, o Google Maps abre no navegador.</p>
      </footer>
    </main>
  );
}
