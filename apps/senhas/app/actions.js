'use server';
// Server actions do controle de senhas. Todas devolvem um objeto simples; em falha, { error, status }
// (401 = PIN inválido → o front volta à tela de PIN). Nunca lançam para o cliente.
import * as db from '@/lib/db';
import { currentRole, roleOfPin, setPinCookie, clearPinCookie } from '@/lib/auth';

const ANY = ['operador', 'gestor'];
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
  await setPinCookie(pin); return { role };
}
export async function logout() { await clearPinCookie(); return { ok: true }; }
export async function whoami() { return guard(ANY, async (role) => ({ role })); }
export async function getState(day, venue) { return guard(ANY, async () => db.state(day, venue)); }
export async function getStats(day, venue) { return guard(ANY, async () => db.stats(day, venue)); }
export async function getQueue(day, venue, service, place) { return guard(ANY, async () => db.queue(day, venue, service, place)); }
export async function setIssued(body) { return guard(ANY, async () => db.issued(body || {})); }
export async function call(body) { return guard(ANY, async () => db.call(body || {})); }
export async function setStatus(id, status) { return guard(ANY, async () => db.setStatus(id, status)); }
export async function endCall(id) { return guard(ANY, async () => db.endCall(id)); }
