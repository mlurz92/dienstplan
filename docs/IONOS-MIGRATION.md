# Umzug nach IONOS Webhosting Plus — Schritt für Schritt

**Ziel:** DienstplanRAD läuft unter `https://dienstplan.markuslurz.de` auf dem
eigenen IONOS-Vertrag. Cloudflare Pages, Pages Functions und Workers KV werden
nicht mehr gebraucht.

Diese Anleitung ist vollständig und in dieser Reihenfolge zu lesen. Sie ist so
angelegt, dass die alte Installation bis zur letzten Minute weiterläuft und ein
Rückweg jederzeit offen bleibt (Schritt 14).

**Zeitbedarf:** etwa 90 Minuten, davon rund 20 Minuten Wartezeit auf DNS.

---

## 0. Was sich ändert — und was nicht

| Bisher (Cloudflare) | Künftig (IONOS) |
|---|---|
| Pages liefert die statischen Dateien | Apache auf dem Webspace liefert sie |
| `functions/api/*.js` (JavaScript am Rand) | `api/index.php` (ein Frontcontroller) |
| Workers KV (Schlüssel-Wert-Ablage) | MySQL-Tabelle `dienstplan_kv` (Schlüssel-Wert-Ablage) |
| `_headers` | `.htaccess` |
| Deployment per Git-Push | `npm run bundle:ionos` + SFTP (oder der Workflow aus Schritt 15) |
| Ohne Anmeldung erreichbar | Basisauthentifizierung (Schritt 9) |

**Am Frontend ändert sich keine Zeile.** Die API behält Pfade, Antwortfelder und
Statuscodes; `js/api.js` bleibt unberührt. Auch die Schlüssel der Ablage bleiben
gleich (`app:settings`, `app:staff`, `app:rbn-names`, `year:JJJJ:month:MM`) —
deshalb passt jede vorhandene JSON-Sicherung ohne Umrechnung.

**Warum MySQL und keine JSON-Dateien auf dem Webspace?** Weil zwei gleichzeitige
Speichervorgänge sonst denselben Monat überschreiben könnten und weil eine
Datei-Ablage keine Transaktion kennt. Der Serverimport schreibt bis zu dreizehn
Monate; er muss ganz oder gar nicht durchgehen. MySQL leistet beides, ist im
Vertrag enthalten und lässt sich über das IONOS-Cockpit sichern.

**Warum eine eigene Subdomain und kein Unterordner?** Die Anwendung ruft die API
unter dem absoluten Pfad `/api/...` auf. Läge sie in
`markuslurz.de/dienstplan/`, zeigte dieser Pfad ins Leere. Eine Subdomain mit
eigenem Dokumentwurzel löst das ohne eine einzige Codeänderung. Das ist der
eigentliche Grund, warum diese Anleitung eine Subdomain wählt.

---

## 1. Ist-Zustand sichern (nicht überspringen)

1. Die laufende Anwendung öffnen und über die Werkzeugleiste eine
   **JSON-Sicherung** herunterladen. Datei mit Datum aufbewahren, z. B.
   `dienstplan-sicherung-2026-08-06.json`.
2. Zusätzlich den Serverbestand direkt sichern — das ist die Datei, mit der
   Schritt 11 arbeitet:

   ```bash
   curl -s https://<alte-adresse>/api/export > kv-export-2026-08-06.json
   ```

3. Prüfen, dass die Datei plausibel ist:

   ```bash
   node -e "const d=require('./kv-export-2026-08-06.json'); console.log('Monate:', d.months.length, '| Personen:', d.staff.length)"
   ```

Erst wenn diese Datei existiert und Monate enthält, weiter.

---

## 2. Subdomain anlegen

IONOS-Cockpit → **Domains & SSL** → `markuslurz.de` → **Subdomains** →
*Subdomain hinzufügen*.

- Name: `dienstplan`
- Zielverzeichnis: **ein neues, leeres Verzeichnis** — `/dienstplan`
  (nicht der Dokumentwurzel der Hauptdomain, nichts, worin schon etwas liegt)

Anschließend unter **Domains & SSL** → `dienstplan.markuslurz.de`:

- **SSL-Zertifikat** aktivieren (im Vertrag enthalten). Auf die Ausstellung
  warten, bis das Cockpit „aktiv“ meldet — typischerweise wenige Minuten.
- **HTTPS-Weiterleitung** aktivieren, falls angeboten. Die `.htaccess` erzwingt
  HTTPS zusätzlich; doppelt ist hier richtig.

---

## 3. PHP-Version festlegen

Cockpit → **Hosting** → **PHP** (bzw. *PHP-Einstellungen*).

- Für das Verzeichnis `/dienstplan` **PHP 8.2 oder neuer** wählen.
- Erweiterungen `pdo_mysql` und `mbstring` müssen aktiv sein (bei IONOS
  Standard).

Der Code nutzt `declare(strict_types=1)`, `never`-Rückgabetypen und
`array_is_list()`. Unter PHP 8.0 oder älter startet er nicht — das ist Absicht,
eine stillschweigend andere Semantik wäre schlimmer.

---

## 4. MySQL-Datenbank anlegen

Cockpit → **Hosting** → **Datenbanken** → *Datenbank erstellen* (MySQL).

Notieren Sie die vier Angaben, die IONOS anzeigt:

| Angabe | Beispiel |
|---|---|
| Host | `db5001234567.hosting-data.io` |
| Datenbankname | `dbs12345678` |
| Benutzer | `dbu1234567` |
| Kennwort | selbst gesetzt |

Der Host ist **nicht** `localhost`. Das ist der häufigste Fehler bei IONOS.

Die Tabelle müssen Sie nicht anlegen: `api/store.php` erzeugt
`dienstplan_kv` beim ersten Zugriff selbst.

---

## 5. SFTP-Zugang bereitstellen

Cockpit → **Hosting** → **SFTP & SSH**.

- Benutzer und Kennwort notieren, Host ist `home<nummer>.1and1-data.host`
  oder wie im Cockpit angegeben.
- Den **Pfad zum Verzeichnis `/dienstplan`** notieren; er sieht etwa so aus:
  `/homepages/12/d123456789/htdocs/dienstplan`. Diesen Pfad brauchen Sie in
  Schritt 9 und 15.

---

## 6. Auslieferungsstand erzeugen

Auf dem eigenen Rechner, im Projektverzeichnis:

```bash
git pull
npm ci
npm run check && npm test      # muss grün sein, sonst nicht ausliefern
npm run bundle:ionos
```

Ergebnis: das Verzeichnis `dist-ionos/`. Es enthält genau das, was auf den
Webspace gehört, und nichts sonst:

```
dist-ionos/
├── .htaccess          ← aus server/ionos/htaccess-webroot.txt
├── index.html
├── *.css
├── js/  vendor/  icons/  manifest.webmanifest
├── sw.js.php
└── api/
    ├── index.php      ← alle /api/-Endpunkte
    ├── store.php      ← Schlüssel-Wert-Ablage auf MySQL
    └── config.example.php
```

Tests, Notizen, `package.json`, `functions/` und `docs/` sind bewusst **nicht**
dabei. Das Bündel wird über eine Positivliste gebaut, nicht über Ausschlüsse.

---

## 7. Hochladen

Mit einem SFTP-Programm (FileZilla, WinSCP, Cyberduck) verbinden und den
**Inhalt** von `dist-ionos/` in `/dienstplan` legen — nicht den Ordner selbst.

Danach muss auf dem Webspace liegen:

```
/dienstplan/index.html
/dienstplan/.htaccess
/dienstplan/api/index.php
```

Falls Ihr SFTP-Programm Dateien mit Punkt am Anfang verbirgt: Anzeige versteckter
Dateien einschalten und prüfen, dass `.htaccess` tatsächlich angekommen ist.
Fehlt sie, antwortet jeder API-Aufruf mit 404.

Auf der Kommandozeile geht es auch:

```bash
lftp -u <sftp-benutzer> sftp://<sftp-host> -e \
  "mirror --reverse --verbose dist-ionos/ /dienstplan; bye"
```

---

## 8. Zugangsdaten hinterlegen

`api/config.example.php` als Vorlage nehmen, ausfüllen und als
`api/config.php` auf dem Webspace ablegen (per SFTP-Editor oder lokal
bearbeiten und hochladen):

```php
<?php
return [
    'dsn' => 'mysql:host=db5001234567.hosting-data.io;dbname=dbs12345678;charset=utf8mb4',
    'user' => 'dbu1234567',
    'password' => 'DAS-KENNWORT-AUS-SCHRITT-4',
    'maxBodyBytes' => 4 * 1024 * 1024,
];
```

Diese Datei gehört **nicht** ins Repository (`.gitignore` verhindert das) und
wird von der `.htaccess` gegen Abruf gesperrt. Der Auslieferungs-Workflow aus
Schritt 15 überschreibt und löscht sie nie.

### Erste Prüfung

```bash
curl -i https://dienstplan.markuslurz.de/api/bootstrap
```

Erwartet: `HTTP/2 200` und

```json
{"ok":true,"settings":null,"staff":null,"rbnNames":null}
```

`null` ist hier **richtig**. Die Datenbank ist leer, und die Vorgaben stehen in
`js/defaults.js` — der Server kennt sie absichtlich nicht, sonst gäbe es zwei
Wahrheiten über das Datenmodell. Der Client setzt sie ein.

Wenn stattdessen …

| Antwort | Ursache | Abhilfe |
|---|---|---|
| `404` | `.htaccess` fehlt oder `mod_rewrite` greift nicht | Schritt 7 prüfen |
| `Serverkonfiguration fehlt` | `api/config.php` nicht angelegt | Schritt 8 |
| `Datenbank nicht erreichbar` | Host/Benutzer/Kennwort falsch | Schritt 4, Host ist nicht `localhost` |
| HTML statt JSON | PHP-Version zu alt, Parserfehler | Schritt 3, dann Fehlerprotokoll im Cockpit |

---

## 9. Zugangsschutz einrichten

Bisher war die Anwendung ohne Anmeldung erreichbar. Unter einer eigenen Domain
ist das nicht tragbar: Wer die Adresse kennt, könnte den Plan lesen **und
überschreiben**. Er enthält Namen und Abwesenheiten von Beschäftigten.

Zwei Wege, einer genügt:

**Weg A — über das Cockpit (einfacher).** Cockpit → **Hosting** →
**Verzeichnisschutz** → Verzeichnis `/dienstplan` → Benutzer und Kennwort
anlegen. IONOS schreibt `.htaccess`/`.htpasswd` selbst. Achtung: Falls IONOS
dabei eine eigene `.htaccess` in `/dienstplan` erzeugt, darf die aus Schritt 7
nicht verloren gehen — hinterher prüfen, dass die Rewrite-Regeln noch drin
stehen, und die vier Zeilen des Schutzes gegebenenfalls in unsere Datei
übernehmen.

**Weg B — von Hand (verlässlicher).** Per SSH:

```bash
htpasswd -c /homepages/12/d123456789/htdocs/.htpasswd-dienstplan dienstplan
```

Kennwortdatei bewusst **oberhalb** des Dokumentwurzels ablegen. Dann in
`/dienstplan/.htaccess` den Block am Dateiende einkommentieren und den Pfad
einsetzen:

```apache
AuthType Basic
AuthName "DienstplanRAD"
AuthUserFile /homepages/12/d123456789/htdocs/.htpasswd-dienstplan
Require valid-user
```

Das Frontend braucht dafür keine Änderung: Der Browser hängt die Anmeldung an
jede `fetch`-Anfrage derselben Herkunft von selbst an. Weil HTTPS erzwungen ist,
geht das Kennwort nie im Klartext über die Leitung.

Prüfen:

```bash
curl -i https://dienstplan.markuslurz.de/api/bootstrap            # erwartet 401
curl -i -u dienstplan:<kennwort> https://dienstplan.markuslurz.de/api/bootstrap  # erwartet 200
```

---

## 10. Anwendung im Browser öffnen

`https://dienstplan.markuslurz.de` aufrufen, anmelden.

Erwartet: Die Monatsansicht erscheint mit dem Standardpersonal und leeren
Diensten. Einen Dienst setzen, die Seite neu laden — die Eintragung muss
erhalten sein. Sie steht jetzt in der MySQL-Tabelle.

Ist das der Fall, funktioniert die Ablage. Jetzt ziehen die echten Daten ein.

---

## 11. Daten aus Workers KV übertragen

Der Umzug läuft über die beiden Endpunkte, die es auf beiden Seiten gibt:
`GET /api/export` liest, `POST /api/import` schreibt in einer Transaktion.

**Erst der Probelauf** — er liest, prüft gegen `js/defaults.js` und schreibt
nichts:

```bash
node scripts/migrate-kv-to-ionos.mjs --from https://<alte-adresse> --dry-run
```

Ausgabe prüfen:

```
Quelle gelesen und geprüft: { monate: 14, personen: 9, rbnNamen: 3, einteilungen: 421 }
Probelauf — es wurde nichts geschrieben.
```

Stimmen die Zahlen mit dem, was Sie erwarten? Dann der echte Lauf:

```bash
node scripts/migrate-kv-to-ionos.mjs \
  --from https://<alte-adresse> \
  --to   https://dienstplan.markuslurz.de \
  --auth dienstplan:<kennwort>
```

Erwartete letzte Zeile:

```
Nachprüfung bestanden — Quelle und Ziel sind inhaltsgleich: { monate: 14, ... }
```

Das Skript liest das Ziel danach erneut aus und vergleicht Feld für Feld gegen
die Quelle. Bei jeder Abweichung nennt es den betroffenen Monat und endet mit
Fehlercode; der Zielbestand ist dann nicht angetastet, weil der Import eine
Transaktion ist.

Statt aus der laufenden alten Installation können Sie auch aus der Sicherung von
Schritt 1 übertragen:

```bash
node scripts/migrate-kv-to-ionos.mjs --file kv-export-2026-08-06.json \
  --to https://dienstplan.markuslurz.de --auth dienstplan:<kennwort>
```

---

## 12. Abnahme

Alles im Browser gegen `https://dienstplan.markuslurz.de`:

- [ ] Anmeldung greift, Seite lädt ohne Fehler in der Entwicklerkonsole
- [ ] Der laufende Monat zeigt die gewohnten Einteilungen
- [ ] Blättern über drei Monate vor und zurück lädt jeden Monat
- [ ] Eine Änderung setzen → neu laden → Änderung ist da
- [ ] Abwesenheit und Dienstwunsch eintragen → neu laden → beide da
- [ ] Auto-Plan Studio öffnen, einen Monat rechnen lassen (Solver lädt aus
      `vendor/` — das prüft die Auslieferung der WebAssembly-Datei)
- [ ] PDF-Export erzeugen und in der Vorschau auf **eine** A4-Seite prüfen
- [ ] Excel-Export erzeugen
- [ ] Eine Excel- oder PDF-Datei importieren
- [ ] JSON-Sicherung herunterladen und mit der aus Schritt 1 vergleichen
- [ ] Dunkelmodus umschalten
- [ ] Auf dem Mobilgerät öffnen

Erst wenn diese Liste vollständig abgehakt ist, ist der Umzug fertig.

---

## 13. Betrieb

### Sicherung

Zwei Ebenen, beide nötig:

1. **Datenbank:** Cockpit → **Hosting** → **Datenbanken** → Sicherung. IONOS
   hält automatische Sicherungen; prüfen Sie einmal, dass sie für diese
   Datenbank aktiv sind, und laden Sie testweise eine herunter.
2. **Fachliche Sicherung:** Einmal im Monat aus der Oberfläche eine
   JSON-Sicherung ziehen und ablegen. Sie ist unabhängig von Hoster und
   Datenbankformat — das ist die Sicherung, die einen Hosterwechsel übersteht.

### Neue Version ausliefern

```bash
git pull && npm run check && npm test && npm run bundle:ionos
```

Dann `dist-ionos/` per SFTP abgleichen. Beim Abgleich mit Löschen (`mirror
--reverse --delete`) müssen `api/config.php` und `.htpasswd*` ausgenommen werden
— sonst sind die Zugangsdaten weg. Der Workflow aus Schritt 15 tut das bereits.

Die Versionsmarken in den Importen (`?v=20260806.1`) erledigen die
Cache-Invalidierung; die `.htaccess` verhindert zusätzlich, dass `index.html`
und die Module zwischengespeichert werden.

### Wartung

- PHP-Version im Cockpit im Blick behalten und Nebenversionen mitnehmen.
- Das Kennwort der Basisauthentifizierung mit dem Team pflegen.
- Die Tabelle `dienstplan_kv` wächst um wenige Kilobyte je Monat. Aufräumen ist
  auf Jahre nicht nötig.

---

## 14. Rückweg

Bis Sie den Cloudflare-Stand abschalten, ist der Rückweg trivial: die alte
Adresse aufrufen. Deshalb bleibt `functions/` bis nach der Abnahme im
Repository, und deshalb sind die Schlüssel der Ablage unverändert.

Vom IONOS-Stand zurück nach Cloudflare, falls doch nötig:

```bash
node scripts/migrate-kv-to-ionos.mjs \
  --from https://dienstplan.markuslurz.de --auth dienstplan:<kennwort> \
  --to   https://<alte-adresse>
```

Das Skript ist richtungsfrei; es kennt nur Quelle und Ziel.

**Erst abschalten, wenn zwei Wochen störungsfreier Betrieb hinter Ihnen liegen:**
Cloudflare-Pages-Projekt löschen, KV-Namespace löschen, danach `functions/`,
`_headers` und die zugehörigen Tests aus dem Repository entfernen.

---

## 15. Auslieferung per GitHub Actions (optional)

`.github/workflows/deploy-ionos.yml` liegt bereit. Er prüft, baut das Bündel und
lädt es per SFTP hoch — **nur von Hand gestartet**, nicht bei jedem Push. Der
Zeitpunkt einer Auslieferung gehört dem Betreiber.

Benötigte Repository-Secrets (Settings → Secrets and variables → Actions):

| Secret | Inhalt |
|---|---|
| `IONOS_SFTP_HOST` | SFTP-Host aus Schritt 5 |
| `IONOS_SFTP_USER` | SFTP-Benutzer |
| `IONOS_SFTP_PASSWORD` | SFTP-Kennwort |
| `IONOS_REMOTE_DIR` | z. B. `/homepages/12/d123456789/htdocs/dienstplan` |
| `IONOS_PUBLIC_URL` | `https://dienstplan.markuslurz.de` |
| `IONOS_BASIC_AUTH` | `dienstplan:<kennwort>` (für die Abnahmeprüfung) |

Den ersten Lauf mit **Probelauf = true** starten und die Liste der Dateien
prüfen, die hochgeladen bzw. gelöscht würden. Erst dann echt ausliefern.

---

## Was der Umzug technisch bedeutet

Zwei Entscheidungen lohnen die Erklärung, weil sie später Fragen erzeugen.

**Der Server normalisiert nicht mehr.** Die Cloudflare-Functions haben jeden
Schreibvorgang durch `js/defaults.js` geschickt. In PHP wäre dieselbe Prüfung
eine zweite Fassung des Datenmodells — fünfhundert Zeilen, die bei jeder
Modelländerung mitwandern müssten und beim ersten Vergessen auseinanderlaufen.
Das ist die gefährlichere Variante. Stattdessen normalisiert der Client an beiden
Enden: Er schreibt ausschließlich kanonische Daten und normalisiert alles
Gelesene erneut. `js/defaults.js` bleibt die einzige Wahrheit. Der Server prüft
das, was ohne Regelwerk prüfbar ist: gültiges JSON, erwarteter Grundtyp, bekannter
Schlüssel, Jahr und Monat im Bereich, Größengrenze.

**Fehlende Schlüssel antworten mit `null`.** Workers KV hat auf den ersten
Zugriff hin die Vorgaben angelegt. Das brauchte es nur, weil die Function die
Vorgaben kannte. Jetzt liefert der Server `null`, und der Client setzt seine
Vorgaben ein — `normalizeSettings(null)` und `normalizeStaffList(null)` tun genau
das. Nebeneffekt: In der Datenbank landet erst ein Eintrag, wenn wirklich etwas
gespeichert wurde.

Beide Zusagen sind durch `tests/ionos-api.test.js` festgehalten. Der Test startet
den PHP-Frontcontroller gegen eine SQLite-Ablage und prüft den HTTP-Vertrag
Endpunkt für Endpunkt gegen dieselben Daten, die auch die Anwendung erzeugt. Er
läuft in `npm test` mit.
