import { supabase } from './supabase';

// =========================================================================
// Paquetes estériles con ID rotativo de 4 dígitos (pool 0000-9999).
// El código vive mientras el paquete está activo y su vigencia estéril;
// al entregar, caducar o anular se libera para el siguiente paquete.
// =========================================================================

const TABLE = 'paquetes_esteriles';
const ESTADOS_VIVOS = ['REGISTRADO', 'EN_PROCESO', 'ESTERILIZADO'];

export const TTL_PRESETS = [
  { dias: 7, label: 'Papel/crepe — 7 días' },
  { dias: 15, label: 'Textil/tyvek — 15 días' },
  { dias: 30, label: 'Bilaminado grado médico — 30 días' },
  { dias: 180, label: 'Contenedor rígido — 180 días' }
];

const normCode = (c) => String(c || '').replace(/\D/g, '').slice(-4).padStart(4, '0');

// Reclama un código libre e inserta el paquete. Reintenta si otra estación
// tomó el mismo código en el mismo instante (índice parcial único).
export async function createPackage({ mac, equipo_alias, cliente, contenido, programa, dias_esterilidad = 30, creado_por }) {
  if (!mac) return { ok: false, error: 'Debe indicar el equipo que procesará el paquete.' };
  if (!cliente?.trim()) return { ok: false, error: 'Indique el nombre del cliente.' };

  for (let intento = 0; intento < 4; intento++) {
    const { data: codigo, error: rpcErr } = await supabase.rpc('claim_paquete_codigo');
    if (rpcErr) return { ok: false, error: rpcErr.message };
    if (!codigo) return { ok: false, error: 'Pool de códigos agotado (10.000 paquetes activos).' };

    const row = {
      codigo,
      mac: String(mac).toUpperCase().replace(/[:-]/g, ''),
      equipo_alias: equipo_alias || mac,
      cliente: cliente.trim(),
      contenido: (contenido || '').trim(),
      programa: programa || '134°C INSTRUMENTAL',
      dias_esterilidad: Number(dias_esterilidad) || 30,
      estado: 'REGISTRADO',
      creado_por: creado_por || null
    };

    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (!error && data) return { ok: true, paquete: data };
    // 23505 = unique violation → el código fue tomado en carrera, reintentar
    if (error?.code !== '23505') return { ok: false, error: error?.message || 'Error al registrar.' };
  }
  return { ok: false, error: 'No se pudo asignar un código libre. Reintente.' };
}

export async function listPackages({ soloVivos = false } = {}) {
  await supabase.rpc('paquetes_sweep_expired').then(() => {}, () => {});
  let q = supabase.from(TABLE).select('*').order('creado_at', { ascending: false }).limit(300);
  if (soloVivos) q = q.in('estado', ESTADOS_VIVOS);
  const { data, error } = await q;
  return { data: data || [], error };
}

// El equipo arrancó un ciclo (fase activa en telemetría): pasa el paquete
// REGISTRADO más antiguo de esa MAC a EN_PROCESO. Devuelve el paquete.
export async function markInProcessByMac(mac) {
  const cleanMac = String(mac || '').toUpperCase().replace(/[:-]/g, '');
  const { data: vivos } = await supabase
    .from(TABLE)
    .select('*')
    .eq('mac', cleanMac)
    .eq('estado', 'REGISTRADO')
    .order('creado_at', { ascending: true })
    .limit(1);
  const pkg = vivos?.[0];
  if (!pkg) return { matched: false };
  const { error } = await supabase
    .from(TABLE)
    .update({ estado: 'EN_PROCESO', iniciado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pkg.id);
  return { matched: !error, paquete: { ...pkg, estado: 'EN_PROCESO' }, error };
}

// El equipo empezó a procesar el paquete (fase activa detectada o comando manual)
export async function markInProcess(codigo) {
  return supabase
    .from(TABLE)
    .update({ estado: 'EN_PROCESO', iniciado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('codigo', normCode(codigo))
    .eq('estado', 'REGISTRADO');
}

// Llegó el reporte forense del ciclo: vincula y resuelve el paquete.
// conforme → ESTERILIZADO + expira_at = ahora + días de vigencia.
export async function markCycleReport(mac, reporte) {
  const cleanMac = String(mac || '').toUpperCase().replace(/[:-]/g, '');
  const conforme = !/FALL|RECHAZ|ABORT|ALARM/i.test(reporte?.diagnostico_principal || '')
    && /CONFORME|FINALIZADO/i.test(reporte?.diagnostico_principal || reporte?.fase_final || '');

  const { data: vivos } = await supabase
    .from(TABLE)
    .select('*')
    .eq('mac', cleanMac)
    .in('estado', ['REGISTRADO', 'EN_PROCESO'])
    .order('creado_at', { ascending: true })
    .limit(1);

  const pkg = vivos?.[0];
  if (!pkg) return { matched: false };

  const ahora = new Date();
  const patch = conforme
    ? {
        estado: 'ESTERILIZADO',
        session_id: reporte.session_id || null,
        esterilizado_at: ahora.toISOString(),
        expira_at: new Date(ahora.getTime() + (pkg.dias_esterilidad || 30) * 86400000).toISOString(),
        updated_at: ahora.toISOString()
      }
    : {
        estado: 'FALLIDO',
        session_id: reporte.session_id || null,
        updated_at: ahora.toISOString()
      };

  const { error } = await supabase.from(TABLE).update(patch).eq('id', pkg.id);
  return { matched: true, paquete: { ...pkg, ...patch }, conforme, error };
}

export async function markDelivered(id) {
  return supabase
    .from(TABLE)
    .update({ estado: 'ENTREGADO', entregado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function cancelPackage(id) {
  return supabase
    .from(TABLE)
    .update({ estado: 'ANULADO', updated_at: new Date().toISOString() })
    .eq('id', id);
}

// Estado efectivo de un paquete (vigencia vencida se reporta CADUCADO)
export function estadoEfectivo(pkg) {
  if (pkg?.estado === 'ESTERILIZADO' && pkg.expira_at && new Date(pkg.expira_at) < new Date()) return 'CADUCADO';
  return pkg?.estado || 'REGISTRADO';
}

// Consulta pública — el cliente escanea el QR del ticket y ve su estado.
// RPC security definer: la llave anon jamás lee la tabla directamente.
export async function getPublicStatus(codigo) {
  const { data, error } = await supabase.rpc('get_package_status', { p_codigo: normCode(codigo) });
  if (error) return { ok: false, error: error.message };
  return data || { ok: false, error: 'NO_ENCONTRADO' };
}
