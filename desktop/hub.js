// Hub local: broker MQTT LAN + descubrimiento UDP + SQLite + WS para la web.
// Ruta local ESP32↔Hub↔web: la placa descubre este Hub por UDP :4210,
// conecta al broker :1883 y la web recibe todo por WS :9781 — con o sin internet.
const { app } = require('electron');
const Aedes = require('aedes');
const net = require('net');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const fs = require('fs');

const DISCOVERY_PORT = Number(process.env.BIOFLEET_DISC_PORT) || 4210;
const WS_PORT = Number(process.env.BIOFLEET_WS_PORT) || 9781;
const MQTT_PORT = Number(process.env.BIOFLEET_MQTT_PORT) || 1883;
const TOPIC_PREFIX = 'autoclave_med_2026';
const HUB_ANNOUNCE_MS = 15000;
const HUB_ANNOUNCE_BURST_MS = 3000;   // arranque: presencia agresiva 45s
const HUB_ANNOUNCE_BURST_S = 45;
const MAX_DEVICES = 256;              // tope defensivo del directorio LAN
const REPORT_REPLAY_MS = 45000;       // reintento de sync de reportes pendientes
const REPORT_REPLAY_BATCH = 20;
const TELEMETRY_TTL_MS = 24 * 3600 * 1000; // datalog local: conservar 24h

exports.startHub = (cb) => {
  // ── SQLite: registro local completo ──
  const dbDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, 'biofleet.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS telemetria(
    id INTEGER PRIMARY KEY AUTOINCREMENT, mac TEXT, datos TEXT,
    recibido_at INTEGER DEFAULT (strftime('%s','now')*1000));
    CREATE TABLE IF NOT EXISTS eventos(
    id INTEGER PRIMARY KEY AUTOINCREMENT, mac TEXT, tipo TEXT, datos TEXT,
    ts INTEGER DEFAULT (strftime('%s','now')*1000));
    CREATE TABLE IF NOT EXISTS reportes(
    session_id TEXT PRIMARY KEY, mac TEXT, payload TEXT,
    ts INTEGER DEFAULT (strftime('%s','now')*1000),
    synced INTEGER NOT NULL DEFAULT 0);`);
  const insTel = db.prepare('INSERT INTO telemetria(mac,datos) VALUES(?,?)');
  const insEvt = db.prepare('INSERT INTO eventos(mac,tipo,datos) VALUES(?,?,?)');
  const insRep = db.prepare('INSERT OR REPLACE INTO reportes(session_id,mac,payload) VALUES(?,?,?)');
  const markRep = db.prepare('UPDATE reportes SET synced=1 WHERE session_id=?');
  const qPending = db.prepare('SELECT session_id,mac,payload FROM reportes WHERE synced=0 ORDER BY ts LIMIT ?');
  const qPendingN = db.prepare('SELECT COUNT(*) n FROM reportes WHERE synced=0');

  // Poda del datalog local: 1 fila por paquete crece sin freno si el Hub
  // vive meses encendido. La telemetría histórica en nube no existe — el
  // valor local es el diagnóstico reciente, 24h alcanza.
  setInterval(() => {
    try { db.prepare('DELETE FROM telemetria WHERE recibido_at < ?').run(Date.now() - TELEMETRY_TTL_MS); } catch (_) {}
    try { db.prepare('DELETE FROM reportes WHERE synced=1 AND ts < ?').run(Date.now() - 7 * 24 * 3600 * 1000); } catch (_) {}
  }, 3600 * 1000).unref();

  // ── Broker MQTT local (puerto LAN) ──
  const aedes = Aedes();
  const mqttServer = net.createServer(aedes.handle);
  mqttServer.on('error', (e) => console.log(`[HUB] MQTT :${MQTT_PORT} no disponible (${e.code || e.message}) — ruta local MQTT deshabilitada`));
  mqttServer.listen(MQTT_PORT, () => console.log(`[HUB] MQTT local :${MQTT_PORT}`));

  const devices = new Map(); // mac → {mac,ip,alias,tipo,fw,lastSeen}
  const rememberDevice = (mac, dev) => {
    devices.set(mac, { ...(devices.get(mac) || {}), ...dev });
    // Tope defensivo: si el mapa se llena, expulsa al más viejo (stale).
    if (devices.size > MAX_DEVICES) {
      let stalest = null;
      devices.forEach((v, k) => { if (!stalest || v.lastSeen < stalest.v.lastSeen) stalest = { k, v }; });
      if (stalest) devices.delete(stalest.k);
    }
  };
  const wsClients = new Set();
  const broadcast = (obj) => {
    const s = JSON.stringify(obj);
    wsClients.forEach((c) => { try { c.send(s); } catch (_) {} });
  };

  aedes.on('publish', (packet, client) => {
    if (!client) return;
    try {
      const msg = JSON.parse(packet.payload.toString());
      const mac = (msg.mac || msg.id || '').toUpperCase();
      if (!mac) return;
      rememberDevice(mac, { mac, ip: devices.get(mac)?.ip || '?', lastSeen: Date.now(), datos: msg });
      insTel.run(mac, JSON.stringify(msg));
      // Canal = tramo del topic tras autoclave_med_2026/<MAC>/ — la web
      // consume el mismo contrato que por la nube (telemetria, meta, esquema…)
      const parts = String(packet.topic || '').split('/');
      const channel = parts.length > 2 ? parts.slice(2).join('/') : 'telemetria';
      // Reporte forense de fin de ciclo: buffer local para replay→sync a
      // nube cuando vuelva internet (la web upsertea por session_id).
      if (channel === 'reporte_paquete') {
        const sid = msg.session_id || `SES-${mac}-${Date.now()}`;
        insRep.run(sid, mac, JSON.stringify(msg));
      }
      broadcast({ tipo: 'mqtt', mac, channel, payload: msg, topic: packet.topic });
      if (channel === 'telemetria') broadcast({ tipo: 'telemetria', mac, datos: msg });
    } catch (_) {}
  });

  // Publica un comando al topic real de la placa (mismo contrato que la nube)
  const sendCommand = (mac, cmd) => {
    const cleanMac = String(mac || '').toUpperCase().replace(/[:-]/g, '');
    if (!cleanMac) return false;
    aedes.publish({
      topic: `${TOPIC_PREFIX}/${cleanMac}/config`,
      payload: JSON.stringify(cmd),
      qos: 1,
      retain: !(cmd && cmd.cmd) // legado sin "cmd" viaja retained, igual que /api/device-command
    });
    insEvt.run(cleanMac, 'cmd', JSON.stringify(cmd));
    return true;
  };

  // ── WS: la web dentro del exe se conecta al hub ──
  const wss = new WebSocketServer({ port: WS_PORT });
  wss.on('error', (e) => console.log(`[HUB] WS :${WS_PORT} no disponible (${e.code || e.message}) — enlace web local deshabilitado`));
  // Replay de reportes pendientes: la web los recibe como paquete normal
  // (canal reporte_paquete, flag replay) y los upsertea a Supabase con la
  // sesión del usuario — cumple RLS. Al confirmar manda reporte_synced y
  // el Hub marca la fila como subida. Idempotente por session_id.
  const replayPendingReports = () => {
    if (!wsClients.size) return;
    try {
      qPending.all(REPORT_REPLAY_BATCH).forEach((r) => {
        try {
          broadcast({ tipo: 'mqtt', mac: r.mac, channel: 'reporte_paquete', payload: JSON.parse(r.payload), replay: true });
        } catch (_) {}
      });
    } catch (_) {}
  };
  setInterval(replayPendingReports, REPORT_REPLAY_MS).unref();

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    let pendientes = 0;
    try { pendientes = qPendingN.get().n; } catch (_) {}
    ws.send(JSON.stringify({ tipo: 'hub_ok', devices: [...devices.values()], reportes_pendientes: pendientes }));
    ws.on('close', () => wsClients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw);
        if (m.tipo === 'comando' && m.mac && m.comando) {
          const ok = sendCommand(m.mac, m.comando);
          try { ws.send(JSON.stringify({ tipo: 'comando_ack', mac: m.mac, ok })); } catch (_) {}
        } else if (m.tipo === 'reporte_synced' && m.session_id) {
          try { markRep.run(String(m.session_id)); } catch (_) {}
        }
      } catch (_) {}
    });
  });

  // ── Descubrimiento UDP ──
  const udp = dgram.createSocket('udp4');
  udp.on('error', (e) => console.log(`[HUB] UDP :${DISCOVERY_PORT} no disponible (${e.code || e.message})`));
  const hubInfo = () => JSON.stringify({ biofleet: 'hub', mqtt: MQTT_PORT, ws: WS_PORT, v: 1 });

  const lanBroadcasts = () => {
    const out = [];
    const nets = os.networkInterfaces();
    Object.values(nets).flat().forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) {
        out.push(n.address.split('.').slice(0, 3).join('.') + '.255');
      }
    });
    return out;
  };

  udp.on('message', (raw, rinfo) => {
    try {
      const m = JSON.parse(raw);
      if (m.biofleet === 'discover') {
        // La placa pregunta → responder directo con nuestra identidad
        udp.send(hubInfo(), rinfo.port, rinfo.address, () => {});
        return;
      }
      if (m.biofleet === 'announce' || m.biofleet === 'hello') {
        const dev = { mac: m.mac, ip: rinfo.address, alias: m.alias || '', tipo: m.tipo || '', fw: m.fw || '', lastSeen: Date.now() };
        if (dev.mac) {
          rememberDevice(dev.mac, dev);
          broadcast({ tipo: 'device_found', dev });
        }
        // Responder también a announces: así la placa nos descubre aunque
        // su broadcast de "discover" nunca nos haya llegado.
        udp.send(hubInfo(), rinfo.port, rinfo.address, () => {});
      }
    } catch (_) {}
  });
  const hubStartedAt = Date.now();
  udp.bind(DISCOVERY_PORT, () => {
    try { udp.setBroadcast(true); } catch (_) {}
    console.log(`[HUB] UDP discovery :${DISCOVERY_PORT}`);
    // Presencia por broadcast: ráfaga cada 3s durante los primeros 45s
    // (las placas que arrancan con el Hub se vinculan sin esperar su
    // discover), luego cadencia normal cada 15s.
    const announce = () => {
      const msg = Buffer.from(hubInfo());
      lanBroadcasts().forEach((b) => udp.send(msg, DISCOVERY_PORT, b, () => {}));
    };
    const burst = setInterval(() => {
      announce();
      if (Date.now() - hubStartedAt > HUB_ANNOUNCE_BURST_S * 1000) clearInterval(burst);
    }, HUB_ANNOUNCE_BURST_MS);
    burst.unref();
    setInterval(announce, HUB_ANNOUNCE_MS).unref();
  });

  // Escáner real: {biofleet:'scan'} — el firmware responde announce al
  // instante (v12.2+); 'discover' se mantiene por compatibilidad. Se
  // esperan ~1.4s las respuestas y se devuelve la lista viva.
  const scanLan = () => new Promise((resolve) => {
    const scan = Buffer.from(JSON.stringify({ biofleet: 'scan', ts: Date.now() }));
    const legacy = Buffer.from(JSON.stringify({ biofleet: 'discover', ts: Date.now() }));
    lanBroadcasts().forEach((bcast) => {
      udp.send(scan, DISCOVERY_PORT, bcast, () => {});
      udp.send(legacy, DISCOVERY_PORT, bcast, () => {});
    });
    setTimeout(() => resolve({ scanning: true, known: [...devices.values()] }), 1400);
  });

  cb({
    scanLan,
    sendCommand,
    status: () => ({ online: true, devices: devices.size, mqtt: MQTT_PORT, ws: WS_PORT, udp: DISCOVERY_PORT }),
    db
  });
};
