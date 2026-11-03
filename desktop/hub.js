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
    ts INTEGER DEFAULT (strftime('%s','now')*1000));`);
  const insTel = db.prepare('INSERT INTO telemetria(mac,datos) VALUES(?,?)');
  const insEvt = db.prepare('INSERT INTO eventos(mac,tipo,datos) VALUES(?,?,?)');

  // ── Broker MQTT local (puerto LAN) ──
  const aedes = Aedes();
  const mqttServer = net.createServer(aedes.handle);
  mqttServer.listen(MQTT_PORT, () => console.log(`[HUB] MQTT local :${MQTT_PORT}`));

  const devices = new Map(); // mac → {mac,ip,alias,tipo,fw,lastSeen}
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
      const prev = devices.get(mac) || {};
      devices.set(mac, { ...prev, mac, ip: prev.ip || '?', lastSeen: Date.now(), datos: msg });
      insTel.run(mac, JSON.stringify(msg));
      // Canal = tramo del topic tras autoclave_med_2026/<MAC>/ — la web
      // consume el mismo contrato que por la nube (telemetria, meta, esquema…)
      const parts = String(packet.topic || '').split('/');
      const channel = parts.length > 2 ? parts.slice(2).join('/') : 'telemetria';
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
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ tipo: 'hub_ok', devices: [...devices.values()] }));
    ws.on('close', () => wsClients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw);
        if (m.tipo === 'comando' && m.mac && m.comando) {
          const ok = sendCommand(m.mac, m.comando);
          try { ws.send(JSON.stringify({ tipo: 'comando_ack', mac: m.mac, ok })); } catch (_) {}
        }
      } catch (_) {}
    });
  });

  // ── Descubrimiento UDP ──
  const udp = dgram.createSocket('udp4');
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
          devices.set(dev.mac, { ...(devices.get(dev.mac) || {}), ...dev });
          broadcast({ tipo: 'device_found', dev });
        }
        // Responder también a announces: así la placa nos descubre aunque
        // su broadcast de "discover" nunca nos haya llegado.
        udp.send(hubInfo(), rinfo.port, rinfo.address, () => {});
      }
    } catch (_) {}
  });
  udp.bind(DISCOVERY_PORT, () => {
    try { udp.setBroadcast(true); } catch (_) {}
    console.log(`[HUB] UDP discovery :${DISCOVERY_PORT}`);
    // Presencia periódica por broadcast: las placas que se conecten tarde
    // nos encuentran sin tener que preguntar.
    setInterval(() => {
      const msg = Buffer.from(hubInfo());
      lanBroadcasts().forEach((b) => udp.send(msg, DISCOVERY_PORT, b, () => {}));
    }, HUB_ANNOUNCE_MS).unref();
  });

  // Escáner: broadcast de pregunta por toda la LAN
  const scanLan = () => {
    const ask = Buffer.from(JSON.stringify({ biofleet: 'discover', ts: Date.now() }));
    lanBroadcasts().forEach((bcast) => udp.send(ask, DISCOVERY_PORT, bcast));
    return { scanning: true, known: [...devices.values()] };
  };

  cb({
    scanLan,
    sendCommand,
    status: () => ({ online: true, devices: devices.size, mqtt: MQTT_PORT, ws: WS_PORT, udp: DISCOVERY_PORT }),
    db
  });
};
