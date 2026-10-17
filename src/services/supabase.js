import { createClient } from '@supabase/supabase-js';

// Lectura de variables de entorno con saneamiento y credenciales de contingencia
const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gjtqyodpgwfvfvkhlhik.supabase.co';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHF5b2RwZ3dmdmZ2a2hsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDAzNTYsImV4cCI6MjEwNTYxNjM1Nn0.g8t_PbEityaneKkOUHttQ_cZv50aczLU4Z9la8R4d_g';

const supabaseUrl = rawUrl.trim();
const supabaseAnonKey = rawKey.trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'scada_biomedical_enterprise_auth'
  },
  realtime: {
    params: {
      eventsPerSecond: 15 // Control de flujo para evitar sobrecarga en la CPU
    },
    timeout: 10000
  },
  db: {
    schema: 'public'
  }
});
