const CACHE = 'dienstplanrad-v9';
const CORE = ['/', '/index.html', '/styles.css', '/js/app.js', '/js/api.js', '/js/defaults.js', '/js/rules.js', '/js/state.js', '/js/theme.js', '/manifest.webmanifest', '/icons/icon.svg'];

/**
 * Eigener Anwendungscode (HTML, CSS, JS) wird NETWORK-FIRST ausgeliefert.
 *
 * Vorher galt Cache-First für alles außer der Navigation. Ein bereits
 * installierter Client hat damit styles.css und die JS-Module dauerhaft aus
 * dem alten Cache bedient – eine ausgerollte Korrektur konnte ihn nie
 * erreichen, solange der Cache-Name unverändert blieb. Genau dadurch blieb der
 * Monatsfarbwechsel trotz Deployment wirkungslos.
 *
 * Jetzt gilt: App-Code immer zuerst vom Netz, mit Cache-Aktualisierung; der
 * Cache ist nur noch Offline-Rückfallebene. Unveränderliche Assets (Icons,
 * Manifest, Fremdressourcen) bleiben Cache-First.
 */
const isAppShell = url => url.origin === self.location.origin
  && (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

function networkFirst(request, cacheKey) {
  return fetch(request)
    .then(response => {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(cacheKey || request, clone));
      return response;
    })
    .catch(() => caches.match(cacheKey || request).then(cached => cached || caches.match('/index.html')));
}

function cacheFirst(request) {
  return caches.match(request).then(cached => cached || fetch(request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(request, clone));
    return response;
  }));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, '/index.html'));
    return;
  }
  const url = new URL(event.request.url);
  event.respondWith(isAppShell(url) ? networkFirst(event.request) : cacheFirst(event.request));
});
