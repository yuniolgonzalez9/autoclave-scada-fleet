// Hub local: broker MQTT LAN + descubrimiento UDP + SQLite + WS para la web.
const { app } = require('electron');
const Aedes = require('aedes');
const net = require('net');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const fs = require('fs');

const DISCOVERY_PORT = 4210;
const WS_PORT = 9781;
const MQTT_PORT = 1883;

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

  aedes.on('publish', (packet, client) => {
    if (!client) return;
    try {
      const msg = JSON.parse(packet.payload.toString());
      const mac = (msg.mac || msg.id || '').toUpperCase();
      if (!mac) return;
      const prev = devices.get(mac) || {};
      devices.set(mac, { ...prev, mac, ip: prev.ip || '?', lastSeen: Date.now(), datos: msg });
      insTel.run(mac, JSON.stringify(msg));
      broadcast({ tipo: 'telemetria', mac, datos: msg });
    } catch (_) {}
  });

  // ── WS: la web dentro del exe se conecta al hub ──
  const wss = new WebSocketServer({ port: WS_PORT });
  const broadcast = (obj) => {
    const s = JSON.stringify(obj);
    wsClients.forEach((c) => { try { c.send(s); } catch (_) {} });
  };
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ tipo: 'hub_ok', devices: [...devices.values()] }));
    ws.on('close', () => wsClients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw);
        if (m.tipo === 'comando' && m.mac && m.comando) {
          aedes.publish({
            topic: `biofleet/${m.mac}/cmd`,
            payload: JSON.stringify(m.comando),
            qos: 1
          });
        }
      } catch (_) {}
    });
  });

  // ── Descubrimiento UDP ──
  const udp = dgram.createSocket('udp4');
  udp.on('message', (raw, rinfo) => {
    try {
      const m = JSON.parse(raw);
      if (m.biofleet === 'announce' || m.biofleet === 'hello') {
        const dev = { mac: m.mac, ip: rinfo.address, alias: m.alias || '', tipo: m.tipo || '', fw: m.fw || '', lastSeen: Date.now() };
        devices.set(dev.mac, { ...(devices.get(dev.mac) || {}), ...dev });
        broadcast({ tipo: 'device_found', dev });
      }
    } catch (_) {}
  });
  udp.bind(DISCOVERY_PORT, () => console.log(`[HUB] UDP discovery :${DISCOVERY_PORT}`));

  // Escáner: broadcast de pregunta por toda la LAN
  const scanLan = () => {
    const ask = Buffer.from(JSON.stringify({ biofleet: 'discover', ts: Date.now() }));
    const nets = os.networkInterfaces();
    Object.values(nets).flat().forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) {
        const bcast = n.address.split('.').slice(0, 3).join('.') + '.255';
        udp.send(ask, DISCOVERY_PORT, bcast);
      }
    });
    return { scanning: true, known: [...devices.values()] };
  };

  const sendCommand = (mac, cmd) => {
    aedes.publish({ topic: `biofleet/${mac}/cmd`, payload: JSON.stringify(cmd), qos: 1 });
    insEvt.run(mac, 'cmd', JSON.stringify(cmd));
    return true;
  };

  cb({
    scanLan,
    sendCommand,
    status: () => ({ online: true, devices: devices.size, mqtt: MQTT_PORT, ws: WS_PORT, udp: DISCOVERY_PORT }),
    db
  });
};
