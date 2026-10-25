import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { sendTelegramAlert } from '../services/telegram';

const AuthContext = createContext({});

const PRIVILEGED_ROLES = ['ADMIN', 'DIRECTOR', 'SUPERADMIN'];
const isPrivileged = (role) => PRIVILEGED_ROLES.some((r) => (role || '').includes(r));

function normalizeUserProfile(raw = {}) {
  const username = (raw.username || raw.user || raw.usuario || raw.auth_email?.split('@')[0] || raw.email?.split('@')[0] || '').toLowerCase().trim();
  const role = (raw.role || raw.rol || 'OPERADOR').toUpperCase().trim();
  const hospital = raw.department || raw.departamento || raw.hospital || raw.clinica || 'Central Hospitalaria';
  const state = (raw.status || raw.estado || 'ACTIVO').toUpperCase().trim();
  const devices = Array.isArray(raw.authorized_devices)
    ? raw.authorized_devices.join(',')
    : (raw.equipos_autorizados || '');
  const email = (raw.contact_email || raw.auth_email || raw.email || '').toLowerCase().trim();
  const userId = raw.user_id || raw.id || `usr_${username}`;

  return {
    ...raw,
    id: userId,
    user_id: userId,
    user: username,
    usuario: username,
    username,
    nombre: raw.display_name || raw.nombre || raw.nombre_completo || username,
    email,
    rol: role,
    departamento: hospital,
    hospital,
    equipos_autorizados: devices.toUpperCase().trim(),
    estado: state
  };
}

function normalizeAccessRequest(raw = {}) {
  return {
    ...raw,
    request_id: raw.id,
    user_id: null,
    user: raw.username,
    usuario: raw.username,
    nombre: raw.display_name || raw.username,
    email: raw.contact_email,
    departamento: raw.department,
    rol: 'OPERADOR',
    estado: raw.status || 'PENDIENTE'
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recoveryRequests, setRecoveryRequests] = useState([]);

  const loadPendingRequests = useCallback(async () => {
    try {
      const { data: pendings, error: errPend } = await supabase
        .from('access_requests')
        .select('*')
        .eq('status', 'PENDIENTE')
        .order('created_at', { ascending: false });

      if (!errPend && pendings) {
        setPendingRequests(pendings.map(normalizeAccessRequest));
      }

      try {
        const { data: recoveries } = await supabase
          .from('auditoria_accesos')
          .select('*')
          .eq('evento', 'SOLICITUD_RECUPERACION_PENDIENTE')
          .limit(10);

        if (recoveries) setRecoveryRequests(recoveries);
      } catch (_) {}
    } catch (e) {
      console.warn('[AUTH] Carga de solicitudes:', e);
    }
  }, []);

  const fetchProfileById = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeUserProfile(data) : null;
  }, []);

  const applyProfile = useCallback(async (nextProfile) => {
    if (nextProfile && nextProfile.estado === 'ACTIVO') {
      setUser(nextProfile);
      setProfile(nextProfile);
      if (isPrivileged(nextProfile.rol)) {
        await loadPendingRequests();
      }
      return true;
    }
    return false;
  }, [loadPendingRequests]);

  // Restaurar sesión Supabase Auth al cargar
  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const storedProfile = await fetchProfileById(session.user.id);
          const applied = await applyProfile(storedProfile);
          if (!applied) {
            await supabase.auth.signOut();
          }
        }
      } catch (e) {
        console.warn('[AUTH] Restauración de sesión:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setPendingRequests([]);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [fetchProfileById, applyProfile]);

  // Helper: operaciones administrativas vía endpoint de servidor (service role)
  const callAdminApi = useCallback(async (action, payload = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no válida. Inicia sesión de nuevo.');

    const res = await fetch('/api/admin-accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action, ...payload })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Error de administración.');
    return json;
  }, []);

  const loginWithCredentials = async (userOrEmail, passwordInput) => {
    const cleanId = (userOrEmail || '').trim().toLowerCase();
    const cleanPass = passwordInput || '';

    if (!cleanId || !cleanPass) {
      throw new Error('Introduce tu usuario y contraseña.');
    }

    // Resolver usuario/correo → email interno de Supabase Auth
    const { data: authEmail, error: resolveError } = await supabase
      .rpc('resolve_login_email', { p_identifier: cleanId });

    if (resolveError) throw new Error('No se pudo verificar el acceso.');
    if (!authEmail) throw new Error('El usuario o correo no se encuentra registrado.');

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: cleanPass
    });

    if (signInError || !signInData?.user) {
      throw new Error('Credenciales no válidas.');
    }

    const matchedUser = await fetchProfileById(signInData.user.id);
    if (!matchedUser) {
      await supabase.auth.signOut();
      throw new Error('Perfil de acceso no encontrado.');
    }

    if (matchedUser.estado === 'PENDIENTE') {
      await supabase.auth.signOut();
      throw new Error('ESTADO_PENDIENTE: Su solicitud está pendiente de aprobación por el Administrador.');
    }

    if (matchedUser.estado !== 'ACTIVO') {
      await supabase.auth.signOut();
      throw new Error('ESTADO_INACTIVO: Cuenta suspendida o inhabilitada.');
    }

    setUser(matchedUser);
    setProfile(matchedUser);

    if (isPrivileged(matchedUser.rol)) {
      await loadPendingRequests();
    }

    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario: matchedUser.user,
        evento: 'INICIO_SESION_EXITOSO',
        dispositivo: navigator.userAgent.slice(0, 80)
      }]);
    } catch (_) {}

    return matchedUser;
  };

  const requestPasswordRecovery = async (emailInput) => {
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    if (!cleanEmail) throw new Error('Por favor introduce un correo válido.');

    const { data: authEmail } = await supabase
      .rpc('resolve_login_email', { p_identifier: cleanEmail });

    if (!authEmail) {
      await sendTelegramAlert(
        `🚨 <b>ALERTA DE SEGURIDAD</b>\n\nIntento de recuperación con correo no registrado: <code>${cleanEmail}</code>`
      );
      return {
        isMaster: false,
        message: 'Si el correo existe en la base clínica, se ha notificado a la Administración.'
      };
    }

    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario: cleanEmail,
        evento: 'SOLICITUD_RECUPERACION_PENDIENTE'
      }]);
    } catch (_) {}

    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
      redirectTo: window.location.origin
    });

    if (error) {
      await sendTelegramAlert(
        `🔔 <b>SOLICITUD DE RECUPERACIÓN</b>\n\n🆔 <b>Identificador:</b> <code>${cleanEmail}</code>\n\nEl envío automático de correo no está disponible; gestione el restablecimiento desde el Centro Maestro de Personal.`
      );
      return {
        isMaster: false,
        message: 'Solicitud enviada a la Dirección Biomédica.'
      };
    }

    return {
      isMaster: false,
      message: 'Se envió un enlace de restablecimiento al correo registrado.'
    };
  };

  // === Operaciones de administración (vía /api/admin-accounts) ===

  const listUserProfiles = useCallback(async () => {
    const json = await callAdminApi('list_profiles');
    return (json.profiles || []).map(normalizeUserProfile);
  }, [callAdminApi]);

  const listAccessRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeAccessRequest);
  }, []);

  const createUserAccount = useCallback(async ({ username, displayName, password, role, department, contactEmail, authEmail, authorizedDevices }) => {
    return callAdminApi('create_user', {
      username,
      displayName,
      password,
      role,
      department,
      contactEmail,
      authEmail,
      authorizedDevices
    });
  }, [callAdminApi]);

  const deleteUserAccount = useCallback(async (userId) => {
    return callAdminApi('delete_user', { userId });
  }, [callAdminApi]);

  const approveAccessRequest = useCallback(async (requestId, role = 'OPERADOR') => {
    const result = await callAdminApi('approve_request', { requestId, role });
    await loadPendingRequests();
    return result;
  }, [callAdminApi, loadPendingRequests]);

  const rejectAccessRequest = useCallback(async (requestId) => {
    const result = await callAdminApi('reject_request', { requestId });
    await loadPendingRequests();
    return result;
  }, [callAdminApi, loadPendingRequests]);

  const resetUserPassword = useCallback(async (userId, newTempPassword) => {
    const cleanPass = (newTempPassword || '').trim();
    if (cleanPass.length < 6) throw new Error('Mínimo 6 caracteres.');
    await callAdminApi('set_password', { userId, password: cleanPass });
  }, [callAdminApi]);

  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    const { error } = await supabase.rpc('submit_access_request', {
      p_username: usuario,
      p_display_name: nombre_completo,
      p_contact_email: email,
      p_department: departamento,
      p_requested_password: password
    });

    if (error) throw new Error(error.message);

    await sendTelegramAlert(
      `🆕 <b>NUEVA SOLICITUD DE ACCESO</b>\n\n` +
      `👤 <b>Nombre:</b> ${nombre_completo}\n` +
      `🆔 <b>Usuario:</b> <code>${(usuario || '').trim().toLowerCase()}</code>\n` +
      `🏥 <b>Área:</b> ${departamento}`
    );
  };

  const updateUserStatus = useCallback(async (userId, nuevoEstado, nuevoRol = null) => {
    await callAdminApi('update_profile', {
      userId,
      status: nuevoEstado,
      ...(nuevoRol ? { role: nuevoRol } : {})
    });
    await loadPendingRequests();
  }, [callAdminApi, loadPendingRequests]);

  const updateUserProfile = useCallback(async (userId, fields = {}) => {
    return callAdminApi('update_profile', { userId, ...fields });
  }, [callAdminApi]);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    sessionStorage.clear();
    setUser(null);
    setProfile(null);
    setPendingRequests([]);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      authMode: Boolean(user),
      pendingRequests,
      recoveryRequests,
      loadPendingRequests,
      loginWithCredentials,
      requestPasswordRecovery,
      resetUserPassword,
      requestUserAccess,
      updateUserStatus,
      updateUserProfile,
      listUserProfiles,
      listAccessRequests,
      createUserAccount,
      deleteUserAccount,
      approveAccessRequest,
      rejectAccessRequest,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
