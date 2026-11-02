// Utilitários dos resumos da organização (resumo-cursos, resumo-total, lanches): filtro ?local= e afins.
import { TCE as T } from '@tce/core';

const D = T.D;
export const VENUE_ORDER = ['jn', 'manga', 'sebrae', 'auditorio', 'iaparra'];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const sameSet = (a, b) => !!a && !!b && a.size === b.size && [...a].every((x) => b.has(x));
/** ?local= → Set de locais (ou null = todos). Aceita ids (jn, manga, sebrae, auditorio, iaparra), vários com vírgula,
    e as cidades: "oiapoque" (Joaquim Nabuco, SEBRAE e auditório) e "manga" (Distrito do Manga e Escola Jorge Iaparrá). */
export function venueFilter(q) {
  const out = new Set();
  for (const raw of String(q || '').toLowerCase().split(/[,+ ]+/).filter(Boolean)) {
    const k = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (D.venues[k]) out.add(k);
    if (k === 'nabuco' || k === 'joaquim') out.add('jn');
    if (k === 'oiapoque') for (const v of Object.values(D.venues)) if (v.city === 'Oiapoque') out.add(v.id);
    if (k === 'manga') for (const v of Object.values(D.venues)) if (/manga/i.test(v.city)) out.add(v.id);
  }
  return out.size ? out : null;
}
/** Nome dos locais selecionados ("Escola Joaquim Nabuco e SEBRAE"). */
export const venuesLabel = (sel) => (sel ? VENUE_ORDER.filter((v) => sel.has(v)).map((v) => D.venues[v].name).join(' e ') : '');
/** ?dia= → Set de datas ISO (ou null). Aceita "04", "4", "04/11", "2026-11-04", vários com vírgula. */
export function dayFilter(q) {
  const out = new Set();
  for (const raw of String(q || '').split(/[,+ ]+/).filter(Boolean)) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})$/) || raw.match(/^(\d{1,2})(?:\/\d{1,2})?$/);
    if (!m) continue;
    out.add(m[1].length === 10 ? m[1] : `${D.event.start.slice(0, 8)}${m[1].padStart(2, '0')}`);
  }
  return out.size ? out : null;
}
