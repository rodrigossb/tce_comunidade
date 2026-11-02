// Autenticação por PIN (equipe = PIN_OPERADOR, gestão = PIN_GESTOR, do .env). O PIN fica num cookie httpOnly
// e é revalidado a cada chamada: trocar o PIN no .env derruba todos os aparelhos.
import { cookies, headers } from 'next/headers';

export const COOKIE = 'tce_at_pin';
export function roleOfPin(pin) {
  const p = String(pin || ''); const op = String(process.env.PIN_OPERADOR || ''); const ge = String(process.env.PIN_GESTOR || '');
  return p && ge && p === ge ? 'gestor' : p && op && p === op ? 'operador' : null;
}
export async function currentRole() { const c = await cookies(); return roleOfPin(c.get(COOKIE)?.value); }
export async function setPinCookie(pin) {
  const h = await headers(); const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim();
  const c = await cookies();
  c.set(COOKIE, String(pin), { httpOnly: true, sameSite: 'lax', secure: proto === 'https', path: process.env.NEXT_PUBLIC_BASE_PATH || '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function clearPinCookie() { const c = await cookies(); c.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: process.env.NEXT_PUBLIC_BASE_PATH || '/', maxAge: 0 }); }
