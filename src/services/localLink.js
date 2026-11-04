// Enlace local WebSocket al Hub Biofleet (:9781).
// La web dentro del exe (o servida desde http://<hub>:9782 en la LAN) recibe
// la telemetría por esta ruta aunque no haya internet; con nube disponible,
// ambas rutas corren en paralelo y se fusionan en el mismo stream de paquetes.
const WS_PORT = 9781;
const RECONNECT_MS = 4000;

function candidateUrls() {
  const urls = [];
  const host = typeof location !== 'undefined' ? location.hostname : '';
  // La web servida por el propio Hub (peer server :9782) habla con ese host
  if (host && host !== 'localhost' && host !== '127.0.0.1' && location.protocol === 'http:') {
    urls.push(`ws://${host}:${WS_PORT}`);
  }
  // Hub en la misma PC (exe, dev, o web abierta localmente)
  urls.push(`ws://127.0.0.1:${WS_PORT}`);
  return urls;
}

const topicOf = (mac, channel) => `autoclave_med_2026/${mac}/${channel}`;

export function connectLocalLink(onPacket, onStatus) {
  const urls = candidateUrls();
  let ws = null;
  let destroyed = false;
  let idx = 0;
  let retryTimer = null;
  let up = false;
  // El Hub exige autenticar el socket antes de aceptar comandos (un
  // cliente LAN cualquiera ya no puede actuar sobre los equipos).
  // El token solo se expone a la web dentro del exe vía preload.
  let needsAuth = false;
  let authed = false;
  const pendingAcks = new Map(); // mac -> resolve

  const requestAuth = () => {
    try {
      const get = window.biofleetHub?.localToken;
      if (typeof get !== 'function') return;
      Promise.resolve(get()).then((token) => {
        if (token && ws && ws.readyState === WebSocket.OPEN && !authed) {
          ws.send(JSON.stringify({ tipo: 'auth', token }));
        }
      }).catch(() => {});
    } catch (_) {}
  };

  const setUp = (v) => {
    if (v === up) return;
    up = v;
    if (onStatus) onStatus(v);
  };

  const emit = (mac, channel, payload, isRetained = false, hubReplay = false) => {
    if (!mac || !channel || payload === undefined) return;
    onPacket({ mac, channel, payload, topic: topicOf(mac, channel), isRetained, hubReplay });
  };

  const emitDeviceSnapshot = (d, retained) => {
    if (!d || !d.mac) return;
    if (d.datos) emit(d.mac, 'telemetria', d.datos, retained);
    emit(d.mac, 'meta', { mac: d.mac, alias: d.alias, tipo: d.tipo, version: d.fw }, true);
  };

  const handleMessage = (raw) => {
    const m = JSON.parse(raw);
    if (m.tipo === 'mqtt' && m.mac && m.channel) {
      // replay=true: reporte bufferado del Hub reenviado para sync a nube.
      // Viaja como retenido para no marcar el equipo "vivo" ni pisar datos
      // frescos, pero hubReplay permite persistirlo y acusar recibo.
      emit(m.mac, m.channel, m.payload, Boolean(m.replay), Boolean(m.replay));
    } else if (m.tipo === 'telemetria' && m.mac) {
      emit(m.mac, 'telemetria', m.datos, false);
    } else if (m.tipo === 'hub_ok' && Array.isArray(m.devices)) {
      // Hubs actualizados exigen auth; los antiguos no anuncian el flag
      // y aceptan comandos directamente (compatibilidad hacia atrás).
      needsAuth = Boolean(m.auth_required);
      if (needsAuth) requestAuth();
      // Snapshot del Hub: datos en caché, no marca el equipo como "vivo"
      m.devices.forEach((d) => emitDeviceSnapshot(d, true));
    } else if (m.tipo === 'auth_ok') {
      authed = true;
    } else if (m.tipo === 'device_found') {
      emitDeviceSnapshot(m.dev, true);
    } else if (m.tipo === 'comando_ack' && m.mac) {
      const key = String(m.mac).toUpperCase();
      const res = pendingAcks.get(key);
      if (res) { pendingAcks.delete(key); res(m.ok !== false); }
    }
  };

  const schedule = () => {
    if (destroyed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, RECONNECT_MS);
  };

  const open = () => {
    if (destroyed) return;
    const url = urls[idx % urls.length];
    try {
      ws = new WebSocket(url);
    } catch (_) {
      idx += 1;
      schedule();
      return;
    }
    ws.onopen = () => setUp(true);
    ws.onclose = () => {
      setUp(false);
      authed = false;
      ws = null;
      idx += 1;
      schedule();
    };
    ws.onerror = () => { try { ws && ws.close(); } catch (_) {} };
    ws.onmessage = (ev) => { try { handleMessage(ev.data); } catch (_) {} };
  };

  open();

  const send = (mac, comando) => {
    // Sin auth el Hub rechaza el comando: se devuelve false para que el
    // emisor use la ruta de nube (que sí verifica usuario y permiso).
    if (!ws || ws.readyState !== WebSocket.OPEN || (needsAuth && !authed)) return Promise.resolve(false);
    try {
      ws.send(JSON.stringify({ tipo: 'comando', mac, comando }));
    } catch (_) {
      return Promise.resolve(false);
    }
    const key = String(mac).toUpperCase();
    return new Promise((resolve) => {
      pendingAcks.set(key, resolve);
      // Optimista: si el Hub no manda ack en 900ms, asumir entregado
      setTimeout(() => { if (pendingAcks.delete(key)) resolve(true); }, 900);
    });
  };

  // La web confirma al Hub que un reporte bufferado ya subió a la nube;
  // el Hub lo marca synced y deja de reenviarlo.
  const ackReporte = (sessionId) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionId) return false;
    try {
      ws.send(JSON.stringify({ tipo: 'reporte_synced', session_id: String(sessionId) }));
      return true;
    } catch (_) {
      return false;
    }
  };

  return {
    send,
    ackReporte,
    isUp: () => up,
    end: () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws && ws.close(); } catch (_) {}
      pendingAcks.forEach((res) => res(false));
      pendingAcks.clear();
    }
  };
}
