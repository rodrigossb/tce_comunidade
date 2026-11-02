/* Leitor do painel administrativo da ESCON (inscritos por curso): aceita HTML, JSON ou texto copiado.
   Puro (sem React/DOM obrigatório); usado pela página resumo-cursos, pela API /api/inscritos do app de senhas e pelos coletores. */
import { TCE as T } from './shared.js';
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
  if (/^[[{]/.test(t)) { try { const j = JSON.parse(t); const cards = apiCards(j); if (cards.length) return fromPanelCards(cards).byKey; return fromJson(j); } catch { /* não é JSON */ } }
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
/** Cartões a partir do JSON da API pública do painel (/escon/admin/api/public/painel/oiapoque?k=…). O formato exato
    não é conhecido de fora da rede do TCE, então a leitura é tolerante: procura a maior lista de objetos e, em cada um,
    o título (titulo/nome/curso…), o período (periodo/data/inicio+fim), os inscritos (inscritos/qtd…), vagas e id. */
function apiCards(data) {
  const lists = []; const walk = (v, depth) => { if (!v || typeof v !== 'object' || depth > 6) return; if (Array.isArray(v)) { if (v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) lists.push(v); v.forEach((x) => walk(x, depth + 1)); } else Object.values(v).forEach((x) => walk(x, depth + 1)); };
  walk(data, 0);
  const keyOf = (o, re, type) => { const k = Object.keys(o).find((key) => re.test(norm(key).replace(/\s+/g, '_')) && (type === 'any' || typeof o[key] === type || (type === 'number' && /^\d+$/.test(String(o[key]))))); return k == null ? undefined : o[k]; };
  const isoDay = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/) || String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); if (!m) return null; return m[0].includes('-') ? { y: +m[1], mo: +m[2], d: +m[3] } : { y: +m[3], mo: +m[2], d: +m[1] }; };
  const MESES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  let best = [];
  for (const list of lists) {
    const cards = [];
    for (const o of list) {
      const title = keyOf(o, /^(titulo|title|nome|name|curso|acao|evento|descricao)$|titulo|nome_|_nome|curso/, 'string'); if (!title) continue;
      const inscritos = keyOf(o, /inscri|matric|confirm|participante|qtd|quant|total/, 'number'); if (inscritos == null) continue;
      const vagas = keyOf(o, /^(vagas?|limite|capacidade|lotacao)$|vaga/, 'number');
      const id = keyOf(o, /^(id|codigo|cod|course_id|curso_id|id_curso|acao_id|id_acao)$/, 'any');
      let date = keyOf(o, /periodo|^data$|data_|date|^dia$|dias/, 'string') || '';
      const ini = isoDay(keyOf(o, /inicio|start|data_ini|de$/, 'string')); const fim = isoDay(keyOf(o, /^fim$|termino|end|data_fim|ate$/, 'string')) || ini;
      let days = [];
      if (ini) { for (let d = ini.d; d <= (fim.mo === ini.mo ? fim.d : 31); d++) days.push(d); if (!date) date = ini.d === fim.d ? `Dia ${ini.d} de ${MESES[ini.mo]}` : `De ${ini.d} a ${fim.d} de ${MESES[fim.mo]}`; }
      else { const dd = isoDay(date); if (dd) { days = [dd.d]; date = `Dia ${dd.d} de ${MESES[dd.mo]}`; } }
      const local = keyOf(o, /^(local|cidade|polo|unidade|municipio)$/, 'string') || '';
      let t = String(title).trim();
      if (local && !/^\(?(manga|oiapoque)\)?\s*[-–:]?\s/i.test(t)) { if (/manga|iaparr/i.test(local)) t = `Manga - ${t}`; else if (/oiapoque/i.test(local)) t = `(Oiapoque) ${t}`; }
      cards.push({ title: t, date, days, inscritos: Number(inscritos) || 0, vagas: vagas != null ? Number(vagas) : undefined, id: id != null ? String(id) : undefined });
    }
    if (cards.length > best.length) best = cards;
  }
  return best;
}
/** "Números de 2 de novembro, às 11:40" → "02/11 11:40", a partir de um campo do JSON (atualizado_em, gerado, data_hora, updated_at…). */
function panelInfoOf(data) {
  const found = []; const walk = (v, depth) => { if (!v || typeof v !== 'object' || depth > 4 || Array.isArray(v)) return; for (const [k, x] of Object.entries(v)) { if (typeof x === 'string' && /atualiz|gerad|numeros|data_hora|datahora|updated|timestamp|referencia/.test(norm(k))) found.push(x); else if (x && typeof x === 'object' && !Array.isArray(x)) walk(x, depth + 1); } };
  walk(data, 0);
  for (const s of found) {
    const m = s.match(/N[úu]meros de (\d{1,2}) de (\w+),? [àa]s (\d{1,2}:\d{2})/i); if (m) { const MES = { outubro: '10', novembro: '11', dezembro: '12' }; return `${m[1].padStart(2, '0')}/${MES[m[2].toLowerCase()] || m[2]} ${m[3]}`; }
    const d = new Date(s); if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) { const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d); const g = (t) => p.find((x) => x.type === t).value; return `${g('day')}/${g('month')} ${g('hour')}:${g('minute')}`; }
    const m2 = s.match(/(\d{2})\/(\d{2})\/\d{4},?\s+(\d{2}:\d{2})/); if (m2) return `${m2[1]}/${m2[2]} ${m2[3]}`;
  }
  return '';
}
const daysOf = (date) => { const m = String(date).match(/de (\d{1,2}) a (\d{1,2})/i) || String(date).match(/dia (\d{1,2})/i); if (!m) return []; const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a; const out = []; for (let d = a; d <= b; d++) out.push(d); return out; };
/** Casa cada cartão com uma turma: título parecido (radicais em comum), local do prefixo e dias. Devolve { byKey, matches, unmatched }. */
function fromPanelCards(cards) {
  const groups = ALL_GROUPS(); const used = new Set(); const byKey = {}; const matches = []; const unmatched = [];
  const scored = [];
  for (const card of cards) {
    const hint = /^\(?manga\)?\s*[-–:]?/i.test(card.title) ? 'manga' : /^\(?oiapoque\)?\s*[-–:]?\s/i.test(card.title) || /^\(oiapoque\)/i.test(card.title) ? 'oiapoque' : null;
    const clean = card.title.replace(/^\(?(manga|oiapoque)\)?\s*[-–:]?\s*/i, '');
    const tk = tokens(clean); const days = card.days && card.days.length ? card.days : daysOf(card.date);
    for (const g of groups) {
      // Id da ESCON vindo da API: casa direto com a turma daquele link (o local/dias desempatam quando há mais de uma).
      const byId = card.id != null && String(card.id) === g.linkId;
      const ct = new Set([...tokens(g.course.title), ...tokens(g.course.short || ''), ...tokens(String(g.course.link).split('/').pop().replace(/-/g, ' '))]);
      const common = [...tk].filter((w) => ct.has(w)).length; if (!byId && (!tk.size || !common)) continue;
      let score = (tk.size ? common / tk.size : 0) + 0.4 * (common / Math.max(1, ct.size)) + (byId ? 1 : 0);
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
    byKey[g.key] = Object.assign({ inscritos: card.inscritos, titulo: card.title, periodo: card.date }, card.vagas != null && card.vagas > 0 ? { vagas: card.vagas } : {});
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
export { parseAny, courseOf, fromRows, fromText, fromHtml, fromJson, htmlToText, panelCards, apiCards, panelInfoOf, fromPanelCards, groupsOf, groupKey, linkIdOf };
