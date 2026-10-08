// =========================================================================
// BIOFLEET OS // SERVICE WORKER EMPRESARIAL (VITE REACT SAFE)
// =========================================================================
const CACHE_NAME = 'biofleet-cache-v2-enterprise';

// 1. Instalación inmediata sin esperas
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Activación: Purga obligatoria de cachés viejas (limpia versiones antiguas)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia Segura Network-First
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones externas, WebSockets, Supabase o HiveMQ para no bloquear la telemetría
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('hivemq.cloud') ||
    event.request.url.includes('api.telegram.org') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Si no hay red, buscar en caché; si no existe, devolver respuesta vacía segura para NO romper el navegador
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        return new Response('Modo fuera de línea', { status: 503, statusText: 'Offline' });
      })
  );
});
