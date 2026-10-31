import { supabase } from './supabase';

// =========================================================================
// UNA SOLA FUENTE DE VERDAD DE FLOTA
//
// - Cada cliente se une al canal de PRESENCIA; el miembro más antiguo es el
//   LÍDER DE INGESTA: escribe device_state en Supabase.
// - Todos los clientes se suscriben a device_state por realtime: cuando su
//   telemetría local envejece, adoptan la fila compartida → misma vista.
// =========================================================================

const PRESENCE_CHANNEL = 'biofleet-fleet-presence';
const TABLE = 'device_state';
const WRITE_THROTTLE_MS = 2500;

const clientId = (crypto?.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2)}`);

let presenceChannel = null;
let isLeaderRef = false;
let joinedAt = 0;
let leaderChannelSubscribed = false;

export const isFleetLeader = () => isLeaderRef;

export function joinFleetPresence(onLeaderChange) {
  if (presenceChannel) return presenceChannel;
  presenceChannel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: clientId } }
  });

  const evalLeader = () => {
    const state = presenceChannel.presenceState();
    const members = [];
    Object.entries(state).forEach(([key, metas]) => {
      (metas || []).forEach((m) => members.push({ key, joined_at: m.joined_at || 0 }));
    });
    members.sort((a, b) => (a.joined_at - b.joined_at) || a.key.localeCompare(b.key));
    const leaderKey = members[0]?.key;
    const next = leaderKey === clientId;
    if (next !== isLeaderRef) {
      isLeaderRef = next;
      try { onLeaderChange?.(next); } catch (_) {}
    }
  };

  presenceChannel
    .on('presence', { event: 'sync' }, evalLeader)
    .on('presence', { event: 'join' }, evalLeader)
    .on('presence', { event: 'leave' }, evalLeader)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        joinedAt = Date.now();
        await presenceChannel.track({ joined_at: joinedAt });
      }
    });

  return presenceChannel;
}

export function leaveFleetPresence() {
  if (presenceChannel) {
    try { supabase.removeChannel(presenceChannel); } catch (_) {}
    presenceChannel = null;
    isLeaderRef = false;
  }
}

// ---- Escritura del líder (throttled por MAC) ----
const pendingUpserts = new Map();
let flushTimer = null;

export function queueDeviceState(mac, datos, f0Score, lastTelemetryAt, lastSeen) {
  if (!isLeaderRef) return;
  pendingUpserts.set(mac, {
    mac,
    datos: datos || {},
    f0_score: f0Score || 0,
    last_telemetry_at: lastTelemetryAt || 0,
    last_seen: lastSeen || Date.now(),
    source: 'leader',
    updated_at: new Date().toISOString()
  });
  if (!flushTimer) {
    flushTimer = setTimeout(flushDeviceState, WRITE_THROTTLE_MS);
  }
}

async function flushDeviceState() {
  flushTimer = null;
  if (!pendingUpserts.size || !isLeaderRef) { pendingUpserts.clear(); return; }
  const rows = [...pendingUpserts.values()];
  pendingUpserts.clear();
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'mac' });
  if (error) console.warn('[FLEET-SYNC] upsert falló:', error.message);
}

// ---- Lectura compartida ----
const remoteRows = new Map();
const stateListeners = new Set();

export function subscribeDeviceState() {
  if (leaderChannelSubscribed) return;
  leaderChannelSubscribed = true;

  supabase.from(TABLE).select('*').then(({ data }) => {
    (data || []).forEach((r) => remoteRows.set(r.mac, r));
    stateListeners.forEach((fn) => { try { fn(remoteRows); } catch (_) {} });
  }).catch(() => {});

  supabase
    .channel('realtime_device_state')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      if (payload.eventType === 'DELETE' && payload.old?.mac) remoteRows.delete(payload.old.mac);
      else if (payload.new?.mac) remoteRows.set(payload.new.mac, payload.new);
      stateListeners.forEach((fn) => { try { fn(remoteRows); } catch (_) {} });
    })
    .subscribe();
}

export function onDeviceState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function getRemoteDeviceState(mac) {
  return remoteRows.get(mac) || null;
}
