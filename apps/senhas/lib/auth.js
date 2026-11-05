// Autenticação por PIN (perfis em lib/roles.js: PIN_GESTOR, PIN_OPERADOR, PIN_TRIAGEM, PIN_PORTA, do .env). O PIN fica num
// cookie httpOnly e é revalidado a cada chamada: trocar o PIN no .env derruba todos os aparelhos daquele perfil.
import { cookies, headers } from 'next/headers';
import { roleOfPin as roleOf } from './roles.js';

export const COOKIE = 'tce_at_pin';
export const roleOfPin = (pin) => roleOf(pin, process.env);
export async function currentRole() { const c = await cookies(); return roleOfPin(c.get(COOKIE)?.value); }
export async function setPinCookie(pin) {
  const h = await headers(); const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim();
  const c = await cookies();
  c.set(COOKIE, String(pin), { httpOnly: true, sameSite: 'lax', secure: proto === 'https', path: process.env.NEXT_PUBLIC_BASE_PATH || '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function clearPinCookie() { const c = await cookies(); c.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: process.env.NEXT_PUBLIC_BASE_PATH || '/', maxAge: 0 }); }
