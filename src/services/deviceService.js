import { supabase } from './supabase';

export const TIPOS_EQUIPO = [
  { id: 'AUTOCLAVE', label: 'Autoclave' },
  { id: 'TERMODESINFECTADORA', label: 'Termodesinfectadora' },
  { id: 'CAMA_HOSPITALARIA', label: 'Cama hospitalaria' },
  { id: 'VEHICULO', label: 'Vehículo / Ambulancia' },
  { id: 'UNIVERSAL_PLC', label: 'Soft-PLC universal' }
];

export const TIPOS_SERVICIO = [
  { id: 'PREVENTIVO', label: 'Preventivo' },
  { id: 'CORRECTIVO', label: 'Correctivo' },
  { id: 'CALIBRACION', label: 'Calibración' },
  { id: 'VALIDACION', label: 'Validación' },
  { id: 'INSPECCION', label: 'Inspección' }
];

export const DEFAULT_PLANES = {
  AUTOCLAVE: [
    { id: 'bowie_dick', nombre: 'Test Bowie-Dick', modo: 'DIAS', intervalo: 1, tipo_servicio: 'INSPECCION' },
    { id: 'calibracion', nombre: 'Calibración de sensores PT100 / presión', modo: 'DIAS', intervalo: 180, tipo_servicio: 'CALIBRACION' },
    { id: 'validacion', nombre: 'Validación anual ISO 17665', modo: 'DIAS', intervalo: 365, tipo_servicio: 'VALIDACION' }
  ],
  TERMODESINFECTADORA: [
    { id: 'calibracion', nombre: 'Calibración de sondas', modo: 'DIAS', intervalo: 180, tipo_servicio: 'CALIBRACION' }
  ],
  VEHICULO: [
    { id: 'aceite', nombre: 'Cambio de aceite', modo: 'DIAS', intervalo: 90, tipo_servicio: 'PREVENTIVO' },
    { id: 'revision', nombre: 'Revisión técnica', modo: 'DIAS', intervalo: 365, tipo_servicio: 'INSPECCION' }
  ]
};

export const cleanMac = (mac) => (mac || '').toUpperCase().replace(/[:-]/g, '').trim();

export async function mergeDeviceConfig(mac, patch) {
  const id = cleanMac(mac);
  const { data, error } = await supabase.from('asignaciones_equipos').select('config_deseada').eq('mac', id).maybeSingle();
  if (error) throw error;
  const config_deseada = { ...(data?.config_deseada || {}), ...patch };
  const { error: upErr } = await supabase
    .from('asignaciones_equipos')
    .update({ config_deseada, updated_at: new Date().toISOString() })
    .eq('mac', id);
  if (upErr) throw upErr;
  return config_deseada;
}

export async function updateDeviceRow(mac, fields) {
  const payload = { ...fields, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('asignaciones_equipos')
    .update(payload)
    .eq('mac', cleanMac(mac))
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

let catalogCache = null;
export async function fetchCatalog() {
  if (catalogCache) return catalogCache;
  const { data, error } = await supabase
    .from('catalogo_equipos')
    .select('id, tipo, marca, modelo, config_default')
    .eq('activo', true)
    .order('marca');
  if (error) throw error;
  catalogCache = data || [];
  return catalogCache;
}

export async function fetchUsersLite() {
  const { data } = await supabase.from('user_profiles').select('username, display_name, role, status');
  return (data || [])
    .map((u) => ({ id: u.username, nombre: u.display_name || u.username, rol: u.role, estado: u.status }))
    .filter((u) => u.id);
}

export async function fetchCycles(mac, { limit = 25, offset = 0, desde = null } = {}) {
  let q = supabase
    .from('reportes_autoclaves')
    .select('*', { count: 'exact' })
    .eq('mac', cleanMac(mac))
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (desde) q = q.gte('created_at', desde);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
}

export async function fetchCycleStats(mac) {
  const { data, error } = await supabase
    .from('reportes_autoclaves')
    .select('created_at, fecha, hora_encendido, hora_apagado, conteo_alarmas, diagnostico_principal, temp_max, pres_max, ciclos_acumulados')
    .eq('mac', cleanMac(mac))
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function fetchMaintenanceLog(mac) {
  const { data, error } = await supabase
    .from('mantenimientos_equipos')
    .select('*')
    .eq('mac', cleanMac(mac))
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function registerMaintenance({ mac, tipo_servicio, tecnico_responsable, descripcion, ciclos_al_momento, plan_id = null, reiniciarOdometro = false }) {
  const id = cleanMac(mac);
  const desc = plan_id ? `[PLAN:${plan_id}] ${descripcion || ''}`.trim() : (descripcion || '');
  const { data, error } = await supabase
    .from('mantenimientos_equipos')
    .insert({ mac: id, tipo_servicio, tecnico_responsable, descripcion: desc, ciclos_al_momento })
    .select()
    .single();
  if (error) throw error;

  const fields = { ultimo_mantenimiento: data.created_at };
  if (reiniciarOdometro) Object.assign(fields, { ciclos_activos: 0, bloqueado_100: false });
  const row = await updateDeviceRow(id, fields);
  return { entry: data, row };
}

export function planIdFromEntry(entry) {
  const m = /^\[PLAN:([^\]]+)\]/.exec(entry?.descripcion || '');
  return m ? m[1] : null;
}

export function stripPlanTag(text) {
  return (text || '').replace(/^\[PLAN:[^\]]+\]\s*/, '');
}

export function parseHoraToMinutes(hora) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((hora || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] || 0) / 60;
}

export function cycleDurationMinutes(row) {
  if (row?.duracion_total_seg) return Number(row.duracion_total_seg) / 60;
  const a = parseHoraToMinutes(row?.hora_encendido);
  const b = parseHoraToMinutes(row?.hora_apagado);
  if (a === null || b === null || (a === 0 && b === 0)) return null;
  const diff = b >= a ? b - a : b + 1440 - a;
  return diff > 0 && diff < 600 ? diff : null;
}

export function isCycleConforme(row) {
  const d = (row?.diagnostico_principal || '').toUpperCase();
  return Number(row?.conteo_alarmas || 0) === 0 && !d.includes('NO CONFORME') && !d.includes('FALL') && !d.includes('ABORT');
}

export async function fetchServiceReports({ mac = null, estado = null, limit = 200 } = {}) {
  let q = supabase.from('reportes_servicio').select('*').order('created_at', { ascending: false }).limit(limit);
  if (mac) q = q.eq('mac', cleanMac(mac));
  if (estado && estado !== 'ALL') q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function saveServiceReport(report) {
  const payload = { ...report, updated_at: new Date().toISOString() };
  delete payload.numero;
  delete payload.created_at;
  if (payload.id) {
    const { id, ...rest } = payload;
    const { data, error } = await supabase.from('reportes_servicio').update(rest).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  delete payload.id;
  const { data, error } = await supabase.from('reportes_servicio').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteServiceReport(id) {
  const { error } = await supabase.from('reportes_servicio').delete().eq('id', id);
  if (error) throw error;
}

export const folioFromNumero = (n) => `OS-${String(n || 0).padStart(6, '0')}`;
