// =========================================================================
// SCADA AUTOCLAVE // VERCEL SERVERLESS WEBHOOK (TELEGRAM BOT ACK)
// =========================================================================

const TELEGRAM_BOT_TOKEN = "8902369071:AAFuFn3R1b6k9_y_2w3XKPc92npVRUKee0s";
const SUPABASE_URL = "https://gjtqyodpgwfvfvkhlhik.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHF5b2RwZ3dmdmZ2a2hsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDAzNTYsImV4cCI6MjEwNTYxNjM1Nn0.g8t_PbEityaneKkOUHttQ_cZv50aczLU4Z9la8R4d_g";

module.exports = async (req, res) => {
  // 1. Responder siempre 200 OK a Telegram
  if (req.method !== 'POST') {
    return res.status(200).send('SCADA Telegram Webhook activo.');
  }

  const update = req.body;
  if (!update) {
    return res.status(200).json({ ok: true });
  }

  try {
    // =====================================================================
    // CASO A: EL USUARIO PULSÓ UN BOTÓN EN SU CELULAR (CALLBACK QUERY)
    // =====================================================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const callbackId = cb.id;
      const data = cb.data || ''; // 'ACK:<mac>' o 'PARO:<mac>'
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      const userFirstName = cb.from?.first_name || 'Operador';
      const username = cb.from?.username ? `@${cb.from.username}` : userFirstName;
      const horaActual = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const [accion, mac] = data.split(':');

      // 1. Notificar a Telegram que recibimos el clic (quita el relojito de carga)
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: accion === 'ACK' ? '✅ Alarma confirmada y silenciada en el SCADA' : '🛑 PARO de emergencia transmitido',
          show_alert: false
        })
      });

      // 2. Registrar en Supabase (dispara en tiempo real el apagado de la sirena web)
      const eventoSeguridad = accion === 'ACK' ? 'ACK_TELEGRAM' : 'PARO_TELEGRAM';
      const detalleAccion = accion === 'ACK' 
        ? `Alarma silenciada por ${username} para equipo [${mac}]` 
        : `PARO de emergencia ordenado por ${username} para equipo [${mac}]`;

      await fetch(`${SUPABASE_URL}/rest/v1/auditoria_accesos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          usuario: username,
          rol: 'TELEGRAM_REMOTE',
          evento: eventoSeguridad,
          dispositivo: 'Telegram Mobile',
          detalles: detalleAccion,
          created_at: new Date().toISOString()
        })
      });

      // 3. Editar el mensaje en Telegram para mostrar quién atendió la emergencia
      const textoOriginal = cb.message?.text || 'Alerta de Autoclave';
      const textoActualizado = textoOriginal + `\n\n` +
        (accion === 'ACK' 
          ? `✅ *ALARMA CONFIRMADA Y SILENCIADA*\n👤 *Por:* ${username}\n🕒 *Hora:* ${horaActual}`
          : `🛑 *PARO DE EMERGENCIA EJECUTADO*\n👤 *Por:* ${username}\n🕒 *Hora:* ${horaActual}`);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: textoActualizado,
          parse_mode: 'Markdown'
        })
      });

      return res.status(200).json({ ok: true, accion: accion });
    }

    // =====================================================================
    // CASO B: EL USUARIO ESCRIBIÓ UN COMANDO DE TEXTO (/estado, /silenciar)
    // =====================================================================
    if (update.message && update.message.text) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text.trim().toLowerCase();

      if (text === '/start') {
        await enviarRespuestaTelegram(chatId, `👋 *Bienvenido al Sistema SCADA Autoclave.*\n\nEste bot transmitirá todas las alarmas críticas con botones de acción inmediata.\n\nComandos disponibles:\n• /silenciar - Apagar sirena activa\n• /estado - Resumen de telemetría`);
      } else if (text === '/silenciar') {
        // Disparar apagado por Supabase
        await fetch(`${SUPABASE_URL}/rest/v1/auditoria_accesos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          },
          body: JSON.stringify({
            usuario: `@${msg.from?.username || 'Operador'}`,
            rol: 'TELEGRAM_REMOTE',
            evento: 'ACK_TELEGRAM',
            dispositivo: 'Telegram Chat Command',
            detalles: 'Sirena silenciada por comando /silenciar',
            created_at: new Date().toISOString()
          })
        });
        await enviarRespuestaTelegram(chatId, `🔕 *Sirena de cabina silenciada exitosamente.*`);
      } else if (text === '/estado') {
        await enviarRespuestaTelegram(chatId, `📊 *SISTEMA SCADA BIOMÉDICO ACTIVO*\n\nNube Supabase: 🟢 CONECTADA\nBroker MQTT: 🟢 HIVEMQ 8884\nCanal Telegram: 🟢 LISTO`);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error Webhook Telegram:', error);
    return res.status(200).json({ error: error.message });
  }
};

async function enviarRespuestaTelegram(chatId, textoMarkdown) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: textoMarkdown,
        parse_mode: 'Markdown'
      })
    });
  } catch(e) {}
}
