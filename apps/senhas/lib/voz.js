/* Voz da TV (?voz=1): escolha da voz em português e diagnóstico do estado, sem depender do navegador (testável).
   Estados: 'off' (voz não pedida) · 'unsupported' (sem speechSynthesis) · 'locked' (o Chrome exige um toque/tecla
   antes de falar) · 'ready' (voz pt-BR) · 'fallback' (fala com a voz padrão, sem pt-BR instalada) · 'novoice'
   (nenhuma voz instalada no aparelho) · 'error:<código>' (último speak() falhou). */

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
export function voiceState({ wanted, supported, voices, unlocked, lastError }) {
  if (!wanted) return 'off';
  if (!supported) return 'unsupported';
  if (lastError) return `error:${lastError}`;
  if (!unlocked) return 'locked';
  if (voices && voices.length === 0) return 'novoice';
  if (voices && !pickVoice(voices)) return 'fallback';
  return 'ready';
}

/** Texto curto para o rodapé da TV. */
export function voiceLabel(state, voice) {
  if (state === 'off') return '';
  if (state === 'unsupported') return 'voz indisponível neste navegador';
  if (state === 'locked') return 'voz: aperte OK no controle (ou toque na tela) para ativar o som';
  if (state === 'novoice') return 'voz: nenhuma voz instalada no aparelho (instale o pacote de voz pt-BR)';
  if (state === 'fallback') return 'voz: sem voz em português, usando a padrão';
  if (state.startsWith('error:')) { const e = state.slice(6); return e === 'not-allowed' ? 'voz bloqueada: aperte OK no controle (ou toque na tela) para ativar o som' : e === 'synthesis-unavailable' || e === 'synthesis-failed' ? 'voz: motor de voz do aparelho indisponível' : `voz: erro ${e}`; }
  return `voz ativa${voice ? ` · ${voice.name}` : ''}`;
}
