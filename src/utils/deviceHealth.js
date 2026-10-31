// Salud de conexión de un equipo según el último paquete recibido.
// La placa publica telemetría cada ~800 ms: 8 s sin datos ya es latencia
// real y a partir de 15 s se considera desconexión (mismo umbral que usan
// Gestión, FOTA, Studio y la cabina).
export const HEALTH_ONLINE_MAX_S = 8;
export const HEALTH_LATENCY_MAX_S = 15;

export const HEALTH_RANK = { ONLINE: 0, LATENCY: 1, OFFLINE: 2 };

export function getDeviceHealth(dev, now = Date.now()) {
  if (!dev?.lastSeen) {
    return { status: 'OFFLINE', text: 'DESCONECTADO', timeAgo: 'Sin señal', tone: 'offline' };
  }
  const s = Math.max(0, Math.floor((now - dev.lastSeen) / 1000));
  if (s <= HEALTH_ONLINE_MAX_S) {
    return { status: 'ONLINE', text: 'EN LÍNEA', timeAgo: s <= 1 ? 'En vivo' : `Hace ${s}s`, tone: 'online' };
  }
  if (s <= HEALTH_LATENCY_MAX_S) {
    return { status: 'LATENCY', text: 'LATENCIA', timeAgo: `Hace ${s}s`, tone: 'latency' };
  }
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const timeAgo = h > 0 ? `Hace ${h}h` : m > 0 ? `Hace ${m}m` : `Hace ${s}s`;
  return { status: 'OFFLINE', text: 'DESCONECTADO', timeAgo, tone: 'offline' };
}

export function getDeviceType(dev) {
  return String(dev?.meta?.config_deseada?.tipo || dev?.meta?.tipo || dev?.datos?.tipo || 'AUTOCLAVE').toUpperCase();
}
