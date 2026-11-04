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
    printersV2: () => ipcRenderer.invoke('hub:printersV2'),
    printHtml: (job) => ipcRenderer.invoke('hub:printHtml', job),
    printToPdf: (job) => ipcRenderer.invoke('hub:printToPdf', job),
    printLabel: (job) => ipcRenderer.invoke('hub:printLabel', job),
    status: () => ipcRenderer.invoke('hub:status'),
    localToken: () => ipcRenderer.invoke('hub:localToken'),
    sendCommand: (mac, cmd) => ipcRenderer.invoke('hub:command', { mac, cmd }),
    vaultSave: (p) => ipcRenderer.invoke('vault:save', p),
    vaultVerify: (p) => ipcRenderer.invoke('vault:verify', p),
    vaultSync: (profiles) => ipcRenderer.invoke('vault:sync', profiles),
    vaultStats: () => ipcRenderer.invoke('vault:stats')
  });

  // ── Botones de ventana propios con el estilo del tema activo ──
  const BTN = 40;
  const ICONS = {
    min: '<path d="M5 12h14"/>',
    max: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    restore: '<rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

  const CSS = `
    html, body, #root, #root > div { scrollbar-width: none !important; }
    html::-webkit-scrollbar, body::-webkit-scrollbar, #root::-webkit-scrollbar, #root > div::-webkit-scrollbar { display: none; width: 0; height: 0; }
    .header-shell { -webkit-app-region: drag; padding-right: ${BTN * 3 + 36}px !important; }
    .header-shell button, .header-shell a, .header-shell input, .header-shell select, .header-shell textarea,
    .header-shell [role="button"], .header-shell [role="menu"], .header-shell .clock-dropdown { -webkit-app-region: no-drag; }
    #bfh-drag { position: fixed; top: 0; left: 0; right: ${BTN * 3 + 40}px; height: 28px; z-index: 2147483646; -webkit-app-region: drag; }
    #bfh-win { position: fixed; top: var(--bfh-top, 8px); right: 12px; z-index: 2147483647; display: flex; gap: 8px; -webkit-app-region: no-drag; }
    #bfh-win button {
      width: ${BTN}px; height: ${BTN}px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      background: rgb(var(--glass-bg, 15 23 42) / 0.9); border: 1px solid var(--card-border, rgba(0,243,255,.42));
      color: var(--accent-text, var(--accent-color, #67e8f9)); cursor: pointer; padding: 0; outline: none;
      backdrop-filter: blur(12px); transition: background .15s, color .15s, box-shadow .15s, transform .1s;
    }
    #bfh-win button:hover {
      background: color-mix(in srgb, var(--accent-color, #00f3ff) 22%, rgb(var(--glass-bg, 15 23 42)));
      box-shadow: 0 0 14px color-mix(in srgb, var(--accent-color, #00f3ff) 45%, transparent);
    }
    #bfh-win button:active { transform: scale(.94); }
    #bfh-win button.bfh-close:hover { background: #e11d48; border-color: #fb7185; color: #fff; box-shadow: 0 0 16px rgba(225,29,72,.6); }
  `;

  let maxBtn = null;
  const setMaxIcon = (isMax) => {
    if (!maxBtn) return;
    maxBtn.innerHTML = svg(isMax ? 'restore' : 'max');
    maxBtn.title = isMax ? 'Restaurar' : 'Maximizar';
  };
  ipcRenderer.on('hub:winState', (e, isMax) => setMaxIcon(isMax));

  const mount = () => {
    if (document.getElementById('bfh-win')) return;
    const st = document.createElement('style');
    st.id = 'bfh-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    const drag = document.createElement('div');
    drag.id = 'bfh-drag';
    document.body.appendChild(drag);

    const box = document.createElement('div');
    box.id = 'bfh-win';
    const mk = (action, icon, title, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.innerHTML = svg(icon);
      if (cls) b.className = cls;
      b.addEventListener('click', () => ipcRenderer.send('hub:win', action));
      box.appendChild(b);
      return b;
    };
    mk('min', 'min', 'Minimizar');
    maxBtn = mk('max', 'max', 'Maximizar');
    mk('close', 'close', 'Cerrar', 'bfh-close');
    document.body.appendChild(box);
    ipcRenderer.invoke('hub:isMax').then(setMaxIcon).catch(() => {});
  };

  // Alinea los botones con el encabezado y pasa el color del tema al fondo de la ventana.
  const toHex = (c) => {
    const m = String(c || '').match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return null;
    return '#' + m.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, '0')).join('');
  };
  let last = '';
  let lastKiosk = null;
  let timer = null;
  const sync = () => {
    timer = null;
    const header = document.querySelector('.header-shell');
    const drag = document.getElementById('bfh-drag');
    const box = document.getElementById('bfh-win');
    if (box) {
      const h = header ? header.getBoundingClientRect().height : 0;
      box.style.setProperty('--bfh-top', `${h > BTN ? Math.round((h - BTN) / 2) : 8}px`);
    }
    // Modo kiosko de la web: la app toma toda la pantalla y oculta la barra de tareas.
    let kiosk = false;
    try { kiosk = localStorage.getItem('biofleet_kiosk') === '1' || Boolean(sessionStorage.getItem('scada_tab_kiosk_mac')) || /[?&]kiosk=/.test(location.search); } catch (_) {}
    if (kiosk !== lastKiosk) { lastKiosk = kiosk; ipcRenderer.send('hub:kiosk', kiosk); }
    if (box) box.style.display = kiosk ? 'none' : 'flex';
    if (drag) drag.style.display = header || kiosk ? 'none' : 'block';
    const glass = getComputedStyle(document.documentElement).getPropertyValue('--glass-bg').trim();
    const bg = toHex(glass ? `rgb(${glass.split(/[\s,/]+/).join(',')})` : '') || '#030712';
    if (bg !== last) { last = bg; ipcRenderer.send('hub:theme', { bg }); }
  };
  const schedule = () => { if (!timer) timer = setTimeout(sync, 150); };

  window.addEventListener('DOMContentLoaded', () => {
    mount();
    sync();
    new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('biofleet-kiosk', sync);
    setInterval(sync, 1000);
  });
}
