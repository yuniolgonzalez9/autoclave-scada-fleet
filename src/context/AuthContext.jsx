import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { sendTelegramAlert } from '../services/telegram';

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = 'biofleet_enterprise_session';

/**
 * Normaliza el registro de perfil clínico para garantizar consistencia
 * en todas las vistas del SCADA independientemente del esquema de BD.
 */
function normalizeUserProfile(raw = {}) {
  const username = (raw.user || raw.usuario || raw.email?.split('@')[0] || '').toLowerCase().trim();
  const role = (raw.rol || 'OPERADOR').toUpperCase().trim();
  const hospital = (raw.departamento || raw.hospital || raw.clinica || 'Central Hospitalaria').trim();
  const state = (raw.estado || 'ACTIVO').toUpperCase().trim();
  const authorizedMacs = (raw.equipos_autorizados || '').toUpperCase().trim();

  return {
    ...raw,
    id: raw.id || `usr_${username}`,
    user: username,
    usuario: username,
    nombre: raw.nombre || raw.nombre_completo || username,
    email: (raw.email || '').toLowerCase().trim(),
    rol: role,
    departamento: hospital,
    hospital: hospital,
    equipos_autorizados: authorizedMacs,
    estado: state
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recoveryRequests, setRecoveryRequests] = useState([]);
  const [requestsLoadedAt, setRequestsLoadedAt] = useState(0);

  /**
   * Consulta el perfil clínico autorizado en la tabla usuarios_scada.
   */
  const fetchProfileFromDb = useCallback(async (identifier, authUserId = null) => {
    const cleanId = (identifier || '').toLowerCase().trim();

    let query = supabase.from('usuarios_scada').select('*');

    if (authUserId) {
      query = query.or(`auth_id.eq.${authUserId},user.eq.${cleanId},usuario.eq.${cleanId},email.eq.${cleanId}`);
    } else {
      query = query.or(`user.eq.${cleanId},usuario.eq.${cleanId},email.eq.${cleanId}`);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error || !data) {
      throw new Error('El perfil biomédico asociado a esta cuenta no existe o fue desvinculado.');
    }

    const normalized = normalizeUserProfile(data);

    if (normalized.estado === 'PENDIENTE') {
      throw new Error('ESTADO_PENDIENTE: Su solicitud de acceso se encuentra en revisión.');
    }
    if (normalized.estado === 'INACTIVO' || normalized.estado === 'SUSPENDIDO') {
      throw new Error('ESTADO_INACTIVO: La credencial clínica se encuentra inhabilitada.');
    }

    return normalized;
  }, []);

  /**
   * Carga las solicitudes de acceso pendientes y peticiones de recuperación.
   */
  const loadPendingRequests = useCallback(async () => {
    try {
      const { data: pendings, error: errPend } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('estado', 'PENDIENTE')
        .order('created_at', { ascending: false });

      if (!errPend && pendings) {
        setPendingRequests(pendings.map(normalizeUserProfile));
        setRequestsLoadedAt(Date.now());
      }

      const { data: recoveries, error: errRec } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .eq('evento', 'SOLICITUD_RECUPERACION_PENDIENTE')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!errRec && recoveries) {
        setRecoveryRequests(recoveries);
      }
    } catch (err) {
      console.warn('[AUTH SCADA] Error sincronizando solicitudes de acceso:', err);
    }
  }, []);

  /**
   * Restauración de sesión al montar el componente.
   */
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        // 1. Verificar sesión activa de Supabase Auth
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!sessionError && session?.user) {
          const userProfile = await fetchProfileFromDb(session.user.email, session.user.id);
          if (isMounted) {
            setUser(session.user);
            setProfile(userProfile);
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userProfile));

            const isPrivileged = userProfile.rol?.includes('ADMIN') || userProfile.rol?.includes('DIRECTOR');
            if (isPrivileged) {
              loadPendingRequests();
            }
          }
          return;
        }

        // 2. Respaldo de sesión local verificada
        const cachedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (cachedRaw) {
          const cached = normalizeUserProfile(JSON.parse(cachedRaw));
          const verifiedProfile = await fetchProfileFromDb(cached.user || cached.email);

          if (isMounted) {
            setUser(verifiedProfile);
            setProfile(verifiedProfile);
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(verifiedProfile));

            const isPrivileged = verifiedProfile.rol?.includes('ADMIN') || verifiedProfile.rol?.includes('DIRECTOR');
            if (isPrivileged) {
              loadPendingRequests();
            }
          }
        }
      } catch (err) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    restoreSession();

    // Listener de cambios en el estado de autenticación de Supabase
    const { data: authSubscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const userProfile = await fetchProfileFromDb(session.user.email, session.user.id);
          if (isMounted) {
            setUser(session.user);
            setProfile(userProfile);
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userProfile));
            if (userProfile.rol?.includes('ADMIN') || userProfile.rol?.includes('DIRECTOR')) {
              loadPendingRequests();
            }
          }
        } catch (_) {
          setUser(null);
          setProfile(null);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } else if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setPendingRequests([]);
          setRecoveryRequests([]);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    });

    return () => {
      isMounted = false;
      authSubscription?.subscription?.unsubscribe();
    };
  }, [fetchProfileFromDb, loadPendingRequests]);

  /**
   * Inicio de sesión clínico directo y seguro.
   */
  const loginWithCredentials = async (userOrEmail, passwordInput) => {
    const cleanId = (userOrEmail || '').trim().toLowerCase();
    const cleanPass = (passwordInput || '').trim();

    if (!cleanId || !cleanPass) {
      throw new Error('Debe ingresar su usuario o correo y contraseña.');
    }

    // 1. Resolver el correo si el operador ingresó un nombre de usuario
    let resolvedEmail = cleanId;
    let resolvedUsername = cleanId;

    if (!cleanId.includes('@')) {
      const { data: userData, error: userError } = await supabase
        .from('usuarios_scada')
        .select('*')
        .or(`user.eq.${cleanId},usuario.eq.${cleanId}`)
        .limit(1)
        .maybeSingle();

      if (userError || !userData) {
        await supabase.from('auditoria_accesos').insert([{
          usuario: cleanId,
          evento: 'USUARIO_NO_ENCONTRADO',
          dispositivo: navigator.userAgent.slice(0, 100)
        }]);
        throw new Error('El usuario o correo no se encuentra registrado en la central.');
      }

      resolvedEmail = (userData.email || '').toLowerCase().trim();
      resolvedUsername = (userData.user || userData.usuario || cleanId).toLowerCase().trim();

      if (!resolvedEmail) {
        throw new Error('El usuario no posee un correo electrónico asociado para la validación.');
      }
    }

    // 2. Intentar autenticación mediante Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: cleanPass
    });

    let authenticatedProfile = null;

    if (!authError && authData?.user) {
      authenticatedProfile = await fetchProfileFromDb(resolvedEmail, authData.user.id);
      setUser(authData.user);
    } else {
      // 3. Fallback de verificación contra usuarios_scada para entornos con credenciales locales
      const { data: localData, error: localError } = await supabase
        .from('usuarios_scada')
        .select('*')
        .or(`email.eq.${resolvedEmail},user.eq.${resolvedUsername},usuario.eq.${resolvedUsername}`)
        .limit(1)
        .maybeSingle();

      if (localError || !localData) {
        await supabase.from('auditoria_accesos').insert([{
          usuario: cleanId,
          evento: 'CLAVE_INCORRECTA',
          dispositivo: navigator.userAgent.slice(0, 100)
        }]);
        throw new Error('Credenciales incorrectas o acceso no autorizado.');
      }

      const storedPass = localData.pass || localData.password || localData.clave;
      if (!storedPass || storedPass !== cleanPass) {
        await supabase.from('auditoria_accesos').insert([{
          usuario: cleanId,
          evento: 'CLAVE_INCORRECTA',
          dispositivo: navigator.userAgent.slice(0, 100)
        }]);
        throw new Error('Credenciales incorrectas.');
      }

      authenticatedProfile = normalizeUserProfile(localData);

      if (authenticatedProfile.estado === 'PENDIENTE') {
        throw new Error('ESTADO_PENDIENTE: Su cuenta se encuentra en revisión.');
      }
      if (authenticatedProfile.estado === 'INACTIVO' || authenticatedProfile.estado === 'SUSPENDIDO') {
        throw new Error('ESTADO_INACTIVO: Cuenta suspendida o inhabilitada.');
      }

      setUser(authenticatedProfile);
    }

    // Registro de inicio de sesión exitoso en la bitácora
    setProfile(authenticatedProfile);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authenticatedProfile));

    await supabase.from('auditoria_accesos').insert([{
      usuario: authenticatedProfile.user,
      evento: 'INICIO_SESION_EXITOSO',
      dispositivo: navigator.userAgent.slice(0, 100)
    }]);

    const isPrivileged = authenticatedProfile.rol?.includes('ADMIN') || authenticatedProfile.rol?.includes('DIRECTOR');
    if (isPrivileged) {
      await loadPendingRequests();
    }

    return authenticatedProfile;
  };

  /**
   * Emite una solicitud de recuperación sin enviar contraseñas en claro.
   */
  const requestPasswordRecovery = async (emailInput) => {
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Debe proporcionar una dirección de correo corporativa válida.');
    }

    const { data: targetUser } = await supabase
      .from('usuarios_scada')
      .select('id, user, usuario, nombre, email')
      .eq('email', cleanEmail)
      .limit(1)
      .maybeSingle();

    if (!targetUser) {
      await supabase.from('auditoria_accesos').insert([{
        usuario: cleanEmail,
        evento: 'INTENTO_RECUPERACION_NO_REGISTRADO',
        dispositivo: navigator.userAgent.slice(0, 100)
      }]);
      await sendTelegramAlert(
        `🚨 <b>AVISO DE SEGURIDAD SCADA</b>\n\nIntento de recuperación con correo no registrado:\n<code>${cleanEmail}</code>`
      );
      return {
        message: 'Si el correo pertenece a la red clínica, se ha enviado la notificación correspondiente.'
      };
    }

    const normalized = normalizeUserProfile(targetUser);

    // Registrar evento de auditoría
    await supabase.from('auditoria_accesos').insert([{
      usuario: normalized.user,
      evento: 'SOLICITUD_RECUPERACION_PENDIENTE',
      dispositivo: navigator.userAgent.slice(0, 100)
    }]);

    // Enviar link seguro si está configurado en Supabase Auth
    try {
      await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });
    } catch (_) {
      // Continúa el flujo administrativo
    }

    // Notificación a Dirección Biomédica sin contraseñas
    await sendTelegramAlert(
      `🔔 <b>S
