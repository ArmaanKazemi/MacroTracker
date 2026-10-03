// Service worker: precache the app shell + food database so everything works offline.
// Bump VERSION whenever you change any app file so phones pick up the update.
const VERSION = 'pithos-v2.12.2';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/art.js',
  'js/db.js',
  'js/fooddb.js',
  'js/health.js',
  'js/meal.js',
  'js/quicklog.js',
  'js/quickparse.js',
  'js/supplements.js',
  'js/nutrients.js',
  'js/scanner.js',
  'js/sheets.js',
  'js/store.js',
  'js/today.js',
  'js/ui.js',
  'js/views.js',
  'data/starter.json',
  'fonts/cormorant-garamond-latin-500-normal.woff2',
  'fonts/cormorant-garamond-latin-600-normal.woff2',
  'fonts/cormorant-garamond-latin-700-normal.woff2',
  'fonts/cinzel-latin-500-normal.woff2',
  'fonts/cinzel-latin-700-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
// Nice-to-have: missing files must not break installation.
const OPTIONAL = ['data/cofid.json', 'vendor/zxing.min.js', 'icons/maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Open Food Facts etc. go straight to the network

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match('index.html')) || fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
