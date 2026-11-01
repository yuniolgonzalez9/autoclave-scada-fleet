const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { startHub } = require('./hub');
const { checkAndUpdate } = require('./updater');
const { listSerialPorts, listPrinters, printLabel } = require('./peripherals');

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#030712',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(null);

  // Carga la web empaquetada local — funciona sin internet.
  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
};

// IPC: la web dentro del exe pide servicios del hub
ipcMain.handle('hub:scanLan', () => global.hub?.scanLan() || []);
ipcMain.handle('hub:serialPorts', () => listSerialPorts());
ipcMain.handle('hub:printers', () => listPrinters());
ipcMain.handle('hub:printLabel', (e, job) => printLabel(job));
ipcMain.handle('hub:status', () => global.hub?.status() || { online: false });
ipcMain.handle('hub:command', (e, { mac, cmd }) => global.hub?.sendCommand(mac, cmd) ?? false);

app.whenReady().then(() => {
  startHub((h) => { global.hub = h; });
  createWindow();

  // Auto-update de la web empaquetada — cada arranque y cada 5 min.
  checkAndUpdate().catch(() => {});
  setInterval(() => checkAndUpdate().catch(() => {}), 5 * 60 * 1000);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
