import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceHealth, getDeviceType, HEALTH_ONLINE_MAX_S, HEALTH_LATENCY_MAX_S, HEALTH_RANK } from '../src/utils/deviceHealth.js';

const NOW = 1_700_000_000_000;
const dev = (lastSeen, extra = {}) => ({ mac: 'AABBCCDDEEFF', lastSeen, ...extra });

test('sin lastSeen → OFFLINE "Sin señal"', () => {
  const h = getDeviceHealth(dev(0), NOW);
  assert.equal(h.status, 'OFFLINE');
  assert.equal(h.timeAgo, 'Sin señal');
});

test('telemetría fresca → ONLINE "En vivo"', () => {
  assert.equal(getDeviceHealth(dev(NOW), NOW).status, 'ONLINE');
  assert.equal(getDeviceHealth(dev(NOW - 1000), NOW).timeAgo, 'En vivo');
});

test('dentro del umbral → ONLINE, pasado → LATENCY', () => {
  assert.equal(getDeviceHealth(dev(NOW - HEALTH_ONLINE_MAX_S * 1000), NOW).status, 'ONLINE');
  assert.equal(getDeviceHealth(dev(NOW - (HEALTH_ONLINE_MAX_S + 1) * 1000), NOW).status, 'LATENCY');
});

test('pasado el umbral de latencia → OFFLINE', () => {
  const h = getDeviceHealth(dev(NOW - (HEALTH_LATENCY_MAX_S + 1) * 1000), NOW);
  assert.equal(h.status, 'OFFLINE');
});

test('timeAgo en minutos y horas', () => {
  assert.equal(getDeviceHealth(dev(NOW - 300_000), NOW).timeAgo, 'Hace 5m');
  assert.equal(getDeviceHealth(dev(NOW - 7_200_000), NOW).timeAgo, 'Hace 2h');
});

test('ranking de salud para ordenar', () => {
  assert.ok(HEALTH_RANK.ONLINE < HEALTH_RANK.LATENCY && HEALTH_RANK.LATENCY < HEALTH_RANK.OFFLINE);
});

test('tipo de equipo: config_deseada > meta > datos > AUTOCLAVE', () => {
  assert.equal(getDeviceType({}), 'AUTOCLAVE');
  assert.equal(getDeviceType({ datos: { tipo: 'vehiculo' } }), 'VEHICULO');
  assert.equal(getDeviceType({ meta: { tipo: 'plc_generico' }, datos: { tipo: 'AUTOCLAVE' } }), 'PLC_GENERICO');
  assert.equal(getDeviceType({ meta: { tipo: 'X', config_deseada: { tipo: 'universal_plc' } } }), 'UNIVERSAL_PLC');
});
