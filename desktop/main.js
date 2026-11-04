const { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Rendimiento alto: GPU dedicada, sin backgrounding por ventana oculta,
// sin throttle de timers — la app es SCADA/kiosko en tiempo real.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('enable-zero-copy');
const { startHub } = require('./hub');
const { initVault } = require('./vault');
const { listSerialPorts, listPrinters, printLabel } = require('./peripherals');
const { syncWebCache, installHandler } = require('./webcache');
const { startPeerServer, startPeerDiscovery } = require('./peerserver');
const { startNodeRegistry } = require('./noderegistry');

let mainWindow = null;

// Instancia única: un segundo lanzamiento enfoca la ventana existente
// en vez de abrir otra copia que chocaría con los puertos del hub.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// La web en vivo (mismo origen que /api): MQTT, comandos y Telegram funcionan
// y siempre está actualizada. Sin internet se usa la copia empaquetada.
// BIOFLEET_WEB_URL permite apuntar el Hub a un dev server local
// (npm run dev) para probar cambios de la web sin desplegar.
const WEB_URL = process.env.BIOFLEET_WEB_URL || 'https://biofle.vercel.app/';
const LOCAL_INDEX = path.join(__dirname, 'web', 'index.html');

// Splash de marca: navy + oro (identidad Biofleet). La web carga en
// segundo plano mientras la animación corre; al terminar (con un mínimo
// de pantalla para que la marca se aprecie) el splash hace fade-out.
const SPLASH_MIN_MS = 9200;
const SPLASH_FAILSAFE_MS = 15000;

const splashHtml = (iconData, version) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{height:100%;background:transparent;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;-webkit-user-select:none;user-select:none}
.card{position:absolute;inset:0;border-radius:20px;background:radial-gradient(120% 140% at 50% 0%,#0d1734 0%,#070d1f 55%,#04070f 100%);border:1px solid rgba(234,179,8,.22);box-shadow:0 30px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.04);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .45s ease,transform .45s ease;overflow:hidden}
body.done .card{opacity:0;transform:scale(.97)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(234,179,8,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(234,179,8,.05) 1px,transparent 1px);background-size:34px 34px;-webkit-mask-image:radial-gradient(70% 70% at 50% 45%,#000 30%,transparent 100%);mask-image:radial-gradient(70% 70% at 50% 45%,#000 30%,transparent 100%);opacity:.5}
.sweep{position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent 0deg,rgba(234,179,8,.06) 40deg,transparent 80deg);animation:spin 6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.emblem{position:relative;width:118px;height:118px;display:grid;place-items:center}
.emblem img{width:88px;height:88px;border-radius:50%;box-shadow:0 0 44px rgba(234,179,8,.35);animation:breathe 2.6s ease-in-out infinite}
.blogo{width:88px;height:88px;border-radius:50%;display:grid;place-items:center;font-size:44px;font-weight:800;color:#fbbf24;background:radial-gradient(circle at 50% 35%,#101d42,#070d1f);border:2px solid rgba(251,191,36,.8);box-shadow:0 0 44px rgba(234,179,8,.35);animation:breathe 2.6s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
.ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 300deg,rgba(250,204,21,.95) 340deg,transparent 360deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:spin 1.6s cubic-bezier(.6,.15,.4,.85) infinite}
.ring2{position:absolute;inset:-9px;border-radius:50%;border:1px dashed rgba(234,179,8,.25);animation:spin 14s linear infinite reverse}
.brand{margin-top:26px;font-size:15px;font-weight:700;letter-spacing:.42em;color:#fbbf24;text-indent:.42em}
.brand small{color:#93a4c3;font-weight:500;letter-spacing:.42em}
.status{margin-top:10px;font-size:9px;letter-spacing:.3em;color:#5b6b8c;text-indent:.3em;min-height:12px;transition:opacity .3s}
.bar{margin-top:22px;width:220px;height:3px;border-radius:99px;background:rgba(148,163,184,.14);overflow:hidden}
.fill{height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,#b45309,#fbbf24,#fde68a);background-size:200% 100%;box-shadow:0 0 12px rgba(251,191,36,.55);transition:width .35s ease;animation:shimmer 1.4s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.pct{margin-top:9px;font-size:8.5px;letter-spacing:.25em;color:#475569;font-variant-numeric:tabular-nums}
.ver{position:absolute;bottom:12px;font-size:8px;letter-spacing:.22em;color:#334155}
</style></head><body>
<div class="card">
  <div class="grid"></div><div class="sweep"></div>
  <div class="emblem"><div class="ring2"></div><div class="ring"></div>${iconData ? `<img src="data:image/png;base64,${iconData}">` : '<div class="blogo">B</div>'}</div>
  <div class="brand">BIOFLEET <small>HUB</small></div>
  <div class="status" id="st">INICIANDO SISTEMA</div>
  <div class="bar"><div class="fill" id="f"></div></div>
  <div class="pct" id="p">0%</div>
  <div class="ver">SCADA LOCAL · v${version}</div>
</div>
<script>
var p=0,f=document.getElementById('f'),e=document.getElementById('p'),st=document.getElementById('st');
var msgs=['INICIANDO SISTEMA','LEVANTANDO BROKER MQTT','DESCUBRIENDO DISPOSITIVOS','SINCRONIZANDO FLOTA','CARGANDO INTERFAZ'],mi=0;
setInterval(function(){if(p<92){p+=Math.random()*4+1;if(p>92)p=92;f.style.width=p+'%';e.textContent=Math.floor(p)+'%';}},280);
setInterval(function(){if(mi<msgs.length-1){mi++;st.style.opacity=0;setTimeout(function(){st.textContent=msgs[mi];st.style.opacity=1;},300);}},1700);
window.__biofleetFinish=function(){p=100;f.style.width='100%';e.textContent='100%';st.style.opacity=1;st.textContent='LISTO';setTimeout(function(){document.body.classList.add('done');},220);};
</script></body></html>`;

const createWindow = () => {
  const splashAt = Date.now();
  const splash = new BrowserWindow({
    width: 460, height: 360, frame: false, transparent: true,
    alwaysOnTop: true, resizable: false, skipTaskbar: true,
    webPreferences: { contextIsolation: true }
  });
  // En el instalador solo existe desktop/web/** — ../public queda fuera
  // del paquete y la imagen salía rota. Fallback: letra "B" de marca.
  const iconPng = [
    path.join(__dirname, 'web', 'icon-512.png'),
    path.join(__dirname, '..', 'public', 'icon-512.png')
  ].find((p) => fs.existsSync(p));
  const iconData = iconPng ? fs.readFileSync(iconPng).toString('base64') : '';
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml(iconData, app.getVersion())));
  splash.center();

  const ico = path.join(__dirname, 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#030712',
    autoHideMenuBar: true,
    title: 'Biofleet Hub — SCADA',
    icon: fs.existsSync(ico) ? ico : iconPng,
    show: false,
    // Sin marco: los botones de ventana los dibuja la web con el estilo del tema.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Preload aislado: solo usa APIs de electron → sandbox completo.
      sandbox: true,
      // Sin throttling de fondo: el keepalive MQTT y Realtime no pueden
      // suspenderse o la telemetría "cae" falsamente cada pocos segundos.
      backgroundThrottling: false
    }
  });
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // La web no puede abrir ventanas nuevas de Electron ni navegar la
  // ventana fuera de su origen confiable — los enlaces externos van al
  // navegador del sistema.
  const trustedOrigin = new URL(WEB_URL).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      if (u.origin !== trustedOrigin && u.protocol !== 'file:') {
        e.preventDefault();
        if (/^https?:$/.test(u.protocol)) shell.openExternal(url).catch(() => {});
      }
    } catch (_) { e.preventDefault(); }
  });

  // Revelado: espera a que la web esté lista + mínimo de marca, completa
  // la barra del splash, hace fade-out y recién ahí muestra la ventana.
  let revealed = false;
  const reveal = (skipMinWait = false) => {
    if (revealed) return;
    revealed = true;
    const wait = skipMinWait ? 0 : Math.max(0, SPLASH_MIN_MS - (Date.now() - splashAt));
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.webContents.executeJavaScript('window.__biofleetFinish&&window.__biofleetFinish()').catch(() => {});
      setTimeout(() => {
        if (!splash.isDestroyed()) splash.destroy();
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
      }, 700);
    }, wait);
  };
  mainWindow.once('ready-to-show', reveal);
  mainWindow.webContents.on('did-finish-load', reveal);
  setTimeout(reveal, SPLASH_FAILSAFE_MS);
  // Clic/tecla en el splash = salta la espera de marca si la web ya cargó.
  splash.webContents.on('before-input-event', () => { if (mainWindow.webContents && !mainWindow.webContents.isLoading()) reveal(true); });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url.startsWith('http')) mainWindow.loadFile(LOCAL_INDEX);
  });
  const sendWinState = () => mainWindow.webContents.send('hub:winState', mainWindow.isMaximized());
  mainWindow.on('maximize', sendWinState);
  mainWindow.on('unmaximize', sendWinState);

  // Hub híbrido: copia local viva de la web en cada PC.
  // Cada arranque consulta el build remoto; si cambió lo descarga a disco.
  // Las peticiones al origen se sirven desde la caché (rápido + offline).
  try {
    startPeerServer();
    startPeerDiscovery();
    startNodeRegistry();
    installHandler(new URL(WEB_URL).origin);
    syncWebCache(WEB_URL).then((r) => console.log('[WEBCACHE]', JSON.stringify(r)));
  } catch (e) {
    console.log('[WEBCACHE] init error:', e?.message || e);
  }
  mainWindow.loadURL(WEB_URL);
};

// Impresión silenciosa de documentos HTML: ventana oculta + spooler del SO.
// Es la vía para auto-imprimir reportes/tickets sin diálogo del navegador.
const printHtmlSilent = (html, { deviceName, landscape, copies } = {}) =>
  new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) return resolve({ ok: false, err: 'ventana no lista' });
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      try { win.destroy(); } catch (_) {}
      resolve(r);
    };
    win.webContents.on('did-finish-load', () => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName || undefined,
          landscape: Boolean(landscape),
          copies: Math.max(1, Number(copies) || 1),
          margins: { marginType: 'printableArea' }
        },
        (ok, reason) => finish({ ok, err: ok ? undefined : reason })
      );
    });
    win.webContents.on('did-fail-load', (e, code, desc) => finish({ ok: false, err: `carga ${code}: ${desc}` }));
    setTimeout(() => finish({ ok: false, err: 'timeout de impresión' }), 30000);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html || '<p></p>'));
  });

// PDF real: el mismo render oculto, pero con webContents.printToPDF —
// devuelve el documento en base64 para que la web lo guarde/descargue.
const htmlToPdf = (html, { landscape, pageSize } = {}) =>
  new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) return resolve({ ok: false, err: 'ventana no lista' });
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { contextIsolation: true, sandbox: true }
    });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      try { win.destroy(); } catch (_) {}
      resolve(r);
    };
    win.webContents.on('did-finish-load', async () => {
      try {
        const data = await win.webContents.printToPDF({
          printBackground: true,
          landscape: Boolean(landscape),
          pageSize: pageSize || 'A4',
          margins: { marginType: 'printableArea' }
        });
        finish({ ok: true, pdf: data.toString('base64') });
      } catch (e) {
        finish({ ok: false, err: e?.message || String(e) });
      }
    });
    win.webContents.on('did-fail-load', (e, code, desc) => finish({ ok: false, err: `carga ${code}: ${desc}` }));
    setTimeout(() => finish({ ok: false, err: 'timeout generando PDF' }), 30000);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html || '<p></p>'));
  });

// IPC: la web dentro del exe pide servicios del hub
ipcMain.handle('hub:scanLan', () => global.hub?.scanLan() || []);
ipcMain.handle('hub:serialPorts', () => listSerialPorts());
ipcMain.handle('hub:printers', () => listPrinters());
ipcMain.handle('hub:printersV2', (e) => {
  if (!mainWindow || e.sender !== mainWindow.webContents) return [];
  return mainWindow.webContents.getPrintersAsync().catch(() => []);
});
ipcMain.handle('hub:printHtml', (e, job) => {
  if (!mainWindow || e.sender !== mainWindow.webContents) return { ok: false, err: 'origen no permitido' };
  return printHtmlSilent(job?.html, job || {});
});
ipcMain.handle('hub:printToPdf', (e, job) => {
  if (!mainWindow || e.sender !== mainWindow.webContents) return { ok: false, err: 'origen no permitido' };
  return htmlToPdf(job?.html, job || {});
});
ipcMain.handle('hub:printLabel', (e, job) => printLabel(job));
ipcMain.handle('hub:status', () => global.hub?.status() || { online: false });
// Token del enlace local: solo la ventana principal (origen confiable
// por el preload) puede pedirlo — autentica los comandos por WS :9781.
ipcMain.handle('hub:localToken', (e) => {
  if (!mainWindow || e.sender !== mainWindow.webContents) return null;
  return global.hub?.token?.() || null;
});
const HEX = /^#[0-9a-f]{6}$/i;
ipcMain.on('hub:theme', (e, t) => {
  if (!mainWindow || e.sender !== mainWindow.webContents || !t) return;
  if (!HEX.test(t.bg)) return;
  mainWindow.setBackgroundColor(t.bg);
});
ipcMain.on('hub:win', (e, action) => {
  if (!mainWindow || e.sender !== mainWindow.webContents) return;
  if (action === 'min') mainWindow.minimize();
  else if (action === 'max') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
});
ipcMain.on('hub:kiosk', (e, on) => {
  if (!mainWindow || e.sender !== mainWindow.webContents) return;
  mainWindow.setKiosk(Boolean(on));
  mainWindow.setAlwaysOnTop(Boolean(on), 'screen-saver');
  if (on) mainWindow.focus();
});
ipcMain.handle('hub:isMax', (e) => (mainWindow && e.sender === mainWindow.webContents ? mainWindow.isMaximized() : false));
ipcMain.handle('hub:command', (e, { mac, cmd }) => global.hub?.sendCommand(mac, cmd) ?? false);

// Bóveda cifrada: login offline con perfiles sincronizados de la nube
const fromMain = (e) => mainWindow && e.sender === mainWindow.webContents;
ipcMain.handle('vault:save', (e, payload) => fromMain(e) ? global.vault?.save(payload) : { ok: false });
ipcMain.handle('vault:verify', (e, payload) => fromMain(e) ? global.vault?.verify(payload) : { ok: false });
ipcMain.handle('vault:sync', (e, profiles) => fromMain(e) ? global.vault?.syncProfiles(profiles || []) : { ok: false });
ipcMain.handle('vault:stats', (e) => fromMain(e) ? global.vault?.stats() : { usuarios: 0 });

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  // Evita que el SO suspenda la app — la telemetría debe seguir viva.
  try { powerSaveBlocker.start('prevent-app-suspension'); } catch (_) {}
  startHub((h) => { global.hub = h; });
  try { global.vault = initVault(); } catch (e) { console.log('[VAULT] init error:', e?.message || e); }
  createWindow();


  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
