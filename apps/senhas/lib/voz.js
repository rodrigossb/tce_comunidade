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
  for (const [k, v] of Object.entries(SPOKEN)) t = t.replace(new RegExp(`\\b${k}\\b`, 'gi'), v);
  return t;
}
/** Frase da sala: "Ginecologista, sala quatro." (nome do atendimento = o que a pessoa procura). */
export function placePhrase(p) {
  const num = Number(p.num); const has = Number.isInteger(num) && num > 0; // "0" ou vazio = sem número (não fala "sala zero")
  const kind = p.kind === 'sala' ? 'sala' : p.kind === 'tenda' ? 'tenda' : has ? 'ambiente' : '';
  const where = has ? `${kind} ${numeroExtenso(num)}` : '';
  return `${cleanSpoken(p.name)}${where ? `, ${where}` : ''}.`;
}
export const ticketPhrase = (n) => `Senha ${numeroExtenso(n)}.`;
/** Chave de arquivo do nome de um atendimento: "Consulta médica" → "consulta-medica" (áudio s-consulta-medica.mp3). */
export function nameKey(name) { return cleanSpoken(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
/** Frase só do nome ("Consulta médica.") e só do número ("Sala oito."): peças para montar a sala atual quando o áudio
    gravado da planta não serve (sala renomeada ou mudada de número na triagem, ou criada na triagem). */
export const namePhrase = (name) => `${cleanSpoken(name)}.`;
export const ROOM_KINDS = { sala: 40, tenda: 10, ambiente: 40 }; // w-<tipo>-N.mp3 gerados de 1 a N
export const roomKind = (p) => (p.kind === 'sala' ? 'sala' : p.kind === 'tenda' ? 'tenda' : p.num ? 'ambiente' : '');
export const roomPhrase = (kind, num) => `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${numeroExtenso(Number(num))}.`;
/** Áudios prontos da sala atual: o gravado da planta (p-<id>) se ainda diz o que a tela mostra; senão, montado com o nome
    (s-<chave>) e o número (w-<tipo>-N). → { files, missing } — missing: o que falta falar por síntese (nome sem áudio);
    null quando não há nada pronto para essa sala (fala-se a frase inteira por síntese). */
export function placeClips(place, manifest) {
  if (!place || !manifest) return null;
  if (place.id && placeClipOk(place.id, place, manifest)) return { files: [`p-${place.id}.mp3`], missing: null };
  const files = []; let missing = null;
  const n = Number(place.num); const has = Number.isInteger(n) && n > 0; const kind = has ? roomKind(place) : ''; // "0"/vazio: sem número
  if (kind) { if (n <= ((manifest.rooms && manifest.rooms[kind]) || 0)) files.push(`w-${kind}-${n}.mp3`); else return null; }
  const key = nameKey(place.name); const rec = manifest.names && manifest.names[`s-${key}`];
  if (rec && rec === namePhrase(place.name)) files.unshift(`s-${key}.mp3`); else missing = namePhrase(place.name);
  return files.length ? { files, missing } : null;
}
/** Arquivos (relativos a /voz/) que compõem um anúncio; null se não há áudio pronto para essa senha.
    Com `place` (sala atual, já com edições da triagem), a sala entra pelo áudio gravado só se a frase for a mesma de hoje
    (sala renomeada não pode tocar o áudio antigo); senão, montada com nome + número (placeClips). */
export function clipsFor({ ticket, placeId, place, again, priority }, manifest) {
  if (!manifest || !(ticket >= 1 && ticket <= (manifest.numbers || 0))) return null;
  const out = []; if (again) out.push('x-novamente.mp3');
  if (priority && manifest.extras && manifest.extras.includes('x-prioridade')) out.push('x-prioridade.mp3');
  out.push(`n-${ticket}.mp3`);
  if (place) { const pc = placeClips(Object.assign({ id: placeId }, place), manifest); if (pc) out.push(...pc.files); }
  else if (placeId && placeClipOk(placeId, null, manifest)) out.push(`p-${placeId}.mp3`);
  return out;
}
/** O áudio pronto da sala existe e (quando se sabe a sala atual) diz exatamente o que a tela mostra. */
export function placeClipOk(placeId, place, manifest) {
  if (!manifest || !manifest.places || !manifest.places.includes(placeId)) return false;
  if (!place || !manifest.phrases) return true;
  const rec = manifest.phrases[`p-${placeId}`]; return !rec || rec === placePhrase(place);
}
/** Pedido de uma frase qualquer como áudio gerado no servidor (GET /api/voz/frase.mp3?t=…; só quando manifest.tts). */
export const phraseSpec = (text) => `frase.mp3?t=${encodeURIComponent(text)}`;
/** Anúncio completo de uma chamada → { files, text, complete }. files: lista de áudios (relativos a /api/voz/) na ordem — avisos,
    senha e sala — ou null sem manifest; complete: toda a frase tem áudio (a TV toca só áudios, numa voz só). Para cada parte:
    áudio pronto da planta → peças gravadas (nome + número) → frase gerada no servidor (manifest.tts) → sem áudio (incompleto).
    text: a frase inteira, para a síntese do navegador quando não dá para tocar tudo em áudio. */
export function announcementFor({ ticket, place, again, priority }, manifest) {
  const pre = `${again ? 'Atenção, chamando novamente. ' : ''}${priority ? 'Senha prioritária. ' : ''}`;
  const where = place ? placePhrase(place) : '';
  const text = `${pre}${ticketPhrase(ticket)}${where ? ` ${where}` : ''}`;
  if (!manifest) return { files: null, text, complete: false };
  const files = []; let complete = true; const tts = !!manifest.tts;
  if (again) files.push('x-novamente.mp3');
  if (priority && manifest.extras && manifest.extras.includes('x-prioridade')) files.push('x-prioridade.mp3');
  if (ticket >= 1 && ticket <= (manifest.numbers || 0)) files.push(`n-${ticket}.mp3`);
  else if (tts) files.push(phraseSpec(ticketPhrase(ticket)));
  else complete = false;
  if (place) {
    const pc = placeClips(place, manifest);
    if (pc && !pc.missing) files.push(...pc.files);
    else if (tts) files.push(phraseSpec(where));
    else { if (pc) files.push(...pc.files); complete = false; }
  }
  return { files, text, complete };
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
