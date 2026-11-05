// Perfis do controle de senhas (puro, sem Next: testável). O PIN define o perfil; o perfil define o que pode fazer.
//   gestor    (PIN_GESTOR)   administração: tudo (triagem completa, porta, painel, CSV)
//   operador  (PIN_OPERADOR) equipe geral: tudo menos exportar CSV (compatibilidade com o PIN já distribuído)
//   triagem   (PIN_TRIAGEM)  só lança quantidades de senhas entregues (sem editar, configurar, criar ou desativar filas)
//   porta     (PIN_PORTA)    só chama senhas na porta da sala (e ajusta o número atual)
export const ROLES = ['gestor', 'operador', 'triagem', 'porta'];
export const CAPS = {
  gestor: { read: 1, issue: 1, door: 1, manage: 1, painel: 1, csv: 1 },
  operador: { read: 1, issue: 1, door: 1, manage: 1, painel: 1 },
  triagem: { read: 1, issue: 1 },
  porta: { read: 1, door: 1 },
};
export const can = (role, cap) => !!(CAPS[role] && CAPS[role][cap]);
export const rolesWith = (cap) => ROLES.filter((r) => can(r, cap));
export const ROLE_LABEL = { gestor: 'administração', operador: 'equipe', triagem: 'triagem', porta: 'porta da sala' };
/** Perfil de um PIN a partir das variáveis de ambiente (env = process.env). PINs iguais: vale o perfil de mais permissões. */
export function roleOfPin(pin, env) {
  const p = String(pin || ''); if (!p) return null; const e = env || process.env;
  const map = [['gestor', 'PIN_GESTOR'], ['operador', 'PIN_OPERADOR'], ['triagem', 'PIN_TRIAGEM'], ['porta', 'PIN_PORTA']];
  for (const [role, key] of map) { const v = String(e[key] || ''); if (v && p === v) return role; }
  return null;
}
