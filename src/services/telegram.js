// Configuración mediante variables de entorno con respaldo
const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8902369071:AAFuFn3R1b6k9_y_2w3XKPc92npVRUkee0s';
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '685508990';

// Mapa de rate-limiting individual por MAC (Evita que un equipo bloquee las alertas de otro)
const ultimasAlarmasPorMac = new Map();
const COOLDOWN_ALARMA_MS = 30000; // 30 segundos por equipo

/**
 * Escapa caracteres reservados para evitar errores HTTP 400 en Telegram HTML parse mode
 */
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Envío general de mensajes administrativos y de auditoría
 */
export const sendTelegramAlert = async (mensaje) => {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[TELEGRAM] Token o Chat ID no configurados.');
    return { success: false, error: 'Credenciales ausentes' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: mensaje,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    return { success: data.ok, data };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[TELEGRAM LOCAL WARN] Envío general omitido:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Envío de Alarma Crítica Biomédica con Botones Interactivos [ACK / PARO]
 */
export const sendCriticalAlarmWithButtons = async ({ mac, alias, temp, pres, fase, errorMsg }) => {
  if (!mac) return;
  const cleanMac = mac.toUpperCase().replace(/[:\-]/g, '');
  const ahora = Date.now();

  // Rate-limiting individual por máquina
  const ultimaHora = ultimasAlarmasPorMac.get(cleanMac) || 0;
  if (ahora - ultimaHora < COOLDOWN_ALARMA_MS) {
    return; // En periodo de enfriamiento para este autoclave específico
  }
  ultimasAlarmasPorMac.set(cleanMac, ahora);

  const safeAlias = escapeHtml(alias || cleanMac);
  const safeError = escapeHtml(errorMsg || 'Parámetros críticos fuera de rango');
  const safeFase = escapeHtml(fase || 'CRÍTICA');
  const tempFormateada = (typeof temp === 'number' && !isNaN(temp)) ? temp.toFixed(1) : '0.0';
  const presFormateada = (typeof pres === 'number' && !isNaN(pres)) ? pres.toFixed(2) : '0.00';

  const texto = 
    `🚨 <b>¡ALARMA CRÍTICA EN QUIRÓFANO / PLANTA!</b> 🚨\n\n` +
    `🏥 <b>Equipo:</b> ${safeAlias}\n` +
    `📟 <b>Dirección MAC:</b> <code>${cleanMac}</code>\n` +
    `⚠️ <b>Diagnóstico:</b> <b>${safeError}</b>\n` +
    `🌡️ <b>Temperatura:</b> ${tempFormateada} °C\n` +
    `💨 <b>Presión:</b> ${presFormateada} Bar\n` +
    `⏱️ <b>Fase Térmica:</b> ${safeFase}\n` +
    `🕒 <b>Hora:</b> ${new Date().toLocaleTimeString()}\n\n` +
    `👇 <i>Presiona abajo para silenciar la sirena de cabina o suspender el ciclo:</i>`;

  const payload = {
    chat_id: CHAT_ID,
    text: texto,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔕 🆗 CONFIRMAR / SILENCIAR', callback_data: `ACK:${cleanMac}` },
          { text: '🛑 PARO EMERGENCIA', callback_data: `PARO:${cleanMac}` }
        ]
      ]
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    return { success: data.ok, data };
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn('[TELEGRAM] Fallo enviando alerta crítica interactiva:', e.message);
    return { success: false, error: e.message };
  }
};
