/* Mapa digital dos locais de serviços: rota a pé do acesso até a sala (grafo dos corredores + Dijkstra) e instruções em texto. Puro, sem DOM: a planta é desenhada pelo componente React PlanMap.
   Módulo ES (pacote @tce/core); roda no navegador, no Next e em Node (testes). */
import { TCE_DATA as D } from './data.js';
const MAPS = D.maps || {};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;

/** Projeção do ponto p no segmento a-b. */
function project(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  if (!l2) return { pt: a, t: 0 };
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return { pt: [a[0] + t * dx, a[1] + t * dy], t };
}
/** Grafo dos corredores: vértices nas dobras; pontos extras (origem/destino) entram projetados no segmento mais próximo. */
function graph(map, extras) {
  const adj = new Map();
  const add = (a, b) => { const ka = key(a); const kb = key(b); if (ka === kb) return; if (!adj.has(ka)) adj.set(ka, { p: a, e: [] }); if (!adj.has(kb)) adj.set(kb, { p: b, e: [] }); adj.get(ka).e.push(kb); adj.get(kb).e.push(ka); };
  // Quebra cada segmento nos pontos projetados dos extras que o têm como mais próximo.
  const segs = []; for (const poly of map.corridors) for (let i = 0; i + 1 < poly.length; i++) segs.push([poly[i], poly[i + 1]]);
  const splits = segs.map(() => []);
  const anchors = extras.map((p) => {
    let best = null;
    segs.forEach((sg, i) => { const pr = project(p, sg[0], sg[1]); const d = dist(p, pr.pt); if (!best || d < best.d) best = { d, i, pt: pr.pt, t: pr.t }; });
    splits[best.i].push(best); return best.pt;
  });
  segs.forEach((sg, i) => {
    const pts = [sg[0], ...splits[i].sort((x, y) => x.t - y.t).map((x) => x.pt), sg[1]];
    for (let k = 0; k + 1 < pts.length; k++) add(pts[k], pts[k + 1]);
  });
  extras.forEach((p, i) => add(p, anchors[i]));
  return adj;
}
function dijkstra(adj, from, to) {
  const kf = key(from); const kt = key(to); const d = new Map([[kf, 0]]); const prev = new Map(); const open = new Set([kf]);
  while (open.size) {
    let u = null; for (const k of open) if (u == null || d.get(k) < d.get(u)) u = k;
    open.delete(u); if (u === kt) break;
    const nu = adj.get(u); if (!nu) continue;
    for (const v of nu.e) { const nd = d.get(u) + dist(nu.p, adj.get(v).p); if (nd < (d.has(v) ? d.get(v) : Infinity)) { d.set(v, nd); prev.set(v, u); open.add(v); } }
  }
  if (!d.has(kt)) return null;
  const path = []; for (let k = kt; k; k = prev.get(k)) { path.unshift(adj.get(k).p); if (k === kf) break; }
  return path;
}
/** Remove pontos colineares/quase repetidos. */
function simplify(path) {
  const out = [];
  for (const p of path) { if (out.length && dist(out[out.length - 1], p) < 2) continue; out.push(p); }
  for (let i = 1; i + 1 < out.length;) { const a = out[i - 1]; const b = out[i]; const c = out[i + 1]; const ang = Math.abs(turn(a, b, c)); if (ang < 8) out.splice(i, 1); else i++; }
  return out;
}
const heading = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
/** Ângulo de curva em b (graus): positivo = direita (eixo y para baixo), negativo = esquerda. */
function turn(a, b, c) { let t = heading(b, c) - heading(a, b); while (t > 180) t -= 360; while (t < -180) t += 360; return t; }

const placeLabel = (p) => (p.kind === 'sala' ? `Sala ${p.num}` : p.kind === 'tenda' ? `Tenda ${p.num}` : p.num ? `Ambiente ${p.num}` : p.name);
const placeFull = (p) => (p.kind === 'area' && !p.num ? p.name : `${placeLabel(p)} · ${p.name}`);
const mapOf = (venue) => MAPS[venue] || null;
function placeById(id) { for (const m of Object.values(MAPS)) { const p = m.places.find((x) => x.id === id); if (p) return { map: m, place: p }; } return null; }
const entranceOf = (map, id) => map.entrances.find((e) => e.id === id) || map.entrances.find((e) => e.default) || map.entrances[0];

/** Rota do acesso até a sala: pontos (px da imagem) e passos em texto. */
function route(venue, placeId, entranceId, alias) {
  const map = mapOf(venue); if (!map) return null;
  let place = map.places.find((p) => p.id === placeId); if (!place) return null;
  if (alias) place = Object.assign({}, place, { name: alias }); // ex.: curso usa a sala 08 → "Sala I (curso)" em vez de "Ortopedia"
  const from = entranceOf(map, entranceId);
  const start = [from.x, from.y]; const goal = place.door || [place.x, place.y];
  const adj = graph(map, [start, goal]);
  let path = dijkstra(adj, start, goal) || [start, goal];
  if (place.door) path = path.concat([[place.x, place.y]]);
  path = simplify(path);
  return { map, place, from, points: path, steps: steps(path, place, from) };
}
function steps(path, place, from) {
  const out = [{ kind: 'start', text: `Você está no ${from.short}. Entre na escola.` }];
  // O último ponto é a porta/centro da sala; as curvas valem só pelo corredor (até o penúltimo ponto).
  const corr = path.length > 2 ? path.slice(0, -1) : path;
  let straight = 0;
  for (let i = 1; i + 1 < corr.length; i++) {
    const t = turn(corr[i - 1], corr[i], corr[i + 1]);
    if (Math.abs(t) < 28) { straight++; continue; }
    if (Math.abs(t) > 150) { out.push({ kind: 'turn', text: 'Dê meia-volta.' }); continue; }
    const soft = Math.abs(t) < 55;
    out.push({ kind: t > 0 ? 'right' : 'left', text: `${straight ? 'Siga em frente e ' : ''}${soft ? 'pegue' : 'vire'} à ${t > 0 ? 'direita' : 'esquerda'}.` });
    straight = 0;
  }
  if (out.length === 1 || straight) out.push({ kind: 'straight', text: out.length === 1 ? 'Siga em frente pelo corredor.' : 'Siga em frente.' });
  // De que lado fica a sala em relação ao último trecho de corredor.
  let side = '';
  if (corr.length >= 2) {
    const a = corr[corr.length - 2]; const b = corr[corr.length - 1]; const c = [place.x, place.y];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const along = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (Math.abs(cross) / along > 15) side = cross > 0 ? ' à sua direita' : ' à sua esquerda';
  }
  out.push({ kind: 'end', text: `${placeLabel(place)}${place.kind === 'area' && !place.num ? '' : ` (${place.name})`} fica${side || ' à sua frente'}.` });
  return out;
}

/** Lê os passos em voz alta (pt-BR), quando o navegador tem síntese de voz. Devolve false se não houver. */
function speak(r) {
  if (!globalThis.speechSynthesis || !r) return false;
  globalThis.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(r.steps.map((s) => s.text).join(' '));
  u.lang = 'pt-BR'; u.rate = 0.95;
  const v = (globalThis.speechSynthesis.getVoices() || []).find((x) => /pt[-_]BR/i.test(x.lang)); if (v) u.voice = v;
  globalThis.speechSynthesis.speak(u); return true;
}

export { MAPS as maps, mapOf, placeById, placeLabel, placeFull, entranceOf, route, turn, dist, speak, project, graph, dijkstra, simplify, heading };
export const TCEMap = { maps: MAPS, mapOf, placeById, placeLabel, placeFull, entranceOf, route, turn, speak };
export default TCEMap;
