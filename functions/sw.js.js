/**
 * Endpunkt für `/sw.js` – eine Pages Function, KEINE ausgelieferte Datei.
 *
 * Die Anwendung hat keinen Service Worker. Dieser Endpunkt existiert allein, um
 * den historischen Cache-First-Worker aus bereits bestehenden Installationen zu
 * entfernen – sofort, nicht irgendwann.
 *
 * WARUM EINE FUNCTION UND KEINE DATEI
 *
 * Eine statische Datei unter `/sw.js` löst das Problem nicht. Am 30.07.2026
 * gegen die Produktion gemessen, nachdem `sw.js` gelöscht worden war:
 *
 *   GET /sw.js        -> HTTP 200 mit dem ALTEN Worker, 1144 Byte,
 *                        `dienstplanrad-v4`, `cf-cache-status: HIT`,
 *                        `age: 30509`, `cache-control: public, s-maxage=604800`
 *   GET /sw.js?cb=…   -> HTTP 200 mit `index.html` als `text/html`
 *                        (SPA-Rückfall von Pages)
 *
 * Der Edge hält die gelöschte Datei also bis zu sieben Tage je Standort weiter
 * vor. Die Updateprüfung eines installierten Workers bekommt darauf ein
 * byteweise identisches Skript zurück und wechselt deshalb nicht. Und selbst
 * nach Ablauf antwortet der SPA-Rückfall mit HTML, was die Prüfung mit einem
 * MIME-Fehler abbricht, OHNE die Registrierung zu lösen. Ein Browser, der den
 * Worker je installiert hatte, behielt ihn damit dauerhaft.
 *
 * Auch eine neue statische Datei ändert daran nichts: Sie liegt unter derselben
 * URL, für die der Edge bereits eine gültige Kopie hält.
 *
 * Functions werden dagegen bei jeder Anfrage ausgeführt und stehen im Routing
 * VOR den statischen Assets. Der Cache-Eintrag wird damit ab dem Deployment
 * nicht mehr erreicht. Das ist der Unterschied zwischen „in einer Woche“ und
 * „sofort“.
 *
 * Der Dateiname ist Absicht: Pages leitet die Route aus dem Pfad ohne die
 * Endung `.js` ab, `functions/sw.js.js` bedient daher genau `/sw.js`.
 */

/**
 * Das ausgelieferte Skript. Es ist kein Service Worker im Sinne einer
 * Auslieferungsschicht: Es horcht auf keine Anfragen, beantwortet keine und
 * speichert nichts zwischen. Es räumt auf und verschwindet.
 * `tests/delivery.test.js` erzwingt genau diese Grenze.
 */
const ABMELDESKRIPT = `// DienstplanRAD: Dieser Worker entfernt sich selbst.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('dienstplanrad')).map(key => caches.delete(key)));
    }
    await self.registration.unregister();
    // Offene Tabs einmal neu aufbauen: \`unregister()\` loest den Controller
    // eines laufenden Tabs nicht ab. Der Neuaufbau erfolgt ohne Controller und
    // kann deshalb nicht in eine Schleife laufen.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      if ('navigate' in client) { try { await client.navigate(client.url); } catch {} }
    }
  })());
});
`;

export const onRequestGet = () => new Response(ABMELDESKRIPT, {
  headers: {
    // Korrekter MIME-Typ: Sonst bricht die Updateprüfung ab, ohne die
    // Registrierung zu lösen – genau der Fehler des SPA-Rückfalls.
    'Content-Type': 'application/javascript; charset=utf-8',
    // Keine Zwischenspeicherung, nirgends. Der Browser prüft damit bei jeder
    // Navigation wirklich neu, und der Edge legt nichts an, was uns später
    // erneut im Weg steht.
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Service-Worker-Allowed': '/'
  }
});

// Bewusst nur GET. Ein Worker wird ausschließlich per GET geholt; für alles
// andere antwortet Pages von sich aus mit 405. Ein zusätzlicher `onRequest`
// wäre eine Fangfunktion für alle Methoden und würde die Reihenfolge nur
// unklar machen.
