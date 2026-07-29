const CACHE = 'dienstplanrad-v1';
const CORE = ['/', '/index.html', '/styles.css', '/js/app.js', '/js/api.js', '/js/defaults.js', '/js/rules.js', '/js/state.js', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
    const clone = res.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
    return res;
  }).catch(() => hit)));
});
