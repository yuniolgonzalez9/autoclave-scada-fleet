import { cleanMac, getAdminClient } from './_lib/session.js';

async function tg(method, body) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Webhook de Telegram activo');

  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || req.headers['x-telegram-bot-api-secret-token'] !== expected) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const query = req.body?.callback_query;
  if (!query) return res.status(200).json({ ok: true });

  const allowedChat = String(process.env.TELEGRAM_CHAT_ID || '');
  if (String(query.message?.chat?.id) !== allowedChat) return res.status(200).json({ ok: true });

  const [action, rawMac] = String(query.data || '').split(':');
  const mac = cleanMac(rawMac);
  const who = String(query.from?.first_name || 'Operador Telegram').slice(0, 60);
  if (!['ACK', 'PARO'].includes(action) || !mac) return res.status(200).json({ ok: true });

  try {
    const admin = getAdminClient();
    await admin.from('auditoria_accesos').insert([{
      usuario: who,
      rol: 'TELEGRAM',
      evento: action === 'ACK' ? 'ACK_TELEGRAM' : 'PARO_TELEGRAM',
      dispositivo: mac,
      detalles: `Telegram user id ${query.from?.id}`
    }]);

    await tg('answerCallbackQuery', {
      callback_query_id: query.id,
      text: action === 'ACK' ? `Alarma confirmada por ${who}.` : `Paro de emergencia registrado para ${mac}.`,
      show_alert: true
    });

    if (action === 'ACK') {
      await tg('editMessageText', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        text: `🔕 <b>ALARMA CONFIRMADA</b>\n\n👤 <b>Operador:</b> ${who}\n📟 <b>Equipo:</b> <code>${mac}</code>\n⏰ ${new Date().toISOString()}`
      });
    }
  } catch (err) {
    console.error('[TELEGRAM WEBHOOK]', err);
  }
  return res.status(200).json({ ok: true });
}
