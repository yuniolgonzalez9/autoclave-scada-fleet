import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Cargar solicitudes pendientes desde Supabase
  const loadPendingRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('estado', 'PENDIENTE');

      if (!error && data) {
        setPendingRequests(data);
      }
    } catch (e) {
      console.warn('Error cargando solicitudes:', e);
    }
  };

  useEffect(() => {
    // Restaurar sesión real del navegador
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

  // 1. AUTENTICACIÓN REAL ESTRICTA (Sin accesos falsos)
  const loginWithCredentials = async (userOrEmail, password) => {
    const cleanId = userOrEmail.trim().toLowerCase();
    const cleanPass = password.trim();

    // Verificación directa de tu credencial Superadmin
    if (
      (cleanId === 'superadmin' || cleanId === 'admin' || cleanId === 'yuniol0220@gmail.com') &&
      cleanPass === '20331973'
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

    // Para cualquier otro usuario: Consulta estricta en la base de datos Supabase
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

    // Verificar si está pendiente o desautorizado
    const userState = (matchedUser.estado || 'ACTIVO').toUpperCase();

    if (userState === 'PENDIENTE') {
      throw new Error('ESTADO_PENDIENTE: Su solicitud de acceso aún está en revisión por el Super Administrador.');
    }

    if (userState === 'INACTIVO' || userState === 'DESACTIVADO' || userState === 'RECHAZADO') {
      throw new Error('ESTADO_INACTIVO: Acceso Desactivado / No Autorizado. Comuníquese con Francisco Gonzalez.');
    }

    // Usuario autorizado
    localStorage.setItem('biofleet_enterprise_session', JSON.stringify(matchedUser));
    setUser(matchedUser);
    setProfile(matchedUser);

    if (matchedUser.rol?.toLowerCase().includes('admin') || matchedUser.rol?.toLowerCase().includes('director')) {
      await loadPendingRequests();
    }

    return matchedUser;
  };

  // 2. SOLICITUD DE ACCESO LIMPIA (Sin columnas inexistentes)
  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    // Comprobar si ya existe
    const { data: existing } = await supabase
      .from('usuarios_scada')
      .select('usuario, email')
      .or(`usuario.ilike.${usuario.trim()},email.ilike.${email.trim()}`);

    if (existing && existing.length > 0) {
      throw new Error('El nombre de usuario o correo ya se encuentra registrado en el sistema.');
    }

    // Inserción limpia: Solo columnas estándar
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

    if (error) {
      throw new Error(error.message);
    }

    return data;
  };

  // 3. ADMINISTRADOR: Aprobar / Inhabilitar
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
      loadPendingRequests,
      loginWithCredentials,
      requestUserAccess,
      updateUserStatus,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
