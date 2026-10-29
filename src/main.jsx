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
// La URL lleva ?v=<BUILD_ID> para que CADA deploy genere un script distinto:
// el navegador detecta el cambio, instala el SW nuevo y al activarse borra
// todas las cachés viejas. Sin esto, un SW legacy seguiría sirviendo la app
// vieja y la detección de versión jamás llegaría a ejecutarse.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        const script = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (!script.includes('/sw.js')) reg.unregister().catch(() => {});
      });
    }).catch(() => {});

    navigator.serviceWorker
      .register(`/sw.js?v=${__BUILD_ID__}`, { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}

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
    const note = document.createElement('div');
    note.setAttribute('role', 'status');
    note.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:10px;background:#151a26;color:#e5e7eb;border:1px solid rgba(245,194,74,.5);padding:9px 12px;border-radius:10px;font:600 12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.5)';
    const label = document.createElement('span');
    label.textContent = 'Nueva versión disponible';
    const btn = document.createElement('button');
    btn.textContent = 'Actualizar ahora';
    btn.style.cssText = 'background:#f5c24a;color:#1a1405;border:none;border-radius:7px;padding:6px 10px;font:700 11px system-ui,sans-serif;cursor:pointer';
    btn.onclick = () => window.location.reload();
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
