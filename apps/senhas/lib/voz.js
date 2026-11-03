/* Voz da TV (?voz=1): escolha da voz em português e diagnóstico do estado, sem depender do navegador (testável).
   Estados: 'off' (voz não pedida) · 'unsupported' (sem speechSynthesis) · 'locked' (o Chrome exige um toque/tecla
   antes de falar) · 'ready' (voz pt-BR) · 'fallback' (fala com a voz padrão, sem pt-BR instalada) · 'novoice'
   (nenhuma voz instalada no aparelho) · 'clips' (áudios prontos em public/voz, gerados por scripts/gerar-voz.mjs; é o caminho
   preferido e o único que funciona em navegador de TV sem speechSynthesis) · 'error:<código>' (último speak() falhou). */

// ---- áudios prontos (public/voz): "Senha N" e "<atendimento>, sala N" ----
export const CLIP_MAX = 300; // senhas de 1 a 300 têm áudio pronto
const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
/** Número por extenso (0–999), para a fala não depender de como o motor lê algarismos. */
export function numeroExtenso(n) {
  n = Math.trunc(Number(n)); if (!(n >= 0 && n < 1000)) return String(n);
  if (n === 0) return 'zero'; if (n === 100) return 'cem';
  const c = Math.floor(n / 100); const r = n % 100; const parts = [];
  if (c) parts.push(CEN[c]);
  if (r) { if (r < 20) parts.push(UNI[r]); else { parts.push(DEZ[Math.floor(r / 10)]); if (r % 10) parts.push(UNI[r % 10]); } }
  return parts.join(' e ');
}
/** Pronúncias de siglas e ajustes de nomes para a fala. */
const SPOKEN = { MPC: 'ême pê cê', CEE: 'cê ê ê', GEA: 'guéa', IDHAMP: 'idámp', CERPIS: 'cérpis', SEJUSP: 'sejúspi', Detran: 'detrã', Politec: 'politéc', Superfácil: 'super fácil', Castramóvel: 'castra móvel' };
export function cleanSpoken(name) {
  let t = String(name || '').replace(/\s*\(([^)]*)\)/g, ', $1').replace(/\s*\+\s*/g, ' e ').replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim();
  for (const [k, v] of Object.entries(SPOKEN)) t = t.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  return t;
}
/** Frase da sala: "Ginecologista, sala quatro." (nome do atendimento = o que a pessoa procura). */
export function placePhrase(p) {
  const kind = p.kind === 'sala' ? 'sala' : p.kind === 'tenda' ? 'tenda' : p.num ? 'ambiente' : '';
  const where = p.num ? `${kind} ${numeroExtenso(Number(p.num))}` : '';
  return `${cleanSpoken(p.name)}${where ? `, ${where}` : ''}.`;
}
export const ticketPhrase = (n) => `Senha ${numeroExtenso(n)}.`;
/** Arquivos (relativos a /voz/) que compõem um anúncio; null se não há áudio pronto para essa senha/sala. */
export function clipsFor({ ticket, placeId, again, priority }, manifest) {
  if (!manifest || !(ticket >= 1 && ticket <= (manifest.numbers || 0))) return null;
  const out = []; if (again) out.push('x-novamente.mp3');
  if (priority && manifest.extras && manifest.extras.includes('x-prioridade')) out.push('x-prioridade.mp3');
  out.push(`n-${ticket}.mp3`);
  if (placeId && manifest.places && manifest.places.includes(placeId)) out.push(`p-${placeId}.mp3`);
  return out;
}


/** Melhor voz em português do Brasil: Google/Microsoft pt-BR primeiro, depois qualquer pt-BR, depois qualquer pt. */
export function pickVoice(voices) {
  const list = (voices || []).filter((v) => v && v.lang);
  const norm = (v) => String(v.lang).toLowerCase().replace('_', '-');
  const br = list.filter((v) => norm(v) === 'pt-br');
  const pt = list.filter((v) => norm(v).startsWith('pt'));
  const score = (v) => (/google/i.test(v.name) ? 3 : /microsoft|natural/i.test(v.name) ? 2 : /brasil|brazil/i.test(v.name) ? 1 : 0) + (v.localService ? 0.5 : 0);
  const best = (arr) => arr.slice().sort((a, b) => score(b) - score(a))[0] || null;
  return best(br) || best(pt);
}

/** Estado da voz a partir do que o navegador oferece. */
export function voiceState({ wanted, supported, voices, unlocked, lastError, clips }) {
  if (!wanted) return 'off';
  if (!unlocked) return 'locked';
  if (clips) return 'clips';
  if (!supported) return 'unsupported';
  if (lastError) return `error:${lastError}`;
  if (voices && voices.length === 0) return 'novoice';
  if (voices && !pickVoice(voices)) return 'fallback';
  return 'ready';
}

/** Texto curto para o rodapé da TV. */
export function voiceLabel(state, voice) {
  if (state === 'off') return '';
  if (state === 'unsupported') return 'sem síntese de voz neste navegador: só a campainha';
  if (state === 'locked') return 'voz: aperte OK no controle (ou toque na tela) para ativar o som';
  if (state === 'clips') return 'voz ativa · áudios prontos';
  if (state === 'novoice') return 'voz: nenhuma voz instalada no aparelho (instale o pacote de voz pt-BR)';
  if (state === 'fallback') return 'voz: sem voz em português, usando a padrão';
  if (state.startsWith('error:')) { const e = state.slice(6); return e === 'not-allowed' ? 'voz bloqueada: aperte OK no controle (ou toque na tela) para ativar o som' : e === 'synthesis-unavailable' || e === 'synthesis-failed' ? 'voz: motor de voz do aparelho indisponível' : `voz: erro ${e}`; }
  return `voz ativa${voice ? ` · ${voice.name}` : ''}`;
}
