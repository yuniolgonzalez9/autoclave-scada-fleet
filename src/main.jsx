import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker: purga cachés viejas y sirve siempre la versión de red.
// Sin este registro, el SW del sitio legacy seguía sirviendo la app vieja.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

// Actualización automática (web y app instalada): si se publicó una versión
// nueva, se recarga sola. En segundo plano recarga de inmediato; en pantalla
// avisa y recarga a los pocos segundos.
if (import.meta.env.PROD) {
  let reloading = false;
  const checkForUpdate = async () => {
    if (reloading || !navigator.onLine) return;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = await res.json();
      if (!build || build === __BUILD_ID__) return;
      reloading = true;
      if (document.visibilityState === 'hidden') {
        window.location.reload();
        return;
      }
      const note = document.createElement('div');
      note.textContent = 'Nueva versión disponible · actualizando…';
      note.setAttribute('role', 'status');
      note.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:99999;background:#2b3037;color:#e5e7eb;border:1px solid rgba(148,163,184,.35);padding:8px 14px;border-radius:8px;font:600 12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      document.body.appendChild(note);
      setTimeout(() => window.location.reload(), 3000);
    } catch (_) {}
  };
  setInterval(checkForUpdate, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
}
