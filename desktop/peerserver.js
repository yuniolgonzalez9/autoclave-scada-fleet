// peerserver.js — cada Hub sirve su caché local a otros PCs en la LAN.
// Servidor HTTP :9782 (solo GET estático) + descubrimiento UDP :4211
// (anuncio periódico + tabla de pares con TTL). Un PC con internet baja
// el build nuevo y lo propaga a todos los Hubs de la red — cada nodo
// instalado agranda el "servidor" colectivo de la aplicación.
const { app } = require('electron');
const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');

const PEER_PORT = 9782;
const DISC_PORT = 4211;
const ANNOUNCE_MS = 10000;
const PEER_TTL_MS = 35000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
  '.txt': 'text/plain', '.webmanifest': 'application/manifest+json'
};

const dir = () => path.join(app.getPath('userData'), 'web-cache');
const metaFile = () => path.join(dir(), '_hub-meta.json');

const readMeta = () => {
  try { return JSON.parse(fs.readFileSync(metaFile(), 'utf8')); } catch (_) { return {}; }
};

const peers = new Map(); // "ip:port" -> { ip, port, build, ts }

// ── Servidor de archivos de la caché (solo GET, confinado a web-cache) ──
function startPeerServer() {
  const srv = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/peerinfo') {
        const meta = readMeta();
        let files = 0;
        try { files = countFiles(dir()); } catch (_) {}
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ hub: 'biofleet', build: meta.build || null, files }));
      }
      const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const f = path.join(dir(), rel);
      if (rel.includes('..') || !f.startsWith(dir()) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    } catch (_) { try { res.writeHead(500); res.end(); } catch (e) {} }
  });
  srv.on('error', (e) => console.log('[PEER] server error:', e.message));
  srv.listen(PEER_PORT, '0.0.0.0', () => console.log(`[PEER] sirviendo caché web en :${PEER_PORT}`));
  return srv;
}

function countFiles(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(d, e.name));
    else if (e.name !== '_hub-meta.json') n++;
  }
  return n;
}

// ── Descubrimiento de pares por UDP broadcast ──
function startPeerDiscovery() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', (e) => console.log('[PEER] udp error:', e.message));
  sock.on('message', (buf, rinfo) => {
    try {
      const m = JSON.parse(buf.toString());
      if (m.t !== 'bf-hub') return;
      const key = `${rinfo.address}:${m.port || PEER_PORT}`;
      peers.set(key, { ip: rinfo.address, port: m.port || PEER_PORT, build: m.build || null, ts: Date.now() });
    } catch (_) {}
  });
  sock.bind(DISC_PORT, () => {
    try { sock.setBroadcast(true); } catch (_) {}
    const announce = () => {
      try {
        const msg = Buffer.from(JSON.stringify({ t: 'bf-hub', port: PEER_PORT, build: readMeta().build || null }));
        sock.send(msg, 0, msg.length, DISC_PORT, '255.255.255.255', () => {});
      } catch (_) {}
    };
    announce();
    setInterval(announce, ANNOUNCE_MS).unref();
  });
  // Limpieza de pares caducados
  setInterval(() => {
    const now = Date.now();
    for (const [k, p] of peers) if (now - p.ts > PEER_TTL_MS) peers.delete(k);
  }, 15000).unref();
  return sock;
}

const getPeers = () =>
  [...peers.values()].sort((a, b) => String(b.build || '').localeCompare(String(a.build || '')));

// GET simple a un par con timeout corto
function peerGet(peer, urlPath, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const r = http.get({ host: peer.ip, port: peer.port, path: urlPath, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
  });
}

// Un archivo desde el primer par que lo tenga
async function fetchFromPeers(urlPath) {
  for (const p of getPeers()) {
    const buf = await peerGet(p, urlPath);
    if (buf && buf.length) return buf;
  }
  return null;
}

// Sincronizar la caché local DESDE otro Hub de la LAN (propagación offline)
async function syncFromPeers() {
  for (const p of getPeers()) {
    try {
      const vbuf = await peerGet(p, '/version.json', 1500);
      if (!vbuf) continue;
      const v = JSON.parse(vbuf.toString());
      const meta = readMeta();
      if (!v.build || v.build === meta.build) continue;

      const hbuf = await peerGet(p, '/', 2000);
      if (!hbuf) continue;
      fs.mkdirSync(dir(), { recursive: true });
      fs.writeFileSync(path.join(dir(), 'index.html'), hbuf);
      fs.writeFileSync(path.join(dir(), 'version.json'), vbuf);

      const html = hbuf.toString();
      const refs = new Set(['/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png']);
      for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) refs.add(m[1]);
      for (const ref of refs) {
        const b = await peerGet(p, ref, 2500);
        if (!b) continue;
        const rel = ref.replace(/^\/+/, '');
        const f = path.join(dir(), rel);
        if (rel.includes('..')) continue;
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, b);
      }
      fs.writeFileSync(metaFile(), JSON.stringify({ build: v.build, syncedAt: Date.now(), via: 'peer:' + p.ip }));
      return { updated: true, build: v.build, via: p.ip };
    } catch (_) {}
  }
  return { updated: false };
}

module.exports = { startPeerServer, startPeerDiscovery, getPeers, fetchFromPeers, syncFromPeers };
