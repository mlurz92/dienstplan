# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle mit wechselnden Monatsfarben" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Release-Token:** `20260801.11`  
> **Farbarchitektur:** **Trend Atlas v3** mit 288 deterministischen Monatsprofilen  
> **Wiederholungsschutz:** sechs Monate visuelles Farbgedächtnis, drei Monate Sektorengedächtnis, 18 Monate Namens-Cooldown  
> **Animation:** High-Framerate-Monatswechsel mit OKLCH-Interpolation  
> **Paketversion:** `0.2.0` · **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die bewusste manuelle Planung von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung erzeugt keinen automatischen Gesamtplan. Jede Einteilung wird vom Benutzer vorgenommen, transparent bewertet und gegen ein nachvollziehbares Regelwerk geprüft.

---

## Inhaltsübersicht

1. [Planungsprinzip](#1-planungsprinzip)
2. [Benutzeroberfläche](#2-benutzeroberfläche)
3. [Monatsnavigation und Animation](#3-monatsnavigation-und-animation)
4. [Trend Atlas v3](#4-trend-atlas-v3)
5. [Dienstarten und Personalpools](#5-dienstarten-und-personalpools)
6. [Bewertungs- und Konfliktmodell](#6-bewertungs--und-konfliktmodell)
7. [Abwesenheiten, Wünsche und RBN](#7-abwesenheiten-wünsche-und-rbn)
8. [Speicherung, Import und Export](#8-speicherung-import-und-export)
9. [Technische Architektur](#9-technische-architektur)
10. [Tests und Qualitätssicherung](#10-tests-und-qualitätssicherung)
11. [Lokale Entwicklung und Deployment](#11-lokale-entwicklung-und-deployment)
12. [Projektstruktur](#12-projektstruktur)
13. [Unveränderliche Grundsätze](#13-unveränderliche-grundsätze)

---

## 1. Planungsprinzip

DienstplanRAD ist ein **assistiertes manuelles Planungssystem**, kein automatischer Optimierer.

- keine automatische Monatsbelegung;
- keine selbstständige Umbesetzung oder Tauschlogik;
- keine verdeckte Gesamtoptimierung;
- vollständige Klartextbegründung ausgelöster Regeln;
- ausdrückliche Bestätigung und Protokollierung roter Ausnahmen;
- lokale Sofortsicherung und zentrale Cloudflare-KV-Synchronisierung.

Der Monatsplan verwendet eine chronologische Zeile je Kalendertag. Datum, Wochentag, BD, HG, RBN, zweite RBN, Abwesenheiten sowie Wünsche und Optionen liegen in einer gemeinsamen Leserichtung. Dienstfolgen, Feiertage und Wochenendbelastungen bleiben dadurch unmittelbar erkennbar.

---

## 2. Benutzeroberfläche

### 2.1 Monatsansicht

Die Oberfläche kombiniert eine Excel-nahe Tabellenlogik mit kontrollierter Glasoptik:

- klar gefasste, semitransparente Panels;
- monatlich gefärbte Kanten, Akzente und Tabellenflächen;
- deckend weiße Eingabefelder für maximale Lesbarkeit;
- tabellarische Ziffern und kompakte Zeilenhöhen;
- eindeutige Wochenend- und Feiertagsflächen;
- reduzierte Bewegung über `prefers-reduced-motion`;
- deckende Ersatzflächen über `prefers-reduced-transparency`.

### 2.2 Adaptive Werkzeugleiste

Die Aktionsleiste gruppiert Planung, Daten und Ausgabe. Ihre Dichte wird aus dem tatsächlich verfügbaren Platz bestimmt:

| Stufe | Darstellung |
|---|---|
| `full` | Gruppenüberschriften und alle Beschriftungen |
| `groups` | vollständige Schaltflächen ohne Gruppenüberschriften |
| `secondary` | nur Planungsaktionen bleiben beschriftet |
| `icons` | reine Symbolschaltflächen |
| `overflow` | Planung bleibt sichtbar, Daten und Ausgabe wechseln in ein Menü |

Die Schaltflächen werden im Überlaufmodus verschoben, nicht neu erzeugt. IDs, Ereignisbindungen und versteckte Datei-Eingaben bleiben erhalten. Alle Aktionen besitzen Tooltip, `aria-label`, Tastaturfokus und ein eigenständiges Inline-SVG-Icon.

### 2.3 Tabellenbearbeitung und Dienst-Picker

- direkte Auswahl für BD und HG;
- native Auswahlfelder für RBN;
- bedingt eingeblendete zweite RBN;
- Löschen und vollständiges Leeren nach Bestätigung;
- Einzel- und Sammeleingabe tagesbezogener Markierungen;
- automatische lokale Sicherung und Server-Synchronisierung.

Der Dienst-Picker sortiert alle Mitarbeitenden nach tatsächlicher Eignung statt alphabetisch:

| Gruppe | Bedeutung |
|---|---|
| **Empfohlen** | Wunsch, Ausgleich oder Verlauf sprechen ausdrücklich dafür |
| **Möglich** | keine relevanten Konflikte |
| **Mit Hinweis** | wählbar, jedoch mit Anmerkung |
| **Nachrangig** | nur bei fehlender besserer Besetzung |
| **Bestätigung nötig** | roter Konflikt, ausdrückliche Bestätigung erforderlich |
| **Nicht verfügbar** | nicht im Pool oder zum Termin nicht aktiv |

Tastatursteuerung: Sucheingabe filtert Name, Kurzname und Funktion; <kbd>↑</kbd>/<kbd>↓</kbd> wechseln die aktive Person, <kbd>Enter</kbd> übernimmt, <kbd>Esc</kbd> schließt. Semantisch ist die Auswahl als `combobox` mit `listbox`, gruppierten `option`-Elementen und `aria-activedescendant` umgesetzt.

---

## 3. Monatsnavigation und Animation

- Vormonat und Folgemonat über Pfeiltasten;
- direkte Monats- und Jahresauswahl;
- Sprung zum aktuellen Monat;
- Vorladen benachbarter Monate für monatsübergreifende Regeln;
- sauberer Abbruch überholter Navigationen bei schnellen Folgeeingaben.

Der Zielmonat wird vollständig vorbereitet, bevor er die alte Ansicht ersetzt. Unterstützte Chromium-Browser verwenden die native **View Transitions API** ausschließlich für `.sheet-panel`; sonst greift ein WAAPI-Fallback.

### Performancevertrag

- keine Tabellen-Neuberechnung pro Animationsframe;
- keine animierten Filter oder Blur-Effekte;
- ausschließlich compositorfähige Bewegungseigenschaften;
- höchstens ein Monats-GET für die Zielnavigation;
- kein nachgelagerter zweiter Render- oder Theme-Schritt;
- deterministischer Abbruch veralteter Navigationen.

Der Farbübergang dauert 760 ms, interpoliert alle Monatsvariablen in OKLCH und endet exakt auf dem kanonischen Zielprofil. Nur tatsächlich veränderte CSS-Custom-Properties werden geschrieben.

---

## 4. Trend Atlas v3

### 4.1 Zielsetzung

Die Monatsfarbe ist ein funktionaler Orientierungsträger. Zwei aufeinanderfolgende Monate müssen unmittelbar unterscheidbar sein; ähnlich gelagerte Töne sollen auch nach mehreren Monaten nicht unbemerkt wiederkehren.

Trend Atlas v3 verbindet:

1. kuratierte moderne Farbnamen und Referenzwerte;
2. wahrnehmungsbasierte Berechnung in OKLab/OKLCH;
3. zeitliche Wiederholungssperren über Monate und Jahre.

### 4.2 Recherchebasis

Der Atlas verwendet englische Originalnamen aus mehreren aktuellen Trendquellen:

- [Pantone Color of the Year 2026 – Cloud Dancer](https://www.pantone.com/eu/en-eu/articles/press-releases/pantone-announces-color-of-the-year-2026-cloud-dancer)
- [Pantone NYFW Spring/Summer 2026](https://www.pantone.com/eu/de-de/articles/fashion-color-trend-report/new-york-fashion-week-spring-summer-2026)
- [Pantone LFW Spring/Summer 2026](https://www.pantone.com/eu/en-eu/articles/fashion-color-trend-report/london-fashion-week-spring-summer-2026)
- [Pantone NYFW Autumn/Winter 2026/2027](https://www.pantone.com/uk/en-gb/articles/fashion-color-trend-report/new-york-fashion-week-autumn-winter-2026)
- [WGSN × Coloro Key Colours A/W 2026/2027](https://www.wgsn.com/en/blogs/key-colours-aw-2627)
- [Sherwin-Williams 2026 – Universal Khaki](https://www.sherwin-williams.com/en-us/color/color-of-the-year/2026)
- [Benjamin Moore 2026 – Silhouette](https://www.benjaminmoore.com/en-us/paint-colors/color-of-the-year-2026)
- [Behr 2026 – Hidden Gem](https://www.behr.com/consumer/inspiration/2026-color-of-the-year/)

Im Atlas liegen unter anderem `Cloud Dancer`, `Mocha Mousse`, `Transformative Teal`, `Future Dusk`, `Electric Fuchsia`, `Blue Aura`, `Universal Khaki`, `Silhouette`, `Hidden Gem` und `Warm Eucalyptus`. Helle Neutralfarben bleiben Referenzanker; sie werden nicht als schwacher Tabellenkontrast erzwungen, wenn Abstands- oder Kontrastkriterien dagegen sprechen.

### 4.3 Datenmodell und Namenslogik

Jeder Anker speichert:

- englischen Originalnamen;
- sRGB-Referenzwert für die Browserdarstellung;
- Quellengruppe;
- saisonal geeignete Monate;
- abgeleitete OKLCH-Werte.

Der sichtbare Name wird aus dem tatsächlich gerenderten Farbwert bestimmt. Generische Editionszusätze wie `Cloud Veil` werden nicht angehängt. Das Badge zeigt ausschließlich `Monatskontrast · <Originalname>`. Der Tooltip ergänzt Saison, Farbfamilie, Toncharakter, Jahrescharakter und Jahr; Quelle und Referenzwert bleiben im Profil verfügbar.

### 4.4 Auswahlalgorithmus

Für jeden Monat und jedes der 24 Zyklusjahre werden 96 Kandidaten erzeugt. Die Auswahl bewertet gleichzeitig:

- Abstand zum unmittelbar vorherigen Monat;
- Farbton- und Helligkeitsabstand zum Vormonat;
- Abstand desselben Monats zum Vorjahr;
- kleinsten Abstand zu den sechs zuletzt verwendeten Farben;
- Kollision mit den Farbsektoren der letzten drei Monate;
- Helligkeitsrhythmus zwischen hellen und tieferen Monaten;
- noch ungenutzte Farbsektoren im laufenden Jahr;
- eindeutigen sRGB-Zielwert im vollständigen Zyklus.

Sicherheitsgrenzen:

| Kriterium | Mindestwert |
|---|---:|
| OKLab-Abstand zum Vormonat | `0.13` |
| Farbtonabstand zum Vormonat | `42°` |
| Helligkeitsabstand zum Vormonat | `0.038` |
| Abstand zum Vorjahresmonat | `0.07` |
| Abstand zu jedem der letzten sechs Monate | `0.075` |
| Namens-Cooldown | `18 Monate` |

Die kanonische Palette 2026–2049 umfasst **288 unterschiedliche Zielwerte**. Jahre außerhalb dieses Fensters werden deterministisch auf den 24-Jahres-Zyklus abgebildet.

### 4.5 Oberflächen und Kontrast

Aus dem Monatsakzent werden in OKLCH abgeleitet:

- starker Akzent;
- dunkle Schrift-/Linienfarbe;
- transparenter Glow;
- Panel-Tint;
- Werktags-, Samstags-, Sonntags- und Feiertagsflächen.

Alle Kombinationen werden gegen WCAG AA geprüft. Die Gamut-Anpassung reduziert Chroma schrittweise, bis ein gültiger sRGB-Wert vorliegt. Eine helligkeitsabhängige Chromaobergrenze verhindert fluoreszierende Flächen.

### 4.6 Modulaufteilung

| Modul | Aufgabe |
|---|---|
| `js/color-atlas-data.js` | Trendquellen, Anker, Jahrescharaktere und Grenzwerte |
| `js/color-atlas-engine.js` | OKLab/OKLCH, Kandidaten, Farbgedächtnis und kanonische Palette |
| `js/color-director.js` | öffentliche Fassade, Badge, CSS-Variablen und Animation |

Die bisherige Importoberfläche von `color-director.js` bleibt kompatibel; Daten- und Engine-Exporte werden über die Fassade weitergereicht.

---

## 5. Dienstarten und Personalpools

### Bereitschaftsdienst

- maximal zwei BD-Einträge pro Kalendertag;
- Richtwert grundsätzlich vier BD pro Monat;
- abweichende Sollwerte für definierte Personen;
- Monatsausgleich erst, sobald mindestens eine Person ihr Soll erreicht hat;
- Jahresverlauf als transparenter Hinweis ohne verdeckte Gewichtung.

### Hintergrunddienst

HG kann zusätzlich zum BD vergeben werden. Die Bewertung berücksichtigt Dienstfolgen, rollierende Zeitfenster, BD am Folgetag, FZA und personenspezifische Ausschlüsse.

### Rufbereitschaft Neuroradiologie

Erste und zweite RBN werden getrennt geführt. Die zweite RBN erscheint nur bei einer ersten RBN, für die eine zusätzliche fachärztliche Rückfallebene vorgesehen ist. RBN fließt nicht in die BD/HG-Belastungsstatistik ein.

---

## 6. Bewertungs- und Konfliktmodell

Die Anwendung liefert zu jeder Bewertung eine Klartextbegründung. Positive Hinweise heben Konflikte nicht auf.

Beispiele:

- Urlaub oder „Kein Dienst“ sperrt BD;
- HG am definierten FZA-Tag ausgeschlossen;
- BD–FZA–BD unter der Woche als Hinweis;
- drei aufeinanderfolgende HG nachrangig;
- erneuter HG innerhalb von drei Kalendertagen mit Hinweis;
- HG am Tag vor eigenem BD nachrangig, definierte Freitags-/Samstagsausnahme;
- Rollen- und Aktivitätszeiträume;
- individuelle Sollwerte und maximale Dienstzahlen;
- rote Konflikte nur nach ausdrücklicher Bestätigung.

Rote Ausnahmen werden mit Datum, Dienstart, Person und Begründung protokolliert.

---

## 7. Abwesenheiten, Wünsche und RBN

Unterstützt werden Urlaub, FZA, „Kein Dienst“, Dienstwünsche und weitere tagesbezogene Optionen. Urlaubstage sperren BD. Bei der Sammeleingabe ist die Auswahl die vollständige Aussage für den gewählten Typ: markiert bedeutet gesetzt, nicht markiert bedeutet entfernt; andere Typen desselben Tages bleiben unberührt.

RBN-Pools, Sichtbarkeit der zweiten RBN und historische Namen werden defensiv behandelt. Entfällt die Voraussetzung für eine zweite RBN, wird ein bestehender Eintrag entfernt.

---

## 8. Speicherung, Import und Export

### Speicherung

- sofortige lokale Sicherung;
- Dirty-Schutz gegen später eintreffende ältere Serverstände;
- zentrale Monatsdaten über Cloudflare Pages Functions und KV;
- GET bleibt read-only, Datensätze entstehen erst durch PUT;
- ganzzahlige Revisionen und defensive Normalisierung.

### Excel

Jahresplaner und Einzelpläne werden unterstützt. Monatsname, Blattstruktur und Kopfzeile werden unabhängig geprüft. Fehlende Jahres- oder Monatsangaben müssen bestätigt werden. Excel-Datumswerte werden als lokale Kalendertage verarbeitet.

### JSON und PDF

Der vollständige Zustand kann als JSON exportiert und validiert importiert werden. Dateinamen verwenden den lokalen Kalendertag. Die Druckansicht ist für eine kompakte A4-Ausgabe optimiert; laufende Animationen werden vor dem Druck auf den Zielzustand abgeschlossen.

---

## 9. Technische Architektur

- semantisches HTML und modulare ES-Module;
- CSS-Custom-Properties als visuelles System;
- keine Framework-Laufzeit;
- native Browser-APIs mit progressiven Fallbacks;
- SheetJS für Excel-Ein-/Ausgabe;
- Cloudflare Pages Functions und KV;
- Node-Test-Runner und Playwright.

Zentrale Module: `app.js` koordiniert Render- und Interaktionsfluss, `state.js` Zustand und Persistenz, `rules*.js` Bewertung und Berichterstattung, `picker-view.js` den Dienst-Picker, `rbn.js` RBN-Abhängigkeiten, `month-transition-stability.js` Farbsignale und `month-view-transition.js` die Monatskartenanimation.

---

## 10. Tests und Qualitätssicherung

```bash
npm run check
npm test
npm run test:e2e
npm run verify
```

Die bestehende Suite umfasst **216 Unit-/Regressionstests** und **22 Playwright-End-to-End-Tests**. Für Trend Atlas werden insbesondere geprüft:

- 288 deterministische und eindeutige Zielwerte;
- mindestens neun 30°-Farbsektoren je Jahr;
- Mindestabstände in OKLab, Farbton und Helligkeit;
- sechsmonatiges visuelles Gedächtnis;
- 18-monatiger Namens-Cooldown über Jahresgrenzen;
- englische Originalnamen und Quellenzuordnung;
- Gamut Mapping, Neonschranke und Helligkeitsrhythmus;
- WCAG-AA-Kontrast aller abgeleiteten Tabellenflächen;
- Monats- und Jahresvariation im Browser;
- konstante finale Monatsfarbe ohne nachgelagertes Blinken.

`npm run check` erfasst die beiden neuen Module `color-atlas-data.js` und `color-atlas-engine.js` ausdrücklich.

---

## 11. Lokale Entwicklung und Deployment

```bash
npm ci
npm run verify
```

Für die reine Oberfläche genügt ein statischer lokaler Webserver. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung mit den vorgesehenen KV-Bindings.

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Der Release-Token `20260801.11` bleibt unverändert; die neuen Atlasmodule besitzen zuvor nicht ausgelieferte Pfade und werden über die bestehende `color-director.js`-Fassade geladen.

---

## 12. Projektstruktur

```text
.
├── index.html
├── styles.css
├── controls.css
├── transitions.css
├── manifest.webmanifest
├── Eignungsregeln.txt
├── icons/
│   ├── icon.svg
│   └── icon-animated.svg
├── js/
│   ├── app.js
│   ├── theme.js
│   ├── color-atlas-data.js
│   ├── color-atlas-engine.js
│   ├── color-director.js
│   ├── month-transition-stability.js
│   ├── month-view-transition.js
│   ├── ui-controls.js
│   ├── state.js
│   ├── defaults.js
│   ├── rules.js
│   ├── rules-core.js
│   ├── rules-evaluation.js
│   ├── rules-reporting.js
│   ├── picker-view.js
│   ├── rbn.js
│   ├── holidays.js
│   └── excel-import.js
├── functions/api/
├── tests/
├── docs/
├── package.json
└── playwright.config.js
```

---

## 13. Unveränderliche Grundsätze

- Der Mensch plant; die Anwendung unterstützt und prüft.
- Keine verdeckte automatische Gesamtoptimierung.
- Konflikte werden erklärt, nicht nur eingefärbt.
- Positive Hinweise heben Konflikte nicht auf.
- Rote Ausnahmen bleiben möglich, aber protokollpflichtig.
- Historische Daten werden defensiv behandelt.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben sind deterministisch, saisonal, kontrastgeprüft und wahrnehmungsbasiert verschieden.
- Ähnliche Farben dürfen sich weder unmittelbar noch innerhalb des rollierenden Farbgedächtnisses unbemerkt wiederholen.
- Sichtbare Farbnamen bleiben belegte englische Originalnamen und beschreiben den tatsächlich gerenderten Ton.
- Ein Monatswechsel darf keinen bereits sichtbaren Plan erneut ausblenden oder nachträglich umfärben.
- Überholte Navigationen dürfen keinen späteren Zustand festlegen.
- Regelwerk, Tests und Dokumentation werden gemeinsam geändert.
