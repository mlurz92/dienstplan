# DienstplanRAD

DienstplanRAD ist eine installierbare Web-Anwendung zur manuellen Monatsplanung von Bereitschaftsdiensten
(BD), Hintergrunddiensten (HG) und zwei Rufbereitschaften Nuklearmedizin (RBN). Sie richtet sich an die
Klinik für Radiologie und Nuklearmedizin und verbindet eine vertraute, Excel-artige Tagesliste mit
Live-Regelprüfung, Verteilungsstatistik, dokumentierten Konfliktfreigaben, Cloudflare-KV-Speicherung und
lokaler Ausfallsicherheit.

Die Anwendung plant nicht automatisch. Der Mensch besetzt jeden Dienst selbst; DienstplanRAD bewertet
jede mögliche Einteilung, erklärt jeden Hinweis und verhindert, dass harte Konflikte unbemerkt bestätigt
werden. Der Grundsatz lautet:

> **Der Mensch entscheidet. Die Anwendung prüft, erklärt, speichert und dokumentiert.**

Diese README beschreibt den vollständigen aktuellen Stand der Anwendung. Sie ist Betriebsanleitung,
Bedienreferenz, Architekturübersicht, Regelwerksdokumentation und Entwicklungsleitfaden in einem.

## Inhaltsverzeichnis

1. [Zweck und Planungsphilosophie](#1-zweck-und-planungsphilosophie)
2. [Funktionsumfang](#2-funktionsumfang)
3. [Technische Architektur](#3-technische-architektur)
4. [Projektstruktur](#4-projektstruktur)
5. [Datenmodell](#5-datenmodell)
6. [Personal, Rollen und Stammdaten](#6-personal-rollen-und-stammdaten)
7. [Regelwerk und Bewertungsstufen](#7-regelwerk-und-bewertungsstufen)
8. [Feiertage und Werktage](#8-feiertage-und-werktage)
9. [Benutzeroberfläche](#9-benutzeroberfläche)
10. [Dialoge und Eingabeflüsse](#10-dialoge-und-eingabeflüsse)
11. [Statistik](#11-statistik)
12. [Monatsfarben und Bewegungsdesign](#12-monatsfarben-und-bewegungsdesign)
12a. [Markenkonformität (KSG-Designsystem)](#12a-markenkonformität-ksg-designsystem)
13. [Monatsnavigation und Wettlaufschutz](#13-monatsnavigation-und-wettlaufschutz)
14. [Speichern, Synchronisieren und lokaler Ausfallbetrieb](#14-speichern-synchronisieren-und-lokaler-ausfallbetrieb)
15. [Backend und HTTP-API](#15-backend-und-http-api)
16. [Excel, JSON, Drucken und PDF](#16-excel-json-drucken-und-pdf)
17. [Auslieferung und Cache-Sicherheit](#17-auslieferung-und-cache-sicherheit)
18. [Sicherheit und Datenschutz](#18-sicherheit-und-datenschutz)
19. [Barrierefreiheit und Responsivität](#19-barrierefreiheit-und-responsivität)
20. [Lokale Entwicklung und Tests](#20-lokale-entwicklung-und-tests)
21. [Deployment und Betrieb](#21-deployment-und-betrieb)
22. [Anpassung, Diagnose und Glossar](#22-anpassung-diagnose-und-glossar)

---

## 1. Zweck und Planungsphilosophie

### 1.1 Assistierte statt automatisierte Planung

Radiologische Dienstplanung enthält fachliche Qualifikationen, individuelle Absprachen, Abwesenheiten,
Wünsche, Urlaubsübergänge, Wochenendbelastung und bewusst akzeptierte Ausnahmen. DienstplanRAD behandelt
diese Faktoren als Entscheidungshilfe, nicht als Autopilot.

Eine Einteilung entsteht ausschließlich durch eine aktive Auswahl. Die Anwendung:

- bewertet jede aktive Person für den konkreten Tag und die konkrete Rolle;
- zeigt die höchste ausgelöste Bewertungsstufe und zugleich alle Begründungen;
- lässt grüne, gelbe und orange Einteilungen unmittelbar zu;
- verlangt für rote Einteilungen eine ausdrückliche Bestätigung;
- protokolliert jede rote Freigabe mit Zeitpunkt, Tag, Rolle, Person, Gründen und optionalem Kommentar;
- berechnet Verteilung und offene Dienste nach jeder Änderung neu;
- überschreibt keine bereits geplanten Dienste durch einen Excel-Import.

### 1.2 Warum eine Tagesliste

Der Monatsplan verwendet eine Zeile je Kalendertag statt eines klassischen Kalenderrasters. Diese Form
entspricht dem klinischen Arbeitsplan, hält BD, HG, beide RBN-Felder, Abwesenheiten und Wünsche in einer
Leserichtung zusammen und lässt sich ohne zweite Darstellungslogik auf A4 ausgeben. Vertikales Scrollen
bleibt chronologisch; die Spalten behalten auf jedem Tag dieselbe Bedeutung.

### 1.3 Spezifischer Nutzwert

- **Vollständige Erklärbarkeit:** Kein farbiger Chip steht ohne Textbegründung im Raum.
- **Monatsübergreifende Regeln:** Vor- und Folgemonat werden vorgeladen, damit der Erste nicht blind für
  den letzten Tag des Vormonats ist.
- **Qualifikation am Diensttag:** Beförderungen und Aktivzeiträume werden gegen das geplante Datum
  ausgewertet, nicht gegen das heutige Datum.
- **Ableitungen statt Doppeleingabe:** Der erste reguläre Werktag nach einem Dienst kann als FZA erkannt
  und in der Darstellung passend behandelt werden.
- **Sofortige Verteilungssicht:** BD, HG, Wochenend-Äquivalent, Soll und Rest stehen direkt unter dem Plan.
- **Monatsidentität:** Jeder Monat besitzt eine eigene Palette; Farbe, Titel und Inhalt wechseln als
  zusammenhängende, richtungsbezogene Bewegung.
- **Robuste Auslieferung:** Release-Token, Revalidierungsheader und aktive Bereinigung alter Worker
  verhindern, dass eine Hosting-Adresse dauerhaft veraltete CSS- oder JavaScript-Dateien ausliefert.

---

## 2. Funktionsumfang

### 2.1 Planung

- monatsweise Navigation per Pfeiltasten, Monatsauswahl, Jahresauswahl oder „Aktueller Monat“;
- je Kalendertag genau ein Feld für BD, HG, RBN und 2. RBN;
- personengebundene BD-/HG-Auswahl mit Live-Eignungsbewertung;
- Löschen einer Einteilung im selben Auswahldialog;
- freie RBN-Namen mit lernender Vorschlagsliste;
- Einzel- und Sammelerfassung von Abwesenheiten und Dienstwünschen;
- automatische Speicherung mit Statusanzeige;
- monatsübergreifende Prüfung geladener Dienste.

### 2.2 Kontrolle

- fünf sichtbare Zustände: geeignet, Hinweis, Konflikt, Bestätigung und nicht wählbar;
- Klartextgründe in Tabelle, Auswahl und Bestätigungsdialog;
- explizite Protokollierung bestätigter roter Konflikte;
- Monatsstatistik mit offenen BD- und HG-Stellen;
- sächsische Feiertage und Feiertagsblöcke ohne externen Kalenderdienst;
- zeitzonensichere Berechnung lokaler Kalendertage.

### 2.3 Datenaustausch

- additiver Mehrmonatsimport aus der bestehenden Excel-Arbeitsmappe;
- Excel-Export des angezeigten Monats;
- serverseitige oder lokale JSON-Vollsicherung;
- validierte JSON-Wiederherstellung;
- druckoptimierte A4-Ausgabe über den nativen Druckdialog.

---

## 3. Technische Architektur

| Bereich | Umsetzung |
|---|---|
| Frontend | HTML, handgeschriebenes CSS und native ES-Module |
| Framework/Build | Kein UI-Framework, Bundler oder Transpiler |
| Backend | Cloudflare Pages Functions |
| Serverdaten | Cloudflare KV, Binding `DIENSTPLAN_KV` |
| Lokale Daten | `localStorage` für Bootstrapdaten und geladene Monate |
| Excel | SheetJS 0.20.3 über CDN |
| Tests | `node:test` und `node:assert/strict` |
| Installation | Web App Manifest, Anzeigeart `standalone` |
| Anwendungs-Worker | Keiner. Die Anwendung liefert und registriert keinen Service Worker |

Der Browser lädt die Dateien unmittelbar aus dem Repository. Das erleichtert Diagnose und Deployment:
Die ausgelieferte Quelldatei entspricht der überprüften Quelldatei. Das Frontend hält DOM-Logik in
`app.js`, Zustand und Persistenz in `state.js`, HTTP-Zugriffe in `api.js`, Regeln in `rules.js`,
Kalenderlogik in `holidays.js`, Vorgaben in `defaults.js` und das Farbsystem in `theme.js`.

`rules.js`, `defaults.js`, `holidays.js` und der rechnende Teil von `theme.js` sind DOM-frei. Dadurch
laufen die fachlichen Tests direkt unter Node. Nur `applyMonthTheme()` schreibt Farbvariablen auf
`document.documentElement`; `app.js` übernimmt Rendering und Ereignisse.

### 3.1 Browseranforderungen

Die Anwendung nutzt ES-Module, `fetch`, `localStorage`, `structuredClone`, `requestAnimationFrame`,
`performance.now()`, `matchMedia`, native `<dialog>`-Elemente, CSS Custom Properties, `color-mix`,
`backdrop-filter` mit Rückfallebene und ein Web App Manifest. Ziel sind aktuelle Chromium-, Firefox- und
Safari-Versionen. Der Monatsfarbverlauf hängt nicht von animierbaren CSS-Custom-Properties ab: JavaScript
schreibt pro Frame konkrete `rgb()`- und `rgba()`-Werte.

---

## 4. Projektstruktur

```text
.
├── index.html                       App-Shell, Tabellenrahmen, Toolbar und vier Dialoge
├── styles.css                       Layout, Glasdesign, Tabellenfarben, Animationen und Druck
├── manifest.webmanifest             Installationsmetadaten
├── _headers                         Cache-, Sicherheits- und Berechtigungsheader
├── package.json                     Prüf- und Testskripte
├── icons/
│   └── icon.svg                     skalierbares any-/maskable-Icon
├── js/
│   ├── app.js                       UI, Rendering, Navigation, Dialoge und Im-/Export
│   ├── api.js                       zentraler Fetch-Wrapper
│   ├── defaults.js                  Monatsnamen, Personal, Typen und leeres Monatsschema
│   ├── holidays.js                  Sachsen-Feiertage, Werktage und Feiertagsblöcke
│   ├── rules.js                     Bewertung, Getter/Setter, Statistik und Sammelprüfung
│   ├── state.js                     Laufzeitzustand, localStorage und Serverpersistenz
│   └── theme.js                     zwölf Paletten, OKLCH-Mathematik und rAF-Animation
├── functions/
│   ├── _utils.js                    KV-Helfer, Antworten und Schemanormalisierung
│   └── api/
│       ├── bootstrap.js
│       ├── export.js
│       ├── import.js
│       ├── rbn-names.js
│       ├── settings.js
│       ├── staff.js
│       └── month/[year]/[month].js
└── tests/
    ├── delivery.test.js             Cache-, Asset- und Legacy-Worker-Garantien
    ├── month-navigation.test.js     Navigations- und Animationsreihenfolge
    ├── rules.test.js                Kernregeln und Statistik
    ├── theme.test.js                Paletten, Kontrast, Farbraum und Zeitkurve
    └── timezone.test.js             Regeln unter Europe/Berlin
```

---

## 5. Datenmodell

### 5.1 Monatsobjekt

Jeder Monat ist ein selbstständiger Datensatz:

```jsonc
{
  "schemaVersion": 1,
  "year": 2026,
  "month": 7,
  "revision": 12,
  "updatedAt": "2026-07-29T12:00:00.000Z",
  "days": {
    "2026-07-01": {
      "bd": "lurz",
      "hg": "dalitz",
      "rbn1": "Meyer",
      "rbn2": "",
      "notes": ""
    }
  },
  "absences": {
    "lurz": { "2026-07-20": "urlaub" }
  },
  "absenceSources": {
    "lurz": { "2026-07-20": "manual" }
  },
  "preferences": {
    "martin": { "2026-07-04": "kein-bd" }
  },
  "overrideLog": [
    {
      "timestamp": "2026-07-29T12:00:00.000Z",
      "dateIso": "2026-07-11",
      "role": "bd",
      "staffId": "becker",
      "reasons": ["Urlaub eingetragen"],
      "comment": "abgestimmt"
    }
  ],
  "importLog": []
}
```

`createEmptyMonth(year, month)` legt jeden gültigen Kalendertag bereits mit leeren BD-, HG-, RBN-,
2.-RBN- und Notizfeldern an. Schaltjahre folgen der nativen Kalenderberechnung. `ensureMonthShape()`
mischt gespeicherte Nutzdaten über dieses vollständige Gerüst; fehlende Tage werden beim Lesen und
Schreiben ergänzt.

### 5.2 Feldbedeutung

- `schemaVersion`: Grundlage späterer Datenmigrationen.
- `year`, `month`: selbstbeschreibende Datumszuordnung.
- `revision`: steigt bei jedem Speichern um eins.
- `updatedAt`: ISO-Zeitpunkt der letzten Speicherung.
- `days[iso].bd`, `days[iso].hg`: stabile Personal-ID oder leerer String.
- `days[iso].rbn1`, `days[iso].rbn2`: freier Text.
- `days[iso].notes`: im Schema vorhanden, derzeit ohne sichtbare Tabellenspalte.
- `absences[staffId][iso]`: Abwesenheitstyp.
- `absenceSources[staffId][iso]`: `manual` oder `import`.
- `preferences[staffId][iso]`: Dienstwunschtyp.
- `overrideLog`: unveränderlich anwachsende Konfliktfreigaben.
- `importLog`: reservierte Importhistorie, derzeit ohne sichtbare Pflege- oder Auswertungsoberfläche.

### 5.3 Globale Daten und Schlüssel

| Datensatz | Cloudflare-KV-Schlüssel | Lokaler Schlüssel |
|---|---|---|
| Einstellungen | `app:settings` | Bestandteil von `dienstplanrad:bootstrap` |
| Personal | `app:staff` | Bestandteil von `dienstplanrad:bootstrap` |
| RBN-Namen | `app:rbn-names` | Bestandteil von `dienstplanrad:bootstrap` |
| Monat | `year:2026:month:07` | `dienstplanrad:month:2026-07` |

Der Laufzeitzustand hält `settings`, `staff`, `rbnNames`, eine `Map` geladener Monate, angezeigtes Jahr
und Monat, Speicherstatus, Dirty-Flag, Debounce-Timer und den letzten Serverzustand.

---

## 6. Personal, Rollen und Stammdaten

### 6.1 Standardpersonal

| ID | Anzeige | Rolle | BD-Soll | Max. BD | HG | Samstags-BD | Aktivität |
|---|---|---|---:|---:|---|---|---|
| `schaefer` | Prof. Schäfer | Chefarzt | – | – | – | – | ab 01.01.2025, nur Abwesenheitsliste |
| `lurz` | Dr. Lurz | FA/OA | 4 | – | ja | ja | ab 01.01.2025 |
| `polednia` | Dr. Polednia | FA/OA | 3 | – | ja | ja | ab 01.01.2025 |
| `dalitz` | Fr. Dalitz | FÄ/OÄ | 4 | – | ja | ja | ab 01.01.2025 |
| `becker` | Dr. Becker | FÄ/OÄ | 3 | – | ja | ja | ab 01.01.2025 |
| `hellmann` | Fr. Hellmann | FÄ | 2 | 2 | ja | ja | ab 01.10.2026 |
| `martin` | Dr. Martin | FA | 4 | – | ja | ja | ab 01.01.2025 |
| `elhouba` | Hr. El Houba | AA, ab 22.09.2026 FA | 4 | – | ab Beförderung | ab Beförderung | ab 01.01.2025 |
| `licenji` | Fr. Licenji | AÄ | 4 | – | nein | nein | ab 01.01.2025 |
| `sebastian` | Hr. Sebastian | AA | 4 | – | nein | nein | ab 01.01.2025 |

Gespeichert werden IDs, nicht Anzeigenamen. Namensänderungen wirken dadurch auf alle Monate, ohne
Dienstdaten umzuschreiben. `activeFrom` und `activeUntil` begrenzen Sichtbarkeit und Planbarkeit.
`includeInPlanning` steuert den Dienstpool; `includeInAbsenceList` steuert die Abwesenheitsverwaltung.

Die feste Planungsreihenfolge lautet:

```text
lurz → polednia → dalitz → becker → hellmann → martin → elhouba → licenji → sebastian
```

### 6.2 Zeitabhängige Rollen

`getRoleProperties(person, dateIso)` wendet ab `promotionDate` die Felder `promotedRoleLabel`,
`promotedCanHg` und `promotedCanSaturdayBd` an. Hr. El Houba ist bis einschließlich 21.09.2026 AA ohne
HG- und Samstags-BD-Berechtigung; ab 22.09.2026 gilt er als FA mit beiden Berechtigungen.

### 6.3 Abwesenheiten

| ID | Bezeichnung | Kurzform |
|---|---|---|
| `urlaub` | Urlaub | U |
| `fza` | FZA/Frei | FZA |
| `weiterbildung` | Weiterbildung | WB |
| `sonstige` | Sonstige Abwesenheit | abwesend |

Jede Abwesenheit erzeugt bei einer Diensteinteilung am selben Tag einen roten Konflikt.

### 6.4 Wünsche

| ID | Bezeichnung | Wirkung |
|---|---|---|
| `kein-bd` | Kein BD | rot bei BD |
| `kein-hg` | Kein HG | rot bei HG |
| `kein-dienst` | Kein Dienst | rot bei BD und HG |
| `bd-bevorzugt` | BD bevorzugt | positiver Grund bei BD |
| `hg-bevorzugt` | HG bevorzugt | positiver Grund bei HG |
| `dienst-bevorzugt` | Dienst bevorzugt | positiver Grund bei BD und HG |

Positive Wünsche senken keine Bewertungsstufe. Sie machen sichtbar, dass eine Einteilung einem Wunsch
entspricht.

---

## 7. Regelwerk und Bewertungsstufen

`evaluateCandidate({ state, monthData, dateIso, role, staffId })` ist die zentrale, seiteneffektfreie
Bewertung. Sie läuft für alle Personen im Picker und für jede bereits gesetzte Einteilung bei jedem
Rendering.

### 7.1 Stufen

| Stufe | Bedeutung | Bedienung |
|---|---|---|
| grün | keine relevanten Konflikte | direkt wählbar |
| gelb | Hinweis | direkt wählbar |
| orange | relevanter Konflikt, nachrangig | direkt wählbar |
| rot | harter Regelverstoß | nur über Bestätigungsdialog |
| grau | nicht aktiv oder nicht planbar | deaktiviert, nicht wählbar |

Bei mehreren Regeln bestimmt die höchste Stufe die Farbe. Alle Gründe bleiben erhalten. Ohne Treffer
ergänzt die Bewertung „Keine relevanten Konflikte“. Grau ist ein Ausschlusszustand mit `canSelect: false`,
kein schwächeres Grün.

### 7.2 Qualifikation und Tageskollisionen

- Person außerhalb des aktiven Planungszeitraums: grau.
- HG ohne tagesgültige HG-Berechtigung: rot.
- Samstags-BD ohne tagesgültige Berechtigung: rot.
- dieselbe Person am selben Tag zugleich in BD und HG: rot.
- eingetragene Abwesenheit: rot.
- passender „Kein …“-Wunsch: rot.
- passender positiver Wunsch: erklärender grüner Grund.

### 7.3 Personenspezifische Regeln

- Dr. Polednia darf dienstags und sonntags weder BD noch HG übernehmen: rot.
- Dr. Beckers Samstags-BD ist nachrangig: orange.
- Fr. Dalitz als HG an Sonntag oder Montag bei gleichzeitigem Sebastian-BD: orange.
- Dr. Becker als BD am ersten regulären Werktag nach eigenem Samstags-BD: rot.

### 7.4 BD-Abstände

Die Anwendung sortiert alle eigenen BD-Termine aus sämtlichen geladenen Monaten und prüft beide
Richtungen:

- eigener BD am Vortag oder Folgetag: gelb;
- sonstiger Abstand von zwei oder drei Tagen: gelb;
- werktägliches Muster BD–FZA–BD mit eingetragenem FZA in der Mitte: eigener gelber Hinweis statt
  allgemeinem Kurzabstand;
- ein im Vor- oder Folgemonat liegender Termin wirkt mit, sobald der Nachbarmonat geladen ist.

Die beidseitige Prüfung macht das Ergebnis unabhängig von der Reihenfolge, in der Dienste eingetragen
werden.

### 7.5 Kontingente und Urlaub

Gezählt werden die Dienste des Monats **ohne den gerade bewerteten Tag**. Die Prüfung fragt damit
„wie viele hat die Person außer an diesem Tag" – und meldet sich genau dann, wenn ein **weiterer**
Dienst hinzukäme.

- erreichtes `bdTarget`: gelb;
- erreichtes `maxBd`: rot, ohne zusätzlichen Sollhinweis;
- BD direkt vor einem Urlaubstag: orange.

Zählte man den bewerteten Tag mit, meldete eine bereits eingetragene, völlig reguläre Einteilung sich
selbst als Überschreitung: Der dritte von drei Soll-BD erschien gelb, und der zweite von zwei erlaubten
BD sogar **rot als Regelverstoß** – samt Eintrag in den offenen Punkten. Die Bewertung ist jetzt
identisch, ob die Einteilung schon existiert oder erst im Auswahldialog vorgeschlagen wird.

### 7.6 HG-Häufung

Auch hier zählen beide Richtungen.

- HG an drei aufeinanderfolgenden Tagen, unabhängig davon, ob der Tag die Kette beginnt, fortsetzt oder
  abschließt: orange;
- erneuter HG innerhalb von drei Kalendertagen davor oder danach: gelb;
- HG am Tag vor eigenem BD: orange – und spiegelbildlich BD mit eigenem HG am Vortag ebenfalls orange;
- Freitag-HG vor Samstag-BD bleibt als gewünschtes Wochenendmuster zulässig, in beiden Blickrichtungen.

### 7.7 Wochenenden

Freitag, Samstag und Sonntag werden über den zugehörigen Freitag zu einer Wochenendeinheit gruppiert.
Betrachtet wird das Wochenende davor **und** das danach.

- BD an zwei unmittelbar benachbarten Wochenenden: rot;
- sonstige Dienstwiederholung an benachbarten Wochenenden: orange.

Zuvor zählte nur das vorhergehende Wochenende. Wer ein Wochenende **vor** einem bereits belegten
besetzte, bekam gar keinen Hinweis, während dieselbe Paarung in umgekehrter Eingabereihenfolge rot
erschien – die Belastung ist in beiden Fällen dieselbe.

### 7.7a Zwei Invarianten über dem Regelwerk

Die Einzelregeln oben werden je für sich geprüft. Zwei Zusagen gelten darüber hinaus für die Bewertung
als Ganzes; sie sind in `tests/rule-matrix.test.js` festgehalten und haben nachweislich fünf Fehler
gefunden, die keine Einzelregel bemerkt hätte.

**Reihenfolgeunabhängigkeit.** Zwei Dienste, die zueinander in Beziehung stehen, werden gleich bewertet –
gleichgültig, welcher zuerst eingetragen wurde. Der Test setzt jedes Paar in beiden Reihenfolgen und
vergleicht die Stufen. Genau diese Zusage war viermal verletzt: beim BD-Tagesabstand, bei der
Wochenendregel, bei der HG-Häufung und bei der HG/BD-Nachbarschaft. Der Plan bewertete dieselbe
Dienstfolge je nach Eingabereihenfolge grün oder rot.

**Selbstkonsistenz.** Eine bereits eingetragene Einteilung bekommt dieselbe Stufe wie dieselbe Person im
Auswahldialog für denselben Tag. Der Test spielt für jede planbare Person die Belegung bis an ihr
Kontingent durch und vergleicht beide Sichten. Verletzt hatte das die Kontingentprüfung (siehe 7.5).

Beide Invarianten sind bewusst als Zusage über das Verhalten formuliert, nicht als weitere Einzelregel:
Eine neue Regel, die nur in eine Richtung schaut, fällt dadurch sofort auf, ohne dass jemand daran denken
muss, den Fall eigens zu testen.

### 7.8 Oster- und Pfingstblock

Der Osterblock umfasst Karfreitag bis Ostermontag, der Pfingstblock Pfingstsamstag bis Pfingstmontag.
Wer im jeweils anderen Block bereits BD oder HG hat, erhält im betrachteten Block einen orangefarbenen
Alternanzhinweis.

### 7.9 Sammelprüfung und Verteilung

`collectIssues()` meldet:

- jeden Tag ohne BD und jeden Tag ohne HG als offenen Punkt;
- jede bestehende orange oder rote Einteilung;
- gleichzeitige Abwesenheit von Dr. Becker und Dr. Martin an einem regulären Werktag genau einmal als
  roten Hinweis auf die CT-Leitungsbesetzung.

Das Ergebnis erscheint unter der Statistik als **„Offene Punkte"**: eine Kopfzeile mit der Kurzbilanz
(offene Einteilungen und Auffälligkeiten) und darunter die Liste. Rote und orange Meldungen stehen
oben, die offenen Tage folgen – eine lange Liste unbesetzter Tage würde die fachlich wichtigen
Meldungen sonst verdecken. Ist nichts zu tun, sagt die Liste das ausdrücklich.

Zuvor war die Funktion zwar vorhanden und getestet, ihr Ergebnis wurde aber nirgends angezeigt; die
Dokumentation beschrieb damit eine Zusage, welche die Anwendung nicht eingelöst hat. Im Druck wird der
Block ausgeblendet – dort steht der Plan selbst im Vordergrund.

`computeWeekendEquivalent()` zählt je Wochenende:

- mindestens ein BD: 1,0;
- kein BD, aber mindestens ein HG: 0,5;
- kein Dienst: 0.

---

## 8. Feiertage und Werktage

`js/holidays.js` ist die gemeinsame Quelle für Darstellung und Regelwerk. Es rechnet ausschließlich mit
lokalen Kalendertagen und formatiert ISO-Daten aus lokalen Jahr-, Monats- und Tageswerten. Ein
`toISOString()`-Rückweg wird vermieden, weil lokale Mitternacht in Deutschland in UTC noch auf den
Vortag fallen kann.

Für Sachsen (`SN`) gelten:

- Neujahr, Tag der Arbeit, Tag der Deutschen Einheit, Reformationstag, erster und zweiter
  Weihnachtsfeiertag;
- Karfreitag, Ostermontag, Christi Himmelfahrt und Pfingstmontag relativ zum berechneten Ostersonntag;
- Buß- und Bettag als Mittwoch vor dem 23. November.

Ein regulärer Werktag ist Montag bis Freitag und kein gesetzlicher Feiertag. Dieser Begriff steuert
FZA-Ableitung, Becker-Sperre und die CT-Leitungsprüfung. Feiertage erhalten in Tabelle und Sammelraster
einen Namen, einen Tooltip und die stärkste Monatsflächenfarbe.

---

## 9. Benutzeroberfläche

### 9.1 Ebenen

Die Oberfläche besteht aus:

1. dunklem Ambient-Hintergrund mit drei langsam driftenden Farborbs;
2. gläserner Kopfleiste;
3. gläserner Werkzeugleiste;
4. großer Arbeitsfläche mit Monatskopf, Tabelle und Statistik;
5. modalen nativen Dialogen.

Die Arbeitsfläche ist auf maximal 1720 px zentriert. Kleine schwebende Elemente verwenden echtes
`backdrop-filter`; die große Tabellenfläche erzeugt ihre Glaswirkung mit Lichtkanten, Tönung und Schatten,
ohne den kostspieligen Vollflächen-Weichzeichner.

### 9.2 Kopfleiste

Links stehen DR-Marke, Klinikbezeichnung, App-Name und Funktionszeile. Rechts befinden sich:

- Pfeil zum Vormonat;
- Monats-Dropdown mit zwölf deutschen Monaten;
- Jahres-Dropdown von mindestens 2025 bis 2030 und dynamischer Erweiterung um jeweils fünf Jahre um das
  aktuelle Jahr;
- Pfeil zum Folgemonat;
- animierter Speicherstatuspunkt mit Statusbeschreibung.

Die Pfeile rechnen von den sichtbaren Dropdownwerten aus und behandeln Jahresgrenzen über ein natives
Datumsobjekt.

### 9.3 Werkzeugleiste

| Element | Funktion |
|---|---|
| Aktueller Monat | setzt beide Auswahlfelder auf heute und öffnet den Monat |
| Abwesenheiten | Sammelerfassung für Abwesenheiten |
| Dienstwünsche | Sammelerfassung für Wünsche |
| Serverstand neu laden | erzwingt das Laden des aktuellen Monats vom Server |
| Excel importieren | liest `.xlsx` oder `.xls` |
| Excel exportieren | schreibt den sichtbaren Monat |
| PDF exportieren | öffnet den Druckdialog |
| JSON sichern | exportiert Server- oder lokalen Gesamtstand |
| JSON laden | validiert und importiert eine Sicherung |

### 9.4 Monatskopf

Der Kopf zeigt „Bereitschaftsdienstplan“, den deutschen Monatstitel, das Badge
„Monatskontrast · Palettenname“ und die Legende für geeignet, Hinweis, Konflikt, nicht wählbar und
Bestätigung.

### 9.5 Plantabelle

| Spalte | Inhalt |
|---|---|
| Tag | Tageszahl |
| Wochentag | ausgeschriebener Wochentag und gegebenenfalls Feiertag |
| BD | bewertete Personenauswahl |
| HG | bewertete Personenauswahl |
| RBN | lernendes Freitextfeld |
| 2. RBN | zweites lernendes Freitextfeld |
| Urlaub / FZA | Tageszusammenfassung und Detaildialog |
| Kein Dienst / Wünsche | Tageszusammenfassung und Detaildialog |

Die Tabelle nutzt `table-layout: fixed`, eine Mindestbreite von 1090 px, einen eigenen horizontalen
Scrollbereich und eine sticky Kopfzeile. Auf schmalen Geräten werden keine fachlichen Spalten
ausgeblendet.

### 9.6 Zeilen und Zellen

- Wochentagsspalte: 46 % Monatsfarbe als durchgehender vertikaler Anker.
- Samstag: 14 % Monatsfarbe.
- Sonntag: 22 % Monatsfarbe.
- Feiertag: 30 % Monatsfarbe.
- Werktagszellen: neutrales Weiß.
- Schrift auf Farbflächen: berechnetes `--month-ink` mit mindestens WCAG-AA-Kontrast.

BD-/HG-Schaltflächen zeigen Namen, Stufenchip und alle Gründe im Tooltip. Offene Felder zeigen `—` und
„offen“. Nach jeder Änderung werden auch bestehende Einteilungen neu bewertet.

### 9.7 RBN-Namen

Beim Verlassen eines RBN-Feldes wird der Wert getrimmt und gespeichert. Neue Namen werden dedupliziert,
mit deutscher Sortierung in `state.rbnNames` aufgenommen, lokal gesichert und nach Möglichkeit an
`/api/rbn-names` übertragen. Beide RBN-Spalten teilen dieselbe `<datalist>`.

### 9.8 FZA-Darstellung

- Für Dr. Becker erscheint am ersten regulären Werktag nach eigenem Samstags-BD automatisch „Becker:
  FZA“, sofern kein gleichwertiger sichtbarer Eintrag vorhanden ist.
- Importierte, nicht manuelle FZA-Einträge können unterdrückt werden, wenn sie exakt dem automatisch
  ableitbaren ersten Werktag nach eigenem BD entsprechen.
- Manuelle FZA-Einträge bleiben immer sichtbar.

---

## 10. Dialoge und Eingabeflüsse

Alle Dialoge sind native `<dialog>`-Elemente. Dadurch kommen Fokusfalle, Escape-Verhalten,
Hintergrund-Inertisierung und `::backdrop` aus der Browserplattform.

### 10.1 Personenauswahl

Ein Klick auf BD oder HG öffnet eine Karte je aktiver planbarer Person. Jede Karte enthält Name,
Bewertungsstufe und alle Gründe. Nicht planbare oder am Datum inaktive Personen werden bereits vor dem
Rendern herausgefiltert und erscheinen nicht als Karte. „Eintrag löschen“ leert die aktuelle Rolle;
„Abbrechen“ verändert nichts.

### 10.2 Rote Konfliktfreigabe

Die Auswahl einer roten Karte öffnet den Bestätigungsdialog. Er zeigt Person, Rolle, Datum, alle Gründe
und ein optionales Kommentarfeld. „Trotzdem eintragen“ setzt den Dienst und ergänzt `overrideLog`.

### 10.3 Tagesmarkierungen

Ein Klick auf eine Zusammenfassungsspalte zeigt jede Person mit Rollenlabel sowie allen
Abwesenheits- und Wunschchips. Änderungen wirken sofort, markieren den Monat als geändert und rendern
Plan und Bewertung neu. Es gibt keine zusätzliche Übernehmen-Schaltfläche.

### 10.4 Sammelerfassung

Abwesenheiten und Wünsche besitzen einen eigenen Modus. Person und Typ werden gewählt; anschließend
lassen sich beliebige Tageskacheln markieren. Die Kacheln zeigen Tageszahl, Wochentag, Feiertag und
aktuellen Wert. „Auswahl zurücksetzen“ hebt Markierungen auf, „Übernehmen“ schreibt den gewählten Typ auf
alle markierten Tage.

---

## 11. Statistik

Die Statistik steht unmittelbar unter dem Monat und wird bei jeder Änderung neu berechnet.

| Spalte | Aussage |
|---|---|
| Mitarbeitende | Anzeigename |
| BD | BD-Anzahl im Monat |
| HG | HG-Anzahl im Monat |
| Wochenende | Wochenend-Äquivalent |
| BD-Soll | persönlicher Richtwert |
| Rest | Soll minus Ist; negative Werte werden hervorgehoben |

Die Schlusszeile „Offen“ zählt unbesetzte BD- und HG-Tage. Planbare Personen werden anhand ihrer
Aktivität zum Monatsersten aufgenommen; das Rollenlabel wird für die Monatsmitte bestimmt.

---

## 12. Monatsfarben und Bewegungsdesign

### 12.1 Paletten

| Monat | Palette | Akzent |
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

Aus jeder Palette entstehen Akzent, starker Akzent, kontrastierter Schriftton, Glow, Paneltönung und die
vier Tabellenflächen. Der Farbton wird bei Aufhellung und Übergang in OKLCH behandelt. Zwischen zwei
Farben folgt die Interpolation dem kürzeren Farbtonbogen; gegenüberliegende Paletten laufen deshalb nicht
durch ein ausgewaschenes Grau.

### 12.2 Farbverlauf

`applyMonthTheme()`:

1. normalisiert die Monatszahl modulo zwölf;
2. liest den tatsächlich sichtbaren Variablensatz als Start;
3. setzt Zielmonat und Palettenname sofort in `dataset.month` und `dataset.palette`;
4. interpoliert neun konkrete Farbvariablen über 720 ms;
5. verwendet `performance.now()` als Zeitbasis und `requestAnimationFrame()` als Takt;
6. nutzt `cubic-bezier(0.40, 0, 0.22, 1)`;
7. übernimmt bei schneller Folgereaktion den aktuellen Zwischenstand als neuen Start;
8. setzt am Ende die Zielwerte exakt.

Die Animation bleibt korrekt, wenn ein Renderframe ausfällt: Der nächste Frame setzt am zeitlich
richtigen Fortschritt fort. Ein erneuter Sicherheitsaufruf aus `render()` beendet einen bereits laufenden
Übergang zum selben Ziel nicht.

### 12.3 Inhaltsbewegung

Farbe reagiert sofort auf die Navigationsabsicht. Der neue Inhalt gleitet erst nach Laden und vollständigem
`render()` ein. Animiert werden:

- `#monthTitle`;
- `#printArea`;
- `#statsGrid`.

Beim Vorwärtswechsel kommen sie aus `translate3d(22px, 0, 0)`, beim Rückwärtswechsel aus `-22px`.
Opacity und Transform laufen 520 ms mit `cubic-bezier(.22, 1, .36, 1)`. Die Klassen werden nach 700 ms
entfernt. Währenddessen ruht die zeilenweise Einlaufanimation, damit eine bereits vollständig gesetzte
Tabelle als Einheit erscheint. Beim Erststart darf jede Zeile mit 7 ms Versatz weich eintreffen.

### 12.4 Weitere Bewegung

- Panel-Einlauf mit gestaffelter Verzögerung;
- langsame Ambient-Orbs;
- wandernde Glasreflexe;
- 1–2-px-Hoverbewegungen;
- atmender Speicherstatuspunkt;
- kurzer Sättigungspuls auf dem kleinen Palettenbadge;
- Dialogöffnung mit Opacity, leichter Skalierung und Tiefenbewegung.

`prefers-reduced-motion: reduce` deaktiviert Farbverlauf, Inhaltsbewegung und dekorative Animationen.
Information, Palette und Funktion bleiben erhalten.

---

## 12a. Markenkonformität (KSG-Designsystem)

Die Oberfläche gehört zur **Klinik für Radiologie und Nuklearmedizin, Klinikum St. Georg Leipzig**, und
folgt deren verbindlichem Designsystem: §1 Markenführung, §1b Feinsatz und Weißraum, §8 App-Oberflächen.

### 12a.1 Übernommene Vorgaben

| Vorgabe | Umsetzung |
|---|---|
| **Markenfarben** | `--ksg-red: #E3000B`, `--ksg-gray: #555553`, `--ksg-secondary-text: #595959`, `--ksg-table-line: #BFBFBF` als benannte Token, nicht hart eingesetzt |
| **KSG-Rot als belegter Akzent** | Trägt die Wortmarke und den kritischen Status. Für Text die abgedunkelte Variante `--ksg-red-ink: #B80009` (6,90:1 auf Weiß); reines `#E3000B` erreicht 4,92:1 und bleibt Flächen- und Markenton |
| **Bildschirmschrift Arial** | `--font: Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif` statt der vorherigen freien Schriftwahl |
| **Tabellenziffern** | `font-variant-numeric: tabular-nums lining-nums` global. Tages-, BD-, HG- und Wochenendkolonnen fluchten dadurch exakt; bei proportionalen Ziffern wandert die Eins aus der Spalte |
| **Optische Laufweite** | `--tracking-caps` 0,06em für Versalmarken, `--tracking-title` −0,006em für Überschriften, `--tracking-small` 0,012em für Kleintext |
| **Weißraum-Leiter** | `--flow-tight` 4 → `--flow-inner` 6 → `--flow-block` 12 → `--flow-group` 20 → `--flow-section` 24 → `--flow-major` 32. Abstand zwischen Blöcken immer größer als innerhalb |
| **Sichtbarer Fokus** | 2 px Kontur mit 2 px Offset (`--app-focus-ring`, `--app-focus-offset`) |
| **Eigener App-Namensraum** | `--app-*` für Radien, Elevation und Fokus, getrennt von Dokument- und Web-Token, damit nichts davon je in eine Druckvorlage wandert |
| **Kontrast** | Helle Graustufen sind nie Textfarbe; Fließtext auf `--ksg-text-black`, Sekundärtext auf `--ksg-secondary-text` (7,00:1) |

### 12a.2 Dokumentierter Konflikt: das Monatsfarbsystem

Das Designsystem kennt keinen Token für eine monatsweise wechselnde Grundfarbe und untersagt, Markenrot
als beliebige Dekorfarbe zu verwenden. Die zwölf Monatspaletten sind aber ausdrücklich gefordert und über
mehrere Abstimmungsrunden festgelegt worden.

Die Referenzhierarchie des Designsystems stellt die Nutzeranforderung an die erste Stelle und verlangt,
einen Konflikt zu protokollieren statt ihn stillschweigend aufzulösen. Deshalb gilt:

* Die Monatsfarbe ist **keine Dekoration**, sondern Informationskodierung – sie trägt die Hierarchie
  Wochentagsspalte / Samstag / Sonntag / Feiertag und die Monatsidentität beim Blättern.
* Sie berührt **kein** Markentoken: KSG-Rot bleibt der Wortmarke und dem kritischen Status vorbehalten.
* Alle daraus abgeleiteten Flächen sind auf Textkontrast geprüft (mindestens 4,5:1 über alle zwölf
  Paletten, siehe 12.x) – die Kontrastvorgabe des Designsystems wird also eingehalten.

### 12a.3 Glasoptik: Kante statt Durchsichtigkeit

Die Leisten sahen zuvor grau und matt aus. Ursache war nicht „zu viel Glas“, sondern eine falsche
Kombination: Kopfleiste, Werkzeugleiste, Einfassungen, Dialogkarte und Monatsplakette lagen bei 50 bis
80 Prozent Weiß über einem fast schwarzen Hintergrund und trugen zusätzlich
`backdrop-filter: blur(22px) saturate(1.42)`. Das Schwarz schlug als Grau durch, und die
Sättigungsanhebung verstärkte genau dieses Grau — ein Schleier ohne Tiefe, ohne Bezug zur Monatsfarbe der
Tabelle darunter.

**Gemessen, fps während eines Monatswechsels:**

| Zustand | fps |
|---|---|
| `blur(22px) saturate(1.42)` | 15 |
| `blur(10px) saturate(1.06)` | 14 |
| ohne Weichzeichner | 19 |

Der Radius ist also fast gleichgültig — die Kosten entstehen dadurch, dass der Compositor in jedem Frame
die Pixel hinter dem Element ausliest. Ein Viertel der Bildrate für einen Effekt, der hinter einer dichten
Fläche ohnehin nichts beiträgt.

**Daraus die jetzige Lösung.** Glasanmutung entsteht über die Kante, nicht über Durchsichtigkeit:

- **Flächen fast deckend** (97,5 → 96 Prozent) mit einer **Dosis Monatsfarbe** (5 → 9 Prozent). Der
  Farbanteil ist klein, aber er bindet die Leisten an das Monatsblatt: Juli warm koralle, November kühl
  schieferblau. Vorher standen sie als graue Platten davor.
- **Rand, Lichtlinie, Brechung** tragen die Optik: 1 px Rand aus 22 Prozent Monatsfarbe, `inset 0 1px 0`
  in Weiß oben, eine feine dunkle Innenkante unten.
- **Enger, hellerer Schatten** statt des weichen dunklen Schlagschattens, der sich als Trübung über die
  eigene Fläche legte.
- **Bedienelemente weiß mit präzisem Rand** statt grauem Verlauf; beim Überfahren übernimmt die
  Monatsfarbe die Führung. Eingabefelder und Einfassungen sind deckend — dort geht Lesbarkeit vor Optik.
- **`backdrop-filter` bleibt an genau einer Stelle:** `.app-dialog::backdrop`. Dort verschwimmt die
  gesamte Seite hinter einem geöffneten Dialog. Das ist sichtbar, sinnvoll, und läuft nur, solange ein
  Dialog offen ist.

Ergebnis: 18 fps statt 14, optisch nicht vom weichgezeichneten Zustand zu unterscheiden — was belegt, dass
der Weichzeichner dort nichts beitrug. Textkontrast über alles geprüft: Subline 4,96:1, Statuszeile 5,59:1,
Monatsplakette 6,41:1, Schaltflächentext 16,45:1 — durchweg über der AA-Schwelle.

**Eine Falle, zum zweiten Mal dieselbe:** `.topbar` und `.glass-panel` haben dieselbe Spezifität (0,1,0),
und `.glass-panel` steht weiter unten in `styles.css`. Die erste Fassung dieser Regeln blieb deshalb
vollständig wirkungslos — genau der Fehler, der zuvor schon die Wochentagsspalte farblos gelassen hatte.
Die Regeln stehen jetzt als `.topbar.glass-panel` / `.toolbar.glass-panel` (0,2,0). Auch der Rückfall
unter `prefers-reduced-transparency` musste nachgezogen werden, sonst hätte er die Leisten nicht mehr
erreicht.

### 12a.3 Transparenz zurücknehmen

Milchglas ist bewusst dosiert (siehe Kapitel 12). Zusätzlich wird
`@media (prefers-reduced-transparency: reduce)` bedient: Wer im Betriebssystem „Transparenz reduzieren"
aktiviert hat, bekommt deckende Flächen, keinen Weichzeichner und keine Hintergrund-Orbs. Farbhierarchie
und Informationsgehalt bleiben dabei vollständig erhalten.

Das ist die von den Barrierefreiheits-Leitlinien ausdrücklich geforderte Rücknahme – dieselbe
Einstellung, mit der auch Apple die Lesbarkeitskritik an Liquid Glass beantwortet hat.

## 13. Monatsnavigation und Wettlaufschutz

Alle Navigationswege führen durch `openCurrentMonth()`:

- Vormonat und Folgemonat über `shiftMonth()`;
- Monats-Dropdown;
- Jahres-Dropdown;
- „Aktueller Monat“;
- Server-Reload des sichtbaren Monats.

### 13.0 Farbe und Monat wechseln gemeinsam

Der sichtbare Wechsel läuft **vollständig vor dem Serverabruf** ab: Palette, Überschrift, Tabelle und
Statistik schalten in einem Schritt um, danach zieht der Serverstand in einem zweiten Renderdurchlauf
nach.

Das ist die Behebung eines Fehlers, der nur mit antwortender API sichtbar war. Zuvor galt die umgekehrte
Reihenfolge – Farbe sofort, Rendern erst nach `loadMonth()`. Gemessen an einer Schnittstelle mit
realistischer Antwortzeit:

| Zeitpunkt | Überschrift | Grundfarbe |
|---|---|---|
| 47 ms | Juli 2026 | Wechsel beginnt |
| 455 ms | Juli 2026 | fast abgeschlossen |
| **825 ms** | **August 2026** | bereits fertig |

Die Farbe lief also vollständig durch, während in der Überschrift noch der alte Monat stand – der
„synchrone Grundfarbe- und Monatswechsel" fand faktisch nicht statt. In allen früheren Testläufen ohne
Backend scheiterte der Abruf sofort, weshalb der Versatz dort nie auftrat. Nach der Korrektur wechseln
Überschrift und Palette im **selben Frame** (gemessen 55 ms bzw. 42 ms Versatz null).

Möglich ist das, weil das Kalendergerüst eines Monats ohne Serverdaten feststeht: Tage, Wochentage,
Feiertage und damit die gesamte Farbhierarchie. Für Nachbarmonate liegen dank Vorladen auch die
Einteilungen bereits vor; bei einem weiten Sprung erscheint das korrekte Gerüst sofort und füllt sich,
sobald die Antwort da ist. Der Status zeigt währenddessen „Lädt …".

`tests/month-navigation.test.js` hält die Reihenfolge fest: Farbe, erster Renderdurchlauf und
Einblendung liegen vor `await loadMonth(`, der zweite Renderdurchlauf danach.

### 13.1 Angefordert versus geladen

`state.currentYear` und `state.currentMonth` bezeichnen den fertig geladenen Monat.
`requestedYear` und `requestedMonth` bezeichnen das zuletzt angeforderte Ziel. Richtung und
`targetChanged` werden gegen das zuletzt angeforderte Ziel berechnet.

Das ist für schnelle Umkehr entscheidend: Wird während „Juli → August“ sofort wieder Juli gewählt, ist
der geladene Zustand möglicherweise noch Juli, die sichtbare Farbanimation aber bereits August. Der
Vergleich gegen `requestedMonth` erkennt die echte Rückwärtsbewegung und führt die Palette wieder sicher
zu Juli.

### 13.2 Request-ID

Jeder Aufruf erhöht `monthRequestId`. Nach dem Laden des Hauptmonats und nach dem Vorladen der
Nachbarmonate prüft der Aufruf, ob er noch der jüngste ist. Ein älterer Request darf sich dadurch nicht
mehr als sichtbarer aktueller Monat veröffentlichen und die UI nicht überschreiben. Der abgeschlossene
Abruf kann zuvor dennoch den Monatscache, dessen lokale Kopie oder den Verbindungsstatus aktualisiert
haben; diese Hintergrunddaten sind nicht mit dem publizierten Navigationsziel gleichzusetzen.

### 13.3 Speichersicherheit

Bei offenem Dirty-Zustand speichert die Navigation `loadedYear` und `loadedMonth`, also den tatsächlich
bearbeiteten Monat. Das Navigationsziel kann bereits weitergelaufen sein, ohne den Speicheradressaten zu
verändern.

---

## 14. Speichern, Synchronisieren und lokaler Ausfallbetrieb

### 14.1 Startkette

1. Das Inline-Skript im `<head>` startet Legacy-Worker- und Cachebereinigung.
2. Versionierte Styles und ES-Module werden geladen.
3. `DOMContentLoaded` startet `init()`.
4. DOM-Referenzen, Ereignisse und statische Auswahlfelder werden aufgebaut.
5. `releaseLegacyServiceWorker()` wiederholt die Bereinigung defensiv.
6. `bootstrapState()` lädt Server, lokalen Stand oder Vorgaben.
7. Die Startpalette wird ohne Übergang gesetzt.
8. Der aktuelle Monat wird geladen und die Nachbarmonate werden erwärmt.

### 14.2 Ladekaskade

Für Bootstrapdaten und Monate gilt:

1. Server;
2. `localStorage`;
3. Standarddaten beziehungsweise leerer Monat.

Bereits geladene Anwendungsdateien vorausgesetzt, bleibt die Planung bei Netz- oder Backend-Ausfall mit
lokalen Daten nutzbar. Ein Kaltstart ohne Netz ist nicht garantiert, weil kein cachender Anwendungs-
Service-Worker HTML, CSS oder JavaScript vorhält.

### 14.3 Nachbarmonate

`warmAdjacentMonths()` lädt Vor- und Folgemonat parallel mit `Promise.allSettled`. Das verbessert
Blättergeschwindigkeit und Regelkorrektheit. Der sichtbare Serverstatus wird dabei gesichert und danach
wiederhergestellt; ein fehlgeschlagener Hintergrundabruf verfälscht den Hauptstatus nicht.

### 14.4 Automatisches Speichern

`scheduleSave()` entprellt Änderungen 1100 ms. `persistMonth()`:

1. setzt `updatedAt`;
2. erhöht `revision`;
3. schreibt zuerst in `localStorage`;
4. sendet anschließend `PUT /api/month/:year/:month`;
5. setzt bei Erfolg „Gespeichert“, bei Fehler „Offline gespeichert“.

Monatswechsel brechen einen offenen Timer ab und speichern den tatsächlich geladenen Monat sofort.
`beforeunload` stößt ebenfalls eine Speicherung an.

Die Speicherung besitzt keine Datensatzsperre, keinen Compare-and-swap und keinen serverseitigen
Revisionskonflikt. Arbeiten mehrere Browser gleichzeitig am selben Monat, gewinnt das zuletzt
eingegangene `PUT`. `revision` dient der Nachvollziehbarkeit, nicht der konkurrierenden
Änderungsauflösung.

### 14.5 Status

| Zustand | Anzeige |
|---|---|
| Laden | gelber Punkt, „Lädt …“ |
| erzwungenes Laden | gelber Punkt, „Lädt Serverstand …“ |
| Speichern | gelber Punkt, „Speichert …“ |
| synchron | grüner Punkt, „Gespeichert“ |
| lokal | orangefarbener Punkt, „Offline – lokaler Stand“ oder „Offline gespeichert“ |

`setStatus()` enthält zusätzlich eine rote `error`-Farbzuordnung als Reserve; der aktuelle
Anwendungsfluss ruft diesen Status nicht auf.

---

## 15. Backend und HTTP-API

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/bootstrap` | Einstellungen, Personal und RBN-Namen |
| GET | `/api/month/:year/:month` | normalisierten Monat lesen |
| PUT | `/api/month/:year/:month` | normalisierten Monat schreiben |
| GET/PUT | `/api/settings` | Einstellungen |
| GET/PUT | `/api/staff` | Personal |
| GET/PUT | `/api/rbn-names` | RBN-Vorschläge |
| GET | `/api/export` | Gesamtstand 2025–2030 |
| POST | `/api/import` | Gesamt- oder Teilstand einspielen |

Alle API-Antworten sind JSON mit UTF-8 und `Cache-Control: no-store`.

- `kv(context)` verlangt `DIENSTPLAN_KV`.
- `getOrInit()` liest einen Schlüssel und initialisiert ihn bei Bedarf.
- `put()` serialisiert JSON.
- `defaults()` liefert frische Kopien.
- `monthStorageKey()` erzeugt zweistellige Monatsschlüssel.
- `ensureMonthShape()` ergänzt fehlende Tage und Standardfelder.
- Der Client-Wrapper liest auch nicht-JSON-förmige Fehlerantworten kontrolliert und wirft bei
  Nicht-2xx einen verständlichen Fehler.

---

## 16. Excel, JSON, Drucken und PDF

### 16.1 Excel-Import

Unterstützte Blattnamen sind `Jan`, `Feb`, `Mrz`, `Apr`, `Mai`, `Jun`, `Jul`, `Aug`, `Sep`, `Okt`,
`Nov`, `Dez`.

Die Tageszeile ist die erste Zeile mit mindestens 20 gültigen Tageszahlen ab Spalte drei. Das Jahr wird
aus einer vierstelligen `20xx`-Angabe in den ersten Zeilen gelesen, sonst aus der sichtbaren Auswahl.
Personalzeilen werden über „Arbeitsplatz“ und eine normalisierte Namenszuordnung erkannt.

| Excelwert | Ergebnis |
|---|---|
| `U` | Urlaub |
| `F`, `FZA` | FZA/Frei |
| `WB` | Weiterbildung |
| `K`, `KK`, `ZU`, `§15C`, `DR` | Sonstige Abwesenheit |
| `D` in Dienstzeile | BD |
| `HG` in Dienstzeile | HG |

Importierte Abwesenheiten erhalten Quelle `import`. Die Zusammenführung ist additiv:

- bestehende BD-/HG-Felder werden nicht überschrieben;
- neue Dienste füllen nur leere Felder;
- Abwesenheiten und ihre Quellen werden ergänzt;
- die allgemeine Zusammenführungsfunktion übernimmt vorhandene Wünsche aus strukturierten
  Monatsdaten; der aktuelle Excel-Parser erzeugt selbst keine Wünsche;
- RBN und Notizen bleiben unverändert.

### 16.2 Excel-Export

Dateiname: `dienstplan_JJJJ_MM.xlsx`. Das Blatt `JJJJ-MM` enthält Titel, Tag, Wochentag, BD, HG, beide
RBN-Spalten sowie einen Statistikblock. Personen werden als vollständige Namen ausgegeben.
Abwesenheiten, Wünsche, `overrideLog`, `importLog` und Notizen werden nicht exportiert; Excel ist damit
ein Arbeitsauszug, aber kein verlustfreies Sicherungs- oder Rundreiseformat.

### 16.3 JSON

Die Sicherung bevorzugt `/api/export`; bei Serverausfall exportiert sie Bootstrapdaten und alle lokal
geladenen Monate. Dateiname: `dienstplanrad_backup_JJJJ-MM-TT.json`.

Beim Import muss die Wurzel ein Objekt sein. Globale Abschnitte sind optional. Monatseinträge müssen
Array-Paare mit Schlüssel `JJJJ-MM` und Objektwert sein; ungültige Einzelmonate werden übersprungen. Der
Stand wird lokal übernommen und nach Möglichkeit an `/api/import` gespiegelt.

### 16.4 Drucken

„PDF exportieren“ ruft `window.print()` auf. Das Druckstylesheet:

- verwendet A4 hoch mit 6 mm Rand;
- entfernt Navigation, Glas, Schatten, Animationen und Bewertungs-Chips;
- setzt Schwarz auf Weiß;
- komprimiert Zeilen und Schrift;
- verwendet feste, druckerunabhängige Graublauwerte für Wochentag, Samstag, Sonntag und Feiertag;
- hält Statistik und vollständigen Monat auf einer Seite, soweit Druckertreiber und Datenmenge dies
  zulassen.

---

## 17. Auslieferung und Cache-Sicherheit

### 17.1 Warum diese Schicht existiert

Ein installierter Cache-First-Worker kann auf einer bestimmten Origin alte `styles.css`- und
JavaScript-Fassungen weiterreichen, obwohl dasselbe Repository unter einer neuen Adresse korrekt läuft.
Browserwechsel auf derselben Adresse löst einen originseitig beziehungsweise workerseitig
festgehaltenen Assetstand nicht zuverlässig. DienstplanRAD behandelt die Konsistenz des Modulgraphs
deshalb als Teil der Anwendung.

### 17.2 Gemeinsamer Release-Token

Alle releasekritischen Shell- und Modulgraph-Assets verwenden denselben Token:

```text
?v=20260729.1
```

Das gilt für Manifest, Stylesheet, App-Einstieg und die internen Imports aus `app.js`, `state.js` und
`rules.js`. Das Icon `/icons/icon.svg` bleibt davon unabhängig unversioniert. Ein alter Cacheeintrag
ohne den Shell-/Modul-Query-String kann nicht irrtümlich als aktuelle Code- oder Style-Datei dienen. Bei
einer zukünftigen Änderung muss der Token im gesamten Browser-Modulgraph gemeinsam erhöht werden;
`tests/delivery.test.js` erzwingt genau einen einheitlichen Wert.

### 17.3 Inline-Bereinigung

Vor Stylesheet und Modulscript startet `index.html`:

- `navigator.serviceWorker.getRegistrations()` und `unregister()` — **ausschließlich** für Registrierungen,
  deren Skriptpfad `/sw.js` ist. Eine originweite Abmeldung würde auch fremde Worker desselben Hosts
  treffen; das ist nicht unsere Registrierung, über die wir verfügen dürfen;
- `caches.keys()` und Löschen aller Cache-Namen mit Präfix `dienstplanrad`;
- Ablage des Abschluss-Promises als `window.__dienstplanLegacyCleanup`.

Die Position im HTML ist absichtlich früh: Die Bereinigung hängt nicht von einem möglicherweise
veralteten `app.js` ab. `releaseLegacyServiceWorker()` wiederholt sie während `init()` als defensive
zweite Ebene — mit derselben Begrenzung auf den eigenen Worker.

**Einmaliger Neustart, und nur wenn nötig.** `unregister()` löst den Controller eines bereits geöffneten
Tabs nicht ab: Wer die Seite mit aktivem Alt-Worker öffnet, wird für die gesamte Lebensdauer dieses Tabs
weiter aus dessen Cache bedient. Die Bereinigung wirkt dort erst beim nächsten Aufruf. Deshalb lädt das
Inline-Skript die Seite genau dann einmal neu, wenn `navigator.serviceWorker.controller` tatsächlich
gesetzt ist. Drei Sicherungen verhindern die Fehler früherer Versuche:

1. Die Marke in `sessionStorage` wird **vor** dem Neuladen gesetzt — eine Schleife ist damit auch dann
   unmöglich, wenn der Controller überraschend bestehen bleibt.
2. Der Neustart geschieht im `<head>`, vor jeder eigenen Anfrage. `init()` fragt
   `legacyNeustartAngekuendigt()` ab und bricht ab, statt in einen bevorstehenden Neustart hinein Abrufe
   abzusetzen. Ein Neustart mitten in laufenden Anfragen war genau das, was die Seite in einem früheren
   Versuch dauerhaft bei „Lädt …“ stehen ließ.
3. Ohne Controller passiert nichts. Der Normalfall — kein Worker vorhanden — bleibt unberührt.

Die Wartezeit auf das Bereinigungs-Promise ist auf drei Sekunden begrenzt. Bliebe es offen, startet die
Anwendung ohne Bereinigung, statt selbst stehen zu bleiben.

### 17.4 Kein Service Worker

Die Anwendung liefert **keinen Service Worker** aus, und sie registriert auch keinen.

Der ursprüngliche Worker lieferte eigenen Anwendungscode Cache-First aus. Ein Client, der ihn einmal
installiert hatte, bekam dauerhaft alte Fassungen von `styles.css` und den JS-Modulen; ausgerollte
Korrekturen erreichten ihn nicht mehr.

Es gibt **keine Worker-Datei** im Auslieferungsstand. `/sw.js` wird von einer **Pages Function**
(`functions/sw.js.js`) bedient, deren einziger Zweck es ist, den historischen Worker aus bestehenden
Installationen zu entfernen: Sie liefert ein Skript aus, das die `dienstplanrad*`-Caches löscht, sich
selbst abmeldet und offene Tabs einmal neu aufbaut. Es horcht auf keine Anfragen und speichert nichts.

#### Warum Löschen allein nicht genügte

Das ist keine Vorsichtsmaßnahme, sondern die Behebung eines gemessenen Fehlers. Am 30.07.2026 gegen die
Produktion geprüft, mit `sw.js` seit dem Vortag nicht mehr im Repository:

| Anfrage | Antwort | Wirkung auf einen installierten Worker |
|---|---|---|
| `GET /sw.js` | HTTP 200, **der alte Worker**, 1144 Byte, `dienstplanrad-v4`, `cf-cache-status: HIT`, `age: 30048`, `cache-control: public, s-maxage=604800` | Die Updateprüfung erhält ein byteweise identisches Skript. Kein Wechsel. Bis zu **sieben Tage je Edge-Standort**. |
| `GET /sw.js?x=…` (Cache-Miss) | HTTP 200, **`index.html`** mit `Content-Type: text/html` — der SPA-Rückfall von Pages | MIME-Fehler. Die Updateprüfung bricht ab, **ohne** die Registrierung zu löschen. Der Worker bleibt dauerhaft. |

Zusammengenommen heißt das: Ein Browser, der den Worker je installiert hatte, behielt ihn **für immer**
und wurde für immer aus dessen Cache bedient. Genau das erklärt den Befund, dass Korrekturen auf einem
eingerichteten Gerät nicht ankamen, während ein frisches Gerät den aktuellen Stand sah — und es erklärt,
warum das Löschen der Datei sich als Lösung angefühlt hat, ohne eine zu sein.

#### Warum eine Function und keine neue Datei

Eine neue statische Datei löst das nicht: Sie liegt unter derselben URL, für die der Edge bereits eine
gültige Kopie hält — die Wirkung träte erst nach bis zu sieben Tagen ein. **Functions stehen im Routing
vor den statischen Assets und werden bei jeder Anfrage ausgeführt.** Der Cache-Eintrag wird damit ab dem
Deployment nicht mehr erreicht. Das ist der Unterschied zwischen „in einer Woche" und „sofort".

Die Antwort trägt `Content-Type: application/javascript; charset=utf-8` — ein falscher MIME-Typ war
genau der Fehler des SPA-Rückfalls — sowie `Cache-Control: no-store` und `CDN-Cache-Control: no-store`,
damit weder Browser noch Edge erneut etwas anlegen, das später im Weg steht.

Der Dateiname `functions/sw.js.js` ist Absicht: Pages leitet die Route aus dem Pfad ohne die Endung
`.js` ab, die Datei bedient daher genau `/sw.js`.

**Nachgewiesen, nicht angenommen.** In Chromium gemessen: Alt-Worker installiert (1 Registrierung, Cache
`dienstplanrad-v4`, Seite wird nachweislich aus dem Cache mit fremdem Inhalt bedient) → Function-Endpunkt
ausgeliefert → nach einer Navigation 0 Registrierungen, 0 Caches, Anwendung bootet mit 31 Zeilen auf dem
aktuellen Stempel.

#### Die Sperre bleibt

`tests/delivery.test.js` prüft: **keine** Datei `sw.js` im Projekt, `/sw.js` von einer Function bedient,
`unregister()` und Cache-Löschung zwingend vorhanden, korrekter MIME-Typ, `no-store` und
`CDN-Cache-Control: no-store` gesetzt — und verboten: `fetch`-Handler, `respondWith`,
`caches.match`/`cache.put`/`addAll`, ein `_headers`-Eintrag für `/sw.js`. Zusätzlich weiterhin: nirgends
`serviceWorker.register(`. Ein Worker, der wieder ausliefert, kann damit nicht zurückkehren.

**Folge für den Betrieb:** Es gibt keine Zwischenschicht mehr, die Dateien festhalten könnte. Die
Aktualität hängt allein an den Cache-Headern und dem Release-Token – beides in 17.5 beschrieben. Der
Datenteil bleibt offlinefähig, weil Stammdaten und geladene Monate in `localStorage` liegen; ein
Kaltstart ohne Netz lädt die Anwendung dagegen bewusst nicht mehr.

### 17.5 Cloudflare-Header

| Route | Cache-Control |
|---|---|
| `/` | `no-cache, no-store, must-revalidate` |
| `/index.html` | `no-cache, no-store, must-revalidate` |
| `/styles.css` | `no-cache, must-revalidate` |
| `/js/*` | `no-cache, must-revalidate` |

HTML darf nicht gespeichert wiederverwendet werden. CSS und JavaScript dürfen lokal
vorliegen, müssen aber revalidiert werden. Release-Token und Header ergänzen sich: Der Token trennt
Releases, die Header verhindern unkontrollierte Wiederverwendung.

---

## 18. Sicherheit und Datenschutz

`_headers` setzt für alle Pfade:

| Header | Wert |
|---|---|
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

Pflegbare Namen, Rollenbezeichnungen, Feiertagsnamen und Bewertungsgründe werden vor Einbettung in
`innerHTML` escaped. Die Anwendung enthält keine Analytik und kein Tracking. Die einzige
Drittanbieter-Laufzeitressource ist SheetJS vom offiziellen CDN.

Gespeichert werden Namen, Dienste, Abwesenheiten, Wünsche und Freigabekommentare. Patientendaten,
Kontaktdaten und Zugangsdaten gehören nicht in das System. Cloudflare KV und Browser-`localStorage`
enthalten personenbezogene Planungsdaten; Geräte- und Deploymentzugriff müssen organisatorisch
geschützt werden. Die Anwendung besitzt keine eigene Authentifizierung. Cloudflare Access,
Netzsegmentierung oder ein gleichwertiger Schutz ist Aufgabe des Betriebs.

Ebenso gibt es keine Rollenverwaltung, API-Autorisierung, CSRF-Abwehr, semantische
Serverschemavalidierung, Import-Größenlimits, Rate-Limits, Content-Security-Policy oder
Subresource-Integrity-Prüfsumme für SheetJS. `overrideLog` dokumentiert die Entscheidung, aber keine
verifizierte Benutzeridentität. Jede Person mit Zugriff auf Site und API kann Daten lesen und schreiben.

---

## 19. Barrierefreiheit und Responsivität

- `<html lang="de">`;
- semantische Bereiche, Tabellen, Buttons, Labels, Menüs und native Dialoge;
- weitgehend native Tastaturbedienung über Buttons, Selects, Eingabefelder und Dialoge;
- sichtbare `:focus-visible`-Konturen;
- Textlabel zusätzlich zu jeder Farbe;
- Klartextgründe ohne Hover-Zwang im Personendialog;
- `aria-hidden` auf rein dekorativem Ambient-Layer;
- inaktive oder nicht planbare Personen werden aus der Kandidatenauswahl entfernt;
- reduzierte Bewegung über CSS und JavaScript;
- neutralisierte Druckanimationen.

Unter 980 px stapeln sich Kopf- und Werkzeugleiste, Monatsauswahl und Sammelsteuerung. Das Tagesraster
verwendet vier Spalten. Die große Plantabelle behält alle acht fachlichen Spalten und scrollt intern
horizontal.

Die Anwendung beansprucht keine formale Barrierefreiheitszertifizierung. Pfeil- und Schließen-Buttons
stützen sich teilweise auf Symbol und `title`, der Speicherstatus ist kein `aria-live`-Bereich,
`title`-Tooltips sind auf Touch-Geräten eingeschränkt und Importmeldungen verwenden `window.alert`.
Eine vollständige Screenreader-Prüfung ist nicht Bestandteil der automatischen Tests.

---

## 20. Lokale Entwicklung und Tests

### 20.1 Start

Nur Frontend:

```bash
python -m http.server 8080
```

Ohne Pages Functions fällt die Anwendung auf lokale Daten und Standardwerte zurück.

Mit Cloudflare-Laufzeit und KV:

```bash
npx wrangler pages dev . --kv DIENSTPLAN_KV
```

### 20.2 Befehle

```bash
npm run check
npm test
```

`npm run check` prüft laut aktuellem `package.json` die Syntax von `app.js`, `api.js`, `defaults.js`,
`rules.js`, `state.js`, `theme.js`, `holidays.js` und `functions/_utils.js`. `npm test` führt alle Dateien unter
`tests/*.test.js` aus.

### 20.3 57 Regressionstests

**`rules.test.js` – 5 Tests**

- korrekte Februar-Länge in Schalt- und Normaljahr;
- zeitabhängige Beförderungsrechte;
- Abwesenheit, Doppelrolle und persönliche Sperren;
- Wochenend-Äquivalent;
- Statistik, Aktivdatum und Restwert.

**`rule-matrix.test.js` – 24 Tests unter `Europe/Berlin`**

Die vollständige Abnahme der Eignungsbewertung, zweiteilig:

- eine **Regelmatrix** mit 17 Fällen, die jede dokumentierte Regel einzeln ansteuert und Stufe *und*
  Begründungstext prüft – Qualifikation, Beförderungsstichtag, Abwesenheit, Wünsche, Doppelrolle,
  persönliche Sonderregeln, Kontingente, Urlaubsübergang, Feiertagsalternanz und der unbelastete
  Normalfall;
- die beiden **Invarianten** aus 7.7a: sechs Dienstpaare jeweils in beiden Eingabereihenfolgen sowie
  die Selbstkonsistenz über alle planbaren Personen und Kontingentstufen.

Gegen den Stand vor der Korrektur schlagen fünf dieser Tests fehl – sie sind also nachweislich
wirksam und nicht bloß bestätigend.

**`timezone.test.js` – 13 Tests unter `Europe/Berlin`**

- Testzeitzone;
- BD am Vortag;
- drei HG-Tage;
- HG vor eigenem BD samt Freitag/Samstag-Ausnahme;
- BD vor Urlaubsbeginn;
- aufeinanderfolgende BD-Wochenenden;
- Oster-/Pfingstalternanz;
- BD–FZA–BD;
- Monatsgrenze;
- inaktive Person als Ausschluss;
- symmetrischer BD-Abstand;
- Becker-Sperre am ersten echten Werktag;
- eindeutige Becker/Martin-Meldung.

**`theme.test.js` – 8 Tests**

- zwölf eindeutige Paletten und sichere Normalisierung;
- Farbparser;
- Flächenhierarchie;
- WCAG-AA-Kontrast aller Paletten und Flächen;
- kontrastierter Schriftton;
- farbtreue Interpolation ohne graue Mitte;
- Alphakanal;
- monotone, über die Dauer verteilte Zeitkurve.

**`delivery.test.js` – 3 Tests**

- Inline-Bereinigung vor Stylesheet und Modulgraph plus Tombstone-Verhalten;
- ein gemeinsamer Release-Token für die releasekritischen Shell- und Modulgraph-Assets;
- Cloudflare-Revalidierung für Shell, Worker, CSS und Module.

**`month-navigation.test.js` – 3 Tests**

- Farbstart vor Laden und Inhaltsanimation nach Rendering;
- Pfeile und beide Dropdowns verwenden dieselbe Pipeline;
- schnelle Umkehr vergleicht gegen den zuletzt angeforderten Monat.

Zusätzlich wurde der Ablauf real in Chromium geprüft: messbare Zwischenfarben, korrekte Zielpalette,
richtige Inhaltsrichtung, schneller Vor-/Zurück-Wechsel und direkter Dropdown-Sprung.

Nicht automatisiert sind echte Browser-E2E- und visuelle Regressionstests, API-/KV-Integration,
Excel-Import mit produktiven Arbeitsmappen, Accessibility-Audits sowie Last- und Mehrbenutzertests.

---

## 21. Deployment und Betrieb

### 21.-2 Herkunft: was aus fremden Beiträgen übernommen wurde

Am Projekt haben mehrere Beitragende gearbeitet. Mehrere Ansätze aus fremden Pull Requests sind
inhaltlich richtig und im aktuellen Stand enthalten — die Herkunft ist hier festgehalten, damit sie bei
späteren Umbauten nicht versehentlich wieder herausfällt.

**Aus PR #7 und #8** (`codex/automatisch-farbwechsel-beim-monatswechsel-implementieren`):

| Idee | Warum sie richtig ist | Wo sie steht |
|---|---|---|
| `shiftMonth` liest die **Auswahlfelder**, nicht `state` | Wer im Dropdown springt und dann die Pfeiltaste drückt, erwartet den Nachbarn des Sichtbaren, nicht des geladenen Monats | `js/app.js`, `shiftMonth` |
| `persistMonth(year, month)` statt `persistCurrentMonth()` | Eine gepufferte Speicherung muss ihrem **Ursprungsmonat** zugeordnet werden, sonst schreibt sie beim Wechsel in den falschen | `js/state.js` |
| `monthRequestId` als Anforderungskennung | Bei schnellen Wechseln darf eine langsamere alte Serverantwort den zuletzt gewählten Monat nicht überschreiben | `js/app.js`, `openCurrentMonth` |
| Jahresauswahl relativ zum Kalenderjahr | Der fest verdrahtete Bereich 2025–2030 läuft ab | `js/app.js`, `buildStaticSelectors` |
| Importe gegen Fehleingaben härten | `XLSX.read` in `try`/`catch`, JSON-Wurzeltyp und Monatsschlüssel geprüft, Tagesspalten gegen die **echte** Monatslänge statt gegen 31 | `js/app.js`, `onExcelImport`, `importMonthSheet`, `onJsonImport` |
| `theme-color` beim Monatswechsel **nicht** mitziehen | Die Browserleiste soll nicht monatlich die Farbe wechseln | `index.html` |
| Sättigungsimpuls zum Farbwechsel | Bindet Farb- und Inhaltswechsel zu einer wahrgenommenen Bewegung | `styles.css`, `.month-content-transition` |

Nicht übernommen wurde aus diesen PRs der Übergang selbst: `@property` plus CSS-`transition` auf `<html>`
löste nicht verlässlich aus. An seiner Stelle steht die zeitgesteuerte OKLCH-Interpolation in
`js/theme.js` (siehe 13.0).

**Aus PR #13** (`agent/re-audit-month-delivery`, nie zusammengeführt) — drei Befunde, die trotz
Nichtzusammenführung zutrafen:

- `unregister()` löst den Controller eines geöffneten Tabs nicht ab → einmaliger, dreifach gesicherter
  Neustart (17.3);
- die Bereinigung darf keine fremden Worker desselben Origin abmelden → Begrenzung auf `/sw.js` (17.3);
- `npm run check` erfasste `js/holidays.js` und alle Endpunkte unter `functions/api/` nicht → die
  Prüfliste ist jetzt vollständig und `tests/delivery.test.js` erzwingt das, indem er die Dateien im
  Projekt gegen das Skript abgleicht. Ein Syntaxfehler in einer Function kostet nicht einen Endpunkt,
  sondern das gesamte Deployment (21.-1).

Der selbstabmeldende Worker unter `/sw.js` (17.4) geht ebenfalls auf PR #13 zurück. Er wurde dort
verworfen und ist nach Messung gegen die Produktion nachweislich notwendig — dort allerdings als Datei
gedacht; als solche hätte er wegen des Asset-Caches bis zu sieben Tage gebraucht.

### 21.-1 Vorfall: gescheiterte Builds hielten die Auslieferung wochenlang auf

**Ursache:** In `functions/api/month/[year]/[month].js` stand `'../../../../_utils.js'` – vier Ebenen
aufwärts statt drei, damit außerhalb von `functions/`. Cloudflare Pages bündelt die Functions vor der
Auslieferung und brach daran ab:

```
✘ [ERROR] Could not resolve "../../../../_utils.js"
    api/month/[year]/[month].js:1:89
Failed: generating Pages Functions failed.
```

**Wirkung:** Nicht ein kaputter Endpunkt, sondern **kein Deployment**. Bei einem gescheiterten Build
bleibt die Produktion am letzten erfolgreichen Stand stehen – hier an einem Commit, dem das
Monatsfarbsystem vollständig fehlte. Über einen langen Zeitraum wurde damit eine alte Fassung
ausgeliefert, während im Repository längst korrigierter Code lag. Die Fehlersuche lief dadurch mehrfach
ins Leere: Sie suchte im Anwendungscode nach etwas, das dort nicht war.

Sichtbar war es ausschließlich in der Deployment-Liste des Pages-Projekts – jede Zeile
`build failure`, sowohl für `main` als auch für jede Vorschau.

**Absicherung:** `tests/functions.test.js` prüft jeden relativen Import unter `functions/` gegen das
Dateisystem und verbietet Versionsmarken (`?v=`) in Function-Importen. Gegen den fehlerhaften Stand
schlägt der Test an. `node --check` konnte das nicht leisten – es prüft nur Syntax und löst keine
Importe auf.

**Merksatz:** Ein grüner Testlauf im Repository sagt nichts über die Auslieferung. Vor jeder Fehlersuche
im Anwendungscode gehört der Blick auf den tatsächlich ausgelieferten Stand – siehe 21.0.

### 21.0 Prüfen, welcher Stand tatsächlich online ist

**Diese Prüfung ist verbindlich, bevor ein Fehlerbild im Code gesucht wird.**

```bash
curl -s https://dienstplanrad.pages.dev/ | grep dienstplanrad-build
```

Der Auslieferungsstempel im Kopf der Seite muss dem Release-Token des Modulgraphen entsprechen; ein Test
hält beide zusammen. Zusätzlich lässt sich jede Datei direkt gegen das Repository stellen:

```bash
for f in index.html styles.css js/app.js js/theme.js; do
  git show origin/main:$f > /tmp/repo && curl -sL -o /tmp/live "https://dienstplanrad.pages.dev/$f"
  cmp -s /tmp/repo /tmp/live && echo "$f identisch" || echo "$f ABWEICHEND"
done
```

**Warum das hier steht.** Genau diese Prüfung fehlte über einen langen Zeitraum, und sie hätte mehrere
Fehlersuchen erspart. Die Live-Seite lief auf dem Zweig `agent/aero-month-palettes-readme` statt auf
`main` – auf einem Stand, dem das Monatsfarbsystem **vollständig fehlte**:

| Suchbegriff | Treffer im ausgelieferten Stand |
|---|---|
| `applyMonthTheme` | 0 |
| `MONTH_PALETTES` | 0 |
| `month-accent` in `styles.css` | 0 |

`/js/theme.js` lieferte dort HTML statt JavaScript – die Datei existierte im Deployment gar nicht,
Cloudflare fiel auf `index.html` zurück. Zusätzlich lag unter `/sw.js` noch der cachende Worker mit
`CACHE = 'dienstplanrad-v4'`, eine Version, die in diesem Repository nie existiert hat; der damalige
`app.js` registrierte ihn aktiv. Kein Eingriff am Code konnte unter diesen Umständen wirken, und auch ein
fabrikneues Gerät zeigte dasselbe Bild.

**Behebung im Hosting**, nicht im Code: In den Einstellungen des Pages-Projekts ist der Produktionszweig
auf `main` zu stellen und ein Deployment auszulösen. Danach beantwortet der Aufruf oben jederzeit, ob der
ausgelieferte Stand der erwartete ist.

### 21.1 Cloudflare Pages

1. Repository mit einem Pages-Projekt verbinden.
2. Keinen Build-Befehl konfigurieren.
3. Repository-Wurzel als Ausgabeverzeichnis verwenden.
4. KV-Namespace erstellen.
5. Binding exakt `DIENSTPLAN_KV` nennen.
6. Zugriffsschutz konfigurieren.
7. Deployment ausführen.

Beim ersten API-Aufruf initialisiert `getOrInit()` fehlende Einstellungen, Personal- und RBN-Daten.

### 21.2 Release-Checkliste

- `npm run check`;
- `npm test`;
- alle Browserimporte tragen denselben `?v=`-Token;
- `_headers` enthält die Revalidierungsregeln;
- es existiert kein Service Worker und keine Registrierung;
- Pfeile, Dropdowns und schnelle Umkehr im Browser prüfen;
- KV-Binding und Zugriffsschutz prüfen;
- JSON-Sicherung vor größeren Stammdatenänderungen erstellen.

### 21.3 Manifest

| Feld | Wert |
|---|---|
| `name`, `short_name` | DienstplanRAD |
| `start_url` | `/` |
| `display` | `standalone` |
| `background_color` | `#0d1117` |
| `theme_color` | `#111820` |
| Icon | `/icons/icon.svg`, `any maskable` |

Das Manifest macht die Anwendung installierbar. Installierbarkeit bedeutet nicht, dass ein Kaltstart
ohne Netz garantiert ist.

---

## 22. Anpassung, Diagnose und Glossar

### 22.1 Anpassung

| Ziel | Stelle |
|---|---|
| Person ergänzen | `DEFAULT_STAFF` und `STAFF_ORDER` in `js/defaults.js` |
| Aktivität begrenzen | `activeFrom` / `activeUntil` |
| Beförderung | `promotionDate` und `promoted*` |
| Soll/Maximum | `bdTarget` / `maxBd` |
| Abwesenheits-/Wunschtyp | Arrays in `defaults.js`, Kurzlabel in `app.js` |
| Regel | `evaluateCandidate()` oder zugehörige Hilfsfunktion in `rules.js` |
| Feiertage | `js/holidays.js` |
| Palette | `MONTH_PALETTES` in `theme.js` |
| Flächenstärke | `SURFACE_MIX` in `theme.js` |
| Farbdauer/-kurve | `THEME_DURATION_MS` und `EASE` |
| Datenmigration | `schemaVersion` und `ensureMonthShape()` |
| Browserrelease | gemeinsamen `?v=`-Token im vollständigen Modulgraph erhöhen |

Bei bestehenden Installationen ist die KV-Kopie des Personals maßgeblich. Änderungen an
`DEFAULT_STAFF` ersetzen `app:staff` nicht automatisch. Eine Administrationsoberfläche für Personal,
Einstellungen und Zugriffsrechte existiert derzeit nicht; solche Änderungen erfolgen über Code,
API beziehungsweise KV-Betrieb.

### 22.2 Diagnose

| Beobachtung | Prüfung |
|---|---|
| dauerhaft offline | Netz, Pages Functions und `DIENSTPLAN_KV` prüfen |
| Person fehlt | `includeInPlanning`, `STAFF_ORDER`, `activeFrom`, `activeUntil` prüfen |
| Excel importiert nichts | Blattname, Tageszeile, „Arbeitsplatz“-Zeilen und Namenszuordnung prüfen |
| Import überschreibt keinen Dienst | beabsichtigt; Ziel vorher leeren |
| SheetJS fehlt | CDN-Erreichbarkeit prüfen |
| keine Animation | `prefers-reduced-motion` prüfen |
| falsche Monatsfarbe nach Deployment | `dataset.month`, `dataset.palette`, aktuellen `?v=`-Token und `_headers` prüfen |
| alte Origin wirkt anders als neue | Inline-Bereinigung, Service-Worker-Registrierungen und `dienstplanrad`-Caches prüfen |
| Änderung noch nicht am Server | 1100-ms-Debounce und Statusanzeige beachten |

`document.documentElement.dataset.month` und `.dataset.palette` zeigen das aktive Theme-Ziel.
Ein manueller Hard Reload ist keine normale Releaseanforderung; die Auslieferungsschicht ist so gebaut,
dass sie veraltete Assets selbst neutralisiert.

### 22.3 Glossar

| Begriff | Bedeutung |
|---|---|
| BD | Bereitschaftsdienst |
| HG | Hintergrunddienst |
| RBN | Rufbereitschaft Nuklearmedizin |
| FZA | Freizeitausgleich |
| WB | Weiterbildung |
| FA/FÄ | Facharzt/Fachärztin |
| OA/OÄ | Oberarzt/Oberärztin |
| AA/AÄ | Assistenzarzt/Assistenzärztin |
| Override | bestätigte rote Einteilung mit Protokolleintrag |
| Wochenend-Äquivalent | BD-Wochenende 1,0; reines HG-Wochenende 0,5 |
| Bootstrap | gemeinsames Laden von Einstellungen, Personal und RBN-Namen |
| KV | Cloudflare Key-Value-Store |
| Release-Token | einheitlicher Query-String der releasekritischen Shell- und Modulgraph-Assets |
| Tombstone-Worker | Worker ohne Fetch-Logik, der alte Registrierungen und Caches neutralisiert |

---

**DienstplanRAD** verbindet manuelle Planungshoheit mit erklärbarer Regelprüfung, unmittelbarer
Verteilungssicht, harmonischer Monatsidentität und einer Auslieferung, die jede Origin zuverlässig auf
denselben aktuellen Anwendungsstand bringt.
