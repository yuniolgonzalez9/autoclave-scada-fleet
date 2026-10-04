import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gjtqyodpgwfvfvkhlhik.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHF5b2RwZ3dmdmZ2a2hsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDAzNTYsImV4cCI6MjEwNTYxNjM1Nn0.g8t_PbEityaneKkOUHttQ_cZv50aczLU4Z9la8R4d_g';
const TELEGRAM_BOT_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN || '8902369071:AAFuFn3R1b6k9_y_2w3XKPc92npVRUkee0s';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook de Telegram Activo');
  }

  const update = req.body;

  // Si el usuario presionó un botón inline en Telegram
  if (update && update.callback_query) {
    const callbackData = update.callback_query.data || '';
    const chatId = update.callback_query.message.chat.id;
    const messageId = update.callback_query.message.message_id;
    const userName = update.callback_query.from.first_name || 'Operador Telegram';

    // 1. Botón Silenciar Sirena (ACK)
    if (callbackData.startsWith('ACK:')) {
      const mac = callbackData.split('ACK:')[1];

      // Registrar en Supabase para que la web silencie la sirena en tiempo real
      await supabase.from('auditoria_accesos').insert([{
        usuario_email: userName,
        evento: 'ACK_TELEGRAM',
        dispositivo: 'Telegram Bot (Móvil)',
        fecha_hora: new Date().toISOString()
      }]);

      // Responder a Telegram para quitar el reloj de carga del botón
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: update.callback_query.id,
          text: `🔕 Alarma silenciada con éxito en cabina por ${userName}.`,
          show_alert: true
        })
      });

      // Editar el mensaje original en Telegram para confirmar
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: `🔕 <b>ALARMA CONFIRMADA & SILENCIADA</b>\n\n` +
                `👤 <b>Operador:</b> ${userName}\n` +
                `📟 <b>Equipo MAC:</b> <code>${mac}</code>\n` +
                `⏰ <b>Hora:</b> ${new Date().toLocaleTimeString()}\n` +
                `✅ La sirena de la estación ha sido apagada de forma remota.`,
          parse_mode: 'HTML'
        })
      });

      return res.status(200).json({ ok: true });
    }

    // 2. Botón Paro de Emergencia
    if (callbackData.startsWith('PARO:')) {
      const mac = callbackData.split('PARO:')[1];

      await supabase.from('auditoria_accesos').insert([{
        usuario_email: userName,
        evento: 'PARO_TELEGRAM',
        dispositivo: 'Telegram Bot (Móvil)',
        fecha_hora: new Date().toISOString()
      }]);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: update.callback_query.id,
          text: `🛑 PARO DE EMERGENCIA REGISTRADO para el equipo ${mac}.`,
          show_alert: true
        })
      });

      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ status: 'ok' });
}
