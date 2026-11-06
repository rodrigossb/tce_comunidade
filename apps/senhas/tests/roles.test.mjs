import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleOfPin, can, rolesWith, CAPS } from '../lib/roles.js';

test('roleOfPin: um PIN por perfil; vazio ou desconhecido → null; PIN repetido vale o perfil mais forte', () => {
  const env = { PIN_GESTOR: '123456', PIN_OPERADOR: '1111', PIN_TRIAGEM: '2222', PIN_PORTA: '3333' };
  assert.equal(roleOfPin('123456', env), 'gestor'); assert.equal(roleOfPin('1111', env), 'operador'); assert.equal(roleOfPin('2222', env), 'triagem'); assert.equal(roleOfPin('3333', env), 'porta');
  assert.equal(roleOfPin('', env), null); assert.equal(roleOfPin('9999', env), null); assert.equal(roleOfPin('2222', { PIN_GESTOR: '2222', PIN_TRIAGEM: '2222' }), 'gestor');
  assert.equal(roleOfPin('1111', { PIN_GESTOR: '', PIN_OPERADOR: '1111' }), 'operador'); assert.equal(roleOfPin('', { PIN_PORTA: '' }), null);
});
test('capacidades: triagem só lança entregues; porta só chama; gestor/operador configuram; CSV só gestor', () => {
  assert.deepEqual(rolesWith('read'), ['gestor', 'operador', 'triagem', 'porta']);
  assert.deepEqual(rolesWith('issue'), ['gestor', 'operador', 'triagem']); assert.deepEqual(rolesWith('door'), ['gestor', 'operador', 'porta']);
  assert.deepEqual(rolesWith('manage'), ['gestor', 'operador']); assert.deepEqual(rolesWith('csv'), ['gestor']); assert.deepEqual(rolesWith('days'), ['gestor'], 'desativar dias de atendimento: só administração');
  assert.ok(!can('triagem', 'manage') && !can('triagem', 'door') && !can('porta', 'issue') && !can('porta', 'painel') && can('porta', 'door')); assert.ok(CAPS.gestor.csv);
});
