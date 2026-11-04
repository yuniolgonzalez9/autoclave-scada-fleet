import { supabase } from './supabase';

// =========================================================================
// Autenticación offline — bóveda cifrada del Hub (safeStorage + scrypt).
// - Tras cada login ONLINE exitoso: guarda hash+perfil cifrado local.
// - Tras cada sesión activa: sincroniza user_profiles (usuarios actuales
//   y futuros) para que el login offline conozca al equipo completo.
// - Sin internet: verifica scrypt local y abre sesión con el perfil cacheado.
// Solo disponible dentro del Hub (exe); en navegador web requiere internet.
// =========================================================================

const vault = () => (typeof window !== 'undefined' && window.biofleetHub?.isHub) ? window.biofleetHub : null;

export const offlineAuthAvailable = () => Boolean(vault()?.vaultVerify);

// Guarda la credencial tras un login online exitoso (fire-and-forget).
export function saveOfflineCredential(profile, identifier, password) {
  const v = vault();
  if (!v?.vaultSave || !profile || !password) return;
  const identifiers = [identifier, profile.user, profile.usuario, profile.email].filter(Boolean);
  v.vaultSave({ identifiers, password, profile }).catch(() => {});
}

// Sincroniza el directorio de usuarios (perfiles) a la bóveda local.
// Solo corre si hay sesión; los nuevos perfiles quedan listos para que cada
// usuario active su acceso offline al loguearse una vez con internet.
export async function syncProfilesToVault() {
  const v = vault();
  if (!v?.vaultSync) return;
  try {
    const { data } = await supabase.from('user_profiles').select('*').limit(500);
    if (Array.isArray(data) && data.length) await v.vaultSync(data);
  } catch (_) {}
}

// Login offline: el RPC/red de Supabase no responde → verifica la bóveda.
// Devuelve el perfil cacheado (estado ACTIVO) o null.
export async function verifyOfflineLogin(identifier, password) {
  const v = vault();
  if (!v?.vaultVerify) return { ok: false, err: 'sin bóveda offline (requiere la app Hub)' };
  try {
    const r = await v.vaultVerify({ identifier, password });
    if (!r?.ok) return { ok: false, err: r?.err || 'credenciales inválidas' };
    const profile = r.profile;
    if (!profile) return { ok: false, err: 'perfil no cacheado' };
    if (profile.estado && profile.estado !== 'ACTIVO') {
      return { ok: false, err: `cuenta ${profile.estado} — requiere revisión` };
    }
    return { ok: true, profile };
  } catch (e) {
    return { ok: false, err: e?.message || 'error de bóveda' };
  }
}
