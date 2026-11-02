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
  if (/po-cartao|pessoas? inscritas?/i.test(t)) { const cards = panelCards(t); if (cards.length) return fromPanelCards(cards).byKey; }
  if (/^[[{]/.test(t)) { try { return fromJson(JSON.parse(t)); } catch { /* não é JSON */ } }
  if (/<\s*(table|tr|html|div|body)[\s>]/i.test(t)) return fromHtml(t);
  return fromText(t);
}


// ---------- formato real do painel "Próximas ações em Oiapoque" (cartões, sem código nem vagas) ----------
// Cada cartão: título (com prefixo "Manga - " / "Oiapoque - " / "(Oiapoque)"), período ("Dia 5 de novembro", "De 3 a 6 de novembro")
// e "N pessoas inscritas". O painel tem um cartão por curso da ESCON; nos nossos dados um curso pode reunir turmas de
// locais diferentes (ex.: Cuidador no Manga e na Joaquim Nabuco) ou com links distintos (Cidadania Conectada I e II).
// Por isso a chave é por turma: `${curso}@${local}@${id ESCON do link}` (groupKey).
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'x', 'ou', 'ao', 'aos', 'um', 'uma', 'curso', 'oiapoque', 'manga', 'suas', 'seu', 'sua', 'que', 'por']);
const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem));
const MANGA = ['manga', 'iaparra']; const OIAPOQUE = ['jn', 'sebrae', 'auditorio'];
const linkIdOf = (c, sess) => { const m = String((sess && sess.link) || c.link || '').match(/cursos\/(\d+)/); return m ? m[1] : String(c.id); };
const groupKey = (c, sess) => `${c.id}@${sess.venue}@${linkIdOf(c, sess)}`;
/** Turmas de um curso (por local e id da ESCON), com os dias do mês em que acontecem. */
function groupsOf(c) {
  const map = new Map();
  for (const s of c.sessions) { const k = groupKey(c, s); if (!map.has(k)) map.set(k, { key: k, course: c, venue: s.venue, linkId: linkIdOf(c, s), days: new Set() }); map.get(k).days.add(Number(s.date.slice(8))); }
  return [...map.values()];
}
const ALL_GROUPS = () => D.courses.flatMap(groupsOf);
/** Cartões a partir do HTML do painel ou do texto copiado dele. */
function panelCards(text) {
  const t = String(text || ''); const cards = [];
  if (/po-cartao/.test(t)) {
    for (const m of t.matchAll(/<li class="po-cartao">([\s\S]*?)<\/li>/g)) {
      const pick = (re) => { const x = m[1].match(re); return x ? x[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() : ''; };
      cards.push({ title: pick(/<h3>([\s\S]*?)<\/h3>/), date: pick(/po-data">([^<]*)/), inscritos: Number(pick(/<strong>([^<]*)/)) || 0, presentes: Number(pick(/po-presentes[^>]*><strong>([^<]*)/)) || null });
    }
    return cards;
  }
  const lines = (/<\w+[\s>]/.test(t) ? htmlToText(t) : t).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d+)\s+pessoas?\s+inscritas?/i); if (!m) continue;
    const date = lines[i - 1] || ''; const title = lines[i - 2] || '';
    if (!/novembro|dezembro|outubro|^dia |^de \d/i.test(date)) continue;
    cards.push({ title, date, inscritos: Number(m[1]) });
  }
  return cards;
}
const daysOf = (date) => { const m = String(date).match(/de (\d{1,2}) a (\d{1,2})/i) || String(date).match(/dia (\d{1,2})/i); if (!m) return []; const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a; const out = []; for (let d = a; d <= b; d++) out.push(d); return out; };
/** Casa cada cartão com uma turma: título parecido (radicais em comum), local do prefixo e dias. Devolve { byKey, matches, unmatched }. */
function fromPanelCards(cards) {
  const groups = ALL_GROUPS(); const used = new Set(); const byKey = {}; const matches = []; const unmatched = [];
  const scored = [];
  for (const card of cards) {
    const hint = /^\(?manga\)?\s*[-–:]?/i.test(card.title) ? 'manga' : /^\(?oiapoque\)?\s*[-–:]?\s/i.test(card.title) || /^\(oiapoque\)/i.test(card.title) ? 'oiapoque' : null;
    const clean = card.title.replace(/^\(?(manga|oiapoque)\)?\s*[-–:]?\s*/i, '');
    const tk = tokens(clean); const days = daysOf(card.date);
    for (const g of groups) {
      const ct = new Set([...tokens(g.course.title), ...tokens(g.course.short || ''), ...tokens(String(g.course.link).split('/').pop().replace(/-/g, ' '))]);
      const common = [...tk].filter((w) => ct.has(w)).length; if (!tk.size || !common) continue;
      let score = common / tk.size + 0.4 * (common / Math.max(1, ct.size));
      const inManga = MANGA.includes(g.venue);
      if (hint === 'manga') score += inManga ? 0.4 : -1; else if (hint === 'oiapoque') score += inManga ? -1 : 0.4; else score += inManga ? 0 : 0.08;
      if (days.length && days.some((d) => g.days.has(d))) score += 0.15;
      if (/\bii\b/i.test(clean) !== /turma ii|\bii\b/i.test(g.course.sessions.find((s) => groupKey(g.course, s) === g.key)?.label || '')) score -= 0.3;
      scored.push({ card, g, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const done = new Set();
  for (const { card, g, score } of scored) {
    if (done.has(card) || used.has(g.key) || score < 0.6) continue;
    done.add(card); used.add(g.key);
    byKey[g.key] = { inscritos: card.inscritos, titulo: card.title, periodo: card.date };
    matches.push({ card, group: g, score });
  }
  for (const card of cards) if (!done.has(card)) unmatched.push(card);
  return { byKey, matches, unmatched };
}

/** HTML → texto: células viram tabulações e linhas viram quebras (para o script em Node). */
function htmlToText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<\/(td|th)>/gi, '\t').replace(/<\/(tr|li|p|div|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/[ \u00a0]+/g, ' ').replace(/ *\t */g, '\t').replace(/\n\s*\n+/g, '\n');
}
export { parseAny, courseOf, fromRows, fromText, fromHtml, fromJson, htmlToText, panelCards, fromPanelCards, groupsOf, groupKey, linkIdOf };
