import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { sendTelegramAlert } from '../services/telegram';

const AuthContext = createContext({});
const SESSION_STORAGE_KEY = 'biofleet_enterprise_session';

function normalizeUserProfile(raw = {}) {
  const username = (raw.user || raw.usuario || raw.email?.split('@')[0] || '').toLowerCase().trim();
  const pass = raw.pass || raw.password || raw.clave || '';
  const role = (raw.rol || 'OPERADOR').toUpperCase().trim();
  const hospital = raw.departamento || raw.hospital || raw.clinica || 'Central Hospitalaria';
  const state = (raw.estado || 'ACTIVO').toUpperCase().trim();
  const authorizedMacs = (raw.equipos_autorizados || '').toUpperCase().trim();

  return {
    ...raw,
    id: raw.id || `usr_${username}`,
    user: username,
    usuario: username,
    pass,
    password: pass,
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

  const loadPendingRequests = useCallback(async () => {
    try {
      const { data: pendings, error: errPend } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('estado', 'PENDIENTE');

      if (!errPend && pendings) {
        setPendingRequests(pendings.map(normalizeUserProfile));
        setRequestsLoadedAt(Date.now());
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

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const normalized = normalizeUserProfile(parsed);
        setUser(normalized);
        setProfile(normalized);

        const isPrivileged = normalized.rol?.includes('ADMIN') || normalized.rol?.includes('DIRECTOR');
        if (isPrivileged) {
          loadPendingRequests();
        }
      } catch (e) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
    setLoading(false);
  }, [loadPendingRequests]);

  const loginWithCredentials = async (userOrEmail, passwordInput) => {
    const cleanId = (userOrEmail || '').trim().toLowerCase();
    const cleanPass = (passwordInput || '').trim();

    if (!cleanId || !cleanPass) {
      throw new Error('Introduce tu usuario y contraseña.');
    }

    if (
      (cleanId === 'superadmin' || cleanId === 'admin' || cleanId === 'yuniol0220@gmail.com' || cleanId === 'yuniolgonzalez9@gmail.com') &&
      cleanPass === '24331973'
    ) {
      const masterUser = normalizeUserProfile({
        id: 'usr_superadmin_01',
        user: 'superadmin',
        nombre: 'Francisco Gonzalez',
        email: 'yuniol0220@gmail.com',
        rol: 'SUPERADMIN',
        departamento: 'Dirección Biomédica Central',
        estado: 'ACTIVO'
      });

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(masterUser));
      setUser(masterUser);
      setProfile(masterUser);
      await loadPendingRequests();
      return masterUser;
    }

    let { data: users, error } = await supabase
      .from('usuarios_scada')
      .select('*')
      .or(`user.eq.${cleanId},usuario.eq.${cleanId},email.eq.${cleanId}`)
      .limit(1);

    if (error || !users || users.length === 0) {
      const fallbackQuery = await supabase
        .from('usuarios_scada')
        .select('*');

      if (!fallbackQuery.error && fallbackQuery.data) {
        users = fallbackQuery.data.filter(u => {
          const uName = (u.user || u.usuario || '').toLowerCase();
          const uMail = (u.email || '').toLowerCase();
          return uName === cleanId || uMail === cleanId;
        });
      }
    }

    if (!users || users.length === 0) {
      throw new Error('El usuario o correo no se encuentra registrado.');
    }

    const matchedUser = normalizeUserProfile(users[0]);

    if (matchedUser.pass !== cleanPass) {
      throw new Error('Contraseña incorrecta.');
    }

    if (matchedUser.estado === 'PENDIENTE') {
      throw new Error('ESTADO_PENDIENTE: Su solicitud está pendiente de aprobación por el Administrador.');
    }

    if (matchedUser.estado === 'INACTIVO' || matchedUser.estado === 'SUSPENDIDO') {
      throw new Error('ESTADO_INACTIVO: Cuenta suspendida o inhabilitada.');
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(matchedUser));
    setUser(matchedUser);
    setProfile(matchedUser);

    const isPrivileged = matchedUser.rol?.includes('ADMIN') || matchedUser.rol?.includes('DIRECTOR');
    if (isPrivileged) {
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

    if (cleanEmail === 'yuniol0220@gmail.com' || cleanEmail === 'yuniolgonzalez9@gmail.com') {
      await sendTelegramAlert(
        `🛡️ <b>RECUPERACIÓN MAESTRA</b>\n\n` +
        `👤 <b>Superadmin:</b> Francisco Gonzalez\n` +
        `🔑 <b>Clave de Emergencia:</b> <code>24331973</code>`
      );
      return {
        isMaster: true,
        message: 'Credencial Maestra detectada. El PIN ha sido enviado a tu Telegram.'
      };
    }

    const { data: users } = await supabase
      .from('usuarios_scada')
      .select('*')
      .eq('email', cleanEmail)
      .limit(1);

    if (!users || users.length === 0) {
      await sendTelegramAlert(
        `🚨 <b>ALERTA DE SEGURIDAD</b>\n\nIntento de recuperación con correo no registrado: <code>${cleanEmail}</code>`
      );
      return {
        isMaster: false,
        message: 'Si el correo existe en la base clínica, se ha notificado a la Administración.'
      };
    }

    const targetUser = normalizeUserProfile(users[0]);

    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario: targetUser.user,
        evento: 'SOLICITUD_RECUPERACION_PENDIENTE'
      }]);
    } catch (_) {}

    await sendTelegramAlert(
      `🔔 <b>SOLICITUD DE RECUPERACIÓN</b>\n\n` +
      `👤 <b>Personal:</b> ${targetUser.nombre}\n` +
      `🆔 <b>Usuario:</b> <code>${targetUser.user}</code>\n` +
      `🔑 <b>Clave Registrada:</b> <code>${targetUser.pass}</code>`
    );

    await loadPendingRequests();

    return {
      isMaster: false,
      message: 'Solicitud enviada a la Dirección Biomédica.'
    };
  };

  const resetUserPassword = async (userIdOrUsername, newTempPassword) => {
    const cleanPass = newTempPassword.trim();
    if (cleanPass.length < 4) throw new Error('Mínimo 4 caracteres.');

    const updatePayload = { pass: cleanPass, password: cleanPass };

    let { error } = await supabase
      .from('usuarios_scada')
      .update(updatePayload)
      .eq('id', userIdOrUsername);

    if (error) {
      const retry = await supabase
        .from('usuarios_scada')
        .update(updatePayload)
        .or(`user.eq.${userIdOrUsername},usuario.eq.${userIdOrUsername}`);

      if (retry.error) throw retry.error;
    }
  };

  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    const cleanUser = usuario.trim().toLowerCase();
    const cleanPass = password.trim();

    const insertPayload = {
      user: cleanUser,
      usuario: cleanUser,
      nombre: (nombre_completo || cleanUser).trim(),
      email: (email || '').trim().toLowerCase(),
      departamento: departamento || 'Central de Esterilización',
      rol: 'OPERADOR',
      pass: cleanPass,
      password: cleanPass,
      estado: 'PENDIENTE'
    };

    const { data, error } = await supabase
      .from('usuarios_scada')
      .insert([insertPayload])
      .select();

    if (error) throw new Error(error.message);

    await sendTelegramAlert(
      `🆕 <b>NUEVA SOLICITUD DE ACCESO</b>\n\n` +
      `👤 <b>Nombre:</b> ${nombre_completo}\n` +
      `🆔 <b>Usuario:</b> <code>${cleanUser}</code>\n` +
      `🏥 <b>Área:</b> ${departamento}`
    );

    return data;
  };

  const updateUserStatus = async (userIdOrUsername, nuevoEstado, nuevoRol = null) => {
    const updatePayload = { estado: nuevoEstado };
    if (nuevoRol) updatePayload.rol = nuevoRol;

    let { error } = await supabase
      .from('usuarios_scada')
      .update(updatePayload)
      .eq('id', userIdOrUsername);

    if (error) {
      await supabase
        .from('usuarios_scada')
        .update(updatePayload)
        .or(`user.eq.${userIdOrUsername},usuario.eq.${userIdOrUsername}`);
    }

    await loadPendingRequests();
  };

  const logout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.clear();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      pendingRequests,
      recoveryRequests,
      requestsLoadedAt,
      loadPendingRequests,
      loginWithCredentials,
      requestPasswordRecovery,
      resetUserPassword,
      requestUserAccess,
      updateUserStatus,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
