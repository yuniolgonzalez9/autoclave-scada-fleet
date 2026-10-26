import { applyCors, requireActor, sendError } from './_lib/session.js';

// Entrega al navegador (solo con sesión activa) la credencial MQTT de
// lectura. La credencial con permiso de publicar nunca sale del servidor.
export default async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    await requireActor(req);
    const url = process.env.MQTT_BROKER_URL || process.env.VITE_MQTT_BROKER_URL;
    const username = process.env.MQTT_VIEWER_USER || process.env.VITE_MQTT_USER;
    const password = process.env.MQTT_VIEWER_PASS || process.env.VITE_MQTT_PASS;
    if (!url || !username || !password) {
      return res.status(503).json({ error: 'MQTT no está configurado en el servidor.' });
    }
    return res.status(200).json({ url, username, password });
  } catch (err) {
    return sendError(res, err);
  }
}
