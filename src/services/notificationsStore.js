import { supabase } from './supabase';

export const NOTIFICATIONS_TABLE = 'notificaciones_scada';
const HISTORY_DAYS = 30;
const MAX_ROWS = 300;

let mode = 'unknown';
let localRows = [];
const listeners = new Set();

const emit = (event) => listeners.forEach((fn) => fn(event));

const isMissingTable = (error) => {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205' || msg.includes('does not exist') || msg.includes('could not find the table');
};

const isDuplicate = (error) => error?.code === '23505';

const localId = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const getStoreMode = () => mode;

export async function listNotifications() {
  if (mode !== 'local') {
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    const { data, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .select('*')
      .or(`estado.neq.RESUELTA,resuelta_en.gte.${since}`)
      .order('creada_en', { ascending: false })
      .limit(MAX_ROWS);

    if (!error) {
      mode = 'remote';
      return data || [];
    }
    if (!isMissingTable(error)) throw error;
    mode = 'local';
  }
  return [...localRows];
}

export async function insertNotification(record) {
  const now = new Date().toISOString();
  const row = {
    estado: 'NUEVA',
    activa: true,
    ocurrencias: 1,
    datos: {},
    ...record,
    creada_en: now,
    actualizada_en: now
  };

  if (mode === 'remote') {
    const { data, error } = await supabase.from(NOTIFICATIONS_TABLE).insert([row]).select().single();
    if (error) {
      if (isDuplicate(error)) return null;
      throw error;
    }
    return data;
  }

  const created = { ...row, id: localId() };
  localRows = [created, ...localRows];
  emit({ type: 'INSERT', row: created });
  return created;
}

export async function updateNotification(id, patch) {
  const changes = { ...patch, actualizada_en: new Date().toISOString() };

  if (mode === 'remote') {
    const { data, error } = await supabase.from(NOTIFICATIONS_TABLE).update(changes).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  let updated = null;
  localRows = localRows.map((row) => {
    if (row.id !== id) return row;
    updated = { ...row, ...changes };
    return updated;
  });
  if (updated) emit({ type: 'UPDATE', row: updated });
  return updated;
}

export async function deleteNotifications(ids) {
  const list = ids.filter(Boolean);
  if (!list.length) return;

  if (mode === 'remote') {
    const { error } = await supabase.from(NOTIFICATIONS_TABLE).delete().in('id', list);
    if (error) throw error;
    return;
  }

  const drop = new Set(list);
  localRows = localRows.filter((row) => !drop.has(row.id));
  list.forEach((id) => emit({ type: 'DELETE', row: { id } }));
}

export function subscribeNotifications(onEvent) {
  listeners.add(onEvent);

  const channel = supabase
    .channel('realtime_notificaciones_scada')
    .on('postgres_changes', { event: '*', schema: 'public', table: NOTIFICATIONS_TABLE }, (payload) => {
      if (payload.eventType === 'DELETE') onEvent({ type: 'DELETE', row: payload.old });
      else if (payload.new) onEvent({ type: payload.eventType, row: payload.new });
    })
    .subscribe();

  return () => {
    listeners.delete(onEvent);
    supabase.removeChannel(channel);
  };
}
