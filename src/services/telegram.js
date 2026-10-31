import { supabase } from './supabase';

// Telegram se envía desde el servidor (/api/telegram): el token del bot
// nunca llega al navegador.
const ultimasAlarmasPorMac = new Map();
const COOLDOWN_ALARMA_MS = 30000;

export const sendTelegramEvent = async (kind, data = {}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({ kind, data })
    });
    return { success: res.ok };
  } catch (e) {
    console.warn('[TELEGRAM] No se pudo enviar el aviso:', e.message);
    return { success: false, error: e.message };
  }
};

export const sendCriticalAlarmWithButtons = async ({ mac, alias, temp, pres, fase, errorMsg }) => {
  if (!mac) return;
  const cleanMac = mac.toUpperCase().replace(/[:-]/g, '');
  const ahora = Date.now();
  if (ahora - (ultimasAlarmasPorMac.get(cleanMac) || 0) < COOLDOWN_ALARMA_MS) return;
  ultimasAlarmasPorMac.set(cleanMac, ahora);
  return sendTelegramEvent('critical_alarm', { mac: cleanMac, alias, temp, pres, fase, errorMsg });
};
