# DienstplanRAD

**Manuelle Bereitschafts- und Hintergrunddienstplanung für die Klinik für Radiologie und Nuklearmedizin.**

DienstplanRAD ist eine installierbare, offlinefähige Web-Anwendung (PWA) zur monatsweisen Planung von
Bereitschaftsdiensten (BD) und Hintergrunddiensten (HG). Die Anwendung plant **nicht automatisch** – sie
lässt die Planerin bzw. den Planer jede Entscheidung selbst treffen und legt daneben in Echtzeit eine
vollständige, farbkodierte Regelbewertung, eine Verteilungsstatistik und eine lückenlose
Konflikt-Dokumentation. Gespeichert wird in Cloudflare KV, gearbeitet werden kann auch vollständig offline.

Diese Datei beschreibt den **vollständigen aktuellen Stand** der Anwendung – Architektur, Datenmodell,
Regelwerk, jede Oberflächenkomponente, jede Interaktion, jede Animation, jeden Import- und Exportweg sowie
den Betrieb. Sie ist kein Changelog, sondern die vollständige Referenz.

---

## Inhaltsverzeichnis

1. [Zielsetzung und Planungsphilosophie](#1-zielsetzung-und-planungsphilosophie)
2. [Technischer Überblick](#2-technischer-überblick)
3. [Projektstruktur](#3-projektstruktur)
4. [Datenmodell](#4-datenmodell)
5. [Stammdaten: Mitarbeitende, Abwesenheiten, Wünsche](#5-stammdaten-mitarbeitende-abwesenheiten-wünsche)
6. [Das Regelwerk im Detail](#6-das-regelwerk-im-detail)
7. [Feiertagslogik](#7-feiertagslogik)
8. [Benutzeroberfläche – Aufbau und Bedienung](#8-benutzeroberfläche--aufbau-und-bedienung)
9. [Dialoge](#9-dialoge)
10. [Statistik und Auswertung](#10-statistik-und-auswertung)
11. [Monatsfarben, Animationen und Design-Philosophie](#11-monatsfarben-animationen-und-design-philosophie)
12. [Persistenz, Synchronisierung und Offline-Betrieb](#12-persistenz-synchronisierung-und-offline-betrieb)
13. [Backend-API](#13-backend-api)
14. [Import und Export](#14-import-und-export)
15. [Drucken und PDF](#15-drucken-und-pdf)
16. [PWA, Service Worker und Caching](#16-pwa-service-worker-und-caching)
17. [Sicherheit und Datenschutz](#17-sicherheit-und-datenschutz)
18. [Barrierefreiheit und Responsivität](#18-barrierefreiheit-und-responsivität)
19. [Entwicklung, Tests und Deployment](#19-entwicklung-tests-und-deployment)
20. [Anpassung und Erweiterung](#20-anpassung-und-erweiterung)
21. [Fehlerbilder und Diagnose](#21-fehlerbilder-und-diagnose)
22. [Glossar](#22-glossar)

---

## 1. Zielsetzung und Planungsphilosophie

### 1.1 Das Grundprinzip: assistierte, nicht automatisierte Planung

Dienstplanung in einer radiologischen Klinik ist nicht rein kombinatorisch. Sie enthält Absprachen,
Rücksichtnahmen, Erfahrungswissen und Ausnahmen, die kein Algorithmus zuverlässig kennt. DienstplanRAD
folgt deshalb konsequent einem einzigen Leitsatz:

> **Der Mensch entscheidet, die Anwendung erklärt.**

Jede Einteilung wird manuell vorgenommen. Die Anwendung schlägt niemals selbständig eine Person vor,
belegt niemals automatisch einen Tag und überschreibt niemals eine Entscheidung. Stattdessen:

* bewertet sie **jede mögliche Person für jeden Tag und jede Rolle** live nach dem hinterlegten Regelwerk,
* zeigt das Ergebnis als **vierstufige Ampel** (grün / gelb / orange / rot),
* nennt zu jeder Bewertung **jede einzelne auslösende Begründung im Klartext**,
* verlangt bei roten Konflikten eine **explizite Bestätigung** und
* protokolliert diese Bestätigung revisionssicher mit Zeitstempel, Gründen und optionalem Kommentar.

Damit bleibt die Planungshoheit vollständig beim Menschen, während gleichzeitig kein Regelverstoß
unbemerkt bleibt.

### 1.2 Warum eine Tabelle und kein Kalenderraster

Die zentrale Darstellung ist bewusst eine **Excel-artige Zeilentabelle mit einer Zeile pro Kalendertag** –
nicht ein Monatsraster. Gründe:

* Der Dienstplan wird traditionell als Liste gelesen, verteilt und gedruckt; die Liste ist das gewohnte
  Format des Hauses.
* Eine Zeile pro Tag bietet Platz für **alle** Informationen dieses Tages nebeneinander: BD, HG, beide
  RBN-Felder, sämtliche Abwesenheiten und sämtliche Dienstwünsche.
* Vertikales Scrollen entspricht dem chronologischen Lesen; ein Monatsraster erzwingt Blicksprünge.
* Der Ausdruck entspricht 1 : 1 dem Bildschirm – kein zweites Layout, keine Überraschungen.

### 1.3 Der spezifische Nutzwert

Was die Anwendung für genau diesen Einsatzzweck auszeichnet:

* **Regelwerk statt Notizzettel.** Persönliche Absprachen (z. B. „Dr. Polednia dienstags und sonntags
  weder BD noch HG") sind fest kodiert und wirken bei jeder Auswahl, statt im Gedächtnis der Planenden
  zu leben.
* **Monatsübergreifende Prüfung.** Abstandsregeln enden nicht am Monatsersten. Vor- und Folgemonat werden
  im Hintergrund vorgeladen, damit Wochenend-, Abstands- und BD-FZA-BD-Prüfungen über Monatsgrenzen hinweg
  korrekt greifen.
* **Ableitungen statt Doppeleingaben.** Der Freizeitausgleich nach einem Dienst wird abgeleitet und
  angezeigt, ohne dass er von Hand gepflegt werden muss.
* **Sofortige Verteilungstransparenz.** Unter dem Plan steht jederzeit, wer wie viele BD und HG hat, wie
  viele Wochenenden das entspricht und wie weit jede Person vom Soll entfernt ist.
* **Farbliche Monatsidentität.** Jeder Monat hat eine eigene Grundfarbe. Beim Blättern ist auf einen Blick
  klar, in welchem Monat man sich befindet – und der Wechsel selbst ist als weiche Bewegung gestaltet.
* **Kein Serverzwang.** Bei Netzausfall wird lokal weitergearbeitet; sobald der Server wieder antwortet,
  synchronisiert die Anwendung ohne Zutun.

---

## 2. Technischer Überblick

### 2.1 Technologie-Entscheidungen

| Bereich | Umsetzung |
|---|---|
| Frontend | Reines ES-Modul-JavaScript, kein Framework, kein Build-Schritt |
| Styling | Eine einzelne handgeschriebene `styles.css`, moderne CSS-Features |
| Backend | Cloudflare Pages Functions (serverless, Edge) |
| Datenhaltung | Cloudflare KV (Key-Value-Store), Binding `DIENSTPLAN_KV` |
| Lokale Persistenz | `localStorage` (Bootstrap-Stammdaten und jeder geladene Monat) |
| Offline-Fähigkeit | Service Worker (Network-First für Anwendungscode, Cache-First für Assets) |
| Excel | SheetJS (`xlsx` 0.20.3) via CDN, `defer` geladen |
| Tests | `node:test` aus der Node-Standardbibliothek, keine externen Test-Abhängigkeiten |

### 2.2 Warum kein Build-Schritt

Die gesamte Anwendung besteht aus statischen Dateien, die der Browser direkt lädt. Es gibt kein Bundling,
kein Transpiling, keine Node-Abhängigkeit im Produktivpfad. Vorteile für den Klinikbetrieb:

* Ein Deployment ist ein Git-Push – Cloudflare Pages liefert das Repository-Root unverändert aus.
* Jede Datei im Repository ist exakt die Datei, die im Browser läuft; Debugging ohne Sourcemaps.
* Keine Abhängigkeitsdrift, keine Sicherheitslücken in einer Build-Toolchain.
* `npm run check` und `npm test` benötigen nur Node selbst.

### 2.3 Laufzeit-Anforderungen im Browser

Genutzte moderne Web-Plattform-Features:

* **ES-Module** (`<script type="module">`) mit statischen Imports.
* **`<dialog>` mit `showModal()`** für alle vier Dialoge, inklusive nativem `::backdrop`, Fokusfalle und
  Escape-Handling.
* **`@property`** zur Typisierung der Monatsvariablen als `<color>`. Der Farbverlauf selbst hängt nicht
  daran – er wird in JavaScript interpoliert (siehe 11.3) und funktioniert deshalb auch ohne diese
  Unterstützung.
* **`color-mix(in srgb, …)`** für die gesamte abgeleitete Farbhierarchie.
* **`backdrop-filter`** für die Glas-Optik der Panels.
* **`structuredClone`** für tiefe Kopien der Vorgabedaten.
* **`localStorage`**, **`fetch`**, **Service Worker**, **Web App Manifest**.

Zielbrowser sind aktuelle Chromium-, Firefox- und Safari-Versionen. Da der Farbverlauf in JavaScript
gerechnet und als fertige `rgb()`-Werte geschrieben wird, ist er von `@property`- und
`color-mix`-Eigenheiten der jeweiligen Engine unabhängig.

---

## 3. Projektstruktur

```
.
├── index.html                     Vollständiges statisches Markup: Shell, Tabellengerüst, alle 4 Dialoge
├── styles.css                     Gesamtes Design: Layout, Glas-Optik, Monatsfarben, Animationen, Druck
├── manifest.webmanifest           PWA-Manifest (Name, Icon, Farben, standalone)
├── sw.js                          Service Worker: Precache und Laufzeit-Cache
├── _headers                       Cloudflare-Pages-Sicherheitsheader
├── package.json                   Skripte: check, test, deploy-note
├── icons/
│   └── icon.svg                   Skalierbares App-Icon (any + maskable)
├── js/
│   ├── app.js                     Anwendungslogik: Rendering, Ereignisse, Dialoge, Import/Export
│   ├── theme.js                   Monatsfarbsystem: Paletten, OKLCH-Farbmathematik, Übergangsschleife
│   ├── state.js                   Zustandsobjekt, Lade-/Speicherpfade, localStorage, Monats-Cache
│   ├── rules.js                   Regelwerk: Bewertung, Statistik, Selektoren, Datumsutilities
│   ├── defaults.js                Vorgabedaten: Personal, Abwesenheits-/Wunschtypen, Monatsnamen
│   └── api.js                     Dünner Fetch-Wrapper über alle REST-Endpunkte
├── functions/
│   ├── _utils.js                  KV-Zugriff, JSON-Antworten, Schlüsselbildung, Schema-Normalisierung
│   └── api/
│       ├── bootstrap.js              GET  /api/bootstrap
│       ├── settings.js               GET/PUT /api/settings
│       ├── staff.js                  GET/PUT /api/staff
│       ├── rbn-names.js              GET/PUT /api/rbn-names
│       ├── export.js                 GET  /api/export
│       ├── import.js                 POST /api/import
│       └── month/[year]/[month].js   GET/PUT /api/month/:year/:month
└── tests/
    ├── rules.test.js              Regressionstests für Kernregeln und Statistik
    └── theme.test.js              Regressionstests für Farbmathematik, Kontrast und Zeitverlauf
```

### 3.1 Modulverantwortlichkeiten und Abhängigkeitsrichtung

```
defaults.js   (keine Abhängigkeiten – reine Daten und Datums-Helfer)
     ▲
     ├── rules.js    (reine Funktionen: Bewertung, Statistik, Getter/Setter – kein DOM)
     ├── state.js    (Zustand, Persistenz, Netzwerk – kein DOM)
     ├── api.js      (Netzwerk – kein DOM)
     ▲
theme.js         (Paletten und Farbmathematik rein; nur applyMonthTheme fasst das DOM an)
     ▲
     └── app.js      (Rendering, Ereignisse, Dialoge)
```

Diese Trennung ist strikt: `rules.js` und `defaults.js` enthalten **keinerlei** DOM- oder
Browser-API-Zugriff und sind deshalb direkt in Node testbar. In `theme.js` ist der gesamte
rechnende Teil – Farbraumkonversion, Mischung, Zeitkurve – ebenfalls seiteneffektfrei und
exportiert; nur `applyMonthTheme` schreibt tatsächlich auf `<html>`. Dadurch sind Farbharmonie
und Kontrast automatisiert prüfbar, statt nur im Browser beurteilbar. `functions/_utils.js` importiert
`js/defaults.js` – Personalstamm und leeres Monatsschema sind damit auf Client und Server garantiert
identisch, ohne Duplikat.

---

## 4. Datenmodell

### 4.1 Der Monat als Datensatz

Alles ist monatsweise organisiert. Ein Monat ist ein eigenständiges JSON-Objekt (`createEmptyMonth`):

```jsonc
{
  "schemaVersion": 1,
  "year": 2026,
  "month": 7,
  "revision": 12,                       // steigt bei jedem Speichern um 1
  "updatedAt": "2026-07-14T09:21:03.512Z",

  "days": {                             // ein Eintrag je Kalendertag, ISO-Datum als Schlüssel
    "2026-07-01": { "bd": "lurz", "hg": "dalitz", "rbn1": "Meyer", "rbn2": "", "notes": "" }
  },

  "absences":       { "lurz": { "2026-07-20": "urlaub" } },
  "absenceSources": { "lurz": { "2026-07-20": "manual" } },   // "manual" | "import"
  "preferences":    { "martin": { "2026-07-04": "kein-bd" } },

  "overrideLog": [                      // jede bestätigte rote Einteilung
    {
      "timestamp": "2026-07-14T09:20:55.104Z",
      "dateIso": "2026-07-11",
      "role": "bd",
      "staffId": "becker",
      "reasons": ["Urlaub eingetragen"],
      "comment": "mit Mitarbeitender abgestimmt"
    }
  ],
  "importLog": []
}
```

**Feldsemantik im Einzelnen:**

* `schemaVersion` – Formatkennung für zukünftige Migrationen.
* `year`, `month` – Redundant zum Speicherschlüssel, damit ein exportierter Monat selbsterklärend bleibt.
* `revision` – Monoton steigender Zähler, in `persistMonth` erhöht. Dient der Nachvollziehbarkeit.
* `updatedAt` – ISO-Zeitstempel des letzten Speicherns.
* `days` – **Vollständig vorbelegt**: `createEmptyMonth` erzeugt für jeden Tag des Monats einen Eintrag,
  auch wenn nichts eingetragen ist. Dadurch ist die Einfügereihenfolge der Objektschlüssel chronologisch
  und das Rendering kann direkt über `Object.entries(days)` laufen. Schaltjahre werden über
  `new Date(year, month, 0).getDate()` korrekt behandelt (getestet: 2028 = 29, 2027 = 28 Tage).
* `days[iso].bd` / `.hg` – **Personen-ID** (nicht Name!), leer bei offener Stelle.
* `days[iso].rbn1` / `.rbn2` – Freitext für Rufbereitschaft Nuklearmedizin, erste und zweite Kraft.
* `days[iso].notes` – Im Datenmodell vorhandenes Freitextfeld, aktuell in der Tabelle nicht dargestellt.
* `absences[staffId][iso]` – Typkennung aus `ABSENCE_TYPES`.
* `absenceSources[staffId][iso]` – Herkunft der Abwesenheit. Entscheidend, weil die Anzeige importierte und
  manuelle FZA-Einträge unterschiedlich behandelt (siehe 8.5.4).
* `preferences[staffId][iso]` – Typkennung aus `PREFERENCE_TYPES`.
* `overrideLog` – Wächst nur an; kein Eintrag wird je entfernt.
* `importLog` – Reserviert für Importprotokolle.

### 4.2 Globale Datensätze

Neben den Monaten existieren drei globale Objekte:

| Schlüssel | Inhalt |
|---|---|
| `app:settings` | `{ schemaVersion, holidayRegion: "SN", fixedMenuOrder, appName }` |
| `app:staff` | Vollständige Personalliste (siehe Abschnitt 5) |
| `app:rbn-names` | Alphabetisch sortiertes, dublettenfreies Array der bisher eingegebenen RBN-Namen |

### 4.3 Speicherschlüssel

| Ort | Schlüsselformat |
|---|---|
| Cloudflare KV, Monat | `year:2026:month:07` |
| Cloudflare KV, global | `app:settings`, `app:staff`, `app:rbn-names` |
| `localStorage`, Monat | `dienstplanrad:month:2026-07` |
| `localStorage`, global | `dienstplanrad:bootstrap` |

### 4.4 In-Memory-Zustand

`state` (in `js/state.js`) hält zur Laufzeit:

| Feld | Bedeutung |
|---|---|
| `settings`, `staff`, `rbnNames` | Aktuelle Stammdaten |
| `months` | `Map` von `"JJJJ-MM"` auf Monatsobjekt – der Arbeits-Cache |
| `currentYear`, `currentMonth` | Angezeigter Monat |
| `saveStatus` | `loading` \| `saving` \| `saved` \| `offline` \| `error` |
| `dirty` | Ungespeicherte Änderungen vorhanden |
| `saveTimer` | Handle des Debounce-Timers |
| `serverReady` | Letzte Serverkommunikation erfolgreich |
| `currentBatchMode` | `absence` \| `preference` – aktiver Modus des Sammel-Dialogs |
| `currentPicker` | `{ dateIso, role }` des offenen Auswahldialogs |
| `cachedBootstrap` | Rohantwort des letzten Bootstrap-Aufrufs |

Der `months`-Cache ist bewusst monatsübergreifend: Regeln wie „BD-Wochenende direkt nach BD-Wochenende"
lesen über `getAssignment(state, iso, role)` aus **beliebigen** geladenen Monaten, nicht nur aus dem
angezeigten.

---

## 5. Stammdaten: Mitarbeitende, Abwesenheiten, Wünsche

### 5.1 Personalstamm

Der Standard-Personalstamm ist in `js/defaults.js` als `DEFAULT_STAFF` hinterlegt und wird beim ersten
Serverstart in KV geschrieben. Danach ist die KV-Kopie maßgeblich.

| ID | Name | Rolle | Kategorie | BD-Soll | Max. BD | HG | Sa-BD | Aktiv ab |
|---|---|---|---|---|---|---|---|---|
| `schaefer` | Prof. Schäfer | Chefarzt | `urlaub-only` | – | – | – | – | 2025-01-01 |
| `lurz` | Dr. Lurz | FA/OA | `fa` | 4 | – | ja | ja | 2025-01-01 |
| `polednia` | Dr. Polednia | FA/OA | `fa` | 3 | – | ja | ja | 2025-01-01 |
| `dalitz` | Fr. Dalitz | FÄ/OÄ | `fa` | 4 | – | ja | ja | 2025-01-01 |
| `becker` | Dr. Becker | FÄ/OÄ | `fa` | 3 | – | ja | ja | 2025-01-01 |
| `hellmann` | Fr. Hellmann | FÄ | `fa` | 2 | **2** | ja | ja | **2026-10-01** |
| `martin` | Dr. Martin | FA | `fa` | 4 | – | ja | ja | 2025-01-01 |
| `elhouba` | Hr. El Houba | AA → **FA ab 2026-09-22** | `aa` | 4 | – | nein → **ja** | nein → **ja** | 2025-01-01 |
| `licenji` | Fr. Licenji | AÄ | `aa` | 4 | – | nein | nein | 2025-01-01 |
| `sebastian` | Hr. Sebastian | AA | `aa` | 4 | – | nein | nein | 2025-01-01 |

**Feldbedeutungen:**

* `id` – Interner, unveränderlicher Schlüssel. Alle Einteilungen speichern diese ID, nie den Namen. Eine
  Namensänderung wirkt dadurch rückwirkend auf alle Pläne, ohne Datenmigration.
* `name` – Anzeigename in Tabelle, Dialogen und Excel-Export.
* `short` – Kurzform für die dicht gesetzten Zusammenfassungsspalten („Becker: U").
* `category` – `fa` (Facharzt), `aa` (Assistenzarzt), `urlaub-only` (erscheint nur in der Abwesenheitsliste).
* `roleLabel` – Angezeigte Funktionsbezeichnung, geschlechtsgerecht gepflegt (FA/FÄ, AA/AÄ, OA/OÄ).
* `activeFrom` / `activeUntil` – Zeitfenster der Zugehörigkeit. Außerhalb erscheint die Person weder im
  Auswahldialog noch in der Statistik. `activeUntil: null` bedeutet „unbefristet".
* `includeInPlanning` – Teil des Dienstpools (BD/HG einteilbar).
* `includeInAbsenceList` – Erscheint in Abwesenheits- und Wunschverwaltung. Für Prof. Schäfer ist dies
  `true`, während `includeInPlanning` `false` ist: Der Chefarzt wird nicht eingeteilt, seine Abwesenheiten
  werden aber geführt.
* `bdTarget` – Monatlicher BD-Richtwert. Überschreitung erzeugt eine gelbe Warnung, keine Sperre.
* `maxBd` – Hartes Monatsmaximum. Erreichen erzeugt einen **roten** Konflikt.
* `canHg`, `canSaturdayBd` – Qualifikationsflags.
* `promotionDate`, `promotedRoleLabel`, `promotedCanHg`, `promotedCanSaturdayBd` – **Zeitgesteuerter
  Rollenwechsel.** Ab dem Stichtag gelten die `promoted*`-Werte. Die Bewertung nutzt immer das Datum des
  jeweiligen Diensttages, nicht das heutige Datum – ein Plan für Dezember 2026 rechnet also bereits mit der
  Beförderung, ein Plan für Juli 2026 noch nicht.

### 5.2 Anzeigereihenfolge

`STAFF_ORDER` legt die Reihenfolge im Auswahldialog fest und ist bewusst **nicht alphabetisch**, sondern
folgt der eingespielten Planungsreihenfolge des Hauses:

```
lurz → polednia → dalitz → becker → hellmann → martin → elhouba → licenji → sebastian
```

`getPlanningStaff()` wendet diese Reihenfolge an und filtert anschließend nach `includeInPlanning` und
Aktivzeitraum am konkreten Tag. Die Liste ist damit tagesabhängig unterschiedlich lang.

### 5.3 Abwesenheitstypen (`ABSENCE_TYPES`)

| ID | Label | Kürzel in der Tabelle |
|---|---|---|
| `urlaub` | Urlaub | `U` |
| `fza` | FZA/Frei | `FZA` |
| `weiterbildung` | Weiterbildung | `WB` |
| `sonstige` | Sonstige Abwesenheit | `abwesend` |

Jede Abwesenheit erzeugt bei einer Einteilung an diesem Tag einen **roten** Konflikt.

### 5.4 Dienstwunschtypen (`PREFERENCE_TYPES`)

| ID | Label | Kürzel | Wirkung |
|---|---|---|---|
| `kein-bd` | Kein BD | `kein BD` | rot bei BD |
| `kein-hg` | Kein HG | `kein HG` | rot bei HG |
| `kein-dienst` | Kein Dienst | `kein Dienst` | rot bei BD **und** HG |
| `bd-bevorzugt` | BD bevorzugt | `+BD` | positiver Hinweis bei BD |
| `hg-bevorzugt` | HG bevorzugt | `+HG` | positiver Hinweis bei HG |
| `dienst-bevorzugt` | Dienst bevorzugt | `+Dienst` | positiver Hinweis bei beiden |

Positive Wünsche verschlechtern die Bewertung nie – sie erscheinen als zusätzliche Begründungszeile im
Tooltip und in der Auswahlliste und machen sichtbar, dass hier ein Wunsch **erfüllt** wird.

---

## 6. Das Regelwerk im Detail

Herzstück ist `evaluateCandidate({ state, monthData, dateIso, role, staffId })` in `js/rules.js`. Die
Funktion wird für **jede Person in jeder geöffneten Auswahlliste** und zusätzlich für **jede bereits
gesetzte Einteilung bei jedem Rendering** aufgerufen. Sie ist frei von Seiteneffekten.

### 6.1 Severity-Modell

```js
const severityRank = { green: 0, yellow: 1, orange: 2, red: 3, gray: -1 };
```

Jede zutreffende Regel ruft `push(level, reason)` auf. Das Endniveau ist das **Maximum** aller Level, die
Begründungsliste enthält jedoch **alle** ausgelösten Gründe – auch die von niedrigerem Rang. Nichts wird
unterdrückt: Wer eine rote Einteilung bestätigt, sieht dabei auch die gelben Nebenhinweise.

| Stufe | Bedeutung | Konsequenz in der Bedienung |
|---|---|---|
| **grün** | Keine relevanten Konflikte | Direkt wählbar |
| **gelb** | Hinweis, planerisch vertretbar | Direkt wählbar |
| **orange** | Konflikt, nachrangig wählen | Direkt wählbar, deutlich markiert |
| **rot** | Regelverstoß | Bestätigungsdialog und Protokolleintrag |
| **grau** | Person zu diesem Zeitpunkt nicht aktiv / nicht im Pool | Erscheint gar nicht erst in der Liste |

Ist am Ende `level === 'green'` und keine Begründung gesetzt, ergänzt die Funktion „Keine relevanten
Konflikte", damit der Tooltip nie leer bleibt.

### 6.2 Rollen- und Aktivitätsprüfungen

| Regel | Stufe |
|---|---|
| Person nicht im aktiven Dienstpool (`includeInPlanning === false`) | grau |
| Person am Tag nicht aktiv (außerhalb `activeFrom` / `activeUntil`) | grau |
| HG, aber `canHg === false` → „HG nur für Fachärzte zulässig" | **rot** |
| Samstags-BD, aber `canSaturdayBd === false` → „Samstags-BD nur für Fachärzte zulässig" | **rot** |

Für `canHg` und `canSaturdayBd` gilt stets der über `getRoleProperties(person, dateIso)` **zum Diensttag**
ermittelte Wert – inklusive Beförderungsstichtag.

### 6.3 Tages- und Personenkollisionen

| Regel | Stufe |
|---|---|
| Dieselbe Person am selben Tag bereits in der jeweils anderen Rolle | **rot** |
| Abwesenheit am Tag eingetragen (jeder Typ) | **rot** |
| Wunsch „kein Dienst" | **rot** |
| Wunsch „kein BD" bei BD-Einteilung | **rot** |
| Wunsch „kein HG" bei HG-Einteilung | **rot** |
| Wunsch „BD/HG/Dienst bevorzugt" passend zur Rolle | grün (positiver Hinweis) |

### 6.4 Personenspezifische Sonderregeln

Fest kodierte Hausabsprachen:

| Regel | Stufe |
|---|---|
| **Dr. Polednia** dienstags und sonntags weder BD noch HG | **rot** |
| **Dr. Becker** Samstags-BD nur nachrangig | orange |
| **Fr. Dalitz** HG an Sonntag/Montag, wenn am selben Tag Hr. Sebastian BD hat, nur nachrangig | orange |
| **Dr. Becker** BD am nächsten regulären Werktag nach eigenem Samstags-BD gesperrt | **rot** |

Die letzte Regel prüft rückwärts bis zu drei Tage: Liegt in diesem Fenster ein Samstag mit Becker-BD und
sind alle Tage dazwischen Wochenendtage, ist der betrachtete Tag der erste reguläre Werktag danach und für
BD gesperrt.

### 6.5 BD-Abstandsregeln

Für die Rolle BD wird die **vollständige, monatsübergreifende** Liste eigener BD-Termine der Person
gebildet (`listOwnRoleDates` über alle Einträge in `state.months`), sortiert und der unmittelbar
vorhergehende BD gesucht:

| Situation | Stufe | Begründungstext |
|---|---|---|
| Abstand = 1 Tag | gelb | „BD bereits am Vortag" |
| Abstand = 2 Tage, Muster BD–FZA–BD, alle drei Tage Mo–Fr, am Zwischentag `fza` eingetragen | gelb | „BD–FZA–BD werktags" |
| Abstand 2–3 Tage (sonstige Fälle) | gelb | „Kurzer Abstand zum letzten BD" |

Die BD-FZA-BD-Erkennung liest den Zwischentag aus dem **richtigen** Monatsobjekt – auch wenn dieser Tag im
Vormonat liegt.

### 6.6 Kontingentregeln

| Regel | Stufe |
|---|---|
| `maxBd` gesetzt und im Monat bereits erreicht → „Monatsmaximum von N BD bereits erreicht" | **rot** |
| Sonst: `bdTarget` im Monat bereits erreicht → „BD-Richtwert N bereits erreicht" | gelb |

Die Prüfungen schließen einander aus: Wo ein hartes Maximum greift, erscheint kein zusätzlicher
Richtwerthinweis. Gezählt wird über `countRoleInMonth` ausschließlich innerhalb des angezeigten Monats.

### 6.7 Urlaubsübergang

| Regel | Stufe |
|---|---|
| BD am Tag unmittelbar vor Urlaubsbeginn („BD unmittelbar vor Urlaubsbeginn") | orange |

Erkannt wird der Folgetag mit Abwesenheitstyp `urlaub`.

### 6.8 HG-Häufungsregeln

| Regel | Stufe |
|---|---|
| HG an drei aufeinanderfolgenden Tagen (Vortag **und** Vorvortag ebenfalls HG) | orange |
| Erneuter HG innerhalb von drei Kalendertagen | gelb |
| HG am Tag vor eigenem BD | orange |

**Ausnahme:** Die Kombination *Freitag HG + Samstag BD* ist ein bewusst gewünschtes, eingespieltes
Wochenendmuster und wird nicht bemängelt.

### 6.9 Wochenendregeln

`applyWeekendWarnings` betrachtet ausschließlich Freitag, Samstag und Sonntag. Die drei Tage werden über
den zugehörigen Freitag zu einer **Wochenendeinheit** normalisiert; anschließend wird das Vorwochenende
(Freitag–Sonntag) geprüft:

| Situation | Stufe |
|---|---|
| BD am aktuellen Wochenende, BD bereits am Vorwochenende | **rot** („BD-Wochenende direkt nach BD-Wochenende") |
| Sonstige Dienstwiederholung an aufeinanderfolgenden Wochenenden | orange |

### 6.10 Oster-/Pfingst-Alternanz

`applyHolidayBlockWarnings` definiert zwei Blöcke:

* **Osterblock:** Karfreitag, Karsamstag, Ostersonntag, Ostermontag
* **Pfingstblock:** Pfingstsamstag, Pfingstsonntag, Pfingstmontag

Liegt der betrachtete Tag in einem der Blöcke und hat dieselbe Person im **jeweils anderen** Block bereits
BD oder HG, wird „Bereits Dienst im alternierenden Oster-/Pfingstblock" als **orange** gemeldet. Damit wird
die Hausregel unterstützt, dass niemand beide großen Feiertagsblöcke eines Jahres trägt.

### 6.11 Sammelprüfung `collectIssues`

Zusätzlich zur Einzelbewertung existiert eine Monatsprüfung, die zusammenträgt:

* jeden Tag ohne BD und jeden Tag ohne HG als gelben Punkt,
* jede gesetzte Einteilung, deren Bewertung orange oder rot ist,
* **Becker/Martin gleichzeitig an einem Werktag abwesend** als roten Punkt mit dem Hinweis
  „CT-Leitungsbesetzung prüfen".

Das Ergebnis ist nach Schweregrad absteigend sortiert.

### 6.12 Wochenend-Äquivalent

`computeWeekendEquivalent(monthData, staffId)` gruppiert alle Freitage, Samstage und Sonntage des Monats zu
Wochenendeinheiten und bewertet je Einheit:

| Belegung der Einheit | Gewicht |
|---|---|
| mindestens ein BD | **1,0** |
| kein BD, aber mindestens ein HG | **0,5** |
| weder BD noch HG | 0 |

Ein BD-Wochenende zählt also unabhängig davon, ob es einen oder drei BD-Tage umfasst, genau einmal – der
Kennwert misst *belastete Wochenenden*, nicht Dienste. Der Testfall bestätigt: BD am 03.07., HG am 05.07.
und HG am 10.07.2026 ergeben 1,5.

---

## 7. Feiertagslogik

### 7.1 Berechnung

Feiertage werden vollständig lokal berechnet – kein externer Dienst, kein Netzzugriff, dadurch auch offline
korrekt. Grundlage ist die **Gaußsche Osterformel** (`calculateEasterUtc`), aus der alle beweglichen
Feiertage abgeleitet werden.

### 7.2 Berücksichtigte Feiertage (Sachsen, `holidayRegion: "SN"`)

**Feste Termine:**

| Datum | Feiertag |
|---|---|
| 01.01. | Neujahr |
| 01.05. | Tag der Arbeit |
| 03.10. | Tag der Deutschen Einheit |
| 31.10. | Reformationstag |
| 25.12. | 1. Weihnachtsfeiertag |
| 26.12. | 2. Weihnachtsfeiertag |

**Bewegliche Termine (relativ zu Ostersonntag):**

| Offset | Feiertag |
|---|---|
| −2 | Karfreitag |
| +1 | Ostermontag |
| +39 | Christi Himmelfahrt |
| +50 | Pfingstmontag |

**Buß- und Bettag:** Der Mittwoch vor dem 23. November – berechnet, indem vom 23. November rückwärts zum
vorangehenden Mittwoch gegangen wird (fällt der 23. selbst auf einen Mittwoch, wird eine volle Woche
zurückgegangen). Sachsen ist das einzige Bundesland mit diesem gesetzlichen Feiertag.

### 7.3 Zwischenspeicherung und Zeitzonensicherheit

Berechnete Feiertage werden pro Jahr in einer `Map` gecacht. Sämtliche Feiertagsberechnungen laufen
**vollständig in UTC** (`Date.UTC`, `getUTC*`), damit keine Sommer-/Winterzeitverschiebung ein Datum um
einen Tag verrutschen lässt. Die Anzeige-Datumsfunktionen arbeiten dagegen bewusst lokal
(`new Date("2026-07-01T00:00:00")`), da sie ausschließlich formatieren.

### 7.4 Wirkung in der Oberfläche

* Die Tageszeile erhält die Klasse `holiday-row` mit der stärksten Farbstufe der Monatspalette.
* In der Wochentagsspalte steht unter dem ausgeschriebenen Wochentag der **Feiertagsname** in kleiner,
  fetter Schrift.
* Der Zeilentooltip (`title`) nennt den Feiertag.
* Im Sammel-Dialog erhalten Feiertagskacheln dieselbe Einfärbung und zeigen den Namen mit.
* Für die Ableitung des Freizeitausgleichs gelten Feiertage **nicht** als reguläre Werktage.

---

## 8. Benutzeroberfläche – Aufbau und Bedienung

### 8.1 Gesamtaufbau

```
┌──────────────────────────────────────────────────────────────────────┐
│ Ambient-Layer (drei weiche, driftende Farborbs, hinter allem)        │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ Topbar   Marke │ Monatsnavigation │ Speicherstatus               │ │
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │ Toolbar  Navigation & Verwaltung │ Import & Export               │ │
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │ Sheet-Panel                                                      │ │
│ │   Überschrift │ Monatsfarb-Badge │ Ampellegende                  │ │
│ │   Plantabelle (8 Spalten, eine Zeile je Tag, sticky Kopfzeile)   │ │
│ │   Statistik (Verteilungstabelle)                                 │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

Die Shell ist auf `max-width: 1720px` zentriert und nutzt ein Grid mit 9 px Abstand bei 12 px Außenabstand –
bewusst kompakt, damit auf einem Klinikmonitor möglichst viele Tageszeilen ohne Scrollen sichtbar sind.

### 8.2 Topbar

**Markenblock (links):**
* Quadratisches Logo „DR" mit dunklem Verlauf, Innenlicht und Schlagschatten.
* Eyebrow: „Klinik für Radiologie und Nuklearmedizin" – versal, weit gesperrt, klein.
* Titel: „DienstplanRAD".
* Subline: „Manuelle Dienstplanung · Cloud-Synchronisierung · Live-Validierung".

**Monatsnavigation (rechts, in einer Glas-Einfassung):**

| Element | Verhalten |
|---|---|
| `‹` Vormonat | Springt einen Monat zurück, inklusive Jahreswechsel |
| Monats-Dropdown | Alle zwölf Monate mit deutschem Namen |
| Jahres-Dropdown | Von `min(2025, aktuelles Jahr − 5)` bis `max(2030, aktuelles Jahr + 5)` |
| `›` Folgemonat | Springt einen Monat vor, inklusive Jahreswechsel |

Beide Pfeiltasten rechnen ausdrücklich mit den **aktuellen Werten der Dropdowns**, nicht mit dem
Zustandsobjekt. Dadurch bleibt das Verhalten auch dann korrekt, wenn ein Monatswechsel noch lädt. Der
Jahreswechsel entsteht automatisch über `new Date(jahr, monat - 1 + delta, 1)`: Ein Klick auf „›" im
Dezember 2026 landet zuverlässig im Januar 2027.

**Statusanzeige:**

| Punktfarbe | Text | Bedeutung |
|---|---|---|
| gelb | „Lädt …" | Monat wird geladen |
| gelb | „Speichert …" | Speichervorgang läuft |
| grün | „Gespeichert" | Serverstand aktuell |
| orange | „Offline – lokaler Stand" / „Offline gespeichert" | Nur lokal gespeichert |
| rot | (Fehlertext) | Fehlerzustand |

Der Punkt „atmet" dauerhaft (`status-breathe`, 2,4 s) und signalisiert damit ohne Text, dass die Anwendung
lebt und synchronisiert.

### 8.3 Toolbar

**Gruppe 1 – Navigation und Verwaltung:**

| Schaltfläche | Wirkung |
|---|---|
| **Aktueller Monat** | Setzt beide Dropdowns auf heute und öffnet den laufenden Monat |
| **Abwesenheiten** | Öffnet den Sammel-Dialog im Abwesenheitsmodus |
| **Dienstwünsche** | Öffnet den Sammel-Dialog im Wunschmodus |
| **Serverstand neu laden** | Lädt den angezeigten Monat mit `forceServer` neu; Status zeigt „Lädt Serverstand …" |

**Gruppe 2 – Import und Export:**

| Schaltfläche | Wirkung |
|---|---|
| **Excel importieren** | Dateidialog `.xlsx`/`.xls`, Mehrmonats-Import (siehe 14.1) |
| **Excel exportieren** | Erzeugt `dienstplan_JJJJ_MM.xlsx` des angezeigten Monats |
| **PDF exportieren** | Startet `window.print()` mit dem Druck-Stylesheet |
| **JSON sichern** | Vollsicherung aller Daten als JSON-Datei |
| **JSON laden** | Spielt eine JSON-Sicherung ein |

Die beiden Dateiauswahlen sind als `<label class="file-btn">` mit verstecktem `<input type="file">`
umgesetzt und damit optisch nicht von den übrigen Schaltflächen unterscheidbar.

### 8.4 Kopfbereich des Plans

Links: Eyebrow „Bereitschaftsdienstplan" über der Monatsüberschrift (z. B. „August 2026").
Rechts, übereinander:

* Das **Monatsfarb-Badge**: eine Pille mit „Monatskontrast · «Palettenname»", eingefärbt in der aktuellen
  Monatsfarbe, mit Glas-Hintergrund und farbigem Schein.
* Die **Ampellegende**: geeignet / Hinweis / Konflikt / Bestätigung nötig, jeweils mit Farbmuster.
  Auf schmalen Bildschirmen wird die Legende ausgeblendet, das Badge bleibt.

### 8.5 Die Plantabelle

Acht Spalten mit festen Breiten (`table-layout: fixed`, Mindestbreite 1090 px, horizontal scrollbar):

| # | Spalte | Breite | Inhalt |
|---|---|---|---|
| 1 | Tag | 42 px | Tageszahl, rechtsbündig, fett |
| 2 | Wochentag | 154 px | Ausgeschriebener Wochentag, darunter ggf. Feiertagsname |
| 3 | BD | 145 px | Einteilungsschaltfläche Bereitschaftsdienst |
| 4 | HG | 145 px | Einteilungsschaltfläche Hintergrunddienst |
| 5 | RBN | 125 px | Freitextfeld mit Vorschlagsliste |
| 6 | 2. RBN | 125 px | Freitextfeld mit Vorschlagsliste |
| 7 | Urlaub / FZA | 220 px | Zusammenfassung aller Abwesenheiten des Tages |
| 8 | Kein Dienst / Wünsche | 230 px | Zusammenfassung aller Dienstwünsche des Tages |

Die Kopfzeile ist `position: sticky` und bleibt beim vertikalen Scrollen stehen. Jede Zelle ist genau 30 px
hoch, ohne Innenabstand – die Steuerelemente füllen die Zelle vollständig aus. Das erzeugt die gewünschte,
dichte Tabellenkalkulations-Anmutung.

#### 8.5.1 Zeilenfarbgebung

Die Tabelle trägt die Monatsfarbe in zwei Richtungen: **senkrecht** als kräftiger Anker, **waagerecht**
als helle Wäsche.

| Fläche | Anteil der Monatsfarbe | Wirkung |
|---|---|---|
| **Wochentagsspalte** (alle Zeilen) | **46 %** | Dunkle Nuance, durchgehender senkrechter Streifen |
| Samstagszeile | 14 % | Hellste Wäsche, 4 px Kante links an der Tageszahl |
| Sonntagszeile | 22 % | Kräftigere Wäsche, 4 px kräftige Kante links |
| Feiertagszeile | 30 % | Stärkste Wäsche, 5 px Kante links, 3 px an der Wochentagsspalte |
| Werktagszellen sonst | – | Neutrales Weiß |

Zwei Gestaltungsentscheidungen stecken darin:

* **Die Wochentagsspalte behält ihre dunkle Nuance in jeder Zeile** – auch in Wochenend- und
  Feiertagszeilen. Dadurch entsteht ein ununterbrochener senkrechter Anker, an dem die waagerechten
  Wäschen entlanglaufen, statt ihn zu zerschneiden.
* **Unter den Zeilentypen bleibt die Wertigkeit erhalten:** Samstag ist besonders, Sonntag ist
  besonderer, ein Feiertag ist am besondersten. Weil eine ganze Zeile über die volle Tabellenbreite
  wirkt, tragen diese Flächen deutlich weniger Farbe als der schmale senkrechte Streifen – dieselbe
  Farbmenge würde in der Breite erschlagend wirken.

Alle vier Werte entstehen aus **einer** Grundfarbe, deshalb ist die Hierarchie in jedem der zwölf Monate
identisch wahrnehmbar und wechselt geschlossen mit.

**Schrift auf farbigen Flächen** verwendet einen eigenen Palettenton `--month-ink`: die Monatsfarbe auf
eine feste Helligkeit abgedunkelt, Farbton und Buntheit bleiben erhalten. Die Schrift trägt damit sichtbar
die Monatsfarbe und hält trotzdem in jeder Palette denselben Kontrast. Nachgemessen über alle zwölf
Paletten und alle vier Flächen liegt der schlechteste Wert bei **5,63:1** und damit durchgehend über
WCAG AA; ein Test hält das fest. Der zuvor verwendete Ton hätte auf der dunklen Wochentagsspalte in
keiner einzigen Palette AA erreicht (schlechtester Wert 3,33:1).

Zusätzlich liegt auf Wochenend- und Feiertagszeilen ein diagonaler, sehr schwacher Weißverlauf – dieselbe
Lichtkante, die auch Panels und Schaltflächen tragen, damit die eingefärbten Zeilen nicht flach wirken.

**Spezifitätsfalle:** Die Basisregel `.plan-table th, .plan-table td` hat die Spezifität (0,1,1). Ein
reiner Klassenselektor wie `.weekday-cell` (0,1,0) verliert dagegen – die Einfärbung der Wochentagsspalte
kam deshalb nie an, unabhängig von jedem Farbwechsel. Alle Zellregeln sind daher konsequent auf
`.plan-table td.<klasse>` (0,2,1) hochgezogen und die Zeilentypen auf `.plan-table tr.<typ> td` (0,2,2).
Damit ist die Rangfolge Zelle < Zeilentyp eindeutig und unabhängig von der Quellreihenfolge.

#### 8.5.2 Einteilungsschaltflächen (BD/HG)

Jede Zelle enthält eine Schaltfläche mit zwei Elementen:

* **Name** der eingeteilten Person, bei Überlänge mit Auslassungspunkten – oder `—` bei offener Stelle.
* **Chip** rechts: bei belegter Stelle die Bewertungsstufe („geeignet", „Hinweis", „Konflikt", „rot"), bei
  offener Stelle das neutrale Label „offen".

Der Tooltip (`title`) enthält **alle** Begründungen der Bewertung, je Zeile eine. Bei offener Stelle steht
dort die Handlungsaufforderung „BD eintragen" bzw. „HG eintragen".

Entscheidend: Die Bewertung wird **bei jedem Rendering neu berechnet**. Wird an anderer Stelle im Monat
etwas geändert – ein Urlaub gesetzt, ein Wochenende belegt, ein Kontingent gefüllt – aktualisieren sich
alle betroffenen Chips sofort. Ein Plan kann sich also im Nachhinein „einfärben", ohne dass man die
betroffene Zelle angefasst hat.

#### 8.5.3 RBN-Felder

Beide RBN-Spalten sind Freitextfelder mit Platzhalter „manuell" und einer gemeinsamen `<datalist>`. Beim
Verlassen eines Feldes:

1. Der getrimmte Wert wird in den Monat geschrieben.
2. Ist der Name neu, wird er in `state.rbnNames` aufgenommen, dedupliziert und mit
   `localeCompare(…, 'de')` sortiert – deutsche Umlaute landen also an der richtigen Stelle.
3. Die Namensliste wird lokal gesichert und – falls erreichbar – zum Server geschrieben.
4. Der Monat wird als geändert markiert und die Speicherung eingeplant.

Die Vorschlagsliste **lernt** damit im laufenden Betrieb: Nach wenigen Monaten genügt ein Anfangsbuchstabe.
Schlägt die Serverspeicherung fehl, ist das folgenlos – die Liste bleibt lokal erhalten.

#### 8.5.4 Zusammenfassungsspalten und die FZA-Ableitung

Die Spalten 7 und 8 sind vollflächige, unauffällige Schaltflächen. Sie zeigen kommagetrennt
`Kurzname: Kürzel` für alle Personen mit `includeInAbsenceList` und öffnen bei Klick den
Tagesmarkierungs-Dialog für genau dieses Datum. Der Tooltip zeigt dieselben Einträge zeilenweise
ausgeschrieben.

Die Abwesenheitsspalte enthält eine besondere Intelligenz – die **Ableitung des Freizeitausgleichs**:

* **Abgeleitete Anzeige (Dr. Becker):** Ist ein Tag der erste reguläre Werktag nach einem Samstags-BD von
  Dr. Becker, erscheint „Becker: FZA" **automatisch**, ohne dass eine Abwesenheit eingetragen wurde. Der
  Tooltip erklärt die Herkunft ausdrücklich: „automatisch aus Samstags-BD für den nächsten regulären
  Werktag abgeleitet". Ein bereits vorhandener manueller FZA-Eintrag wird dadurch nicht verdoppelt.
* **Unterdrückte Redundanz (alle Personen):** Ein FZA-Eintrag, der **nicht** manuell gesetzt wurde
  (`absenceSources ≠ "manual"`, also aus einem Import stammt) und der ohnehin auf den ersten regulären
  Werktag nach einem eigenen BD fällt, wird **nicht** angezeigt. Er ist selbstverständliche Folge des
  Dienstes und würde die Spalte nur zumüllen. Manuell gesetzte FZA bleiben immer sichtbar – wer sie bewusst
  eingetragen hat, will sie auch sehen.

„Regulärer Werktag" heißt dabei: Montag bis Freitag **und** kein sächsischer Feiertag. Die Suche läuft bis
zu sieben Tage rückwärts und bricht ab, sobald ein regulärer Werktag ohne BD dazwischenliegt – ein
Brückentag oder ein Feiertagsblock unterbricht die Ableitung also nicht.

#### 8.5.5 Mikrointeraktionen der Tabelle

* Zeilen erscheinen beim Rendern **gestaffelt**: `row-soft-arrive`, 300 ms, 7 ms Versatz je Zeile,
  90 ms Grundverzögerung. Der Monat „läuft ein" statt schlagartig zu erscheinen.
* Beim Überfahren verschiebt sich eine Zeile um 1 px nach rechts, wird minimal heller und gesättigter und
  hebt sich per `z-index` über ihre Nachbarn.
* Alle interaktiven Elemente der Zelle haben eine sichtbare `:focus-visible`-Kontur in der Monatsfarbe,
  nach innen versetzt, damit sie das enge Zellraster nicht sprengt.

---

## 9. Dialoge

Alle vier Dialoge sind native `<dialog>`-Elemente, geöffnet mit `showModal()`. Sie erben dadurch
Fokusfalle, Escape-zum-Schließen, Inertisierung des Hintergrunds und einen echten `::backdrop` – ohne
eigenen JavaScript-Aufwand. Jeder Dialog öffnet mit `dialog-glass-open` (250 ms: aus 12 px Tiefe, 97,5 %
Skalierung und 3 px Unschärfe heraus), der Hintergrund blendet in 220 ms ein.

### 9.1 Auswahldialog (Personalauswahl)

Geöffnet durch Klick auf eine BD- oder HG-Zelle.

* **Eyebrow:** „Bereitschaftsdienst" bzw. „Hintergrunddienst".
* **Titel:** Deutsches Datum und Rolle, z. B. „11.07.2026 · BD".
* **Untertitel:** „Farbkodierte Eignungsbewertung mit Tooltip-Begründung. Rote Konflikte erfordern eine
  explizite Bestätigung."
* **Liste:** Für jede an diesem Tag aktive, planbare Person eine Karte mit
  – Name und Bewertungs-Chip in der Kopfzeile,
  – **allen** Begründungen als einzelne Zeilen darunter,
  – Einfärbung der gesamten Karte nach Bewertungsstufe,
  – Tooltip mit denselben Begründungen.
* **Aktionen:** „Abbrechen" und „Eintrag löschen" (leert die Zelle).

Die Begründungen stehen **direkt in der Liste**, nicht nur im Tooltip. Die Entscheidung ist damit ohne
Hover und ohne zweiten Klick vollständig informiert – auf einem Touch-Gerät der einzige gangbare Weg.

### 9.2 Konfliktbestätigung

Erscheint ausschließlich, wenn eine Person mit roter Bewertung gewählt wird.

* **Eyebrow:** „Bestätigung erforderlich", Titel „Roter Konflikt".
* **Klartext:** „«Name» wird für BD am «Datum» mit rotem Konflikt eingetragen."
* **Gründe:** Jede rote Begründung als eigener roter Chip.
* **Kommentarfeld:** dreizeilig, optional, Platzhalter „z. B. mit Mitarbeitendem abgestimmt".
* **Aktionen:** „Abbrechen" oder „Trotzdem eintragen".

Bei Bestätigung wird die Einteilung gesetzt **und** ein Eintrag im `overrideLog` des Monats abgelegt:
Zeitstempel, Datum, Rolle, Personen-ID, sämtliche Gründe und der Kommentar. Anschließend schließen sich
Konflikt- **und** Auswahldialog. Der Vorgang ist damit vollständig dokumentiert und im JSON-Export
nachlesbar – ohne dass die Planenden dafür etwas tun müssen.

### 9.3 Tagesmarkierungs-Dialog

Geöffnet durch Klick auf eine der beiden Zusammenfassungsspalten.

* **Titel:** „Markierungen für «Datum»", Hinweis: „Mehrfachauswahl pro Datum. Änderungen werden automatisch
  gespeichert."
* Pro Person eine Zeile mit Name und Funktionsbezeichnung, darunter zwei Chip-Gruppen:
  * **Abwesenheit:** alle vier Typen plus „keine".
  * **Dienstwunsch:** alle sechs Typen plus „kein Wunsch".
* Der jeweils aktive Chip ist in der Monatsfarbe hervorgehoben.

Jeder Klick wirkt sofort: Wert setzen → als geändert markieren → Dialog neu aufbauen → Tabelle neu rendern.
Die Auswirkung auf die Ampeln im Hintergrund ist also unmittelbar sichtbar. Es gibt bewusst keine
„Übernehmen"-Schaltfläche – der Dialog ist ein Direktmanipulations-Werkzeug.

### 9.4 Sammel-Dialog (Komforteingabe)

Der schnellste Weg für Urlaubsblöcke und Wunschserien, geöffnet über „Abwesenheiten" oder „Dienstwünsche".

* **Kopf:** Modusabhängige Beschriftung, Untertitel „Beliebige einzelne Tage auswählen, Typ festlegen,
  gesammelt übernehmen."
* **Zwei Auswahlfelder:** Mitarbeitende und Typ. Eine Änderung baut das Raster sofort neu auf.
* **Tagesraster:** eine Kachel je Kalendertag mit Tageszahl, Wochentagskürzel, ggf. Feiertagsname und dem
  aktuell gesetzten Wert (oder `—`). Samstage, Sonntage und Feiertage tragen dieselbe Farbhierarchie wie
  die Plantabelle.
* **Vorbelegung:** Kacheln, die bereits den gewählten Typ tragen, sind vorausgewählt. Man sieht damit auf
  einen Blick den Bestand und kann ihn erweitern oder – durch Abwählen und erneutes Übernehmen –
  korrigieren.
* **Auswahl:** Klick schaltet eine Kachel um.
* **Aktionen:** „Auswahl zurücksetzen" (hebt alle Markierungen auf) und „Übernehmen" (schreibt den
  gewählten Typ auf alle markierten Tage, rendert neu, schließt den Dialog).

Auf schmalen Bildschirmen wird das Raster auf vier Spalten reduziert und die Auswahlfelder untereinander
gestellt.

---

## 10. Statistik und Auswertung

Unter dem Plan steht dauerhaft – nicht in einem Reiter, nicht in einem Dialog – die Verteilungstabelle mit
dem Zusatz „Direkt aus dem Monatsplan berechnet".

| Spalte | Inhalt |
|---|---|
| **Mitarbeitende** | Name |
| **BD** | Anzahl Bereitschaftsdienste im Monat |
| **HG** | Anzahl Hintergrunddienste im Monat |
| **Wochenende** | Wochenend-Äquivalent (BD = 1,0 / nur HG = 0,5), eine Nachkommastelle |
| **BD-Soll** | Richtwert der Person, leer wenn keiner gesetzt |
| **Rest** | Soll minus Ist; **negative Werte rot** hervorgehoben (`over-target`) |

Die letzte Zeile „Offen" zählt die Tage **ohne** BD und **ohne** HG. Sie ist die schnellste Antwort auf die
wichtigste Frage des Planungsprozesses: *Bin ich fertig?*

Aufgenommen werden nur Personen mit `includeInPlanning`, die **am Ersten des Monats aktiv** sind. Die
Funktionsbezeichnung wird zum **15. des Monats** ausgewertet, also zur Monatsmitte – fällt ein
Beförderungsstichtag in den Monat, zeigt die Statistik die überwiegend gültige Rolle. Beides ist durch
Tests abgesichert (Fr. Hellmann fehlt im September 2026 und erscheint im Oktober 2026).

Die Statistik rendert bei **jeder** Änderung neu. Eine Einteilung verschiebt die Zahlen sofort – man plant
also permanent mit sichtbarer Verteilung, statt am Ende nachzuzählen.

---

## 11. Monatsfarben, Animationen und Design-Philosophie

### 11.1 Gestaltungsidee

Die Oberfläche folgt einer **Liquid-Glass-/Aero-Peak-Ästhetik**: geschichtete, halbtransparente
Glasflächen über einem dunklen, leicht bewegten Farbraum. Das ist kein Selbstzweck. Der dunkle Hintergrund
lässt die eigentliche Arbeitsfläche – die weiße, streng gerasterte Tabelle – wie ein physisches Blatt
Papier auf einem Tisch wirken. Alles Bedienende (Panels, Leisten, Dialoge) liegt sichtbar *darüber*, alles
Inhaltliche liegt *darin*. Diese Ebenentrennung macht die Anwendung auch nach Stunden noch lesbar.

Das Farbsystem hält sich strikt an eine Regel: **Chrom ist neutral, Inhalt trägt Farbe.** Farbe erscheint
nur dort, wo sie Information transportiert – Wochenend- und Feiertagshierarchie, Ampelbewertung,
Speicherstatus, Monatsidentität.

### 11.2 Die zwölf Monatspaletten

Jeder Monat besitzt eine eigene, benannte Grundfarbe:

| Monat | Palette | Grundfarbe |
|---|---|---|
| Januar | Eisblau | `#4f8fbd` |
| Februar | Rubinrose | `#b46483` |
| März | Salbeigrün | `#5d9476` |
| April | Lavendel | `#8273bd` |
| Mai | Frühlingsgrün | `#4d9b62` |
| Juni | Türkis | `#3c9b9b` |
| Juli | Koralle | `#c66c5a` |
| August | Bernstein | `#bd812d` |
| September | Pflaume | `#94618f` |
| Oktober | Kupfer | `#aa6f45` |
| November | Schieferblau | `#657b9d` |
| Dezember | Tannengrün & Rubin | `#416f62` |

Die Auswahl ist bewusst **jahreszeitlich motiviert**: kühles Eisblau im Januar, Lavendel und Frühlingsgrün
im Frühjahr, warme Koralle und Bernstein im Hochsommer, Kupfer und Pflaume im Herbst, Tannengrün zur
Weihnachtszeit. Alle zwölf Töne haben eine vergleichbare Sättigung und Helligkeit, sodass Kontrast und
Lesbarkeit über das ganze Jahr konstant bleiben und keine Palette „lauter" wirkt als eine andere.

Aus jeder Palette entsteht ein vollständiger Variablensatz:

| Variable | Herkunft | Verwendung |
|---|---|---|
| `--month-accent` | Palette | Grundfarbe: Kanten, Fokusringe, Basis aller Ableitungen |
| `--month-accent-strong` | Palette | Dunklere Variante: kräftige Kanten, Badge-Text |
| `--month-ink` | berechnet | Schriftton auf farbigen Tabellenflächen, kontrastgeprüft |
| `--month-glow` | Palette | Halbtransparenter Schein: Ambient-Orbs, Panel-Schatten, Badge-Leuchten |
| `--month-panel-tint` | Palette | Sehr schwache Einfärbung der Glasflächen |
| `--weekday-field-bg` | berechnet | Wochentagsspalte, 46 % |
| `--saturday-row-bg` | berechnet | Samstagszeilen, 14 % |
| `--sunday-row-bg` | berechnet | Sonntagszeilen, 22 % |
| `--holiday-row-bg` | berechnet | Feiertagszeilen, 30 % |

Die berechneten Werte entstehen in `js/theme.js` als **fertige, konkrete Farben** und werden als
Inline-Style auf `<html>` geschrieben. Weitere Farben leitet das Stylesheet per `color-mix` ab –
Fokusringe, Chip-Hintergründe, Auswahlmarkierungen, Panel-Schein. **Eine** Farbe steuert das gesamte
Erscheinungsbild eines Monats.

Gemischt wird nicht linear in sRGB, sondern in **OKLCH**: Beim Aufhellen bleibt der Farbton exakt
erhalten, statt in Richtung Violett oder Grün zu kippen, wie es die naive sRGB-Mischung heller Töne tut.

### 11.3 Der Farbwechsel beim Monatswechsel

Dieser Wechsel ist die auffälligste Interaktion der Anwendung. Er wird **nicht** über CSS-Transitions
gefahren, sondern von `js/theme.js` selbst interpoliert – aus einem konkreten, gemessenen Grund.

#### Warum keine CSS-Transition

Der naheliegende Weg wäre, die Monatsvariablen per `@property` als `<color>` zu registrieren und eine
`transition` darauf zu legen. Das war die frühere Umsetzung, und sie war nicht reproduzierbar:

* **Der Start hängt vom freien Main-Thread ab.** Eine Transition beginnt mit der Stilberechnung des
  Frames, in dem der neue Wert erstmals berechnet wird. Genau in diesem Moment baut die Anwendung die
  Monatstabelle neu auf. Messungen zeigten mal einen weichen Verlauf, mal überhaupt keine Bewegung bis
  zum Ende – in einem Durchlauf stand die Farbe nach 1000 ms noch exakt auf dem Ausgangswert und sprang
  dann.
* **Abgeleitete Variablen lösen nicht überall neu auf.** Die Flächenfarben waren als nicht registrierte
  Custom Properties über `color-mix(… var(--month-accent) …)` definiert. Ob eine solche Ableitung
  während der Animation der Basisvariablen Frame für Frame neu aufgelöst wird, ist zwischen den Engines
  nicht verlässlich gleich.

#### Wie es jetzt läuft

1. **Sofortige Reaktion.** `openCurrentMonth` startet den Farbwechsel als **Erstes** – vor Speichern,
   Laden und Rendern. Er ist damit unabhängig von Netzgeschwindigkeit und Datenmenge und beginnt in dem
   Moment, in dem geklickt wird. Das gilt gleichermaßen für beide Pfeiltasten, das Monats-Dropdown, das
   Jahres-Dropdown und „Aktueller Monat".
2. **Ein Frame Vorlauf.** Danach wartet die Anwendung einen Animationsframe, bevor Laden und Rendern
   den Main-Thread belegen – der erste Schritt des Verlaufs ist damit gezeichnet, bevor Arbeit anfällt.
3. **Zeitbasierte Interpolation.** Eine `requestAnimationFrame`-Schleife schreibt in jedem Frame fertige
   Farbwerte. Der Fortschritt kommt aus `performance.now()`, nicht aus der Frame-Zählung: Blockiert ein
   langer Frame die Schleife, springt sie auf den korrekten Fortschritt und läuft weich weiter, statt
   stehenzubleiben. Genau diese Eigenschaft macht den Wechsel unempfindlich gegen Ladelast.
4. **OKLCH statt sRGB, über den kürzeren Farbtonbogen.** Eine Gerade durch den Farbraum führt zwischen
   gegenüberliegenden Tönen (Koralle → Tannengrün) nahe an der Neutralachse vorbei – gemessen fiel die
   Buntheit in der Mitte von 59 auf 11, die Fläche wurde für einen Moment grau. Über den Farbtonwinkel
   gedreht bleibt die Buntheit über den gesamten Weg erhalten: Die Fläche wandert sichtbar über Bernstein
   und Oliv nach Salbeigrün, statt durch Grau zu tauchen.
5. **Eine Kurve, die die volle Dauer nutzt.** Die sonst verwendete Kurve `cubic-bezier(.22, 1, .36, 1)`
   legt rund 98 % des Weges im ersten Drittel zurück – die Zielfarbe war nach 245 von 640 ms erreicht,
   der Rest der Dauer blieb wirkungslos. Für eine großflächige Farbfläche liest sich das als Schnappen.
   Der Wechsel läuft daher über **720 ms** mit `cubic-bezier(0.40, 0, 0.22, 1)`: ruhiger Antritt,
   getragene Mitte, weiches Auslaufen.
6. **Zwei Geschwindigkeiten.** Der Inhalt gleitet in 520 ms mit der schnelleren Kurve herein, die Farbe
   zieht in 720 ms darunter nach. Der Plan ist sofort lesbar, die Fläche kommt getragen hinterher – das
   Gegenteil eines gleichzeitigen Umschaltens.
7. **Weiche Verkettung.** Ein neuer Wechsel liest den **tatsächlich sichtbaren** Zustand als
   Ausgangspunkt, auch mitten in einem laufenden Verlauf. Schnelles Blättern kettet dadurch weich, statt
   zu springen.
8. **Nicht zerstörendes Sicherheitsnetz.** `render()` wendet die Palette des gerenderten Monats erneut an,
   damit Farbe und Inhalt auch bei Reload, Excel-Import oder JSON-Wiederherstellung nie auseinanderlaufen.
   Läuft bereits ein Übergang auf genau dieses Ziel, bleibt er unangetastet. Ohne diese Sperre schoss der
   Sicherheitsnetz-Aufruf den gerade gestarteten Verlauf ab und die Farbe sprang mitten in der Bewegung
   ans Ziel – nach außen exakt das Bild, das wie „gar keine Animation" aussah.
9. **Erstanwendung ohne Übergang.** Beim Programmstart werden die Farben direkt gesetzt. Die Anwendung
   startet in der richtigen Farbe, statt aus dem Standardblau hineinzublenden.
10. **Richtungsabhängige Inhaltsbewegung.** Monatstitel, Plantabelle und Statistik gleiten in Leserichtung
    ein: beim Vorwärtsblättern von rechts, beim Rückwärtsblättern von links. Bei einem Direktsprung
    bestimmt der Vorzeichenvergleich der Monatsordnungszahlen (`Jahr × 12 + Monat`) die Richtung – von
    März auf Dezember läuft es nach vorn, von Dezember auf März zurück.
11. **Mitziehende Umgebung.** Ambient-Orbs, Panel-Schatten, Farb-Badge, Fokusringe und die gesamte
    Flächenhierarchie leiten sich aus demselben Satz ab und wandern im selben Verlauf mit. Nichts bleibt
    in der alten Farbe zurück.
12. **Robuste Monatsnormalisierung.** Die Monatszahl wird modulo 12 normalisiert, sodass auch ein
    rechnerisch entstandener Wert außerhalb von 1–12 nie zu einer fehlenden Palette führt.

Das Farb-Badge nennt zusätzlich den Namen der Palette („Monatskontrast · Bernstein") – die Farbe ist damit
nicht nur Atmosphäre, sondern benannte, überprüfbare Information. Zur Diagnose spiegeln
`document.documentElement.dataset.month` und `dataset.palette` jederzeit den aktiven Zustand.

### 11.4 Weitere Animationen und Mikrointeraktionen

| Element | Effekt | Dauer |
|---|---|---|
| Panels beim Start | `glass-surface-enter`: aus 10 px Tiefe, 99,2 % Skalierung, 3 px Unschärfe | 560 ms, gestaffelt 0 / 55 / 110 ms |
| Ambient-Orb 1 | Drift über 34 rem, sanfte Skalierung, in `--month-accent` | 18 s, alternierend |
| Ambient-Orb 2 | Gegenläufige Drift in `--month-glow` | 22 s, alternierend |
| Ambient-Orb 3 | Weiße Aufhellung von unten | 26 s, alternierend |
| Glas-Reflex | `glass-reflection`: wandernde elliptische Lichtkante über jedem Panel | 12 s, alternierend |
| Topbar/Toolbar bei Hover | 2 px anheben, Rand aufhellen, Schein in Monatsfarbe | 240 ms |
| Tabellenrahmen bei Hover | Randfarbe wechselt zur Monatsfarbe, farbiger Außenschein | 260 ms |
| Schaltflächen bei Hover | 1 px anheben, hellerer Verlauf, tieferer Schatten | 160 ms |
| Statuspunkt | `status-breathe`: Skalierung 0,9 → 1,08 mit Leuchtstärke | 2,4 s, endlos |
| Tageszeilen (nur Erststart) | `row-soft-arrive`, 7 ms Versatz je Zeile | 300 ms |
| Farb-Badge beim Wechsel | `month-content-breathe`, Sättigungspuls | 680 ms |
| Dialoge | `dialog-glass-open` und Backdrop-Einblendung | 250 / 220 ms |
| Karten und Kacheln | 1 px anheben mit weichem Schatten | 160 ms |

Alle Bewegungen sind kurz, richtungsstabil und laufen über dieselbe Beschleunigungskurve. Nichts blinkt,
nichts springt, nichts wiederholt sich aufdringlich – die einzigen Dauerbewegungen (Orbs, Reflex,
Statuspunkt) sind so langsam, dass sie unterhalb der bewussten Wahrnehmungsschwelle bleiben.

Zwei Entscheidungen sind messbasiert und betreffen ausdrücklich den Monatswechsel:

* **Der Sättigungspuls liegt nur auf dem kleinen Farb-Badge.** Ein `filter` auf der gesamten Plantabelle
  erzwingt in jedem Frame ein Neurastern der kompletten Fläche und hat genau die Frames gekostet, die der
  Farbverlauf braucht. Tabelle und Statistik bewegen sich ausschließlich über `transform` und `opacity` –
  beides läuft im Compositor.
* **Die gestaffelte Zeilen-Einblendung ruht während des Monatswechsels.** Zusammen mit der
  Containerbewegung erschien die Tabelle rund 300 ms lang leer: Die letzte Zeile startet erst nach
  90 ms + 31 × 7 ms, der Plan fiel mitten im Wechsel in ein Loch. Jetzt gleitet eine bereits vollständig
  gesetzte Tabelle herein; beim Erststart bleibt der gestaffelte Aufbau erhalten.

### 11.5 Bewegungsreduktion

Die Anwendung respektiert `prefers-reduced-motion: reduce` auf drei Ebenen:

* **Global in CSS:** Alle Animations- und Übergangsdauern werden auf 0,001 ms gesetzt.
* **Gezielt:** Farbübergang, Inhalts-Slide und Sättigungspuls werden zusätzlich explizit deaktiviert.
* **In JavaScript:** `applyMonthTheme` und `animateMonthContent` prüfen die Einstellung selbst und setzen
  Farben dann hart, statt eine unterdrückte Animation zu starten.

Funktional ändert sich nichts – jede Farbe, jede Hierarchie und jede Information bleibt vollständig
erhalten. Auch beim Drucken werden die Einlaufanimationen ausdrücklich neutralisiert, damit kein
teiltransparenter Zwischenzustand auf Papier landen kann.

---

## 12. Persistenz, Synchronisierung und Offline-Betrieb

### 12.1 Start der Anwendung

```
DOMContentLoaded
  └─ init()
       ├─ cacheElements()          DOM-Referenzen einsammeln
       ├─ bindEvents()             alle Ereignisse registrieren
       ├─ buildStaticSelectors()   Monats- und Jahresliste aufbauen
       ├─ registerServiceWorker()  PWA-Registrierung (Fehler werden verschluckt)
       ├─ setStatus('loading')
       ├─ bootstrapState()         Stammdaten: Server → localStorage → Vorgaben
       ├─ applyMonthTheme(…, ohne Animation)
       ├─ populateSelectors()
       └─ openCurrentMonth(…, forceServer = true)
```

### 12.2 Dreistufige Ladekette

Sowohl `bootstrapState` als auch `loadMonth` folgen derselben Kaskade:

1. **Server** (`/api/…`) – bei Erfolg wird der Stand übernommen, `serverReady = true` gesetzt und eine
   Kopie in `localStorage` geschrieben.
2. **`localStorage`** – bei Netzfehler wird der letzte lokale Stand verwendet, `serverReady = false`.
3. **Leerer Monat / Vorgabestammdaten** – wenn auch lokal nichts vorliegt.

Es gibt damit **keinen Zustand, in dem die Anwendung nicht bedienbar ist**. Auch der Erstaufruf ohne Netz
liefert einen vollständig funktionsfähigen, leeren Monat mit korrekten Kalendertagen und Feiertagen.

### 12.3 Vorladen der Nachbarmonate

Nach jedem Monatswechsel lädt `warmAdjacentMonths(jahr, monat)` Vor- und Folgemonat parallel
(`Promise.allSettled`) in den Cache. Zwei Zwecke:

* **Regelkorrektheit.** Abstands-, Wochenend- und BD-FZA-BD-Prüfungen brauchen Daten jenseits der
  Monatsgrenze. Ohne Vorladen wäre ein BD am 1. des Monats regeltechnisch blind für den 31. des Vormonats.
* **Wahrgenommene Geschwindigkeit.** Das Blättern in Nachbarmonate erfolgt aus dem Speicher.

Wichtig: Das Vorladen **verändert den Statusindikator nicht**. `state.serverReady` wird vorher gesichert
und danach wiederhergestellt – ein fehlgeschlagener Hintergrundabruf darf einen erfolgreich geladenen
Hauptmonat nicht als „offline" erscheinen lassen.

### 12.4 Speicherstrategie

**Debounce statt Speicherknopf.** Jede Änderung ruft `markDirty()` auf, das über `scheduleSave` einen Timer
von **1100 ms** setzt. Weitere Änderungen innerhalb dieser Zeit verschieben den Zeitpunkt. Erst danach wird
geschrieben. Schnelle Eingabefolgen erzeugen so genau einen Speichervorgang.

Der Speichervorgang selbst (`persistMonth`):

1. `updatedAt` auf jetzt setzen, `revision` erhöhen.
2. **Immer zuerst** in `localStorage` schreiben – der lokale Stand ist damit sicher, bevor Netzwerk im
   Spiel ist.
3. Status auf „Speichert …".
4. `PUT /api/month/:year/:month`.
5. Erfolg → „Gespeichert", `dirty = false`. Fehler → „Offline gespeichert", `serverReady = false`, `dirty`
   bleibt gesetzt.

**Wichtig:** `markDirty()` merkt sich Jahr und Monat **zum Zeitpunkt der Änderung** in der Closure. Wird
während des laufenden Debounce der Monat gewechselt, wird trotzdem der korrekte – der geänderte – Monat
gespeichert.

### 12.5 Schutz vor Datenverlust

Drei Sicherungen greifen ineinander:

* **Vor jedem Monatswechsel:** Sind Änderungen offen, wird der Timer abgebrochen und der bisherige Monat
  **sofort ausgeschrieben**, bevor der neue geladen wird.
* **Vor dem Verlassen der Seite:** `beforeunload` löst eine Speicherung des aktuellen Monats aus.
* **Immer lokal zuerst:** Selbst ein abgebrochener Serverschreibvorgang lässt den Stand in `localStorage`
  zurück, von wo er beim nächsten Start geladen wird.

### 12.6 Wettlaufschutz beim Monatswechsel

`openCurrentMonth` vergibt bei jedem Aufruf eine fortlaufende `requestId`. Nach jedem `await` wird geprüft,
ob inzwischen ein neuerer Aufruf gestartet wurde; wenn ja, bricht der alte Aufruf **ohne Rendering** ab.
Schnelles, mehrfaches Klicken auf die Pfeiltasten kann so niemals dazu führen, dass ein zwischenzeitlich
fertig geladener älterer Monat den neueren überschreibt. Da der Farbwechsel vor dieser Kette liegt, folgt
die Farbe immer dem zuletzt angeforderten Monat.

---

## 13. Backend-API

Alle Endpunkte sind Cloudflare Pages Functions unter `functions/api/`. Antworten sind stets JSON mit
`Cache-Control: no-store` und `Content-Type: application/json; charset=utf-8`.

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/bootstrap` | Settings, Personal und RBN-Namen in einem Aufruf |
| `GET` | `/api/month/:year/:month` | Einen Monat lesen (`:month` zweistellig) |
| `PUT` | `/api/month/:year/:month` | Einen Monat schreiben |
| `GET` | `/api/settings` | Einstellungen lesen |
| `PUT` | `/api/settings` | Einstellungen schreiben |
| `GET` | `/api/staff` | Personal lesen |
| `PUT` | `/api/staff` | Personal schreiben |
| `GET` | `/api/rbn-names` | RBN-Namensliste lesen |
| `PUT` | `/api/rbn-names` | RBN-Namensliste schreiben |
| `GET` | `/api/export` | Vollsicherung: Settings, Personal, RBN-Namen und **alle** Monate 2025–2030 |
| `POST` | `/api/import` | Vollsicherung einspielen |

### 13.1 Zentrale Backend-Mechanismen

* **`getOrInit(context, key, fallback)`** – Liest einen Schlüssel; existiert er nicht, wird der Vorgabewert
  **geschrieben** und zurückgegeben. Der allererste Aufruf der Anwendung initialisiert damit den KV-Store
  vollständig selbst. Es gibt keinen Setup-Schritt.
* **`ensureMonthShape(year, month, payload)`** – Legt ein leeres Monatsgerüst an und mischt die Nutzdaten
  darüber, wobei `days` **feldweise** gemischt wird. Folgen: fehlende Tage werden ergänzt, ein
  unvollständiger oder älterer Datensatz wird beim Lesen **und** beim Schreiben normalisiert. Die Anwendung
  erhält nie einen Monat mit Lücken.
* **`kv(context)`** – Wirft eine klare Fehlermeldung, wenn das Binding `DIENSTPLAN_KV` fehlt, statt später
  mit undefiniertem Verhalten zu scheitern.
* **`defaults()`** – Erzeugt frische Kopien der Vorgabedaten aus `js/defaults.js`. Client und Server teilen
  sich damit **eine einzige Quelle** für Personalstamm und Monatsschema.
* Der Export iteriert die Jahre **2025 bis 2030** und nimmt nur tatsächlich vorhandene Monate auf; leere
  Zeiträume blähen die Sicherung nicht auf.
* Der Import schreibt nur die Abschnitte, die im Nutzdatenobjekt vorhanden sind – eine Teilwiederherstellung
  (etwa nur des Personalstamms) ist damit möglich.

---

## 14. Import und Export

### 14.1 Excel-Import (Bestandspläne)

Der Import ist auf die **im Haus gewachsene Arbeitsplan-Arbeitsmappe** zugeschnitten und liest mehrere
Monate in einem Durchgang.

**Blatterkennung:** Berücksichtigt werden Blätter mit den Namen `Jan`, `Feb`, `Mrz`, `Apr`, `Mai`, `Jun`,
`Jul`, `Aug`, `Sep`, `Okt`, `Nov`, `Dez`. Alle anderen Blätter werden stillschweigend übergangen.

**Kopf- und Spaltenerkennung:**
* Die **Tageszeile** ist die erste Zeile, die ab Spalte 3 mindestens 20 Zahlen zwischen 1 und 31 enthält –
  eine robuste Heuristik, die ohne feste Zeilennummern auskommt.
* Das **Jahr** wird über eine `20\d{2}`-Suche in den ersten beiden Zeilen der ersten Spalte gefunden;
  schlägt das fehl, gilt das aktuell angezeigte Jahr.
* Es werden nur Tageszahlen übernommen, die im jeweiligen Monat tatsächlich existieren – ein 31. Februar
  aus einer verrutschten Vorlage kann nicht entstehen.

**Zeilenerkennung:** Gesucht werden Zeilenpaare, deren erste Spalte einen Personennamen und deren zweite
Spalte den Text `Arbeitsplatz` enthält. Die Zeile darunter gilt als **Dienstzeile**. Namen werden
normalisiert (Mehrfachleerzeichen zusammengefasst, getrimmt, kleingeschrieben) und über eine
Zuordnungstabelle auf Personen-IDs abgebildet – zusätzlich zu den Namen aus dem Personalstamm sind alle
gebräuchlichen Schreibweisen fest hinterlegt.

**Wertzuordnung:**

| Feld | Zellwert | Ergebnis |
|---|---|---|
| Arbeitsplatz | `U` | Urlaub |
| Arbeitsplatz | `F`, `FZA` | FZA/Frei |
| Arbeitsplatz | `WB` | Weiterbildung |
| Arbeitsplatz | `K`, `KK`, `ZU`, `§15C`, `DR` | Sonstige Abwesenheit |
| Dienst | `D` | Bereitschaftsdienst |
| Dienst | `HG` | Hintergrunddienst |

Alle importierten Abwesenheiten werden mit `absenceSources = "import"` markiert – die Grundlage für die
Unterdrückung redundanter FZA-Anzeigen (siehe 8.5.4).

**Zusammenführung (`mergeMonthData`) – additiv, niemals zerstörend:**

* Eine BD- oder HG-Einteilung wird **nur** übernommen, wenn das Zielfeld **leer** ist. Bereits geplante
  Dienste werden nie überschrieben.
* Abwesenheiten und Dienstwünsche werden übernommen bzw. aktualisiert, inklusive Herkunftskennzeichnung.
* RBN-Felder und Notizen bleiben vollständig unberührt.

Nach dem Import werden alle berührten Monate zum Server geschrieben, die Ansicht neu gerendert und eine
Zusammenfassung je Blatt in einem Hinweisfenster angezeigt.

### 14.2 Excel-Export

Erzeugt eine Arbeitsmappe mit einem Blatt (benannt `JJJJ-MM`) und dem Dateinamen
`dienstplan_JJJJ_MM.xlsx`:

* Kopfzeile mit Titel „Bereitschaftsdienstplan" und Monatsbezeichnung.
* Spaltenüberschriften: Tag, Wochentag, BD, HG, 1. RBN, 2. RBN.
* Eine Zeile je Kalendertag; das Datum als `TT.MM.`, Personen mit **vollem Namen** (nicht als ID – die
  Datei ist für Menschen bestimmt).
* Leerzeile, dann der Block „Statistik" mit je Person `BD n`, `HG n`, `WE n`, `Ziel n`.
* Festgelegte Spaltenbreiten (10/12/28/28/18/18 Zeichen), damit die Datei ohne Nacharbeit lesbar ist.

Ist SheetJS noch nicht geladen, erscheint der Hinweis „Excel-Bibliothek noch nicht geladen." statt eines
Fehlers.

### 14.3 JSON-Sicherung

**Sichern:** Bevorzugt wird `/api/export` verwendet – die vollständige, serverseitige Sicherung aller Monate
2025–2030. Ist der Server nicht erreichbar, wird als Rückfallebene der komplette lokale Speicher exportiert.
Der Dateiname trägt das Tagesdatum: `dienstplanrad_backup_JJJJ-MM-TT.json`.

**Laden:** Die Datei wird gelesen und **validiert**:

* Die Wurzel muss ein JSON-Objekt sein (kein Array, kein Skalar) – sonst erscheint eine verständliche
  Fehlermeldung mit dem konkreten Grund.
* `settings`, `staff` und `rbnNames` werden übernommen, wenn vorhanden.
* Jeder Monatseintrag muss ein Array-Paar sein, dessen Schlüssel exakt dem Muster `JJJJ-MM` mit gültigem
  Monat 01–12 entspricht und dessen Wert ein Objekt ist. **Ungültige Einträge werden einzeln übersprungen**,
  nicht der gesamte Import abgebrochen.

Anschließend wird lokal gesichert, die Sicherung – falls möglich – zum Server gespiegelt und neu gerendert.
Schlägt die Serverspiegelung fehl, bleibt die lokale Wiederherstellung dennoch bestehen.

---

## 15. Drucken und PDF

„PDF exportieren" ruft `window.print()` auf; ein eigenes Druck-Stylesheet formt dabei die Bildschirmansicht
in ein Klinikdokument um.

| Aspekt | Druckverhalten |
|---|---|
| Seitenformat | **A4 hoch**, 6 mm Rand |
| Ausgeblendet | Topbar, Toolbar, Legendenblock, Ambient-Layer, Hintergrundverläufe, Bewertungs-Chips |
| Glas-Optik | Vollständig entfernt: kein `backdrop-filter`, keine Schatten, keine Rundungen |
| Hintergrund | Reines Weiß, Text reines Schwarz |
| Tabelle | Feste Mindestbreite aufgehoben, Schriftgröße 8,3 px, Zeilenhöhe 18 px |
| Zellinhalte | 17 px hoch, 8 px Schrift |
| Feiertagsname | 5,5 px – vorhanden, aber untergeordnet |
| Statistik | Auf 120 mm Breite begrenzt, 5 mm unter dem Plan |
| Rahmen | Durchgehend reines Schwarz für maximalen Kopierkontrast |
| Flächenfarben | Auf **feste** Graublautöne umgestellt: Wochentagsspalte `#9dbdd4`, Samstag `#eaf1f6`, Sonntag `#dae7f0`, Feiertag `#c8dbe7`, Schrift `#10314a` – jeweils mit `!important`, da `js/theme.js` die Werte als Inline-Style setzt |
| Animationen | Vollständig neutralisiert |

Die Umstellung auf feste Druckfarben ist eine bewusste Entscheidung: Der Ausdruck bleibt bei jedem Monat und
auf jedem Drucker – auch in Graustufen – **identisch lesbar**, und die Wertigkeitshierarchie
Samstag < Sonntag < Feiertag bleibt als Grauabstufung erhalten. Ein zwölffarbiger Ausdruck wäre auf
Klinikdruckern unberechenbar.

Ein ganzer Monat passt so auf ein einziges A4-Blatt, inklusive Statistik.

---

## 16. PWA, Service Worker und Caching

### 16.1 Manifest

| Feld | Wert |
|---|---|
| `name` / `short_name` | DienstplanRAD |
| `start_url` | `/` |
| `display` | `standalone` (eigenes Fenster, keine Browserleiste) |
| `background_color` | `#0d1117` |
| `theme_color` | `#111820` |
| `icons` | `/icons/icon.svg`, `sizes: any`, `purpose: any maskable` |

Ein einzelnes SVG deckt alle Größen ab – es gibt keine Bitmap-Icon-Matrix zu pflegen.

### 16.2 Service Worker

**Cache-Name:** `dienstplanrad-v9`.

**Vorgeladene Kerndateien:** `/`, `/index.html`, `/styles.css`, alle sechs JS-Module,
`/manifest.webmanifest`, `/icons/icon.svg`.

**Lebenszyklus:**
* `install` → Kerndateien cachen, danach `skipWaiting()` – eine neue Version übernimmt sofort.
* `activate` → alle Caches mit abweichendem Namen löschen, danach `clients.claim()`.

**Abrufstrategie:**
* Nicht-`GET`-Anfragen (also alle `PUT`/`POST` an die API) werden **nicht** angefasst und gehen immer ans
  Netz. Schreibvorgänge können damit niemals aus einem Cache beantwortet werden.
* Navigationsanfragen: **Network-First** mit Aktualisierung des gecachten `/index.html`; bei Netzfehler wird
  die gecachte Fassung ausgeliefert.
* **Eigener Anwendungscode** (`.html`, `.css`, `.js` gleicher Herkunft): ebenfalls **Network-First**.
* Alle übrigen `GET`-Anfragen (Icons, Manifest, Fremdressourcen): **Cache-First**.

Die Network-First-Regel für Anwendungscode ist eine bewusste Korrektur. Vorher galt Cache-First für alles
außer der Navigation: Ein bereits installierter Client hat `styles.css` und die JS-Module dauerhaft aus dem
alten Cache bedient, solange der Cache-Name unverändert blieb – **eine ausgerollte Korrektur konnte ihn nie
erreichen**. Genau dadurch blieb eine bereits deployte Behebung des Monatsfarbwechsels beim Nutzer
wirkungslos. Jetzt ist der Cache reine Offline-Rückfallebene, und eine Änderung am Anwendungscode kommt
beim nächsten Aufruf an, auch ohne Versionswechsel.

Die Registrierung schlägt bewusst still fehl (`.catch(() => {})`) – eine Umgebung ohne
Service-Worker-Unterstützung soll keine sichtbaren Fehler erzeugen.

---

## 17. Sicherheit und Datenschutz

### 17.1 HTTP-Header (`_headers`)

| Header | Wert | Zweck |
|---|---|---|
| `X-Frame-Options` | `SAMEORIGIN` | Kein Einbetten in fremde Seiten (Clickjacking-Schutz) |
| `X-Content-Type-Options` | `nosniff` | Kein MIME-Type-Raten |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Keine Pfadweitergabe an Dritte |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Sensorzugriffe vollständig abgeschaltet |

### 17.2 Datenhaltung

* Personenbezogene Daten beschränken sich auf **Namen und Diensteinteilungen** – keine Kontaktdaten, keine
  Kennungen, keine Gesundheitsdaten von Patientinnen und Patienten.
* Es gibt **kein Tracking**, keine Analytik, keine Drittanbieter-Einbindung außer der SheetJS-Bibliothek
  über CDN.
* Alle Nutzdaten liegen im KV-Store des betreibenden Cloudflare-Kontos sowie im `localStorage` der
  benutzten Geräte.
* Die Anwendung besitzt **keine eigene Benutzerverwaltung**. Der Zugriffsschutz erfolgt auf Ebene des
  Deployments – etwa über Cloudflare Access oder eine Netzbeschränkung. Das ist bei der Inbetriebnahme
  bewusst zu konfigurieren.
* `localStorage` überdauert das Schließen des Browsers. Auf geteilten Arbeitsplätzen ist dies bei der
  Geräteauswahl zu berücksichtigen.

---

## 18. Barrierefreiheit und Responsivität

### 18.1 Barrierefreiheit

* **Semantisches Markup:** `header`, `section`, `main`, `table` mit `thead`/`tbody`, `dialog`, `menu`, echte
  `<button>`- und `<label>`-Elemente. Keine `div`-Attrappen für interaktive Elemente.
* **Sprachauszeichnung:** `<html lang="de">` – Screenreader wählen die richtige Aussprache.
* **Native Dialoge:** Fokusfalle, Escape und Hintergrund-Inertisierung kommen von der Plattform und sind
  damit korrekt und konsistent.
* **Tastaturbedienung:** Vollständig. Alle Steuerelemente sind fokussierbar, alle Aktionen ohne Maus
  erreichbar.
* **Sichtbarer Fokus:** Eigene `:focus-visible`-Konturen in der Monatsfarbe, nach innen versetzt, damit sie
  im engen Zellraster nicht abgeschnitten werden.
* **Doppelte Kodierung:** Bewertungen werden **nie allein über Farbe** transportiert. Jeder Chip trägt
  zusätzlich einen Text („geeignet", „Hinweis", „Konflikt", „rot"), jeder Tooltip die vollständigen
  Begründungen, und im Auswahldialog stehen die Gründe unmittelbar in der Liste. Auch bei Farbfehlsicht ist
  jede Bewertung eindeutig lesbar.
* **Dekoration ausgeblendet:** Der Ambient-Layer trägt `aria-hidden="true"`.
* **Bewegungsreduktion:** siehe 11.5.

### 18.2 Responsivität

Umbruchpunkt bei **980 px**:

* Topbar und Toolbar stellen sich vertikal, Steuergruppen nehmen die volle Breite ein.
* Die Monatsnavigation dehnt sich; beide Dropdowns teilen sich den Platz gleichmäßig.
* Der Legendenblock rückt nach links; die Ampellegende wird ausgeblendet, das Monatsfarb-Badge bleibt.
* Die Auswahlfelder des Sammel-Dialogs stapeln sich; das Tagesraster wird auf vier Spalten reduziert.

Die Plantabelle behält ihre Mindestbreite von 1090 px und scrollt innerhalb ihres eigenen Containers
horizontal. Das ist Absicht: Ein Umbrechen oder Ausblenden von Spalten würde den Plan verfälschen. Der
Seitenkörper selbst scrollt nie horizontal.

---

## 19. Entwicklung, Tests und Deployment

### 19.1 Lokale Entwicklung

Es genügt ein beliebiger statischer Server im Projektwurzelverzeichnis:

```bash
npx serve .            # oder: python3 -m http.server 8080
```

Ohne laufende Pages Functions schlagen die API-Aufrufe fehl; die Anwendung fällt dann automatisch in den
Offline-Modus und ist – abgesehen von der Serversynchronisierung – vollständig bedienbar.

Mit Backend:

```bash
npx wrangler pages dev . --kv DIENSTPLAN_KV
```

### 19.2 Prüfungen

```bash
npm run check          # Syntaxprüfung aller JS-Module inkl. Service Worker und Backend-Utils
npm test               # Regressionstests des Regelwerks
```

`npm run check` prüft `js/app.js`, `js/api.js`, `js/defaults.js`, `js/rules.js`, `js/state.js`,
`js/theme.js`, `functions/_utils.js` und `sw.js` mit `node --check`.

### 19.3 Testabdeckung

Insgesamt 13 Tests, alle ohne DOM, ohne Netzwerk und ohne externe Abhängigkeiten.

**Regelwerk (`tests/rules.test.js`)**

| Test | Prüft |
|---|---|
| `createEmptyMonth creates exactly the valid leap-year days` | Februar 2028 = 29 Tage, Februar 2027 = 28 Tage |
| `time-dependent promotion changes HG and Saturday-BD eligibility` | El Houba am 21.09.2026 ohne, am 22.09.2026 mit HG-Berechtigung |
| `absence, same-day double assignment and personal restrictions become red conflicts` | Urlaub → rot, BD+HG am selben Tag → rot, Polednia sonntags → rot |
| `weekend equivalent counts BD weekends once and HG-only weekends as half` | Ergebnis 1,5 für BD-Wochenende plus reines HG-Wochenende |
| `statistics honor activation dates and calculate remaining targets` | Hellmann fehlt im September 2026, erscheint im Oktober; Restwert korrekt |

**Farbsystem (`tests/theme.test.js`)**

| Test | Prüft |
|---|---|
| Palettenzuordnung | Zwölf verschiedene Grundfarben; Monatswerte außerhalb 1–12 laufen sicher um |
| `parseColor` | Hex, Kurz-Hex und `rgba()` |
| Flächenhierarchie | Samstag < Sonntag < Feiertag, Wochentagsspalte am kräftigsten; 0 % ergibt Weiß |
| **Kontrast** | `--month-ink` hält auf allen vier Flächen **aller zwölf Paletten** mindestens 4,5:1 |
| `deepen` | Farbton bleibt erhalten (kürzerer Winkelbogen), Zielhelligkeit wird erreicht |
| Interpolation | Endpunkte exakt getroffen; die Buntheit bricht auf dem gesamten Weg nicht ein |
| Alphakanal | Der halbtransparente Schein bleibt über den ganzen Verlauf transparent |
| Zeitkurve | Geklemmt, monoton, und die Bewegung verteilt sich über die volle Dauer statt zu schnappen |

Die Tests kommen ohne DOM, ohne Netzwerk und ohne externe Abhängigkeiten aus – genau deshalb ist die
DOM-Freiheit von `rules.js`, `defaults.js` und dem rechnenden Teil von `theme.js` eine harte Regel.
Besonders die Kontrast- und Harmonieprüfungen wären im Browser nur per Augenmaß zu beurteilen; als Test
sind sie eine harte Zusage über alle zwölf Paletten hinweg.

### 19.4 Deployment auf Cloudflare Pages

1. Repository mit dem Pages-Projekt verbinden.
2. **Build-Befehl:** *keiner*. **Ausgabeverzeichnis:** Repository-Wurzel.
3. KV-Namespace anlegen und als **`DIENSTPLAN_KV`** an das Projekt binden.
4. Deployen. Der erste Aufruf initialisiert Einstellungen, Personalstamm und RBN-Liste selbständig.
5. Zugriffsschutz konfigurieren (siehe 17.2).

Ein Push auf den Standardbranch löst das Deployment aus. Wird eine der vorgeladenen Kerndateien geändert,
sollte die Versionsnummer in `sw.js` (`dienstplanrad-v8`) erhöht werden, damit alle Clients den alten Cache
sicher verwerfen.

---

## 20. Anpassung und Erweiterung

| Vorhaben | Vorgehen |
|---|---|
| **Person hinzufügen** | Eintrag in `DEFAULT_STAFF` (`js/defaults.js`) ergänzen **und** die ID in `STAFF_ORDER` an der gewünschten Position einfügen. Ohne den zweiten Schritt erscheint die Person nicht im Auswahldialog. |
| **Person ausscheiden lassen** | `activeUntil` auf das letzte Datum setzen. Vergangene Pläne bleiben unverändert korrekt. |
| **Rollenwechsel terminieren** | `promotionDate` plus `promotedRoleLabel`, `promotedCanHg`, `promotedCanSaturdayBd` setzen. |
| **Dienstkontingent ändern** | `bdTarget` (weich, gelb) bzw. `maxBd` (hart, rot) anpassen. |
| **Abwesenheits- oder Wunschtyp ergänzen** | `ABSENCE_TYPES` bzw. `PREFERENCE_TYPES` erweitern; die kurzen Tabellenkürzel in `shortAbsenceLabel` / `shortPreferenceLabel` in `js/app.js` ergänzen. |
| **Regel hinzufügen oder ändern** | In `evaluateCandidate` (`js/rules.js`) über `push(level, reason)` ergänzen. Die Begründung erscheint automatisch in Tooltip, Auswahlliste und – bei roten Konflikten – im Protokoll. |
| **Feiertagsregion wechseln** | Feste Termine und Buß-und-Bettag-Sonderfall in `getSaxonyHolidays` (`js/app.js`) anpassen; `holidayRegion` in `DEFAULT_SETTINGS` mitführen. |
| **Monatsfarbe ändern** | Den betreffenden Eintrag in `MONTH_PALETTES` (`js/theme.js`) anpassen. Die gesamte Ableitungskette – Wochentagsspalte, Zeilenwäschen, Schriftton, Orbs, Fokusringe, Badge – folgt automatisch, und der Kontrasttest prüft die neue Farbe sofort mit. |
| **Flächenstärken ändern** | `SURFACE_MIX` in `js/theme.js`. Die Startwerte in `:root` und die Druckfarben in `styles.css` mitziehen und `npm test` laufen lassen – der Kontrasttest schlägt an, wenn eine Fläche zu dunkel wird. |
| **Dauer oder Kurve des Farbwechsels** | `THEME_DURATION_MS` und `EASE` in `js/theme.js`. |
| **Bestehende Daten migrieren** | `schemaVersion` erhöhen und die Umwandlung in `ensureMonthShape` (`functions/_utils.js`) vornehmen, damit sie beim Lesen **und** Schreiben greift. |

**Wichtig bei Personaländerungen:** Nach dem ersten Start ist die **KV-Kopie** maßgeblich, nicht mehr die
Datei. Änderungen an `DEFAULT_STAFF` wirken auf bestehende Installationen erst, wenn `app:staff` über
`PUT /api/staff` oder eine JSON-Wiederherstellung aktualisiert wird.

---

## 21. Fehlerbilder und Diagnose

| Beobachtung | Ursache | Vorgehen |
|---|---|---|
| Status bleibt dauerhaft „Offline – lokaler Stand" | Kein Netz oder fehlendes KV-Binding | „Serverstand neu laden"; im Cloudflare-Dashboard prüfen, ob `DIENSTPLAN_KV` gebunden ist |
| Serverfehler „KV Binding DIENSTPLAN_KV nicht vorhanden" | Namespace nicht an das Projekt gebunden | Binding anlegen und neu deployen |
| Eine Person fehlt im Auswahldialog | `includeInPlanning === false`, Aktivzeitraum trifft nicht zu, oder ID fehlt in `STAFF_ORDER` | Stammdaten prüfen |
| Person in der Statistik unerwartet abwesend | Statistik prüft die Aktivität zum **Ersten** des Monats | `activeFrom` prüfen |
| Excel-Import bringt nichts ein | Blattname nicht in der erlaubten Liste, Tageszeile nicht erkannt, oder `Arbeitsplatz`-Zeilen fehlen | Blattbenennung und Struktur prüfen |
| Import überschreibt keine Dienste | Beabsichtigt – die Zusammenführung ist rein additiv | Zielfelder gegebenenfalls vorher leeren |
| „Excel-Bibliothek noch nicht geladen." | SheetJS-CDN noch nicht bereit oder nicht erreichbar | Kurz warten; bei dauerhaftem Fehler Netzzugang zum CDN prüfen |
| Farbwechsel springt ohne Übergang | Betriebssystem meldet „Bewegung reduzieren" oder Browser kennt `@property` nicht | Beabsichtigtes Verhalten |
| Alte Version nach Deployment | Service-Worker-Cache | Seit v9 wird Anwendungscode Network-First geladen, das erledigt sich von selbst. Bei einem Client, der noch auf einer Fassung vor v9 steht: Seite hart neu laden oder den Service Worker in den Entwicklerwerkzeugen abmelden |
| Farbwechsel bleibt trotz Deployment aus | Client läuft noch auf altem, Cache-First ausgeliefertem Code | Siehe Zeile darüber – das war die Ursache, warum eine bereits behobene Fassung beim Nutzer nicht ankam |
| Änderung scheint verloren | Debounce von 1100 ms noch nicht abgelaufen | Kurz warten; Monatswechsel und Seitenverlassen erzwingen die Speicherung ohnehin |

**Diagnosehilfen:** `document.documentElement.dataset.month` und `.dataset.palette` zeigen den aktuell
aktiven Monat und die aktive Palette. Der `overrideLog` eines Monats im JSON-Export dokumentiert jede
bestätigte rote Einteilung mit Zeitpunkt, Gründen und Kommentar.

---

## 22. Glossar

| Begriff | Bedeutung |
|---|---|
| **BD** | Bereitschaftsdienst – der Hauptdienst, eine Person je Tag |
| **HG** | Hintergrunddienst – fachärztliche Rückfallebene, eine Person je Tag |
| **RBN** | Rufbereitschaft Nuklearmedizin, in zwei Stufen (RBN und 2. RBN) |
| **FZA** | Freizeitausgleich nach geleistetem Dienst |
| **WB** | Weiterbildung |
| **FA / FÄ** | Facharzt / Fachärztin |
| **OA / OÄ** | Oberarzt / Oberärztin |
| **AA / AÄ** | Assistenzarzt / Assistenzärztin |
| **Wochenend-Äquivalent** | Kennzahl belasteter Wochenenden: BD = 1,0 / nur HG = 0,5 |
| **Override** | Bewusst bestätigte Einteilung trotz rotem Konflikt, protokolliert |
| **Monatspalette** | Die zwölf jahreszeitlich abgestimmten Grundfarben, je Monat eine |
| **Bootstrap** | Der erste Ladevorgang: Einstellungen, Personal und RBN-Namen in einem Aufruf |
| **KV** | Cloudflare Key-Value-Store – die serverseitige Datenhaltung |
| **PWA** | Progressive Web App – installierbar, offlinefähig, eigenes Fenster |

---

**DienstplanRAD** · Klinik für Radiologie und Nuklearmedizin · Manuelle Dienstplanung mit
Live-Regelvalidierung, Cloudflare-Synchronisierung und vollständigem Offline-Betrieb.
