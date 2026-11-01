// Auto-update: si Vercel tiene un commit nuevo, descarga y reemplaza la web local.
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VERSION_URL = 'https://biofle.vercel.app/version.json';
const BUILD_URL = 'https://biofle.vercel.app'; // la web ya es el bundle servido

const localVersionFile = () => path.join(__dirname, 'web', 'version.json');
const readLocalCommit = () => {
  try { return JSON.parse(fs.readFileSync(localVersionFile(), 'utf8')).commit; } catch (_) { return null; }
};

const fetchJson = (url) => new Promise((res, rej) => {
  https.get(url, { headers: { 'User-Agent': 'biofleet-hub' } }, (r) => {
    let d = '';
    r.on('data', (c) => { d += c; });
    r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

exports.checkAndUpdate = async () => {
  try {
    const remote = await fetchJson(VERSION_URL);
    const local = readLocalCommit();
    if (!remote?.commit || remote.commit === local) return { updated: false, commit: local };

    // Hay versión nueva: descargar el sitio completo (los archivos estáticos del build).
    // Estrategia simple: bajar index.html + assets referenciados a un dir temporal.
    const tmp = path.join(os.tmpdir(), 'biofleet-web-new');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });

    const html = await new Promise((res, rej) => {
      https.get(BUILD_URL + '/', (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej);
    });
    fs.writeFileSync(path.join(tmp, 'index.html'), html);
    fs.writeFileSync(path.join(tmp, 'version.json'), JSON.stringify(remote));

    // Bajar assets del index (src="/assets/...").
    const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|ico|png|json))"/g)].map(m => m[1]);
    for (const a of assets) {
      try {
        const dir = path.dirname(path.join(tmp, a));
        fs.mkdirSync(dir, { recursive: true });
        const buf = await new Promise((res, rej) => {
          https.get(BUILD_URL + a, (r) => { const ch=[]; r.on('data',c=>ch.push(c)); r.on('end',()=>res(Buffer.concat(ch))); }).on('error', rej);
        });
        fs.writeFileSync(path.join(tmp, a), buf);
      } catch (_) {}
    }

    // Swap atómico: viejo → backup, nuevo → web
    const webDir = path.join(__dirname, 'web');
    const bakDir = path.join(__dirname, 'web.bak');
    if (fs.existsSync(bakDir)) fs.rmSync(bakDir, { recursive: true, force: true });
    if (fs.existsSync(webDir)) fs.renameSync(webDir, bakDir);
    fs.renameSync(tmp, webDir);
    console.log(`[UPDATER] Web actualizada a ${remote.commit}`);
    return { updated: true, commit: remote.commit };
  } catch (e) {
    console.warn('[UPDATER]', e.message);
    return { updated: false, error: e.message };
  }
};
