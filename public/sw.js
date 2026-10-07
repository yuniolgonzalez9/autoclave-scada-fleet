// Service Worker Oficial BioFleet OS (PWA)
const CACHE_NAME = 'biofleet-scada-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

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

self.addEventListener('fetch', (event) => {
  // Ignorar WebSocket, MQTT y Supabase para no bloquear la telemetría en tiempo real
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('hivemq.cloud') ||
    event.request.url.includes('telegram.org') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
