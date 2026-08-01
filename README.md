# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – abstrakte gläserne Dienstplantabelle" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Release-Token:** `20260801.11`  
> **Aktueller UI-Stand:** kompakte, semantisch gruppierte Icon-Werkzeugleiste  
> **Monatsdesign:** saisonales Langzeit-Farbsystem mit **288 deterministischen Monatspaletten**  
> **Paketversion:** `0.2.0` · **Datenregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die **bewusste manuelle Planung** von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Es existiert keine automatische Gesamtplanung: Jede Einteilung entsteht durch eine ausdrückliche Benutzereingabe und wird gegen das fachliche Regelwerk geprüft.

Die ausführliche historische Referenz bleibt unter [`docs/README-20260801.11.md`](docs/README-20260801.11.md) erhalten. Diese Haupt-README beschreibt den aktuellen produktiven Stand.

---

## 1. Planungsprinzip

- keine automatische Monatsbelegung;
- keine selbstständige Umbesetzung oder Tauschlogik;
- keine verdeckte Gesamtoptimierung;
- keine automatisch erzeugten Gegenposten bei Kopplungsregeln;
- vollständige Klartextbegründung ausgelöster Regeln;
- ausdrückliche Bestätigung und Protokollierung roter Ausnahmen;
- lokale Sofortsicherung und zentrale Cloudflare-KV-Synchronisierung.

Der Monatsplan verwendet eine chronologische Zeile je Kalendertag. Datum, Wochentag, BD, HG, RBN, zweite RBN, Abwesenheiten sowie Wünsche und Optionen liegen damit in einer gemeinsamen Leserichtung.

---

## 2. Benutzeroberfläche

### Monatsnavigation

- Vormonat und Folgemonat;
- direkte Monats- und Jahresauswahl;
- Sprung zum aktuellen Monat;
- dynamische historische und zukünftige Jahresoptionen;
- richtungsabhängige Monatswechselanimation;
- Vorladen benachbarter Monate für monatsübergreifende Regeln.

### Planbearbeitung

- direkte Auswahl für BD und HG;
- native Auswahlfelder für erste und zweite RBN;
- Einzelerfassung und Sammelerfassung tagesbezogener Markierungen;
- vollständiges Leeren des sichtbaren Monats nach Bestätigung;
- Excel-, PDF- und JSON-Ausgabe;
- Excel- und JSON-Import;
- automatisches Speichern.

### Gestaltung

Die Oberfläche verbindet eine Excel-nahe Tabelle mit kontrollierter Glasoptik, monatlich getönten Kanten, deckend weißen Eingabefeldern, tabellarischen Ziffern und klarer Fokusdarstellung. `prefers-reduced-motion` und `prefers-reduced-transparency` werden berücksichtigt.

---

## 3. Kompakte Icon-Werkzeugleiste

Die frühere Leiste aus zwei unbenannten Reihen gleichartiger Textschaltflächen wurde vollständig neu organisiert. `js/ui-controls.js` verschiebt die bestehenden Bedienelemente in drei semantische Gruppen; `controls.css` übernimmt die kompakte Darstellung. Die vorhandenen IDs und Ereignisbehandlungen bleiben unverändert.

| Gruppe | Aktionen |
|---|---|
| **Planung** | Aktueller Monat, Abwesenheiten, Wünsche / Optionen, Monat leeren |
| **Daten** | Serverstand neu laden, Excel importieren, JSON laden |
| **Ausgabe** | Excel exportieren, PDF-Ausgabe, JSON sichern |

### Icon-System

Jede Aktion besitzt ein eigenes Inline-SVG-Icon ohne externe Bibliothek:

- Kalender mit Bestätigung: **Aktueller Monat**;
- Kalender mit Sperrmarkierung: **Abwesenheiten**;
- Regler: **Wünsche / Optionen**;
- Papierkorb: **Monat leeren**;
- Kreispfeile: **Serverstand neu laden**;
- Datei mit Einwärtspfeil: **Excel importieren**;
- Datenbank mit Aufwärtspfeil: **JSON laden**;
- Tabellenblatt: **Excel exportieren**;
- Drucker: **PDF**;
- Datenbank mit Sicherungspfeil: **JSON sichern**.

Alle Icons verwenden `currentColor`, identische Strichstärken und ein gemeinsames 24-Pixel-Raster.

### Responsive Verhalten

- große Desktopbreite: Icon und kurze Textbeschriftung;
- mittlere Breite: Gruppenüberschriften entfallen zuerst;
- kompakte Breite: echte Icon-only-Schaltflächen;
- Mobilansicht: Gruppen untereinander mit gleichmäßig verteilten Aktionen;
- Druck: Werkzeugleiste vollständig ausgeblendet.

### Zugänglichkeit

- vollständige Aktionsnamen über `aria-label`;
- native Tooltips über `title`;
- sichtbare Fokusrahmen;
- Dateiaktionen per Maus, Touch, Enter und Leertaste;
- dekorative SVGs mit `aria-hidden="true"`;
- keine Hover-Translation bei reduzierter Bewegung.

### Visuelle Priorisierung

- **Aktueller Monat:** dezenter Monatsakzent;
- **Monat leeren:** zurückhaltender Gefahrenton;
- **Serverstand neu laden:** ruhiger Sekundärton;
- übrige Aktionen: neutrale weiße Werkzeugschaltflächen mit monatlich getöntem Rand.

Die Erweiterung ist progressiv: Fällt das Zusatzmodul aus, bleiben die ursprünglichen Textschaltflächen vollständig funktionsfähig.

---

## 4. Bewertungs- und Konfliktmodell

| Stufe | Bedeutung |
|---|---|
| **Grün** | geeignet oder positiv empfohlen |
| **Gelb** | Hinweis oder nachrangige Konstellation |
| **Orange** | relevanter Konflikt |
| **Rot** | schwerer Konflikt, Bestätigung erforderlich |
| **Grau** | am konkreten Tag nicht auswählbar |

Geprüft werden unter anderem Aktivität, Qualifikation, Urlaub, FZA, Sperrwünsche, Doppelbesetzungen, BD-Sollwerte, harte Maxima, Dienstabstände, Wochenendnachbarschaften, HG-Häufungen, Kopplungsregeln und personenspezifische Sonderregeln.

---

## 5. Saisonales Langzeit-Farbsystem

Die Monatsidentität wird deterministisch aus **Jahr und Monat** abgeleitet:

- 12 saisonale Monatsfamilien;
- vier handkuratierte Grundvarianten je Monat;
- 24 kontrollierte Trend-Editionen;
- 288 eindeutige Monatspaletten;
- 24-jähriger Zyklus ab Referenzjahr 2026;
- keine Laufzeit-Zufallszahlen.

### Sichtbares Monatsbadge

Das Badge zeigt ausschließlich die kuratierte Grundvariante:

```text
Monatskontrast · Eisnebel
```

Technische Editionsnamen wie `Cloud Veil`, `Quiet Luxury` oder `Organic Modern` erscheinen **nicht mehr im Badge** und **nicht mehr im Tooltip**. Sie bleiben intern Bestandteil der deterministischen Palettenberechnung und über `data-palette-edition` technisch nachvollziehbar.

Der reduzierte Tooltip enthält nur Saison, Farbfamilie und Jahr, beispielsweise:

```text
Winter · Frost · 2026
```

### Tabellenflächen und Kontrast

| Fläche | Anteil Monatsfarbe |
|---|---:|
| Wochentagsspalte | 46 % |
| Samstag | 14 % |
| Sonntag | 22 % |
| Feiertag | 30 % |

Alle 288 Paletten werden gegen sämtliche relevanten Flächen auf mindestens **WCAG AA mit 4,5:1** geprüft. Monatswechsel werden zeitbasiert in OKLCH interpoliert; bei reduzierter Bewegung wird die Zielpalette unmittelbar gesetzt.

---

## 6. Abwesenheiten, Wünsche und Optionen

Unterstützt werden Urlaub, FZA, Sperrwünsche sowie positive oder negative Dienstoptionen. Markierungen können einzeln oder gesammelt gesetzt werden. Wirksame Abwesenheiten entfernen eine Person aus tagesbezogenen Vergleichsgruppen. Automatisch abgeleitetes FZA wird ausschließlich für ausdrücklich definierte Sonderregeln erzeugt.

---

## 7. RBN

- getrennte Felder für erste und zweite RBN;
- zweite RBN nur bei definierten Erstbesetzungen sichtbar;
- datumsabhängige Pools;
- defensive Behandlung importierter Altwerte;
- keine Einbeziehung der RBN in die BD-/HG-Statistik.

---

## 8. Persistenz, Import und Export

- lokale Sofortsicherung jeder Änderung;
- debouncte Cloudflare-KV-Synchronisierung;
- getrennte Dirty-Zustände je Monat;
- defensive Daten- und Importnormalisierung;
- Excel-Import und Excel-Export;
- A4-optimierte PDF-/Druckausgabe;
- vollständige JSON-Sicherung und Wiederherstellung.

---

## 9. Technische Architektur

| Datei/Modul | Aufgabe |
|---|---|
| `index.html` | App-Shell, Dialoge und versionierte Asset-Einbindung |
| `styles.css` | Grundlayout, Tabelle, Glasoptik, Dialoge und Druck |
| `controls.css` | kompakte Icon-Werkzeugleiste und responsive Zustände |
| `js/app.js` | Navigation, Rendering, Dialoge sowie Import-/Exportsteuerung |
| `js/ui-controls.js` | Werkzeugleistengruppen, Icons, Badge-Bereinigung und Tastaturzugang |
| `js/theme.js` | Langzeit-Paletten, Farbräume, Kontrastflächen und Animation |
| `js/state.js` | Laden, Speichern, Dirty-Zustände und Monatscache |
| `js/rules*.js` | Regelengine, Statistik und offene Punkte |
| `js/rbn.js` | RBN-Pools und zweite RBN |
| `js/holidays.js` | sächsische Feiertage und Werktage |
| `functions/api/*` | Cloudflare-API und KV-Zugriff |

Die Anwendung verwendet native Webtechnologien ohne Frontend-Framework: semantisches HTML, CSS Custom Properties, ES-Module, Pages Functions, Cloudflare KV, SheetJS, Node-Test-Runner und Playwright.

---

## 10. Tests

```bash
npm run check
npm test
npm run test:e2e
npm run verify
```

Zusätzlich zur vollständigen Regelengine und dem Farbsystem werden geprüft:

- Palettenname ohne Editionszusatz;
- Tooltip ohne Editionsbezeichnung;
- drei Werkzeugleistengruppen;
- zehn eindeutige Aktionen;
- vollständige Icon- und Beschriftungsmetadaten;
- reale Browserdarstellung der Gruppen und Icons;
- Gefahrenton von „Monat leeren“;
- Dateiaktion mit zugänglicher Beschriftung;
- Badge `Monatskontrast · Eisnebel` ohne `Cloud Veil`;
- 288 eindeutige Langzeit-Paletten und WCAG-AA-Kontrast.

---

## 11. Deployment

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Der bestehende Release-Token `20260801.11` wird im gesamten Modulgraphen konsistent verwendet; die neuen Dateien `controls.css` und `js/ui-controls.js` besitzen eigene, zuvor nicht vorhandene Asset-Pfade und werden damit trotz unverändertem Modulgraph-Token eindeutig ausgeliefert.

Ein eigener Service Worker wird nicht verwendet. Historisch vorhandene Registrierungen und Caches werden defensiv entfernt.

---

## 12. Projektstruktur

```text
.
├── index.html
├── styles.css
├── controls.css
├── manifest.webmanifest
├── Eignungsregeln.txt
├── icons/
├── js/
│   ├── app.js
│   ├── ui-controls.js
│   ├── theme.js
│   ├── state.js
│   ├── rules*.js
│   ├── rbn.js
│   ├── holidays.js
│   └── excel-import.js
├── functions/api/
├── tests/
│   ├── e2e/app.spec.js
│   ├── theme.test.js
│   └── ui-controls.test.js
├── docs/README-20260801.11.md
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
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben bleiben deterministisch, saisonal und kontrastgeprüft.
- Sichtbare UI-Texte bleiben knapp; technische Metadaten belasten die Oberfläche nicht unnötig.
- Änderungen an Funktion, Tests und Dokumentation gehören in denselben Änderungsvorgang.
