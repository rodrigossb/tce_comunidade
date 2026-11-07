// PDF das senhas para recortar, gerado no servidor sem dependências: A4 retrato (595,28 × 841,89 pt), margem de 12 mm,
// 4 colunas × 6 linhas de 42 mm (cabe também em Carta, se a impressora ignorar o tamanho), linhas de corte tracejadas,
// fontes padrão Helvetica/Helvetica-Bold (WinAnsi, sem embutir). Entrada: folhas de pagesOf() de lib/impressao.js — cada
// folha é de uma sala ({ name, room, tickets: [{ label, prio }] }). Saída: Buffer do arquivo PDF (versão 1.4, sem compressão).
const MM = 72 / 25.4;
export const A4 = { w: 595.28, h: 841.89 };
export const GRID = { cols: 4, rows: 6, margin: 12 * MM, rowH: 42 * MM, pad: 2 * MM };

// Larguras (por 1000 unidades) das fontes padrão; letras acentuadas usam a largura da letra base. Fora da tabela: 556.
const AW = 'A667B667C722D722E667F611G778H722I278J500K667L556M833N722O778P667Q778R722S667T611U722V667W944X667Y667Z611a556b556c500d556e556f278g556h556i222j222k500l222m833n556o556p556q556r333s500t278u556v500w722x500y500z500';
const BW = 'A722B722C722D722E667F611G778H722I278J556K722L611M833N722O778P667Q778R722S667T611U722V667W944X667Y667Z611a556b611c556d611e556f333g611h611i278j278k556l278m889n611o611p611q611r389s556t333u611v556w778x556y556z500';
const parseW = (s) => { const o = {}; for (const m of s.matchAll(/([A-Za-z])(\d{3})/g)) o[m[1]] = +m[2]; return o; };
const PUNCT = { ' ': 278, '.': 278, ',': 278, '-': 333, '(': 333, ')': 333, '/': 278, ':': 278, ';': 278, '!': 278, '?': 556, "'": 191, '"': 355, '&': 667, '+': 584, '·': 278, '–': 556, '—': 1000, 'º': 365, 'ª': 370 };
const FONT = { reg: Object.assign({}, PUNCT, parseW(AW)), bold: Object.assign({}, PUNCT, { "'": 238, '"': 474, '&': 722 }, parseW(BW)) };
const base = (ch) => { const n = ch.normalize('NFD')[0]; return n === 'ç' ? 'c' : n === 'Ç' ? 'C' : n; };
/** Largura de um texto em pt (size) numa fonte, com espaçamento extra entre letras (tc, em pt). */
export function textWidth(str, bold, size, tc) {
  const t = FONT[bold ? 'bold' : 'reg']; let w = 0; const chars = [...str];
  for (const ch of chars) w += /\d/.test(ch) ? 556 : (t[ch] ?? t[base(ch)] ?? 556);
  return (w * size) / 1000 + (tc || 0) * Math.max(0, chars.length - 1);
}

// WinAnsi: Latin-1 direto; alguns sinais tipográficos do bloco 0x80–0x9F; o resto vira "?"
const CP = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
export function winAnsi(str) {
  let out = '';
  for (const ch of String(str)) { const c = ch.codePointAt(0); const b = c < 256 ? c : CP[ch] != null ? CP[ch] : 63; out += b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : String.fromCharCode(b); }
  return out;
}
const n2 = (x) => (Math.round(x * 100) / 100).toString();

/** Quebra um texto em até `max` linhas que caibam em `width`; reduz a fonte até `min` pt se preciso. → { size, lines } */
export function fitLines(text, width, bold, size, tc, max, min) {
  for (let s = size; s >= (min || 6); s -= 0.5) {
    const lines = []; let cur = '';
    for (const w of text.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w;
      if (textWidth(t, bold, s, tc) <= width) cur = t; else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    const ok = lines.length <= (max || 2) && lines.every((l) => textWidth(l, bold, s, tc) <= width);
    if (ok) return { size: s, lines };
  }
  const s = min || 6; const lines = []; let cur = ''; // não coube: corta com reticências
  for (const w of text.split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (textWidth(t, bold, s, tc) <= width) cur = t; else { if (cur) lines.push(cur); cur = w; if (lines.length === (max || 2)) break; } }
  if (lines.length < (max || 2) && cur) lines.push(cur);
  const last = lines.length - 1; while (lines[last] && textWidth(lines[last] + '…', bold, s, tc) > width && lines[last].length > 1) lines[last] = lines[last].slice(0, -1);
  if (lines.length > (max || 2) || cur) lines[last] += '…';
  return { size: s, lines: lines.slice(0, max || 2) };
}

/** Conteúdo (operadores PDF) de uma folha de senhas. Coordenadas internas com origem no topo; convertidas para o PDF. */
export function pageOps(page) {
  const { cols, margin, rowH, pad } = GRID; const cw = (A4.w - 2 * margin) / cols; const H = A4.h; const Y = (y) => n2(H - y);
  const ops = []; const tickets = page.tickets || []; const rows = Math.max(1, Math.ceil(tickets.length / cols));
  const text = (x, yBase, str, bold, size, tc, white) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${n2(size)} Tf ${n2(tc || 0)} Tc ${white ? '1 g' : '0 g'} ${n2(x)} ${Y(yBase)} Td (${winAnsi(str)}) Tj ET`);
  const centered = (cx, yBase, str, bold, size, tc, white) => text(cx - textWidth(str, bold, size, tc) / 2, yBase, str, bold, size, tc, white);
  // linhas de corte tracejadas (só as linhas ocupadas)
  ops.push('q 0.55 G 0.5 w [3 2] 0 d');
  for (let i = 0; i <= cols; i++) { const x = n2(margin + i * cw); ops.push(`${x} ${Y(margin)} m ${x} ${Y(margin + rows * rowH)} l S`); }
  for (let j = 0; j <= rows; j++) { const y = Y(margin + j * rowH); ops.push(`${n2(margin)} ${y} m ${n2(A4.w - margin)} ${y} l S`); }
  ops.push('Q');
  tickets.forEach((t, i) => {
    const x0 = margin + (i % cols) * cw; const y0 = margin + Math.floor(i / cols) * rowH;
    const ix = x0 + pad; const iy = y0 + pad; const iw = cw - 2 * pad; const ih = rowH - 2 * pad; const cx = ix + iw / 2;
    const barH = t.prio ? 11 : 0;
    if (t.prio) {
      ops.push(`q 0 G 1.2 w [] 0 d ${n2(ix)} ${Y(iy + ih)} ${n2(iw)} ${n2(ih)} re S Q`);
      ops.push(`q 0 g ${n2(ix)} ${Y(iy + barH)} ${n2(iw)} ${n2(barH)} re f Q`);
      centered(cx, iy + 8.2, 'PRIORIDADE', true, 7, 0.84, true);
    }
    const name = fitLines(String(page.name || '').toUpperCase(), iw - 6, true, 9.5, 1.1, 2, 6.5);
    const nameLH = name.size * 1.2; const numSize = t.label.length > 4 ? 24 : 30; const hasRoom = !!page.room;
    const total = name.lines.length * nameLH + 4 + numSize * 1.05 + (hasRoom ? 4 + 1 + 4 + 11 : 0);
    let y = iy + barH + Math.max(0, (ih - barH - total) / 2);
    for (const l of name.lines) { centered(cx, y + name.size * 0.95, l, true, name.size, 1.1); y += nameLH; }
    y += 4; centered(cx, y + numSize * 0.9, t.label, false, numSize, -0.3); y += numSize * 1.05;
    if (hasRoom) {
      y += 4; const room = String(page.room).toUpperCase(); const rw = Math.max(iw * 0.6, textWidth(room, true, 10.5, 1.2) + 6);
      ops.push(`q 0 G 1 w [] 0 d ${n2(cx - rw / 2)} ${Y(y)} m ${n2(cx + rw / 2)} ${Y(y)} l S Q`);
      y += 1 + 4; centered(cx, y + 10.5 * 0.9, room, true, 10.5, 1.2);
    }
  });
  return ops.join('\n');
}

/** Monta o arquivo PDF a partir das folhas (cada uma com name, room, tickets). → Buffer */
export function buildPdf(pages, meta) {
  const objs = []; // strings (latin1) na ordem dos números de objeto
  const add = (s) => { objs.push(s); return objs.length; };
  const fontsAt = objs.length + 1; add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesIdx = objs.length + 1; add(''); // /Pages (preenchido depois)
  const kids = [];
  for (const pg of pages.length ? pages : [{ name: '', room: '', tickets: [] }]) {
    const content = pageOps(pg); const len = Buffer.byteLength(content, 'latin1');
    const c = add(`<< /Length ${len} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesIdx} 0 R /MediaBox [0 0 ${n2(A4.w)} ${n2(A4.h)}] /Resources << /Font << /F1 ${fontsAt} 0 R /F2 ${fontsAt + 1} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[pagesIdx - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesIdx} 0 R >>`);
  const d = new Date(); const pdfDate = `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  const info = add(`<< /Title (${winAnsi((meta && meta.title) || 'Senhas')}) /Producer (tce-senhas) /CreationDate (${pdfDate}) >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
