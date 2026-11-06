'use server';
// Server actions do controle de senhas. Todas devolvem um objeto simples; em falha, { error, status }
// (401 = PIN inválido → o front volta à tela de PIN). Nunca lançam para o cliente.
import * as db from '@/lib/db';
import { currentRole, roleOfPin, setPinCookie, clearPinCookie } from '@/lib/auth';
import { rolesWith, CAPS } from '@/lib/roles';

// Quem pode o quê (lib/roles.js): ler = todos; lançar entregues = gestor/operador/triagem; porta = gestor/operador/porta;
// configurar/editar/criar/desativar = gestor/operador.
const ANY = rolesWith('read'); const ISSUE = rolesWith('issue'); const DOOR = rolesWith('door'); const MANAGE = rolesWith('manage'); const PAINEL = rolesWith('painel'); const DAYS = rolesWith('days');
async function guard(roles, fn) {
  try {
    const role = await currentRole();
    if (!role || !roles.includes(role)) return { error: 'PIN inválido', status: 401 };
    return await fn(role);
  } catch (e) {
    if (e && e.status) return { error: e.message, status: e.status };
    console.error(e); return { error: 'erro no servidor', status: 500 };
  }
}
export async function login(pin) {
  const role = roleOfPin(pin); if (!role) return { error: 'PIN inválido', status: 401 };
  await setPinCookie(pin); return { role, caps: CAPS[role] };
}
export async function logout() { await clearPinCookie(); return { ok: true }; }
export async function whoami() { return guard(ANY, async (role) => ({ role, caps: CAPS[role] })); }
export async function getState(day, venue) { return guard(ANY, async () => db.state(day, venue)); }
export async function getStats(day, venue) { return guard(PAINEL, async () => db.stats(day, venue)); }
export async function getQueue(day, venue, service, place) { return guard(ANY, async () => db.queue(day, venue, service, place)); }
export async function setIssued(body) { return guard(ISSUE, async () => db.issued(body || {})); }
export async function setQueueConfig(body) { return guard(MANAGE, async () => db.setQueueConfig(body || {})); }
export async function call(body) { return guard(DOOR, async () => db.call(body || {})); }
export async function setStatus(id, status) { return guard(DOOR, async () => db.setStatus(id, status)); }
export async function endCall(id) { return guard(DOOR, async () => db.endCall(id)); }
export async function recall(id) { return guard(DOOR, async () => db.recall(id)); }
export async function advance(body) { return guard(DOOR, async () => db.advance(body || {})); }
export async function addExtraQueue(body) { return guard(MANAGE, async () => db.addExtra(body || {})); }
export async function removeExtraQueue(id) { return guard(MANAGE, async () => db.removeExtra(id)); }
export async function setQueueEnabled(body) { return guard(MANAGE, async () => db.setQueueEnabled(body || {})); }
export async function setQueueMode(body) { return guard(MANAGE, async () => db.setQueueMode(body || {})); }
export async function setQueueInfo(body) { return guard(MANAGE, async () => db.setQueueInfo(body || {})); }
export async function setCursor(body) { return guard(DOOR, async () => db.setCursor(body || {})); }
export async function setDayEnabled(body) { return guard(DAYS, async () => db.setDayEnabled(body || {})); }
