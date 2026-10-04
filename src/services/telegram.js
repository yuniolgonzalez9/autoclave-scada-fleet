const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8902369071:AAFuFn3R1b6k9_y_2w3XKPc92npVRUkee0s';
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '685508990';

let ultimoEnvioAlarma = 0;

// Envío general de mensajes
export const sendTelegramAlert = async (mensaje) => {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: mensaje,
        parse_mode: 'HTML'
      })
    });
    return await response.json();
  } catch (error) {
    console.warn('Alerta Telegram en modo local:', error);
  }
};

// Envío de Alarma Crítica con Botones Interactivos [ACK / SILENCIAR]
export const sendCriticalAlarmWithButtons = async ({ mac, alias, temp, pres, fase, errorMsg }) => {
  const ahora = Date.now();
  if (ahora - ultimoEnvioAlarma < 45000) return; // Anti-spam de 45 segundos
  ultimoEnvioAlarma = ahora;

  const texto = 
    `🚨 <b>¡ALARMA CRÍTICA EN AUTOCLAVE!</b> 🚨\n\n` +
    `🏥 <b>Equipo:</b> ${alias || mac}\n` +
    `📟 <b>Dirección MAC:</b> <code>${mac}</code>\n` +
    `⚠️ <b>Fallo:</b> <b>${errorMsg || 'Parámetros críticos fuera de rango'}</b>\n` +
    `🌡️ <b>Temperatura:</b> ${(temp || 0).toFixed(1)} °C\n` +
    `💨 <b>Presión:</b> ${(pres || 0).toFixed(2)} Bar\n` +
    `⏱️ <b>Fase:</b> ${fase || 'CRÍTICA'}\n` +
    `🕒 <b>Hora:</b> ${new Date().toLocaleTimeString()}\n\n` +
    `👇 <b>Presiona abajo para silenciar la sirena de la estación:</b>`;

  const payload = {
    chat_id: CHAT_ID,
    text: texto,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔕 🆗 CONFIRMAR / SILENCIAR', callback_data: `ACK:${mac}` },
          { text: '🛑 PARO EMERGENCIA', callback_data: `PARO:${mac}` }
        ]
      ]
    }
  };

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Fallo enviando alerta interactiva a Telegram:', e);
  }
};
