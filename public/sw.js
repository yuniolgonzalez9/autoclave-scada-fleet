// =========================================================================
// BIOFLEET OS v2.0 // SERVICE WORKER DE PURGA AUTOMÁTICA DE CACHÉ
// =========================================================================
const VERSION = 'biofleet-v2-build-' + Date.now();

// 1. Forzar activación inmediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Al activarse: BORRA TODAS LAS CACHÉS VIEJAS DE RAÍZ (elimina v1.0 y previas)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          console.log('[AUTO-PURGA] Eliminando caché obsoleta:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia Network-First Absoluta (Siempre consulta la red primero)
self.addEventListener('fetch', (event) => {
  // Ignorar llamadas en tiempo real
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('hivemq.cloud') ||
    event.request.url.includes('api.telegram.org')
  ) {
    return;
  }

  // Siempre pide la versión fresca de la red
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        return response;
      })
      .catch(async () => {
        // Solo si no hay internet en absoluto busca en la copia local
        const cached = await caches.match(event.request);
        return cached || new Response('Sin conexión', { status: 503 });
      })
  );
});
