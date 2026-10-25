import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { sendTelegramAlert } from '../services/telegram';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recoveryRequests, setRecoveryRequests] = useState([]);
  const [requestsLoadedAt, setRequestsLoadedAt] = useState(0);

  // Carga de perfil y autorización desde la base de datos
  const fetchUserProfile = useCallback(async (authUserId, email) => {
    try {
      const { data, error } = await supabase
        .from('usuarios_scada')
        .select('*')
        .or(`auth_id.eq.${authUserId},email.eq.${email.toLowerCase()}`)
        .maybeSingle();

      if (error || !data) {
        throw new Error(error?.message || 'Perfil biomédico no encontrado o no asignado.');
      }

      if (data.estado === 'PENDIENTE') {
        throw new Error('ESTADO_PENDIENTE: Su cuenta se encuentra en revisión.');
      }
      if (data.estado === 'INACTIVO' || data.estado === 'SUSPENDIDO') {
        throw new Error('ESTADO_INACTIVO: Acceso revocado por supervisión técnica.');
      }

      return data;
    } catch (err) {
      throw err;
    }
  }, []);

  const loadPendingRequests = useCallback(async () => {
    try {
      const { data: pendings } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('estado', 'PENDIENTE')
        .order('created_at', { ascending: false });

      if (pendings) {
        setPendingRequests(pendings);
        setRequestsLoadedAt(Date.now());
      }

      const { data: recoveries } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .eq('evento', 'SOLICITUD_RECUPERACION_PENDIENTE')
        .order('created_at', { ascending: false })
        .limit(20);

      if (recoveries) setRecoveryRequests(recoveries);
    } catch (err) {
      console.error('[AUTH SCADA] Error cargando solicitudes pendientes:', err);
    }
  }, []);

  // Inicialización de sesión persistente con Supabase Auth
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted) {
          const userProfile = await fetchUserProfile(session.user.id, session.user.email);
          setUser(session.user);
          setProfile(userProfile);

          if (userProfile.rol === 'SUPERADMIN' || userProfile.rol === 'DIRECTOR') {
            loadPendingRequests();
          }
        }
      } catch (err) {
        await supabase.auth.signOut();
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const userProfile = await fetchUserProfile(session.user.id, session.user.email);
          setUser(session.user);
          setProfile(userProfile);
          if (userProfile.rol === 'SUPERADMIN' || userProfile.rol === 'DIRECTOR') {
            loadPendingRequests();
          }
        } catch (err) {
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setPendingRequests([]);
        setRecoveryRequests([]);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchUserProfile, loadPendingRequests]);

  const loginWithCredentials = async (emailOrUser, password) => {
    const cleanIdentifier = emailOrUser.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanIdentifier || !cleanPassword) {
      throw new Error('Debe especificar usuario/correo y contraseña.');
    }

    let authEmail = cleanIdentifier;

    // Si el operador ingresa su ID de usuario en vez de email, resolver el email real en BD
    if (!cleanIdentifier.includes('@')) {
      const { data: userData, error: userError } = await supabase
        .from('usuarios_scada')
        .select('email')
        .eq('user', cleanIdentifier)
        .maybeSingle();

      if (userError || !userData?.email) {
        throw new Error('Credenciales inválidas o identificador no registrado.');
      }
      authEmail = userData.email;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: cleanPassword
    });

    if (error) {
      // Registro de auditoría de fallo
      await supabase.from('auditoria_accesos').insert([{
        usuario: cleanIdentifier,
        evento: 'CLAVE_INCORRECTA',
        dispositivo: navigator.userAgent.slice(0, 100)
      }]);
      throw new Error('Credenciales de acceso incorrectas.');
    }

    const userProfile = await fetchUserProfile(data.user.id, data.user.email);
    setUser(data.user);
    setProfile(userProfile);

    // Registro de auditoría de éxito
    await supabase.from('auditoria_accesos').insert([{
      usuario: userProfile.user,
      evento: 'INICIO_SESION_EXITOSO',
      dispositivo: navigator.userAgent.slice(0, 100)
    }]);

    return userProfile;
  };

  const requestPasswordRecovery = async (emailInput) => {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail) throw new Error('Ingrese un correo corporativo válido.');

    const { data: existingUser } = await supabase
      .from('usuarios_scada')
      .select('user, nombre, email')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (!existingUser) {
      await supabase.from('auditoria_accesos').insert([{
        usuario: cleanEmail,
        evento: 'INTENTO_RECUPERACION_NO_REGISTRADO',
        dispositivo: navigator.userAgent.slice(0, 100)
      }]);
      throw new Error('El correo ingresado no pertenece a un personal autorizado.');
    }

    // Flujo estándar seguro: Magic Link / Token de restablecimiento
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (resetError) throw resetError;

    await supabase.from('auditoria_accesos').insert([{
      usuario: existingUser.user,
      evento: 'SOLICITUD_RECUPERACION_PENDIENTE',
      dispositivo: navigator.userAgent.slice(0, 100)
    }]);

    await sendTelegramAlert(
      `🔐 <b>SOLICITUD DE RESTABLECIMIENTO DE CLAVE</b>\n\n` +
      `👤 <b>Operador:</b> ${existingUser.nombre}\n` +
      `🆔 <b>Usuario:</b> <code>${existingUser.user}</code>\n` +
      `📧 <b>Email:</b> <code>${cleanEmail}</code>\n` +
      `ℹ️ Se ha emitido un enlace de reseteo seguro al correo del operador.`
    );

    return {
      message: 'Se ha emitido un correo oficial con el enlace criptográfico para actualizar la contraseña.'
    };
  };

  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    const cleanUser = usuario.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password.trim()
    });

    if (authError) throw new Error(authError.message);

    // 2. Insertar registro de perfil clínico en estado PENDIENTE
    const { error: profileError } = await supabase
      .from('usuarios_scada')
      .insert([{
        auth_id: authData.user?.id,
        user: cleanUser,
        nombre: nombre_completo.trim(),
        email: cleanEmail,
        departamento,
        rol: 'OPERADOR',
        estado: 'PENDIENTE'
      }]);

    if (profileError) throw new Error(profileError.message);

    await sendTelegramAlert(
      `📋 <b>NUEVA SOLICITUD DE ACCESO CLÍNICO</b>\n\n` +
      `👤 <b>Nombre:</b> ${nombre_completo}\n` +
      `🆔 <b>Usuario:</b> <code>${cleanUser}</code>\n` +
      `🏥 <b>Área:</b> ${departamento}\n` +
      `⚠️ Esperando aprobación de Dirección Biomédica.`
    );
  };

  const updateUserStatus = async (userId, nuevoEstado, nuevoRol = null) => {
    const updatePayload = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (nuevoRol) updatePayload.rol = nuevoRol;

    const { error } = await supabase
      .from('usuarios_scada')
      .update(updatePayload)
      .eq('id', userId);

    if (error) throw error;
    await loadPendingRequests();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    sessionStorage.clear();
  };

  const authContextValue = useMemo(() => ({
    user,
    profile,
    loading,
    pendingRequests,
    recoveryRequests,
    requestsLoadedAt,
    loadPendingRequests,
    loginWithCredentials,
    requestPasswordRecovery,
    requestUserAccess,
    updateUserStatus,
    logout
  }), [user, profile, loading, pendingRequests, recoveryRequests, requestsLoadedAt, loadPendingRequests]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de un AuthProvider.');
  return context;
};
