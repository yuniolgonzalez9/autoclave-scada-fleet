import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { sendTelegramAlert } from '../services/telegram';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recoveryRequests, setRecoveryRequests] = useState([]);

  // Cargar solicitudes de registro y recuperación
  const loadPendingRequests = async () => {
    try {
      const { data: pendings } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('estado', 'PENDIENTE');
      if (pendings) setPendingRequests(pendings);

      // Consulta protegida usando created_at (evita error HTTP 400)
      const { data: recoveries } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .eq('evento', 'SOLICITUD_RECUPERACION_PENDIENTE')
        .order('created_at', { ascending: false })
        .limit(10);
      if (recoveries) setRecoveryRequests(recoveries);
    } catch (e) {
      console.warn('Carga de solicitudes:', e);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('biofleet_enterprise_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setProfile(parsed);
        if (parsed.rol?.toLowerCase().includes('admin') || parsed.rol?.toLowerCase().includes('director')) {
          loadPendingRequests();
        }
      } catch (e) {
        localStorage.removeItem('biofleet_enterprise_session');
      }
    }
    setLoading(false);
  }, []);

  // 1. INICIAR SESIÓN REAL
  const loginWithCredentials = async (userOrEmail, password) => {
    const cleanId = userOrEmail.trim().toLowerCase();
    const cleanPass = password.trim();

    // Credencial Maestra Francisco Gonzalez
    if (
      (cleanId === 'superadmin' || cleanId === 'admin' || cleanId === 'yuniol0220@gmail.com' || cleanId === 'yuniolgonzalez9@gmail.com') &&
      cleanPass === '24331973'
    ) {
      const masterUser = {
        id: 'usr_superadmin_01',
        usuario: 'superadmin',
        user: 'superadmin',
        nombre: 'Francisco Gonzalez',
        email: 'yuniol0220@gmail.com',
        rol: 'SUPERADMIN',
        departamento: 'Dirección Biomédica Central',
        estado: 'ACTIVO'
      };
      localStorage.setItem('biofleet_enterprise_session', JSON.stringify(masterUser));
      setUser(masterUser);
      setProfile(masterUser);
      await loadPendingRequests();
      return masterUser;
    }

    // Consulta flexible en usuarios_scada
    const { data: users, error } = await supabase
      .from('usuarios_scada')
      .select('*');

    if (error || !users || users.length === 0) {
      throw new Error('El usuario o correo no existe en el registro central.');
    }

    const matchedUser = users.find(u => {
      const uname = (u.user || u.usuario || '').toLowerCase();
      const umail = (u.email || '').toLowerCase();
      return uname === cleanId || umail === cleanId;
    });

    if (!matchedUser) {
      throw new Error('Credenciales incorrectas.');
    }

    const userPass = matchedUser.pass || matchedUser.password || matchedUser.clave;
    if (userPass !== cleanPass) {
      throw new Error('Contraseña incorrecta.');
    }

    const userState = (matchedUser.estado || 'ACTIVO').toUpperCase();
    if (userState === 'PENDIENTE') {
      throw new Error('ESTADO_PENDIENTE: Su solicitud de acceso aún está en revisión.');
    }
    if (userState === 'INACTIVO' || userState === 'SUSPENDIDO') {
      throw new Error('ESTADO_INACTIVO: Acceso Desactivado / No Autorizado.');
    }

    const sessionObj = {
      ...matchedUser,
      usuario: matchedUser.user || matchedUser.usuario,
      user: matchedUser.user || matchedUser.usuario
    };

    localStorage.setItem('biofleet_enterprise_session', JSON.stringify(sessionObj));
    setUser(sessionObj);
    setProfile(sessionObj);

    if (sessionObj.rol?.toLowerCase().includes('admin') || sessionObj.rol?.toLowerCase().includes('director')) {
      await loadPendingRequests();
    }

    return sessionObj;
  };

  // 2. RECUPERACIÓN DE CONTRASEÑA
  const requestPasswordRecovery = async (emailInput) => {
    const cleanEmail = emailInput.trim().toLowerCase();

    if (cleanEmail === 'yuniol0220@gmail.com' || cleanEmail === 'yuniolgonzalez9@gmail.com') {
      await sendTelegramAlert(
        `🛡️ <b>RECUPERACIÓN MAESTRA</b>\n\n` +
        `👤 <b>Usuario:</b> Francisco Gonzalez (Superadmin)\n` +
        `🔑 <b>Clave Maestra:</b> <code>24331973</code>`
      );
      return {
        isMaster: true,
        message: 'Credencial Maestra detectada. El PIN ha sido enviado a su canal de Telegram.'
      };
    }

    const { data: users } = await supabase
      .from('usuarios_scada')
      .select('*')
      .eq('email', cleanEmail);

    if (!users || users.length === 0) {
      await sendTelegramAlert(
        `🚨 <b>ALERTA DE SEGURIDAD</b>\n\nIntento de recuperación con correo no registrado: <code>${cleanEmail}</code>`
      );
      return {
        isMaster: false,
        message: 'Si el correo existe en la base clínica, se ha notificado a la Administración.'
      };
    }

    const targetUser = users[0];

    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario: targetUser.user || targetUser.usuario,
        evento: 'SOLICITUD_RECUPERACION_PENDIENTE',
        created_at: new Date().toISOString()
      }]);
    } catch (e) {}

    await sendTelegramAlert(
      `🔔 <b>SOLICITUD DE RECUPERACIÓN</b>\n\n` +
      `👤 <b>Personal:</b> ${targetUser.nombre || targetUser.user}\n` +
      `🆔 <b>Usuario:</b> <code>${targetUser.user || targetUser.usuario}</code>\n` +
      `🔑 <b>Clave:</b> <code>${targetUser.pass || targetUser.password}</code>`
    );

    await loadPendingRequests();

    return {
      isMaster: false,
      message: 'Solicitud enviada a la Dirección Biomédica.'
    };
  };

  const resetUserPassword = async (userId, newTempPassword) => {
    const { error } = await supabase
      .from('usuarios_scada')
      .update({ pass: newTempPassword.trim(), password: newTempPassword.trim() })
      .eq('id', userId);

    if (error) throw error;
  };

  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    const cleanUser = usuario.trim().toLowerCase();
    const { data, error } = await supabase
      .from('usuarios_scada')
      .insert([{
        user: cleanUser,
        usuario: cleanUser,
        nombre: nombre_completo.trim(),
        email: email.trim().toLowerCase(),
        departamento: departamento || 'Central de Esterilización',
        rol: 'OPERADOR',
        pass: password.trim(),
        password: password.trim(),
        estado: 'PENDIENTE'
      }])
      .select();

    if (error) throw new Error(error.message);

    await sendTelegramAlert(
      `🆕 <b>NUEVA SOLICITUD DE ACCESO</b>\n\n` +
      `👤 <b>Nombre:</b> ${nombre_completo}\n` +
      `🆔 <b>Usuario:</b> <code>${cleanUser}</code>`
    );

    return data;
  };

  const updateUserStatus = async (userId, nuevoEstado, nuevoRol = null) => {
    const updatePayload = { estado: nuevoEstado };
    if (nuevoRol) updatePayload.rol = nuevoRol;

    const { error } = await supabase
      .from('usuarios_scada')
      .update(updatePayload)
      .eq('id', userId);

    if (error) throw error;
    await loadPendingRequests();
  };

  const logout = () => {
    localStorage.removeItem('biofleet_enterprise_session');
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
