import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { sendTelegramAlert } from '../services/telegram';

const AuthContext = createContext({});
const SESSION_STORAGE_KEY = 'biofleet_enterprise_session';

/**
 * Normaliza cualquier fila de 'usuarios_scada' a un objeto estándar predecible
 */
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

  // Cargar solicitudes pendientes (Solo para administradores)
  const loadPendingRequests = useCallback(async () => {
    try {
      const { data: pendings, error: errPend } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('estado', 'PENDIENTE');

      if (!errPend && pendings) {
        setPendingRequests(pendings.map(normalizeUserProfile));
      }

      // Consulta de recuperación tolerante a nombres de columna fecha_hora / created_at
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

  // Carga inicial de sesión guardada
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

  // 1. INICIAR SESIÓN CON CREDENCIALES
  const loginWithCredentials = async (userOrEmail, passwordInput) => {
    const cleanId = (userOrEmail || '').trim().toLowerCase();
    const cleanPass = (passwordInput || '').trim();

    if (!cleanId || !cleanPass) {
      throw new Error('Introduce tu usuario y contraseña.');
    }

    // Credencial Maestra de Contingencia Root
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

    // Consulta específica y optimizada (No descarga toda la tabla a memoria)
    let { data: users, error } = await supabase
      .from('usuarios_scada')
      .select('*')
      .or(`user.eq.${cleanId},usuario.eq.${cleanId},email.eq.${cleanId}`)
      .limit(1);

    // Si falló por nombre de columna compuesto, intentamos búsqueda por email o user
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

    // Registro forense de login exitoso
    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario: matchedUser.user,
        evento: 'INICIO_SESION_EXITOSO',
        dispositivo: navigator.userAgent.slice(0, 80)
      }]);
    } catch (_) {}

    return matchedUser;
  };

  // 2. RECUPERACIÓN DE CONTRASEÑA
  const requestPasswordRecovery = async (emailInput) => {
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    if (!cleanEmail) throw new Error('Por favor introduce un correo válido.');

    if (cleanEmail === 'yuniol0220@gmail.com' || cleanEmail === 'yuniolgonzalez9@gmail.com') {
      await sendTelegramAlert(
        `🛡️ <b>RECUPERACIÓN MAESTRA</b>\n\n` +
        `👤 <b>Superadmin:</b> Francisco Gonzalez
