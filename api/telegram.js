import { HttpError, OPERATOR_ROLES, applyCors, cleanMac, requireActor, sendError } from './_lib/session.js';

const PUBLIC_KINDS = new Set(['access_request', 'recovery_request', 'recovery_unknown']);
const ipHits = new Map();

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 300);
}

function rateLimit(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= 5) throw new HttpError(429, 'Demasiadas solicitudes. Intenta más tarde.');
  hits.push(now);
  ipHits.set(ip, hits);
}

function buildMessage(kind, data, actor) {
  switch (kind) {
    case 'access_request':
      return { text: `🆕 <b>NUEVA SOLICITUD DE ACCESO</b>\n\n👤 <b>Nombre:</b> ${esc(data.nombre)}\n🆔 <b>Usuario:</b> <code>${esc(data.usuario)}</code>\n🏥 <b>Área:</b> ${esc(data.departamento)}` };
    case 'recovery_request':
      return { text: `🔔 <b>SOLICITUD DE RECUPERACIÓN</b>\n\n🆔 <b>Identificador:</b> <code>${esc(data.identificador)}</code>\n\nGestione el restablecimiento desde el Centro de Personal.` };
    case 'recovery_unknown':
      return { text: `🚨 <b>ALERTA DE SEGURIDAD</b>\n\nIntento de recuperación con correo no registrado: <code>${esc(data.identificador)}</code>` };
    case 'critical_alarm': {
      const mac = cleanMac(data.mac);
      return {
        text: `🚨 <b>ALARMA CRÍTICA</b>\n\n📟 <b>Equipo:</b> ${esc(data.alias || mac)} (<code>${esc(mac)}</code>)\n⚠️ <b>Falla:</b> ${esc(data.errorMsg)}\n🌡️ <b>Temp:</b> ${Number(data.temp || 0).toFixed(1)} °C\n📈 <b>Presión:</b> ${Number(data.pres || 0).toFixed(2)} bar\n🔄 <b>Fase:</b> ${esc(data.fase)}\n👤 <b>Detectado por:</b> ${esc(actor?.username)}`,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔕 Silenciar (ACK)', callback_data: `ACK:${mac}` },
            { text: '🛑 Paro de emergencia', callback_data: `PARO:${mac}` }
          ]]
        }
      };
    }
    case 'text':
      return { text: esc(data.text).slice(0, 1500) };
    default:
      throw new HttpError(400, 'Tipo de mensaje no permitido.');
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    const { kind, data = {} } = req.body || {};
    let actor = null;
    if (PUBLIC_KINDS.has(kind)) {
      rateLimit(req);
    } else {
      ({ profile: actor } = await requireActor(req, { roles: OPERATOR_ROLES }));
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new HttpError(503, 'Telegram no está configurado en el servidor.');

    const message = buildMessage(kind, data, actor);
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, parse_mode: 'HTML', ...message })
    });
    if (!tg.ok) throw new HttpError(502, 'Telegram rechazó el mensaje.');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}
