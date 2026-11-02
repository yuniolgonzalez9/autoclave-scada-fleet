// webcache.js — Hub híbrido: cada PC guarda una copia local viva de la web.
// Al arrancar consulta version.json remoto; si el build cambió descarga
// index.html + assets referenciados + sw.js. Las peticiones al origen se
// sirven desde disco (instantáneo y offline); los chunks lazy se cachean
// al vuelo (write-through). Cada instalación se vuelve un nodo con la app.
const { protocol, net, app } = require('electron');
const fs = require('fs');
const path = require('path');

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

function fileFor(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]);
  const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return null;
  return path.join(dir(), rel);
}

async function fetchText(url) {
  const r = await net.fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function fetchBuf(url) {
  const r = await net.fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Sincroniza la copia local con el servidor. Corre en segundo plano en
// cada arranque: si el build no cambió, no descarga nada (arranque rápido).
async function syncWebCache(webUrl) {
  try {
    const origin = new URL(webUrl).origin;
    const remoteV = JSON.parse(await fetchText(origin + '/version.json?t=' + Date.now()));

    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaFile(), 'utf8')); } catch (_) {}
    if (remoteV.build && meta.build === remoteV.build) {
      return { updated: false, build: remoteV.build };
    }

    fs.mkdirSync(dir(), { recursive: true });
    const html = await fetchText(origin + '/?t=' + Date.now());
    fs.writeFileSync(path.join(dir(), 'index.html'), html);
    fs.writeFileSync(path.join(dir(), 'version.json'), JSON.stringify(remoteV));

    const refs = new Set(['/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png']);
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) refs.add(m[1]);

    await Promise.all([...refs].map(async (p) => {
      try {
        const buf = await fetchBuf(origin + p);
        const f = fileFor(p);
        if (f) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); }
      } catch (_) {}
    }));

    fs.writeFileSync(metaFile(), JSON.stringify({ build: remoteV.build, syncedAt: Date.now() }));
    return { updated: true, build: remoteV.build, files: refs.size };
  } catch (e) {
    // Sin internet → propagación LAN: otro Hub ya puede tener el build
    try {
      const { syncFromPeers } = require('./peerserver');
      const r = await syncFromPeers();
      if (r.updated) return r;
    } catch (_) {}
    return { updated: false, offline: true, error: String(e?.message || e) };
  }
}

// Intercepta HTTPS al origen de la web: sirve desde caché si existe,
// si no va a red y cachea los estáticos al vuelo (write-through).
function installHandler(origin) {
  protocol.handle('https', async (req) => {
    try {
      const u = new URL(req.url);
      if (u.origin === origin && req.method === 'GET') {
        const f = fileFor(u.pathname);
        if (f && fs.existsSync(f)) {
          return new Response(fs.readFileSync(f), {
            headers: { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }
          });
        }
        // No en caché → intento otros Hubs de la LAN antes de internet
        try {
          const { fetchFromPeers } = require('./peerserver');
          const peerBuf = await fetchFromPeers(u.pathname);
          if (peerBuf) {
            try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, peerBuf); } catch (_) {}
            return new Response(peerBuf, {
              headers: { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }
            });
          }
        } catch (_) {}
        const resp = await net.fetch(req);
        if (resp.ok && f && /^\/(assets|icons?|images?|fonts?|screenshots?)\//i.test(u.pathname)) {
          resp.clone().arrayBuffer().then((ab) => {
            try {
              fs.mkdirSync(path.dirname(f), { recursive: true });
              fs.writeFileSync(f, Buffer.from(ab));
            } catch (_) {}
          }).catch(() => {});
        }
        return resp;
      }
    } catch (_) {}
    return net.fetch(req);
  });
}

module.exports = { syncWebCache, installHandler };
