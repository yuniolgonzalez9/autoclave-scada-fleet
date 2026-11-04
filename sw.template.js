// =========================================================================
// BIOFLEET OS v2.0 // SERVICE WORKER — OFFLINE REAL + PURGA POR BUILD
// =========================================================================
// Estrategia:
//  - /assets/* (chunks con hash inmutable): CACHE-FIRST — se guardan al
//    primer uso y sirven offline para siempre hasta el próximo deploy.
//  - Navegaciones / index.html: NETWORK-FIRST con fallback al shell
//    cacheado → la app abre sin internet.
//  - VERSION cambia en cada build → purga cachés viejos y reclama clientes.
// =========================================================================
const VERSION = 'biofleet-v2-build-__SW_BUILD__';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['./', './index.html', './manifest.json', './version.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Purga cachés de builds anteriores (los assets viejos ya no se referencian)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const isAsset = (url) => url.pathname.startsWith('/assets/');

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Nunca interceptar APIs en vivo
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('hivemq.cloud') ||
    url.hostname.includes('api.telegram.org') ||
    url.hostname.includes('qrserver.com')
  ) {
    return;
  }

  // Assets hasheados: cache-first (son inmutables por build)
  if (isAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Navegación / shell: network-first, fallback al index cacheado (offline)
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok && (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.json'))) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Petición de navegación → entrega el shell (SPA offline)
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('Sin conexión', { status: 503 });
      })
  );
});
