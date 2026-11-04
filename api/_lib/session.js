import { createClient } from '@supabase/supabase-js';

export const PRIVILEGED_ROLES = ['ADMIN', 'DIRECTOR', 'SUPERADMIN'];
export const OPERATOR_ROLES = ['OPERADOR', 'TECNICO', ...PRIVILEGED_ROLES];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function cleanMac(mac) {
  return String(mac || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  const host = req.headers.host;
  let sameOrigin = false;
  if (origin && host) {
    try { sameOrigin = new URL(origin).host === host; } catch (_) {}
  }
  if (sameOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'El servidor seguro no está configurado.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireActor(req, { roles = null } = {}) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw new HttpError(401, 'Autenticación requerida.');

  const admin = getAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) throw new HttpError(401, 'Sesión no válida.');

  const { data: profile, error } = await admin
    .from('user_profiles')
    .select('user_id, username, role, status, authorized_devices')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile || profile.status !== 'ACTIVO') throw new HttpError(403, 'Cuenta no activa.');
  if (roles && !roles.includes(profile.role)) throw new HttpError(403, 'Tu rol no permite esta acción.');

  return { admin, profile };
}

// Mismo cierre estricto que la UI: un no privilegiado solo actúa sobre
// equipos listados en authorized_devices o con usuario_asignado = su
// usuario. Antes, sin lista, un operador podía comandar TODA la flota
// por API aunque la interfaz se la ocultara.
export async function canAccessMac(admin, profile, mac) {
  if (PRIVILEGED_ROLES.includes(profile.role)) return true;
  const target = cleanMac(mac);
  const list = Array.isArray(profile.authorized_devices) ? profile.authorized_devices : [];
  if (list.map(cleanMac).includes(target)) return true;
  try {
    const { data } = await admin
      .from('asignaciones_equipos')
      .select('usuario_asignado')
      .eq('mac', target)
      .maybeSingle();
    const assigned = String(data?.usuario_asignado || '').trim().toLowerCase();
    if (assigned && assigned === String(profile.username || '').trim().toLowerCase()) return true;
  } catch (_) {}
  return false;
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error('[API]', err);
  return res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : err.message });
}
