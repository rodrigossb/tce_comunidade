'use client';
import { useEffect, useState, useCallback } from 'react';
import { now } from '@tce/core';

/** true depois da montagem no navegador (o HTML exportado é um esqueleto; relógio, hash e localStorage só existem no cliente). */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { setM(true); }, []);
  return m;
}

/** Relógio no fuso do evento (TCE.now()), atualizado a cada segundo quando o minuto muda. */
export function useClock() {
  const [clock, setClock] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => { const c = now(); setClock((prev) => (prev.time === c.time && prev.date === c.date ? prev : c)); }, 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

/** Hash atual (sem '#', decodificado) e função go(hash, replace). Rotas por hash como no site antigo (#curso/116, #mapa?local=jn). */
export function useHash(fallback = '') {
  const read = () => (typeof location === 'undefined' ? fallback : decodeURIComponent(location.hash.slice(1)) || fallback);
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => setHash(read());
    on(); window.addEventListener('hashchange', on); window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = useCallback((h, replace) => {
    const target = h.startsWith('#') ? h : `#${h}`;
    if (replace) { history.replaceState(null, '', target); setHash(read()); } else location.hash = target;
  }, []);
  return [hash, go];
}

/** Estado persistido em localStorage (JSON). Lê só no cliente. */
export function useStored(key, initial) {
  const [v, setV] = useState(initial);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s != null) setV(JSON.parse(s)); } catch { /* sem storage */ } }, [key]);
  const set = useCallback((next) => { setV((prev) => { const val = typeof next === 'function' ? next(prev) : next; try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ } return val; }); }, [key]);
  return [v, set];
}
