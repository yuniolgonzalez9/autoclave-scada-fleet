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

      // Cargar auditorías de recuperación pendientes
      const { data: recoveries } = await supabase
        .from('auditoria_accesos')
        .select('*')
        .eq('evento', 'SOLICITUD_RECUPERACION_PENDIENTE')
        .order('fecha_hora', { ascending: false })
        .limit(10);
      if (recoveries) setRecoveryRequests(recoveries);
    } catch (e) {
      console.warn('Error cargando solicitudes:', e);
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

    if (
      (cleanId === 'superadmin' || cleanId === 'admin' || cleanId === 'yuniol0220@gmail.com' || cleanId === 'yuniolgonzalez9@gmail.com') &&
      cleanPass === '24331973'
    ) {
      const masterUser = {
        id: 'usr_superadmin_01',
        usuario: 'superadmin',
        nombre: 'Francisco Gonzalez',
        email: 'yuniol0220@gmail.com',
        rol: 'Super Administrador (Director Biomédico)',
        departamento: 'Ingeniería Biomédica & Mantenimiento',
        estado: 'ACTIVO'
      };
      localStorage.setItem('biofleet_enterprise_session', JSON.stringify(masterUser));
      setUser(masterUser);
      setProfile(masterUser);
      await loadPendingRequests();
      return masterUser;
    }

    const { data: users, error } = await supabase
      .from('usuarios_scada')
      .select('*')
      .or(`usuario.ilike.${cleanId},email.ilike.${cleanId}`);

    if (error || !users || users.length === 0) {
      throw new Error('Credenciales incorrectas: El usuario o correo no existe en el registro central.');
    }

    const matchedUser = users[0];
    const userPass = matchedUser.password || matchedUser.clave || matchedUser.password_acceso;

    if (userPass !== cleanPass) {
      throw new Error('Contraseña incorrecta. Verifique sus credenciales.');
    }

    const userState = (matchedUser.estado || 'ACTIVO').toUpperCase();
    if (userState === 'PENDIENTE') {
      throw new Error('ESTADO_PENDIENTE: Su solicitud de acceso aún está en revisión por el Super Administrador.');
    }
    if (userState === 'INACTIVO' || userState === 'DESACTIVADO' || userState === 'RECHAZADO') {
      throw new Error('ESTADO_INACTIVO: Acceso Desactivado / No Autorizado. Comuníquese con Francisco Gonzalez.');
    }

    localStorage.setItem('biofleet_enterprise_session', JSON.stringify(matchedUser));
    setUser(matchedUser);
    setProfile(matchedUser);

    if (matchedUser.rol?.toLowerCase().includes('admin') || matchedUser.rol?.toLowerCase().includes('director')) {
      await loadPendingRequests();
    }

    return matchedUser;
  };

  // 2. RECUPERACIÓN DE CONTRASEÑA CON AUDITORÍA Y TELEGRAM
  const requestPasswordRecovery = async (emailInput) => {
    const cleanEmail = emailInput.trim().toLowerCase();

    // Verificación si es el correo maestro de Francisco
    if (cleanEmail === 'yuniol0220@gmail.com' || cleanEmail === 'yuniolgonzalez9@gmail.com') {
      await sendTelegramAlert(
        `🛡️ <b>RECUPERACIÓN MAESTRA SOLICITADA</b>\n\n` +
        `👤 <b>Usuario:</b> Francisco Gonzalez (Superadmin)\n` +
        `📧 <b>Correo:</b> ${cleanEmail}\n` +
        `🔑 <b>Clave de Contingencia Activa:</b> <code>20331973</code>\n` +
        `⏰ <b>Fecha:</b> ${new Date().toLocaleString()}`
      );
      return {
        isMaster: true,
        message: 'Credencial Maestra detectada. El PIN de contingencia ha sido verificado y enviado a su canal seguro de Telegram.'
      };
    }

    // Buscar en la base de datos de usuarios
    const { data: users } = await supabase
      .from('usuarios_scada')
      .select('*')
      .eq('email', cleanEmail);

    if (!users || users.length === 0) {
      // Intento con correo sospechoso/no registrado -> Alerta de Seguridad
      await sendTelegramAlert(
        `🚨 <b>ALERTA DE SEGURIDAD - POSIBLE INTRUSIÓN</b>\n\n` +
        `⚠️ Se intentó recuperar acceso con un correo <b>NO REGISTRADO</b>.\n` +
        `📧 <b>Correo ingresado:</b> <code>${cleanEmail}</code>\n` +
        `⏰ <b>Fecha:</b> ${new Date().toLocaleString()}\n` +
        `Acción recomendada: Revisar si se trata de personal nuevo o intento de sondeo no autorizado.`
      );
      return {
        isMaster: false,
        message: 'Si el correo existe en el registro hospitalario, se ha notificado a la Administración para validar su identidad.'
      };
    }

    const targetUser = users[0];

    // Registrar en auditoría
    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario_email: targetUser.email,
        evento: 'SOLICITUD_RECUPERACION_PENDIENTE',
        fecha_hora: new Date().toISOString()
      }]);
    } catch (e) {}

    // Notificar al Telegram del Administrador
    await sendTelegramAlert(
      `🔔 <b>SOLICITUD DE RECUPERACIÓN DE ACCESO</b>\n\n` +
      `👤 <b>Personal:</b> ${targetUser.nombre || 'Sin nombre'}\n` +
      `🆔 <b>Usuario:</b> <code>${targetUser.usuario}</code>\n` +
      `📧 <b>Correo:</b> ${targetUser.email}\n` +
      `🏢 <b>Departamento:</b> ${targetUser.departamento || 'No asignado'}\n` +
      `🔑 <b>Clave Actual:</b> <code>${targetUser.password}</code>\n` +
      `⏰ <b>Fecha:</b> ${new Date().toLocaleString()}\n\n` +
      `Puedes contactar al usuario o restablecer su clave desde la plataforma.`
    );

    await loadPendingRequests();

    return {
      isMaster: false,
      message: 'Solicitud enviada a la Dirección Biomédica. El Administrador ha recibido la alerta y verificará sus credenciales.'
    };
  };

  // 3. CAMBIAR O GENERAR NUEVA CONTRASEÑA (Por el Administrador)
  const resetUserPassword = async (userId, newTempPassword) => {
    const { error } = await supabase
      .from('usuarios_scada')
      .update({ password: newTempPassword.trim() })
      .eq('id', userId);

    if (error) throw error;
  };

  // 4. SOLICITUD DE REGISTRO
  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    const { data: existing } = await supabase
      .from('usuarios_scada')
      .select('usuario, email')
      .or(`usuario.ilike.${usuario.trim()},email.ilike.${email.trim()}`);

    if (existing && existing.length > 0) {
      throw new Error('El nombre de usuario o correo ya está registrado.');
    }

    const { data, error } = await supabase
      .from('usuarios_scada')
      .insert([{
        usuario: usuario.trim().toLowerCase(),
        nombre: nombre_completo.trim(),
        email: email.trim().toLowerCase(),
        departamento: departamento || 'Central de Esterilización (CEYE/RUMED)',
        rol: 'Operador en Espera',
        password: password.trim(),
        estado: 'PENDIENTE'
      }])
      .select();

    if (error) throw new Error(error.message);

    // Alerta Telegram de nuevo registro
    await sendTelegramAlert(
      `🆕 <b>NUEVA SOLICITUD DE ACCESO AL SCADA</b>\n\n` +
      `👤 <b>Nombre:</b> ${nombre_completo}\n` +
      `🆔 <b>Usuario Deseado:</b> <code>${usuario}</code>\n` +
      `📧 <b>Correo:</b> ${email}\n` +
      `🏢 <b>Área:</b> ${departamento}\n` +
      `Revisa la campanita 🔔 en la plataforma para autorizarlo.`
    );

    return data;
  };

  // 5. CAMBIAR ESTADO
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
