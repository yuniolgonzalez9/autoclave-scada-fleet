const db = require('better-sqlite3')('C:/Users/HARMONY/AppData/Roaming/biofleet-hub/data/biofleet.db');
const iso = (t) => new Date(t).toISOString();
console.log('== REPORTES (buffer offline) ==');
db.prepare('SELECT session_id,mac,synced,ts FROM reportes ORDER BY ts DESC LIMIT 10').all()
  .forEach(r => console.log(`${iso(r.ts)} | ${r.session_id} | synced=${r.synced} | ${r.mac}`));
console.log('== EVENTOS (ultimos 15) ==');
db.prepare('SELECT mac,tipo,recibido_at FROM eventos ORDER BY recibido_at DESC LIMIT 15').all()
  .forEach(r => console.log(`${iso(r.recibido_at)} | ${r.tipo} | ${r.mac}`));
console.log('== TELEMETRIA: ultima fila ==');
const t = db.prepare('SELECT recibido_at FROM telemetria ORDER BY recibido_at DESC LIMIT 1').get();
if (t) console.log(iso(t.recibido_at));
