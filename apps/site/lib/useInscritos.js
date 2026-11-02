'use client';
import { useEffect, useState } from 'react';
import { TCE as T } from '@tce/core';

export const LS_DATA = 'tce_inscritos';
const API = () => (T.params.get('api') || T.D.event.apiUrl || '').replace(/\/$/, '');
export const loadLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
export const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };

/** Dados de inscrição ({ byId, updatedAt, source, painelInfo } ou null), do mais novo entre: o que já está neste
    aparelho (localStorage), a API do tce-senhas (coletor dentro da rede do TCE, ao vivo) e o inscritos.json publicado com o site. */
export function useInscritos() {
  const [enr, setEnr] = useState(() => loadLS(LS_DATA, null));
  useEffect(() => {
    const take = (pub, source) => {
      if (!pub || !pub.byId || !Object.keys(pub.byId).length) return;
      setEnr((cur) => { if (cur && cur.updatedAt >= pub.updatedAt) return cur; const data = { byId: pub.byId, updatedAt: pub.updatedAt, source, painelInfo: pub.painelInfo || '' }; saveLS(LS_DATA, data); return data; });
    };
    if (API()) fetch(`${API()}/api/inscritos`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).then((pub) => take(pub, 'coletor')).catch(() => {});
    fetch('inscritos.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((pub) => take(pub, 'publicado')).catch(() => {});
  }, []);
  return [enr, setEnr];
}
/** "ter 03 11:40 · via coletor (ao vivo)" para o rodapé/KPI de fonte. */
export function inscritosSourceLabel(enr) {
  if (!enr) return 'sem leitura do painel';
  const p = T.partsOf(new Date(enr.updatedAt));
  const how = enr.source === 'coletor' ? 'via coletor (ao vivo)' : enr.source === 'publicado' ? 'publicado com o site' : enr.source === 'painel' ? 'lido do painel' : 'colado';
  return `${T.fmtDate(p.date, 'wd')} ${p.time}${enr.painelInfo ? ` · painel de ${enr.painelInfo}` : ''} · ${how}`;
}
