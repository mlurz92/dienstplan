/**
 * GRABSTEIN – kein Service Worker im eigentlichen Sinn.
 *
 * Diese Datei cacht nichts, fängt keine Anfragen ab und liefert nichts aus. Ihr
 * einziger Zweck ist, den historischen Cache-First-Worker von DienstplanRAD aus
 * bereits bestehenden Installationen zu entfernen. Sie darf niemals wieder
 * Auslieferungslogik erhalten; `tests/delivery.test.js` erzwingt das.
 *
 * Warum sie überhaupt existiert, obwohl der Worker längst gelöscht war:
 *
 * Das Löschen der Datei genügt nachweislich nicht. Am 30.07.2026 gegen die
 * Produktion gemessen, mit `sw.js` seit dem Vortag nicht mehr im Repository:
 *
 *   1. `GET /sw.js` ohne Query lieferte HTTP 200 mit dem ALTEN Worker,
 *      1144 Byte, `dienstplanrad-v4`, `cf-cache-status: HIT`, `age: 30048`
 *      (8,3 Stunden) und `cache-control: public, s-maxage=604800`.
 *      Der Edge hält die gelöschte Datei also bis zu sieben Tage je Standort
 *      weiter vor. Die Updateprüfung eines installierten Workers bekommt darauf
 *      ein byteweise identisches Skript zurück – und wechselt daher nicht.
 *
 *   2. `GET /sw.js?x=…` (Cache-Miss) lieferte HTTP 200 mit `index.html` und
 *      `Content-Type: text/html`. Das ist der SPA-Rückfall von Cloudflare Pages:
 *      Die URL antwortet auch nach dem Löschen weiter mit 200, nur eben mit
 *      HTML. Für die Updateprüfung ist das ein MIME-Fehler – und ein MIME-Fehler
 *      bricht die Prüfung ab, OHNE die Registrierung zu entfernen.
 *
 * Ergebnis beider Punkte: Ein Browser, der den Worker je installiert hat, behält
 * ihn dauerhaft und wird dauerhaft aus dessen Cache bedient. Genau das ist die
 * Ursache dafür, dass ausgerollte Korrekturen auf einem eingerichteten Gerät
 * nicht ankamen, während ein frisches Gerät den aktuellen Stand sah.
 *
 * Deshalb der Grabstein, das etablierte Vorgehen zum Stilllegen eines Workers:
 * Er ist gültiges JavaScript mit korrektem MIME-Typ und unterscheidet sich vom
 * installierten Skript. Die Updateprüfung nimmt ihn daher an, er wird aktiv,
 * meldet sich selbst ab, löscht die Caches und schickt die offenen Tabs einmal
 * durch einen Neuaufbau. Danach ist die Registrierung endgültig fort.
 *
 * `_headers` gibt dieser Datei `no-store`. Damit legt der Browser keine
 * HTTP-Cache-Kopie an und prüft bei jeder Navigation wirklich neu.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 1. Caches des Altbestands leeren. Ohne diesen Schritt bliebe der belegte
    //    Speicher auf dem Gerät liegen, auch wenn ihn niemand mehr ausliest.
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('dienstplanrad')).map(key => caches.delete(key)));
    }

    // 2. Selbst abmelden. Ab hier ist keine Registrierung mehr vorhanden.
    await self.registration.unregister();

    // 3. Offene Tabs einmal neu aufbauen. Sie hängen sonst bis zu ihrem Ende an
    //    dem abgelösten Worker – `unregister()` allein löst den Controller eines
    //    laufenden Tabs nicht ab. Der Neuaufbau erfolgt ohne Controller und
    //    kann deshalb nicht in eine Schleife laufen.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      if ('navigate' in client) await client.navigate(client.url).catch(() => {});
    }
  })());
});

// Bewusst KEIN fetch-Handler. Ein Worker ohne fetch-Handler greift in keine
// einzige Anfrage ein; der Browser holt alles direkt aus dem Netz.
