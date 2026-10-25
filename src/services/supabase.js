import { createClient } from '@supabase/supabase-js';

// URL y Clave pública de tu proyecto Supabase: Autoclave-SCADA
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gjtqyodpgwfvfvkhlhik.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_r7Oz_wW66N2Vea2_g9c3MA_wT2v-iPQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

export default supabase;
