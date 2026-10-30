import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';
import { applyMotionPrefs, readMotionPrefs } from './services/motionPrefs';

applyMotionPrefs(readMotionPrefs());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker: purga cachés viejas y sirve siempre la versión de red.
// sw.js se genera por build con el BUILD_ID inyectado → cada deploy cambia
// el script → el navegador actualiza el SW → activate purga + recarga.
// Registro en /sw.js limpio (sin ?v=) para la instalación como PWA.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        const script = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (!script.includes('/sw.js')) reg.unregister().catch(() => {});
      });
    }).catch(() => {});

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}

// Instalación PWA tipo APK: captura el prompt nativo del navegador y
// muestra un botón propio estilo Aurum — instalar en 1 toque sin buscar
// la opción escondida en el menú del navegador.
(() => {
  let deferredPrompt = null;
  const isInstalled = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const showInstallBanner = () => {
    if (deferredPrompt === null || isInstalled() || document.getElementById('bf-install-note')) return;
    if (!document.getElementById('biofleet-update-style')) {
      const st = document.createElement('style');
      st.id = 'biofleet-update-style';
      st.textContent = '@keyframes bf-gold-pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,194,74,.45)}50%{box-shadow:0 0 18px 4px rgba(245,194,74,.35)}}'
        + '@keyframes bf-logo-halo{0%,100%{filter:drop-shadow(0 0 3px rgba(245,194,74,.8));transform:scale(1)}50%{filter:drop-shadow(0 0 10px rgba(245,194,74,1));transform:scale(1.08)}}'
        + '@keyframes bf-rise{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(st);
    }
    const note = document.createElement('div');
    note.id = 'bf-install-note';
    note.setAttribute('role', 'status');
    note.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99998;display:flex;align-items:center;gap:10px;'
      + 'background:linear-gradient(135deg,#0d1424 0%,#182038 55%,#0d1424 100%);color:#e8c96a;border:1px solid rgba(245,194,74,.55);'
      + 'padding:10px 14px;border-radius:14px;font:600 12px system-ui,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.6),inset 0 0 24px rgba(245,194,74,.06);'
      + 'animation:bf-rise .35s ease-out,bf-gold-pulse 2.4s ease-in-out infinite';
    const logo = document.createElement('img');
    logo.src = '/icon-192.png';
    logo.alt = 'BIOFLEET';
    logo.style.cssText = 'width:26px;height:26px;border-radius:8px;animation:bf-logo-halo 1.8s ease-in-out infinite';
    const label = document.createElement('span');
    label.textContent = 'Instala BIOFLEET OS';
    label.style.cssText = 'letter-spacing:.04em;text-shadow:0 0 10px rgba(245,194,74,.35)';
    const btn = document.createElement('button');
    btn.textContent = 'Instalar';
    btn.style.cssText = 'background:linear-gradient(135deg,#f5c24a,#d9a62e);color:#1a1405;border:none;border-radius:8px;padding:6px 12px;'
      + 'font:700 11px system-ui,sans-serif;cursor:pointer;box-shadow:0 0 12px rgba(245,194,74,.35)';
    btn.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      note.remove();
    };
    const close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Cerrar');
    close.style.cssText = 'background:none;border:none;color:#94a3b8;font:600 12px system-ui;cursor:pointer;padding:2px 4px';
    close.onclick = () => note.remove();
    note.appendChild(logo);
    note.appendChild(label);
    note.appendChild(btn);
    note.appendChild(close);
    document.body.appendChild(note);
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(showInstallBanner, 2500);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.getElementById('bf-install-note')?.remove();
  });
})();

// Actualización automática (web y app instalada) — TRIPLE REDUNDANCIA:
//  A) Poll de /version.json cada 45s + al enfocar/volver online
//  B) registration.update() en cada ciclo: fuerza al navegador a detectar
//     el sw.js?v=BUILD nuevo → activa → purga → navega las ventanas
//  C) Detector inline en index.html al cargar la página
// Si el build servido difiere del que corre, se muestra un botón
// "Actualizar ahora" y se recarga sola a los 8s de todas formas.
if (import.meta.env.PROD) {
  let reloading = false;
  let regRef = null;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then((r) => { regRef = r || null; })
      .catch(() => {});
  }

  const applyUpdate = () => {
    reloading = true;
    if (document.visibilityState === 'hidden') {
      window.location.reload();
      return;
    }
    if (!document.getElementById('biofleet-update-style')) {
      const st = document.createElement('style');
      st.id = 'biofleet-update-style';
      st.textContent = '@keyframes bf-gold-pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,194,74,.45)}50%{box-shadow:0 0 18px 4px rgba(245,194,74,.35)}}'
        + '@keyframes bf-logo-halo{0%,100%{filter:drop-shadow(0 0 3px rgba(245,194,74,.8));transform:scale(1)}50%{filter:drop-shadow(0 0 10px rgba(245,194,74,1));transform:scale(1.08)}}'
        + '@keyframes bf-rise{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(st);
    }
    const note = document.createElement('div');
    note.setAttribute('role', 'status');
    note.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:10px;'
      + 'background:linear-gradient(135deg,#0d1424 0%,#182038 55%,#0d1424 100%);color:#e8c96a;border:1px solid rgba(245,194,74,.55);'
      + 'padding:10px 14px;border-radius:14px;font:600 12px system-ui,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.6),inset 0 0 24px rgba(245,194,74,.06);'
      + 'animation:bf-rise .35s ease-out,bf-gold-pulse 2.4s ease-in-out infinite';
    const logo = document.createElement('img');
    logo.src = '/icon-192.png';
    logo.alt = 'BIOFLEET';
    logo.style.cssText = 'width:26px;height:26px;border-radius:8px;animation:bf-logo-halo 1.8s ease-in-out infinite';
    const label = document.createElement('span');
    label.textContent = 'Nueva versión disponible';
    label.style.cssText = 'letter-spacing:.04em;text-shadow:0 0 10px rgba(245,194,74,.35)';
    const btn = document.createElement('button');
    btn.textContent = 'Actualizar ahora';
    btn.style.cssText = 'background:linear-gradient(135deg,#f5c24a,#d9a62e);color:#1a1405;border:none;border-radius:8px;padding:6px 11px;'
      + 'font:700 11px system-ui,sans-serif;cursor:pointer;box-shadow:0 0 12px rgba(245,194,74,.35)';
    btn.onclick = () => window.location.reload();
    note.appendChild(logo);
    note.appendChild(label);
    note.appendChild(btn);
    document.body.appendChild(note);
    setTimeout(() => window.location.reload(), 8000);
  };

  const checkForUpdate = async () => {
    if (reloading || !navigator.onLine) return;
    // Canal B: fuerza byte-diff del SW (sw.js?v=BUILD cambia por deploy)
    try { if (regRef) await regRef.update(); } catch (_) {}
    // Canal A: compara build servido vs build en ejecución
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = await res.json();
      if (!build || build === __BUILD_ID__) return;
      applyUpdate();
    } catch (_) {}
  };

  // Chequeo inmediato al abrir la app + periódico + al volver a la pestaña
  if (document.readyState === 'complete') checkForUpdate();
  else window.addEventListener('load', checkForUpdate);
  setInterval(checkForUpdate, 45 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
}
