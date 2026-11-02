// noderegistry.js — Registro WAN de nodos Hub en Supabase.
// Cada PC instalada se anuncia con heartbeat periódico (id persistente,
// build de la web cacheada, versión del Hub). La red de nodos crece
// visible entre localidades distintas: cada Hub aporta a la estructura.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HEARTBEAT_MS = 5 * 60 * 1000; // 5 min

function loadConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) return { url, key };
  // Fallback: leer .env del repo (dev) o userData/.env (instalado)
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(app.getPath('userData'), '.env')
  ];
  for (const p of candidates) {
    try {
      const env = fs.readFileSync(p, 'utf8');
      const u = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
      const k = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
      if (u && k) return { url: u, key: k };
    } catch (_) {}
  }
  return null;
}

function nodeId() {
  const f = path.join(app.getPath('userData'), '_node-id');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (_) {}
  const id = crypto.randomUUID();
  try { fs.writeFileSync(f, id); } catch (_) {}
  return id;
}

let cfg = null;
let id = null;

async function beat() {
  if (!cfg) return;
  try {
    const meta = {};
    try { Object.assign(meta, JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'web-cache', '_hub-meta.json'), 'utf8'))); } catch (_) {}
    await fetch(`${cfg.url}/rest/v1/hub_nodes`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        node_id: id,
        host: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        hub_version: app.getVersion(),
        web_build: meta.build || null,
        last_seen: new Date().toISOString()
      })
    }).then((r) => { if (!r.ok) console.log('[NODES] heartbeat HTTP', r.status); });
  } catch (_) {}
}

function startNodeRegistry() {
  cfg = loadConfig();
  if (!cfg) { console.log('[NODES] sin credenciales Supabase — registro deshabilitado'); return; }
  id = nodeId();
  console.log(`[NODES] registro activo — nodo ${id.slice(0, 8)}…`);
  beat();
  setInterval(beat, HEARTBEAT_MS).unref();
}

module.exports = { startNodeRegistry };
