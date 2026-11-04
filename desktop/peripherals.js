// Puente de periféricos: enumera puertos USB/COM + impresoras + impresión multi-driver.
const { SerialPort } = require('serialport');
const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const net = require('net');

// ── Puertos serie/USB de la PC ──
exports.listSerialPorts = async () => {
  try {
    const list = await SerialPort.list();
    return list.map((p) => ({ path: p.path, manufacturer: p.manufacturer || '', friendlyName: p.friendlyName || p.path, serial: p.serialNumber || '' }));
  } catch (e) { return { error: e.message }; }
};

// ── Impresoras instaladas ──
// wmic está deprecado y ausente en Windows 11 recientes: se intenta
// PowerShell (Get-Printer) primero y wmic como respaldo.
exports.listPrinters = async () => {
  try {
    if (process.platform === 'win32') {
      try {
        const out = execSync(
          'powershell -NoProfile -Command "Get-Printer | Select-Object Name,PortName,DriverName,PrinterStatus | ConvertTo-Json -Compress"',
          { encoding: 'utf8', timeout: 8000 }
        );
        let rows = JSON.parse(out || '[]');
        if (!Array.isArray(rows)) rows = [rows];
        const list = rows.map((p) => ({ name: p.Name || '', port: p.PortName || '', driver: p.DriverName || '', default: false }));
        if (list.length) return list;
      } catch (_) {}
      const out = execSync('wmic printer get name,portname,drivername,default /format:csv', { encoding: 'utf8', timeout: 8000 });
      return out.split('\n').slice(1).filter(l => l.trim()).map((l) => {
        const cols = l.split(',');
        return { name: cols[2] || '', port: cols[3] || '', driver: cols[1] || '', default: /TRUE/i.test(cols[4] || '') };
      }).filter(p => p.name);
    }
    const out = execSync('lpstat -p 2>/dev/null || echo ""', { encoding: 'utf8' });
    return out.split('\n').filter(l => l.startsWith('printer ')).map(l => ({ name: l.split(' ')[1], port: '', driver: 'cups' }));
  } catch (e) { return { error: e.message }; }
};

// ── Impresión multi-driver de etiqueta ──
// job = {driver: 'escpos'|'zpl'|'tspl'|'raw'|'win', target: 'COM3'|'LPT1'|'printerName'|'ip', data: {titulo, qr, campos:{}, texto}}
exports.printLabel = async (job = {}) => {
  const { driver = 'raw', target = '', data = {} } = job;
  let payload;
  if (driver === 'zpl') {
    payload = `^XA^FO30,30^A0N,40,40^FD${data.titulo || ''}^FS^FO30,90^BQN,2,6^FDQA,${data.qr || data.titulo || ''}^FS^XZ`;
  } else if (driver === 'tspl') {
    payload = `SIZE 60mm,40mm\nCLS\nTEXT 20,20,"2",0,1,1,"${data.titulo || ''}"\nQRCODE 20,60,L,5,A,0,"${data.qr || data.titulo || ''}"\nPRINT 1\n`;
  } else if (driver === 'escpos') {
    const ESC = '', GS = '';
    payload = `${ESC}@${ESC}a1${GS}!1\n${data.titulo || ''}\n\n${(data.campos ? Object.entries(data.campos).map(([k,v])=>`${k}: ${v}`).join('\n') : '')}\n${data.qr ? `\nQR:${data.qr}` : ''}\n\n\n${GS}V0`;
  } else {
    payload = `${data.titulo || ''}\n${data.texto || JSON.stringify(data.campos || {})}\n${data.qr || ''}\n\n`;
  }

  // Enviar: por puerto COM, por red (9100) o por spooler de Windows.
  if (/^COM\d+/i.test(target)) {
    const port = new SerialPort({ path: target, baudRate: 9600 });
    return new Promise((res) => port.write(payload, (e) => { port.close(); res({ ok: !e, err: e?.message }); }));
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
    return new Promise((res) => {
      const s = new net.Socket();
      s.connect(9100, target, () => { s.write(payload, () => { s.end(); res({ ok: true }); }); });
      s.on('error', (e) => res({ ok: false, err: e.message }));
    });
  }
  // Windows spooler: copia el payload a la cola de la impresora.
  // El nombre va al shell: whitelist estricta o sería inyección de comandos.
  if (!/^[A-Za-z0-9 _.\-()]{1,80}$/.test(target)) return { ok: false, err: 'nombre de impresora no válido' };
  try {
    const tmp = require('path').join(os.tmpdir(), `lbl_${Date.now()}.prn`);
    fs.writeFileSync(tmp, payload);
    execSync(`copy /B "${tmp}" "\\\\localhost\\${target}"`);
    fs.unlinkSync(tmp);
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
};
