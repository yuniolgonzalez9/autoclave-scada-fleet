// =========================================================================
// SCADA AUTOCLAVE // SERVICE WORKER (NETWORK-FIRST & AUTO-PURGA DE CACHÉ)
// =========================================================================
const CACHE_VERSION = 'scada-cache-v25-laser';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.png'
];

// 1. Instalación inmediata sin esperas
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Aviso precaching:', err);
      });
    })
  );
});

// 2. Activación: Purga obligatoria de cachés viejas (elimina v18 y anteriores)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            console.log('[SW] Purgando caché obsoleta antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia Network-First: Siempre consulta la red en caliente primero
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Supabase, HiveMQ o APIs externas
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('hivemq.cloud') ||
    event.request.url.includes('formsubmit.co') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si no hay red en absoluto, servir desde caché
        return caches.match(event.request);
      })
  );
});
