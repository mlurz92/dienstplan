# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – abstrakte gläserne Dienstplantabelle" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Aktueller Funktionsstand:** saisonales Langzeit-Farbsystem mit **288 deterministischen Monatspaletten**  
> **Paketversion:** `0.2.0` · **Datenregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die **bewusste manuelle Planung** von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung nimmt keine automatische Gesamtplanung vor. Sie bewertet konkrete Einteilungen nachvollziehbar, erklärt Konflikte und Empfehlungen, speichert Monatsstände und hält Importe, Exporte sowie bestätigte Ausnahmen revisionsfähig.

Die vor Einführung des Langzeit-Farbsystems erstellte, sehr ausführliche Bedienungs- und Architekturreferenz bleibt als historischer Snapshot erhalten: [`docs/README-20260801.11.md`](docs/README-20260801.11.md). Die vorliegende Haupt-README beschreibt den aktuellen Stand und ist für neue Änderungen maßgeblich.

---

## Inhaltsverzeichnis

1. [Planungsprinzip](#1-planungsprinzip)
2. [Benutzeroberfläche](#2-benutzeroberfläche)
3. [Dienstarten und Personalpools](#3-dienstarten-und-personalpools)
4. [Bewertungs- und Konfliktmodell](#4-bewertungs--und-konfliktmodell)
5. [Saisonales Langzeit-Farbsystem](#5-saisonales-langzeit-farbsystem)
6. [Abwesenheiten, Wünsche und Optionen](#6-abwesenheiten-wünsche-und-optionen)
7. [RBN-Logik](#7-rbn-logik)
8. [Statistik und offene Punkte](#8-statistik-und-offene-punkte)
9. [Persistenz und Datensicherheit](#9-persistenz-und-datensicherheit)
10. [Import und Export](#10-import-und-export)
11. [Technische Architektur](#11-technische-architektur)
12. [Tests und Qualitätssicherung](#12-tests-und-qualitätssicherung)
13. [Lokale Entwicklung](#13-lokale-entwicklung)
14. [Deployment](#14-deployment)
15. [Projektstruktur](#15-projektstruktur)
16. [Unveränderliche Grundsätze](#16-unveränderliche-grundsätze)

---

# 1. Planungsprinzip

## 1.1 Assistierte manuelle Planung

DienstplanRAD ist **kein automatischer Optimierer**. Es gibt:

- keine automatische Monatsbelegung;
- keine selbstständige Umbesetzung;
- keine automatische Tauschlogik;
- keine versteckte Gesamtoptimierung;
- keine automatisch erzeugten Gegenposten bei Kopplungsregeln.

Jede Besetzung entsteht durch eine ausdrückliche Auswahl. Die Anwendung prüft diese Auswahl gegen das fachliche Regelwerk und zeigt sämtliche ausgelösten Gründe in Klartext an.

## 1.2 Chronologische Monatsansicht

Der Monatsplan verwendet eine Zeile je Kalendertag. Dadurch liegen Datum, Wochentag, BD, HG, RBN, zweite RBN, Abwesenheiten sowie Wünsche und Optionen in einer gemeinsamen Leserichtung. Dienstfolgen, Wochenenden, Feiertage und Ruheabstände bleiben unmittelbar erkennbar.

## 1.3 Erklärbarkeit

Eine Kandidatenkarte enthält nicht nur eine Farbe, sondern alle relevanten Gründe. Die höchste Konfliktstufe bestimmt die sichtbare Bewertung; niedrigere Gründe und positive Hinweise bleiben erhalten. Positive Gründe können Konflikte nicht rechnerisch aufheben.

---

# 2. Benutzeroberfläche

## 2.1 Monatsnavigation

- Vormonat und Folgemonat;
- direkte Monats- und Jahresauswahl;
- Sprung zum aktuellen Monat;
- dynamische Ergänzung historischer oder zukünftiger Jahre;
- richtungsabhängige Monatswechselanimation;
- Vorladen benachbarter Monate für monatsübergreifende Regeln.

## 2.2 Planbearbeitung

- direkte Auswahl für BD und HG;
- native Auswahlfelder für RBN;
- bedingt eingeblendete zweite RBN;
- Löschen vorhandener Einteilungen;
- Einzelerfassung tagesbezogener Markierungen;
- Sammelerfassung mehrerer Tage;
- vollständiges Leeren des sichtbaren Monats nach Bestätigung;
- automatische lokale Sicherung und Server-Synchronisierung.

## 2.3 Gestaltung

Die Oberfläche kombiniert eine Excel-nahe Tabellenlogik mit kontrollierter Glasoptik:

- semitransparente, klar begrenzte Panels;
- monatlich getönte Kanten und Akzente;
- deckend weiße Eingabefelder für maximale Lesbarkeit;
- tabellarische Ziffern;
- definierte Fokusdarstellung;
- reduzierte Bewegung über `prefers-reduced-motion`;
- deckende Ersatzflächen über `prefers-reduced-transparency`.

---

# 3. Dienstarten und Personalpools

## 3.1 Bereitschaftsdienst

BD wird monatlich gegen individuelle Sollwerte und gegebenenfalls harte Maxima bewertet. Die Kandidatenliste berücksichtigt die am konkreten Datum aktive Rolle, Abwesenheiten, Wünsche, Qualifikation, bestehende Einteilungen und relevante Dienstfolgen.

## 3.2 Hintergrunddienst

HG steht nur tagesgültig HG-berechtigten Personen zur Verfügung. Die Bewertung berücksichtigt unter anderem bestehende BD-Einteilungen, Diensthäufungen, Kopplungsregeln, Abwesenheiten und kombinierte Monatslast.

## 3.3 Rufbereitschaft Neuroradiologie

Die erste RBN besitzt einen datumsabhängigen festen Pool. Die zweite RBN wird ausschließlich eingeblendet, wenn die Erstbesetzung fachlich eine zusätzliche Absicherung erfordert. Historische oder importierte Altwerte bleiben lesbar, werden aber nicht automatisch als erneut wählbar behandelt.

## 3.4 Tagesgültige Personalrollen

Personaldefinitionen können Aktivierungsdaten, Deaktivierungsdaten, Beförderungsdaten, Grundrollen, BD-Sollwerte, Maxima und Planungsberechtigungen enthalten. Qualifikationen werden für den konkreten Kalendertag aufgelöst, nicht pauschal aus dem aktuellen Status abgeleitet.

---

# 4. Bewertungs- und Konfliktmodell

## 4.1 Stufen

| Stufe | Bedeutung |
|---|---|
| **Grün** | fachlich geeignet oder positiv empfohlen |
| **Gelb** | Hinweis, Belastung oder nachrangige Konstellation |
| **Orange** | relevanter Konflikt, der besonders geprüft werden soll |
| **Rot** | schwerer Konflikt; Eintragung nur nach ausdrücklicher Bestätigung |
| **Grau** | am konkreten Tag nicht auswählbar |

## 4.2 Rote Ausnahmen

Rote Einteilungen bleiben bewusst möglich, erfordern jedoch eine explizite Bestätigung. Protokolliert werden Datum, Rolle, Person, Gründe, Zeitpunkt und optionaler Kommentar.

## 4.3 Regelgruppen

Die Engine prüft unter anderem:

- tagesgültige Aktivität und Qualifikation;
- Urlaub, FZA und Sperrwünsche;
- gleiche Person in inkompatiblen Rollen;
- individuelle BD-Sollwerte und harte Maxima;
- monatsbezogenen Ausgleich;
- Dienstabstände und Dienstfolgen;
- Wochenendnachbarschaften;
- HG-Häufungen;
- fachliche Kopplungen zwischen BD und HG;
- personenspezifische Sonderregeln;
- historische Monatsdaten, sofern sicher geladen;
- reinen Jahreskontext ohne verdeckte Bewertungswirkung.

## 4.4 Fachliche Quellenhierarchie

1. ausgelieferter Quellcode;
2. ausführbare Tests;
3. `Eignungsregeln.txt`;
4. aktuelle README und ergänzende Dokumentation.

---

# 5. Saisonales Langzeit-Farbsystem

## 5.1 Ziel

Die frühere Zuordnung von genau zwölf Farben ausschließlich nach Monatsnummer führte dazu, dass sich jede Palette jährlich wiederholte. Das aktuelle System leitet die Monatsidentität **deterministisch aus Jahr und Monat** ab.

Es kombiniert:

- **12 saisonale Monatsfamilien**;
- **vier handkuratierte Grundvarianten je Monat**;
- **24 kontrollierte Trend-Editionen**;
- insgesamt **288 eindeutige Monatspaletten**;
- einen definierten **24-Jahres-Zyklus** ab Referenzjahr **2026**.

Derselbe Monat desselben Jahres erhält auf jedem Gerät und bei jedem Neuladen exakt dieselbe Palette. Laufzeit-Zufall wird nicht verwendet.

## 5.2 Saisonale Familien

| Monat | Saison | Farbfamilie | Grundvarianten |
|---|---|---|---|
| Januar | Winter | Frost | Eisnebel, Polarlicht, Winterflieder, Arktischer Stahl |
| Februar | Spätwinter | Beere | Rubinrose, Winterbeere, Orchideenrauch, Granatapfel |
| März | Vorfrühling | Botanik | Salbeigrün, Eukalyptus, Junge Olive, Celadon |
| April | Frühling | Blüte | Lavendel, Wisteria, Irisblau, Fliederregen |
| Mai | Frühling | Grün | Frühlingsgrün, Minzblatt, Chartreuse-Salbei, Maigrün |
| Juni | Frühsommer | Wasser | Türkis, Lagune, Aqua Mineral, Meeresglas |
| Juli | Hochsommer | Sonnenfrucht | Koralle, Persimone, Wassermelone, Sonnenuntergang |
| August | Spätsommer | Gold | Bernstein, Safran, Aprikosengold, Ringelblume |
| September | Frühherbst | Pflaume | Pflaume, Feige, Aubergine, Weinlese |
| Oktober | Herbst | Erde | Kupfer, Terrakotta, Zimt, Bronze |
| November | Spätherbst | Mineral | Schieferblau, Sturmblau, Petrolgrau, Indigonebel |
| Dezember | Winter | Immergrün | Tannengrün, Wacholder, Smaragdnacht, Winterwald |

## 5.3 Trend-Editionen

Die 24 Editionen verändern Farbton, Helligkeit und Buntheit nur innerhalb enger Grenzen. Beispiele:

- Cloud Veil;
- Botanical Jade;
- Plum Noir;
- Wasabi Spark;
- Persimmon Pop;
- Quiet Luxury;
- Neo Mineral;
- Digital Bloom;
- Soft Chrome;
- Organic Modern;
- Future Heritage;
- Glacial Pulse;
- Modern Heirloom.

Die saisonale Grundidentität bleibt erhalten: Januar bleibt winterlich, Juli sommerlich, Oktober erdig, Dezember immergrün.

## 5.4 Deterministische Auswahl

Zentrale Konstanten und Funktionen in `js/theme.js`:

```js
PALETTE_REFERENCE_YEAR = 2026
PALETTE_CYCLE_YEARS = 24
paletteForMonth(month, year)
paletteForDate(year, month)
```

Der Jahresindex wird positiv modulo 24 berechnet. Monat, Grundvariante und Trend-Edition ergeben einen reproduzierbaren Kalender-Schlüssel `JJJJ-MM`.

## 5.5 Generierte Farbwerte

Jede Palette enthält:

- `accent`;
- `accentStrong`;
- `glow`;
- `panelTint`;
- Saison;
- Familie;
- Edition;
- Anzeigename;
- eindeutigen Kalenderschlüssel.

Aus dem Akzent werden zusätzlich der dunkle Schriftton sowie sämtliche Tabellenflächen berechnet.

## 5.6 Tabellenflächen

| Fläche | Anteil Monatsfarbe |
|---|---:|
| Wochentagsspalte | 46 % |
| Samstag | 14 % |
| Sonntag | 22 % |
| Feiertag | 30 % |

Die Hierarchie Samstag < Sonntag < Feiertag < Wochentagsspalte bleibt über alle Paletten erhalten.

## 5.7 Kontrast und Barrierefreiheit

Der Schriftton wird im OKLab-Farbraum auf eine konstante dunkle Zielhelligkeit vertieft. Die Tests prüfen jede der 288 Paletten gegen alle vier relevanten Flächen. Sämtliche Kombinationen müssen mindestens **WCAG AA mit 4,5:1** erreichen.

## 5.8 Übergänge

Monatswechsel werden zeitbasiert über `requestAnimationFrame` und `performance.now()` animiert. Die Interpolation erfolgt in OKLCH über den kürzeren Farbtonbogen. Dadurch bleiben Buntheit und wahrgenommene Helligkeit stabil; gegensätzliche Farben laufen nicht durch einen grauen Zwischenzustand.

Die Farbanimation dauert 720 ms. Schnelles Blättern setzt am tatsächlich sichtbaren Zwischenstand an. Bei reduzierter Bewegung wird die Zielpalette ohne Übergang gesetzt.

## 5.9 Sichtbare Metadaten

Das Monatsbadge zeigt Grundvariante und Edition. Der Tooltip ergänzt Saison, Farbfamilie, Edition und Jahr. Auf `<html>` werden Monat, Jahr, Palette und Edition als Datensätze hinterlegt.

---

# 6. Abwesenheiten, Wünsche und Optionen

Unterstützt werden tagesbezogene Abwesenheiten, FZA, Sperrwünsche sowie positive oder negative Dienstoptionen. Markierungen können einzeln oder gesammelt gesetzt werden. Wirksame Abwesenheiten entfernen eine Person aus der tagesbezogenen Vergleichsgruppe.

Automatisch abgeleitete Freizeitausgleichsregeln werden ausschließlich dort erzeugt, wo sie fachlich ausdrücklich definiert sind. Manuelle und abgeleitete Quellen bleiben unterscheidbar; doppelte sichtbare Einträge werden vermieden.

---

# 7. RBN-Logik

- getrennte Felder für erste und zweite RBN;
- zweite RBN nur bei definierten Erstbesetzungen sichtbar;
- datumsabhängige Pools;
- defensive Behandlung importierter Altwerte;
- keine Einbeziehung der RBN in die BD-/HG-Statistik;
- vollständige Speicherung im Monatsdatensatz.

---

# 8. Statistik und offene Punkte

Die Statistik wird unmittelbar aus dem sichtbaren Monatsplan berechnet. Sie zeigt insbesondere BD, HG, Sollwerte, Restwerte und Wochenendlast. Die Liste „Offene Punkte“ priorisiert unbesetzte Rollen und erkannte Inkonsistenzen, ohne selbst Einteilungen zu verändern.

---

# 9. Persistenz und Datensicherheit

## 9.1 Lokaler Zustand

Jede Änderung wird unmittelbar lokal gesichert. Ein Debounce bündelt Serverspeicherungen, ohne die lokale Rückfallebene zu verzögern.

## 9.2 Cloudflare KV

Monatsdaten und Einstellungen werden über Pages Functions in Cloudflare KV gespeichert. Beim Öffnen eines Monats wird der aktuelle Serverstand geladen, sofern keine schützenswerten lokalen Änderungen entgegenstehen.

## 9.3 Konfliktvermeidung

- getrennte Dirty-Zustände je Monat;
- kein stilles Überschreiben lokaler Änderungen;
- defensive Normalisierung importierter Daten;
- Revision und Zeitstempel im Monatsobjekt;
- JSON-Sicherung als manuell transportierbares Rückfallformat.

---

# 10. Import und Export

## 10.1 Excel-Import

Der Import analysiert den Jahresplaner, ordnet Personalnamen defensiv zu und übernimmt unterstützte Monatsinformationen. Abweichende vorhandene Werte werden nur im vorgesehenen Importmodus ersetzt.

## 10.2 Excel-Export

Der sichtbare Monatsplan wird in ein Excel-kompatibles Arbeitsblatt mit Tageszeilen, Diensten, RBN und Markierungen übertragen.

## 10.3 PDF-/Druckausgabe

Die Druckansicht ist auf eine kompakte A4-Ausgabe ausgelegt. Vor dem Druck wird eine laufende Farbanimation beendet, damit keine Zwischenfarbe eingefroren wird.

## 10.4 JSON

Vollständige Sicherung und Wiederherstellung von Stammdaten, Einstellungen und Monatsständen.

---

# 11. Technische Architektur

Die Anwendung verwendet native Webtechnologien ohne Frontend-Framework:

- semantisches HTML;
- CSS Custom Properties und moderne Farbfunktionen;
- ES-Module;
- Pages Functions;
- Cloudflare KV;
- SheetJS für Excel;
- Node-Test-Runner;
- Playwright für End-to-End-Tests.

Wesentliche Module:

| Modul | Aufgabe |
|---|---|
| `js/app.js` | UI, Navigation, Dialoge, Rendering, Import-/Exportsteuerung |
| `js/theme.js` | Langzeit-Paletten, Farbräume, Kontrastflächen, Animation |
| `js/state.js` | Laden, Speichern, Dirty-Zustände, Monatscache |
| `js/rules*.js` | Regelengine, Auswertung, Statistik, offene Punkte |
| `js/rbn.js` | RBN-Pools und zweite RBN |
| `js/holidays.js` | sächsische Feiertage und Werktage |
| `js/excel-import.js` | Arbeitsmappenanalyse und Zuordnung |
| `functions/api/*` | Cloudflare-API und KV-Zugriff |

---

# 12. Tests und Qualitätssicherung

## 12.1 Syntaxprüfung

```bash
npm run check
```

Prüft sämtliche produktiven JavaScript-Module, Pages Functions und Testkonfigurationen.

## 12.2 Unit- und Regressionstests

```bash
npm test
```

Das Theme-Testpaket prüft insbesondere:

- exakt 288 Paletten;
- eindeutige Kalender-Schlüssel;
- eindeutige Akzentfarben;
- zwölf unterschiedliche Farben innerhalb jedes Jahres;
- sichere Monatsüberläufe;
- saisonale Metadaten;
- 24-jährigen Wiederholungszyklus;
- WCAG-AA-Kontrast sämtlicher Flächen;
- Farbtontreue des Schrifttons;
- farbtonerhaltende OKLCH-Interpolation;
- Alpha-Interpolation;
- monotone, zeitlich verteilte Easing-Kurve.

## 12.3 End-to-End

```bash
npm run test:e2e
```

Prüft die Anwendung im Browser einschließlich Navigation, Interaktion und zentraler Planungsabläufe.

## 12.4 Vollständige Verifikation

```bash
npm run verify
```

Der Pull Request für das Langzeit-Farbsystem bestand Syntaxprüfung, sämtliche Unit-/Regressionstests und sämtliche Playwright-End-to-End-Tests.

---

# 13. Lokale Entwicklung

```bash
npm ci
npm run check
npm test
npm run test:e2e
```

Für die reine Oberfläche kann ein statischer lokaler Webserver verwendet werden. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung und die vorgesehenen KV-Bindings.

---

# 14. Deployment

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Änderungen an statischen Assets werden durch die Pages-Auslieferung versioniert und revalidiert. Ein eigener Service Worker wird nicht verwendet; historisch vorhandene Registrierungen werden defensiv entfernt.

---

# 15. Projektstruktur

```text
.
├── index.html
├── styles.css
├── manifest.webmanifest
├── Eignungsregeln.txt
├── icons/
│   ├── icon.svg
│   └── icon-animated.svg
├── js/
│   ├── app.js
│   ├── theme.js
│   ├── state.js
│   ├── defaults.js
│   ├── rules.js
│   ├── rules-core.js
│   ├── rules-evaluation.js
│   ├── rules-reporting.js
│   ├── rbn.js
│   ├── holidays.js
│   └── excel-import.js
├── functions/
│   └── api/
├── tests/
│   └── theme.test.js
├── docs/
│   └── README-20260801.11.md
├── package.json
└── playwright.config.js
```

---

# 16. Unveränderliche Grundsätze

- Der Mensch plant; die Anwendung unterstützt und prüft.
- Keine verdeckte automatische Gesamtoptimierung.
- Konflikte werden erklärt, nicht nur eingefärbt.
- Positive Hinweise heben Konflikte nicht auf.
- Rote Ausnahmen bleiben möglich, aber protokollpflichtig.
- Historische Daten werden defensiv behandelt.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben sind deterministisch, saisonal, kontrastgeprüft und langfristig abwechslungsreich.
- Änderungen an Regelwerk, Tests und Dokumentation gehören in denselben Änderungsvorgang.
