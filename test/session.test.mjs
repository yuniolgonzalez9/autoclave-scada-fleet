import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMac, canAccessMac } from '../api/_lib/session.js';

// Mock mínimo del cliente admin de Supabase para canAccessMac
const adminWithAssignee = (usuario_asignado) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: usuario_asignado === null ? null : { usuario_asignado } })
      })
    })
  })
});
const adminNoMatch = adminWithAssignee(null);

test('cleanMac normaliza separadores y caso', () => {
  assert.equal(cleanMac('aa:bb:cc-dd.ee ff'), 'AABBCCDDEEFF');
  assert.equal(cleanMac(''), '');
  assert.equal(cleanMac(null), '');
});

test('canAccessMac: roles privilegiados siempre pasan', async () => {
  for (const role of ['ADMIN', 'DIRECTOR', 'SUPERADMIN']) {
    assert.equal(await canAccessMac(adminNoMatch, { role, authorized_devices: [] }, 'AABB'), true);
  }
});

test('canAccessMac: lista authorized_devices autoriza', async () => {
  const profile = { role: 'OPERADOR', authorized_devices: ['AABBCCDDEEFF'] };
  assert.equal(await canAccessMac(adminNoMatch, profile, 'AA:BB:CC:DD:EE:FF'), true);
  assert.equal(await canAccessMac(adminNoMatch, profile, '001122334455'), false);
});

test('canAccessMac: usuario_asignado en asignaciones autoriza', async () => {
  const profile = { role: 'OPERADOR', username: 'tecnico1', authorized_devices: [] };
  assert.equal(await canAccessMac(adminWithAssignee('Tecnico1'), profile, 'AABB'), true);
  assert.equal(await canAccessMac(adminWithAssignee('otro'), profile, 'AABB'), false);
});

test('canAccessMac: sin lista ni asignación queda denegado', async () => {
  // Antes un operador sin lista podía comandar TODA la flota por API.
  const profile = { role: 'OPERADOR', username: 'op', authorized_devices: [] };
  assert.equal(await canAccessMac(adminNoMatch, profile, 'AABB'), false);
  const cliente = { role: 'CLIENTE', username: 'cli', authorized_devices: [] };
  assert.equal(await canAccessMac(adminNoMatch, cliente, 'AABB'), false);
});
