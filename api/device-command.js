import mqtt from 'mqtt';
import { OPERATOR_ROLES, PRIVILEGED_ROLES, HttpError, applyCors, canAccessMac, cleanMac, requireActor, sendError } from './_lib/session.js';

const TOPIC_PREFIX = 'autoclave_med_2026';
const MAX_PAYLOAD = 16 * 1024;

// Cliente MQTT reutilizado entre invocaciones "calientes": antes cada
// comando abría una conexión nueva (cientos de ms de handshake y un
// clientId distinto por comando en el broker).
let pooled = null;
let pooledKey = '';

function getPooledClient(url, username, password) {
  const key = `${url}|${username}`;
  if (pooled && pooledKey === key && !pooled.disconnected && !pooled.ended) return pooled;
  try { pooled?.end(true); } catch (_) {}
  pooledKey = key;
  pooled = mqtt.connect(url, {
    clientId: `SRV_${Math.random().toString(36).slice(2, 10)}`,
    username,
    password,
    clean: true,
    keepalive: 30,
    connectTimeout: 6000,
    reconnectPeriod: 5000
  });
  // 'error' sin listener tumba el proceso: el handler vive aquí y cada
  // publicación añade el suyo para el intento concreto.
  pooled.on('error', () => {});
  pooled.on('close', () => {
    if (pooled && (pooled.ended || pooled.disconnected)) pooled = null;
  });
  return pooled;
}

function publishOnce({ topic, payload, retain }) {
  const url = process.env.MQTT_BROKER_URL || process.env.VITE_MQTT_BROKER_URL;
  const username = process.env.MQTT_SERVER_USER || process.env.VITE_MQTT_USER;
  const password = process.env.MQTT_SERVER_PASS || process.env.VITE_MQTT_PASS;
  if (!url || !username || !password) throw new HttpError(503, 'MQTT no está configurado en el servidor.');

  return new Promise((resolve, reject) => {
    const client = getPooledClient(url, username, password);
    const timer = setTimeout(() => {
      cleanup();
      reject(new HttpError(504, 'El broker MQTT no respondió.'));
    }, 9000);
    const cleanup = () => {
      clearTimeout(timer);
      client.off('connect', onConnect);
      client.off('error', onError);
    };
    const publish = () => {
      client.publish(topic, payload, { qos: 1, retain }, (err) => {
        cleanup();
        if (err) reject(new HttpError(502, `No se pudo publicar: ${err.message}`));
        else resolve();
      });
    };
    const onConnect = () => publish();
    const onError = (err) => {
      cleanup();
      reject(new HttpError(502, `Broker MQTT: ${err.message}`));
    };
    if (client.connected) publish();
    else {
      client.once('connect', onConnect);
      client.once('error', onError);
    }
  });
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    const { admin, profile } = await requireActor(req, { roles: OPERATOR_ROLES });
    const { mac, command, retain } = req.body || {};
    const target = cleanMac(mac);
    if (!target) throw new HttpError(400, 'Equipo no indicado.');
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new HttpError(400, 'Comando no válido.');
    }
    if (target === 'ALL') {
      if (!PRIVILEGED_ROLES.includes(profile.role)) throw new HttpError(403, 'Solo administración puede enviar a toda la flota.');
    } else if (!(await canAccessMac(admin, profile, target))) {
      throw new HttpError(403, 'No tienes permiso sobre este equipo.');
    }

    const payload = JSON.stringify(command);
    if (payload.length > MAX_PAYLOAD) throw new HttpError(413, 'Comando demasiado grande.');
    const shouldRetain = typeof retain === 'boolean' ? retain : !command.cmd;

    await publishOnce({ topic: `${TOPIC_PREFIX}/${target}/config`, payload, retain: shouldRetain });

    await admin.from('auditoria_accesos').insert([{
      usuario: profile.username,
      rol: profile.role,
      evento: 'COMANDO_EQUIPO',
      dispositivo: target,
      detalles: payload.slice(0, 2000)
    }]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}
