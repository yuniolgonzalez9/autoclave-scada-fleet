import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Cargar solicitudes pendientes para el panel del Administrador
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
    // Revisar sesión persistente guardada en el navegador
    const stored = localStorage.getItem('biofleet_enterprise_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setProfile(parsed);
        if (parsed.rol?.toLowerCase().includes('director') || parsed.rol?.toLowerCase().includes('admin')) {
          loadPendingRequests();
        }
      } catch (e) {
        localStorage.removeItem('biofleet_enterprise_session');
      }
    }
    setLoading(false);
  }, []);

  // 1. INICIO DE SESIÓN UNIVERSAL (Por Usuario O por Correo)
  const loginWithCredentials = async (userOrEmail, password) => {
    const cleanIdentifier = userOrEmail.trim().toLowerCase();

    // Consultamos en la tabla usuarios_scada
    const { data: users, error } = await supabase
      .from('usuarios_scada')
      .select('*')
      .or(`usuario.ilike.${cleanIdentifier},email.ilike.${cleanIdentifier}`);

    if (error || !users || users.length === 0) {
      throw new Error('El usuario o correo ingresado no existe en el registro central.');
    }

    const matchedUser = users[0];

    // Verificar contraseña (soporta texto directo o campo clave)
    const validPassword = matchedUser.password || matchedUser.clave || matchedUser.password_acceso;
    if (validPassword && validPassword !== password) {
      throw new Error('Contraseña o firma de acceso incorrecta.');
    }

    // Comprobación de estado jerárquico
    const userState = (matchedUser.estado || 'ACTIVO').toUpperCase();
    const isAuthorized = matchedUser.autorizado !== false && matchedUser.activo !== false;

    if (userState === 'PENDIENTE') {
      throw new Error('ESTADO_PENDIENTE: Su solicitud de acceso se encuentra en revisión por la Dirección de Ingeniería.');
    }

    if (userState === 'INACTIVO' || userState === 'DESACTIVADO' || !isAuthorized) {
      throw new Error('ESTADO_INACTIVO: Acceso inhabilitado o desautorizado. Comuníquese con la Administración Biomédica.');
    }

    // Acceso autorizado
    localStorage.setItem('biofleet_enterprise_session', JSON.stringify(matchedUser));
    setUser(matchedUser);
    setProfile(matchedUser);

    // Registro en auditoria de accesos
    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario_email: matchedUser.email || matchedUser.usuario,
        evento: 'ACCESO_AUTORIZADO',
        fecha_hora: new Date().toISOString()
      }]);
    } catch (e) {}

    if (matchedUser.rol?.toLowerCase().includes('director') || matchedUser.rol?.toLowerCase().includes('admin')) {
      loadPendingRequests();
    }

    return matchedUser;
  };

  // 2. SOLICITUD DE ACCESO INDEPENDIENTE (Nuevos Usuarios)
  const requestUserAccess = async ({ usuario, nombre_completo, email, departamento, password }) => {
    // Comprobar que el usuario no exista ya
    const { data: existing } = await supabase
      .from('usuarios_scada')
      .select('usuario, email')
      .or(`usuario.ilike.${usuario.trim()},email.ilike.${email.trim()}`);

    if (existing && existing.length > 0) {
      throw new Error('El nombre de usuario o correo ya está registrado en el sistema.');
    }

    const { data, error } = await supabase
      .from('usuarios_scada')
      .insert([{
        usuario: usuario.trim().toLowerCase(),
        nombre: nombre_completo.trim(),
        email: email.trim().toLowerCase(),
        departamento: departamento || 'Central de Esterilización (CEYE/RUMED)',
        rol: 'Operador en Espera',
        password: password,
        estado: 'PENDIENTE',
        activo: false,
        autorizado: false,
        fecha_solicitud: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    return data;
  };

  // 3. GESTIÓN DE LA ADMINISTRACIÓN: Aprobar / Habilitar / Deshabilitar
  const updateUserStatus = async (userId, nuevoEstado, nuevoRol = null, autorizado = true) => {
    const updatePayload = {
      estado: nuevoEstado,
      activo: autorizado,
      autorizado: autorizado
    };
    if (nuevoRol) updatePayload.rol = nuevoRol;

    const { error } = await supabase
      .from('usuarios_scada')
      .update(updatePayload)
      .eq('id', userId);

    if (error) throw error;
    await loadPendingRequests();
  };

  // 4. ACCESO RÁPIDO MAESTRO
  const loginQuickAccess = () => {
    const masterAdmin = {
      id: 'master-director',
      usuario: 'director_biomedico',
      nombre: 'Director de Ingeniería Biomédica',
      email: 'yuniolgonzalez9@gmail.com',
      rol: 'Director Biomédico (Super Admin)',
      departamento: 'Ingeniería Clínica Central',
      estado: 'ACTIVO',
      activo: true,
      autorizado: true
    };
    localStorage.setItem('biofleet_enterprise_session', JSON.stringify(masterAdmin));
    setUser(masterAdmin);
    setProfile(masterAdmin);
    loadPendingRequests();
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
      loginQuickAccess,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
