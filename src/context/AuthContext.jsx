import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Consulta el perfil biomédico y rol del usuario
  const fetchUserProfile = async (supabaseUser) => {
    try {
      const { data, error } = await supabase
        .from('usuarios_scada')
        .select('*')
        .eq('email', supabaseUser.email)
        .single();

      if (!error && data) {
        setProfile(data);
      } else {
        // Perfil por defecto si aún no está asignado en la tabla
        setProfile({
          nombre: supabaseUser.email.split('@')[0],
          rol: 'Operador Biomédico',
          email: supabaseUser.email
        });
      }
    } catch (err) {
      console.error('Error obteniendo perfil:', err);
    }
  };

  useEffect(() => {
    // 1. Verificar sesión persistente al abrir la página (Evita parpadeo)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchUserProfile(session.user);
      }
      setLoading(false);
    });

    // 2. Escuchar cambios de sesión en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Función de inicio de sesión
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // Registrar en tabla auditoria_accesos
    try {
      await supabase.from('auditoria_accesos').insert([{
        usuario_email: email,
        evento: 'INICIO_SESION_EXITOSO',
        fecha_hora: new Date().toISOString()
      }]);
    } catch (e) {
      console.warn('Bitácora de auditoría offline:', e);
    }

    return data;
  };

  // Función de cierre de sesión
  const logout = async () => {
    try {
      if (user?.email) {
        await supabase.from('auditoria_accesos').insert([{
          usuario_email: user.email,
          evento: 'CIERRE_SESION',
          fecha_hora: new Date().toISOString()
        }]);
      }
    } catch (e) {
      // Ignorar si falla registro
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
