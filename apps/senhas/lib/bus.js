// Aviso em memória de mudanças nas senhas (emitir, chamar, entrou, não compareceu, encerrar): a TV recebe por SSE
// (app/api/tv/stream) na hora, sem esperar o próximo polling. Um só processo (pm2 fork), então um EventEmitter basta.
import { EventEmitter } from 'node:events';
const g = globalThis;
if (!g.__tceSenhasBus) { g.__tceSenhasBus = new EventEmitter(); g.__tceSenhasBus.setMaxListeners(500); }
export const bus = g.__tceSenhasBus;
export function notify(day, venue) { try { bus.emit('change', { day, venue, ts: Date.now() }); } catch { /* sem ouvintes */ } }
