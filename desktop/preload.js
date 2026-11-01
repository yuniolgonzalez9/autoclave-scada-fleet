const { contextBridge, ipcRenderer } = require('electron');

// La web dentro del exe habla con el hub por este puente seguro
// (solo la web oficial o la copia empaquetada).
const trusted = location.protocol === 'file:' || location.origin === 'https://biofle.vercel.app';

if (trusted) {
  contextBridge.exposeInMainWorld('biofleetHub', {
    isHub: true,
    scanLan: () => ipcRenderer.invoke('hub:scanLan'),
    serialPorts: () => ipcRenderer.invoke('hub:serialPorts'),
    printers: () => ipcRenderer.invoke('hub:printers'),
    printLabel: (job) => ipcRenderer.invoke('hub:printLabel', job),
    status: () => ipcRenderer.invoke('hub:status'),
    sendCommand: (mac, cmd) => ipcRenderer.invoke('hub:command', { mac, cmd })
  });
}
