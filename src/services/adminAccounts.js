import { supabase } from './supabase';

export async function adminAccountRequest(payload) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session?.access_token) throw new Error('La sesión expiró. Inicia sesión de nuevo.');

  const response = await fetch('/api/admin-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud administrativa.');
  return result;
}
