<?php
/**
 * Grabstein für `/sw.js` — die IONOS-Fassung von `functions/sw.js.js`.
 *
 * Relevant nur, wenn die Anwendung unter einer Herkunft erreichbar wird, unter
 * der früher der alte Cache-First-Worker installiert war. Ein Service Worker
 * ist an die Herkunft gebunden; auf einer neuen Adresse gibt es nichts zu
 * entfernen. Der Grabstein kostet nichts und darf deshalb bleiben.
 *
 * Der Ablauf ist derselbe: abmelden, Caches des Altbestands löschen, offene
 * Tabs einmal neu aufbauen. Kein `fetch`-Handler, keine Zwischenspeicherung.
 */

header('Content-Type: application/javascript; charset=utf-8');
// Ein falscher MIME-Typ bricht die Updateprüfung des Browsers ab, ohne die
// Registrierung zu lösen — genau der Fehler, der auf Cloudflare aufgetreten ist.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Service-Worker-Allowed: /');
?>
// DienstplanRAD: Dieser Worker entfernt sich selbst.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('dienstplanrad')).map(key => caches.delete(key)));
    }
    await self.registration.unregister();
    // Offene Tabs einmal neu aufbauen: `unregister()` loest den Controller
    // eines laufenden Tabs nicht ab. Der Neuaufbau erfolgt ohne Controller und
    // kann deshalb nicht in eine Schleife laufen.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      if ('navigate' in client) { try { await client.navigate(client.url); } catch {} }
    }
  })());
});
