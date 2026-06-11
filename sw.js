const CACHE_NAME = 'ft-planner-v6';
// GSAP core (CDN) — precached so bottom-sheet/card animations work offline.
// Cached non-fatally: if the CDN is unreachable at install time the app
// still installs and the UI falls back to CSS transitions.
const GSAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/storage.js',
  './js/calendar.js',
  './js/equipment.js',
  './js/slots.js',
  './js/planner.js',
  './js/summary.js',
  './js/settings.js',
  './js/export.js',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).then(() => cache.add(GSAP_URL).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy: try network, fall back to cache
// This ensures updates are picked up immediately
self.addEventListener('fetch', event => {
  // Skip non-GET requests (let API calls through directly)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then(response => {
      // Update cache with fresh response
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // Network failed — fall back to cache (offline support)
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
