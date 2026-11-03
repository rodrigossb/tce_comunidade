/* Lugares cadastrados pela equipe (mapa-eventos.html): tipos, limites geográficos e validação — usados pelo servidor
   (tce-senhas, api/lugares) e pelo formulário do site, para as duas pontas aceitarem a mesma coisa. */
export const PLACE_KINDS = {
  escola: { label: 'Escola', plural: 'Escolas', icon: 'graduation', color: '#1f3b9a' },
  restaurante: { label: 'Restaurante', plural: 'Restaurantes', icon: 'store', color: '#ea580c' },
  hotel: { label: 'Hotel', plural: 'Hotéis', icon: 'building', color: '#7c3aed' },
  saude: { label: 'Saúde', plural: 'Saúde', icon: 'heart', color: '#dc2626' },
  outro: { label: 'Outro', plural: 'Outros', icon: 'pin', color: '#0f766e' },
};
/** Caixa generosa em volta de Oiapoque (sede, Manga, Clevelândia, Vila Brasil e a BR-156 até a divisa). */
export const PLACE_BOUNDS = { lat: [3.2, 4.6], lng: [-52.6, -51.0] };
const S = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const bad = (msg) => { const e = new Error(msg); e.status = 400; return e; };
/** Lê "3,8435" ou "3.8435" (também "-51,83"). */
export const parseCoord = (v) => { if (typeof v === 'number') return v; const t = String(v == null ? '' : v).trim().replace(',', '.'); if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN; return Number(t); };
/** Normaliza/valida um lugar vindo de formulário ou API; lança Error com status 400 explicando o campo. */
export function normalizeLugar(b) {
  const o = b || {};
  const name = S(o.name, 120); if (name.length < 2) throw bad('informe o nome do lugar');
  const kind = S(o.kind, 24).toLowerCase(); if (!PLACE_KINDS[kind]) throw bad('tipo inválido');
  const address = S(o.address, 200);
  const lat = parseCoord(o.lat); const lng = parseCoord(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw bad('latitude e longitude são obrigatórias (ex.: 3,8436 e -51,8342)');
  if (lat < PLACE_BOUNDS.lat[0] || lat > PLACE_BOUNDS.lat[1] || lng < PLACE_BOUNDS.lng[0] || lng > PLACE_BOUNDS.lng[1]) throw bad('coordenada fora da região de Oiapoque (latitude ≈ 3,8 · longitude ≈ -51,8)');
  const out = { name, kind, address, lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7, note: S(o.note, 300), phone: S(o.phone, 40) };
  if (o.id != null && o.id !== '') { const id = Number(o.id); if (!Number.isInteger(id) || id <= 0) throw bad('id inválido'); out.id = id; }
  return out;
}
