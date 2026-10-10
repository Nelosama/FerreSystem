// Service worker del POS: permite abrir y recargar la aplicación sin conexión.
// - Las llamadas a la API (/api/...) nunca se cachean ni se responden desde caché.
// - La navegación cae a la última versión cacheada del shell si no hay red.
// - Los recursos estáticos se sirven desde caché y se actualizan en segundo plano.
// No llama a skipWaiting: una versión nueva se activa al cerrar las pestañas, nunca durante un cobro.
const VERSION = 'ferresystem-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo.jpg', '/favicon.svg'];

// Precarga el shell y los recursos que referencia index.html (los nombres de archivo cambian en cada build).
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
    const recursos = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('/api'));
    await cache.addAll([...new Set([...SHELL, ...recursos])]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copia));
          return respuesta;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((enCache) => {
      const red = fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copia));
          }
          return respuesta;
        })
        .catch(() => enCache);
      return enCache ?? red;
    }),
  );
});
