const { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

// Rendimiento alto: GPU dedicada, sin backgrounding por ventana oculta,
// sin throttle de timers — la app es SCADA/kiosko en tiempo real.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const { startHub } = require('./hub');
const { listSerialPorts, listPrinters, printLabel } = require('./peripherals');

let mainWindow = null;

// La web en vivo (mismo origen que /api): MQTT, comandos y Telegram funcionan
// y siempre está actualizada. Sin internet se usa la copia empaquetada.
const WEB_URL = 'https://biofle.vercel.app/';
const LOCAL_INDEX = path.join(__dirname, 'web', 'index.html');

const createWindow = () => {
  // Splash de marca mientras carga la web empaquetada.
  const splash = new BrowserWindow({
    width: 420, height: 320, frame: false, transparent: true,
    alwaysOnTop: true, resizable: false, skipTaskbar: true,
    webPreferences: { contextIsolation: true }
  });
  const iconData = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'public', 'icon-512.png')).toString('base64'); } catch (_) { return ''; } })();
  splash.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:rgba(3,7,18,.96);border-radius:18px;font-family:monospace"><img src="data:image/png;base64,${iconData}" style="width:120px;height:120px;filter:drop-shadow(0 0 24px rgba(34,211,238,.6))"/><div style="color:#22d3ee;font-size:11px;letter-spacing:.35em;margin-top:18px">BIOFLEET HUB</div><div style="color:#64748b;font-size:8px;letter-spacing:.2em;margin-top:6px">INICIANDO SISTEMA SCADA LOCAL...</div></body></html>`));
  splash.center();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#030712',
    autoHideMenuBar: true,
    title: 'Biofleet Hub — SCADA',
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Sin throttling de fondo: el keepalive MQTT y Realtime no pueden
      // suspenderse o la telemetría "cae" falsamente cada pocos segundos.
      backgroundThrottling: false
    }
  });
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => { splash.destroy(); mainWindow.show(); mainWindow.focus(); }, 600);
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url.startsWith('http')) mainWindow.loadFile(LOCAL_INDEX);
  });
  mainWindow.loadURL(WEB_URL);
};

// IPC: la web dentro del exe pide servicios del hub
ipcMain.handle('hub:scanLan', () => global.hub?.scanLan() || []);
ipcMain.handle('hub:serialPorts', () => listSerialPorts());
ipcMain.handle('hub:printers', () => listPrinters());
ipcMain.handle('hub:printLabel', (e, job) => printLabel(job));
ipcMain.handle('hub:status', () => global.hub?.status() || { online: false });
ipcMain.handle('hub:command', (e, { mac, cmd }) => global.hub?.sendCommand(mac, cmd) ?? false);

app.whenReady().then(() => {
  // Evita que el SO suspenda la app — la telemetría debe seguir viva.
  try { powerSaveBlocker.start('prevent-app-suspension'); } catch (_) {}
  startHub((h) => { global.hub = h; });
  createWindow();


  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
