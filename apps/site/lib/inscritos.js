/* Leitor do painel administrativo da ESCON (inscritos por curso): aceita HTML, JSON ou texto copiado.
   Puro (sem React); usado pela página resumo-cursos e pelo script scripts/inscritos.mjs. */
import { TCE as T } from '@tce/core';
const D = T.D;
const norm = (s) => T.norm(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// ---------- leitura do painel da ESCON (HTML, JSON ou texto colado) ----------
const COURSES = D.courses.map((c) => ({ c, id: String(c.id), t: norm(c.title), s: c.short ? norm(c.short) : '' }));
/** Curso citado em um texto: pelo id (ex.: "145") ou pelo título (o mais longo que couber). */
function courseOf(text) {
  const n = norm(text);
  const ids = n.match(/\b1\d\d\b/g) || [];
  for (const id of ids) { const hit = COURSES.find((x) => x.id === id); if (hit) return hit.c; }
  let best = null;
  for (const x of COURSES) { if (x.t.length >= 8 && n.includes(x.t) && (!best || x.t.length > best.t.length)) best = x; }
  if (!best) for (const x of COURSES) { if (x.s && x.s.length >= 8 && n.includes(x.s) && (!best || x.s.length > best.s.length)) best = x; }
  return best ? best.c : null;
}
const numsIn = (s) => (String(s).match(/\d+/g) || []).map(Number);
const isHeader = (cells) => cells.some((c) => /vaga|inscri|matric/i.test(c)) && !cells.some((c) => courseOf(c));
/** Linhas (arrays de células) → { [id]: { vagas, inscritos, restantes } }. Reconhece cabeçalho; sem ele, usa a ordem vagas · inscritos · restantes. */
function fromRows(rows) {
  const out = {}; let idx = null;
  for (const cells of rows) {
    if (!cells.length) continue;
    if (isHeader(cells)) {
      const f = (re, not) => cells.findIndex((c) => re.test(norm(c)) && !(not && not.test(norm(c))));
      idx = { v: f(/vaga|limite|capac/, /restan|dispon|saldo|livre|remanesc/), i: f(/inscri|matric|confirm/), r: f(/restan|dispon|saldo|livre|remanesc/) };
      continue;
    }
    const c = courseOf(cells.join(' ')); if (!c) continue;
    const row = out[c.id] || (out[c.id] = {});
    const val = (k) => (idx && idx[k] >= 0 && cells[idx[k]] != null ? numsIn(cells[idx[k]])[0] : undefined);
    let v = val('v'); let i = val('i'); let r = val('r');
    if (i == null && r == null) {
      // Sem cabeçalho: números da linha fora do título/id do curso.
      const nums = cells.flatMap((cell) => (courseOf(cell) ? [] : numsIn(cell))).filter((n) => n !== c.id && n < 100000);
      if (nums.length >= 3) [v, i, r] = nums; else if (nums.length === 2) { if (nums[0] === c.seats) [v, i] = nums; else [i, r] = nums; } else if (nums.length === 1) [i] = nums;
    }
    if (v != null) row.vagas = v; if (i != null) row.inscritos = i; if (r != null) row.restantes = r;
  }
  return out;
}
function fromHtml(html) {
  if (typeof DOMParser === 'undefined') return fromText(htmlToText(html)); // Node (script): sem DOM, converte a tabela em texto com tabulações
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  let out = fromRows(rows);
  if (!Object.keys(out).length) { // sem tabela: blocos/cartões → uma linha por elemento com texto curto
    const blocks = [...doc.querySelectorAll('li, article, .card, .row, div')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 8 && t.length < 400);
    out = fromRows(blocks.map((t) => t.split(/\s{2,}|\s\|\s|\t/)));
  }
  if (!Object.keys(out).length) out = fromText(doc.body ? doc.body.innerText || doc.body.textContent : html);
  return out;
}
function fromText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => l.split(/\t|\s{2,}|\s\|\s|;/).map((s) => s.trim()).filter(Boolean));
  let out = fromRows(rows);
  if (!Object.keys(out).length) { // título numa linha e números na(s) seguinte(s)
    const merged = []; for (let k = 0; k < lines.length; k++) { if (courseOf(lines[k])) merged.push([lines[k], lines[k + 1] || '', lines[k + 2] || '']); }
    out = fromRows(merged);
  }
  return out;
}
function fromJson(data) {
  const list = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) || [];
  const out = {};
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const c = courseOf(Object.values(o).filter((v) => typeof v === 'string' || typeof v === 'number').join(' ')); if (!c) continue;
    const pick = (re) => { const k = Object.keys(o).find((key) => re.test(norm(key))); return k != null ? Number(o[k]) : undefined; };
    out[c.id] = { vagas: pick(/^(vaga|limite|capac)/), inscritos: pick(/inscri|matric|confirm/), restantes: pick(/restan|dispon|saldo|livre/) };
  }
  return out;
}
function parseAny(text) {
  const t = String(text || '').trim(); if (!t) return {};
  if (/^[[{]/.test(t)) { try { return fromJson(JSON.parse(t)); } catch { /* não é JSON */ } }
  if (/<\s*(table|tr|html|div|body)[\s>]/i.test(t)) return fromHtml(t);
  return fromText(t);
}

/** HTML → texto: células viram tabulações e linhas viram quebras (para o script em Node). */
function htmlToText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<\/(td|th)>/gi, '\t').replace(/<\/(tr|li|p|div|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/[ \u00a0]+/g, ' ').replace(/ *\t */g, '\t').replace(/\n\s*\n+/g, '\n');
}
export { parseAny, courseOf, fromRows, fromText, fromHtml, fromJson, htmlToText };
