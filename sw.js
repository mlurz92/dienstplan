/*
 * Neutralisiert ausschließlich frühere DienstplanRAD-Service-Worker.
 *
 * Diese Datei bleibt absichtlich unter der historischen URL erreichbar. Ein
 * Browser, der dort noch eine Registrierung kennt, lädt dieses Skript als
 * Update, ersetzt damit den alten Cache-First-Worker und entfernt anschließend
 * Registrierung und Anwendungscaches. Es gibt bewusst keinen fetch-Handler.
 */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('dienstplanrad')).map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
