// Service worker: permite usar la app sin conexión.
// Sube el número de versión cada vez que cambies algún archivo de la app.
const VERSION = 'mb-v5';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'vendor/barcode-detector.js',
  'vendor/zxing_reader.wasm',
];
const COVERS = 'mb-covers';

self.addEventListener('install', e => {
  // cache: 'reload' evita guardar copias antiguas de la caché HTTP del navegador
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  // La versión nueva espera a que el usuario pulse «Actualizar» (salvo en la primera instalación)
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== COVERS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos de la app: primero caché, y se actualiza en segundo plano
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(VERSION).then(async cache => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Portadas de internet: se guardan para verlas sin conexión
  if (req.destination === 'image') {
    e.respondWith(
      caches.open(COVERS).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })
    );
  }
});
