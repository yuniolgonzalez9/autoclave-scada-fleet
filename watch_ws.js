// watch_ws.js — complemento del monitor: escribe a ws_watch.csv cada 10s
// cuántas telemetrías llegaron por el WS :9781 en ese intervalo.
// Si ws_rate>0 mientras db_age crece -> el HUB deja de escribir (bug hub).
// Si ws_rate=0 -> la PLACA dejó de publicar (stall loop firmware).
const fs = require('fs');
const WebSocket = require('ws');
const OUT = 'ws_watch.csv';
const DB = process.env.APPDATA + '/biofleet-hub/data/biofleet.db';

fs.writeFileSync(OUT, 'tstamp,telemetrias_10s,db_age_s\n');
const ws = new WebSocket('ws://127.0.0.1:9781');
let count = 0;
ws.on('message', (d) => {
  try { const p = JSON.parse(d); if (p.tipo === 'telemetria' || p.channel === 'telemetria') count++; } catch (_) {}
});
ws.on('error', (e) => console.log('WS err', e.message));

const t0 = Date.now();
const tmr = setInterval(() => {
  const age = fs.existsSync(DB) ? Math.round((Date.now() - fs.statSync(DB).mtimeMs) / 1000) : -1;
  fs.appendFileSync(OUT, `${new Date().toLocaleTimeString('es-DO')},${count},${age}\n`);
  count = 0;
}, 10000);

const MIN = parseInt(process.argv[2] || '15', 10);
setTimeout(() => { clearInterval(tmr); console.log('LISTO -> ws_watch.csv'); process.exit(0); }, MIN * 60000);
console.log(`vigilando ${MIN} min...`);
