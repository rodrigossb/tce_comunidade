'use client';
import { useEffect, useState } from 'react';
import { TCE as T } from '@tce/core';
import { loadLS, saveLS } from './useInscritos';

export const LS_ATEND = 'tce_atendimento';
const API = () => (T.params.get('api') || T.D.event.apiUrl || '').replace(/\/$/, '');
const REFRESH_MS = 5 * 60 * 1000;

/** Retrato do atendimento por dia definido na triagem do controle de senhas ({ updatedAt, days, source } ou null; formato
    em @tce/core/atendimento), do mais novo entre: a cópia neste aparelho (localStorage), a API ao vivo do tce-senhas e o
    atendimento.json publicado com o site. Enquanto a página fica aberta, consulta a API de novo a cada 5 min. */
export function useAtendimento() {
  const [data, setData] = useState(() => loadLS(LS_ATEND, null));
  useEffect(() => {
    let alive = true;
    const take = (pub, source) => {
      if (!alive || !pub || !Array.isArray(pub.days) || !(pub.updatedAt > 0)) return;
      setData((cur) => { if (cur && cur.updatedAt >= pub.updatedAt) return cur; const next = { updatedAt: pub.updatedAt, days: pub.days, source }; saveLS(LS_ATEND, next); return next; });
    };
    const live = () => { if (API()) fetch(`${API()}/api/atendimento`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).then((pub) => take(pub, 'ao vivo')).catch(() => {}); };
    live();
    fetch('atendimento.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((pub) => take(pub, 'publicado')).catch(() => {});
    const id = setInterval(live, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return data;
}
