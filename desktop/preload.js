const { contextBridge, ipcRenderer } = require('electron');

// La web dentro del exe habla con el hub por este puente seguro.
contextBridge.exposeInMainWorld('biofleetHub', {
  isHub: true,
  scanLan: () => ipcRenderer.invoke('hub:scanLan'),
  serialPorts: () => ipcRenderer.invoke('hub:serialPorts'),
  printers: () => ipcRenderer.invoke('hub:printers'),
  printLabel: (job) => ipcRenderer.invoke('hub:printLabel', job),
  status: () => ipcRenderer.invoke('hub:status'),
  sendCommand: (mac, cmd) => ipcRenderer.invoke('hub:command', { mac, cmd })
});
