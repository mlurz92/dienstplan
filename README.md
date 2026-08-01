# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – abstrakte gläserne Dienstplantabelle" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Referenzstand:** Build `20260801.14`  
> **Aktueller UI-Stand:** kompakte, semantisch gruppierte Icon-Werkzeugleiste  
> **Monatsdesign:** saisonales Langzeit-Farbsystem mit **288 deterministischen Monatspaletten**  
> **Paketversion:** `0.2.0` · **Datenregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die **bewusste manuelle Planung** von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung nimmt keine automatische Gesamtplanung vor. Sie bewertet konkrete Einteilungen nachvollziehbar, erklärt Konflikte und Empfehlungen, speichert Monatsstände und hält Importe, Exporte sowie bestätigte Ausnahmen revisionsfähig.

Die ausführliche Referenz vor Einführung des Langzeit-Farbsystems bleibt als historischer Snapshot erhalten: [`docs/README-20260801.11.md`](docs/README-20260801.11.md). Die vorliegende Haupt-README beschreibt den aktuellen produktiven Stand.

---

## Inhaltsverzeichnis

1. [Planungsprinzip](#1-planungsprinzip)
2. [Benutzeroberfläche](#2-benutzeroberfläche)
3. [Kompakte Icon-Werkzeugleiste](#3-kompakte-icon-werkzeugleiste)
4. [Dienstarten und Personalpools](#4-dienstarten-und-personalpools)
5. [Bewertungs- und Konfliktmodell](#5-bewertungs--und-konfliktmodell)
6. [Saisonales Langzeit-Farbsystem](#6-saisonales-langzeit-farbsystem)
7. [Abwesenheiten, Wünsche und Optionen](#7-abwesenheiten-wünsche-und-optionen)
8. [RBN-Logik](#8-rbn-logik)
9. [Statistik und offene Punkte](#9-statistik-und-offene-punkte)
10. [Persistenz und Datensicherheit](#10-persistenz-und-datensicherheit)
11. [Import und Export](#11-import-und-export)
12. [Technische Architektur](#12-technische-architektur)
13. [Tests und Qualitätssicherung](#13-tests-und-qualitätssicherung)
14. [Lokale Entwicklung](#14-lokale-entwicklung)
15. [Deployment](#15-deployment)
16. [Projektstruktur](#16-projektstruktur)
17. [Unveränderliche Grundsätze](#17-unveränderliche-grundsätze)

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

# 3. Kompakte Icon-Werkzeugleiste

## 3.1 Zielsetzung

Die frühere Aktionsleiste bestand aus zwei unbenannten Reihen gleichartiger Textschaltflächen. Der aktuelle Stand ordnet sämtliche Aktionen nach ihrer Funktion, reduziert visuelles Gewicht und erhält dennoch die unmittelbare Erreichbarkeit aller Funktionen.

Die Leiste wird durch `js/ui-controls.js` semantisch organisiert und durch `controls.css` gestaltet. Die bestehenden IDs und Ereignisbehandlungen bleiben unverändert; die UI-Schicht verschiebt die bereits vorhandenen Elemente lediglich in klar definierte Gruppen.

## 3.2 Gruppen

| Gruppe | Aktionen |
|---|---|
| **Planung** | Aktueller Monat, Abwesenheiten, Wünsche / Optionen, Monat leeren |
| **Daten** | Serverstand neu laden, Excel importieren, JSON laden |
| **Ausgabe** | Excel exportieren, PDF-Ausgabe, JSON sichern |

Die Trennung folgt dem Arbeitsablauf: zuerst planen, anschließend Daten laden oder synchronisieren, zuletzt Ergebnisse ausgeben beziehungsweise sichern.

## 3.3 Icon-System

Jede Aktion besitzt ein eigenes, funktional zugeordnetes Inline-SVG-Icon:

- Kalender mit Bestätigung für **Aktueller Monat**;
- Kalender mit Sperrmarkierung für **Abwesenheiten**;
- Regler für **Wünsche / Optionen**;
- Papierkorb für **Monat leeren**;
- Kreispfeile für **Serverstand neu laden**;
- Dateisymbol mit Einwärtspfeil für **Excel importieren**;
- Datenbanksymbol mit Aufwärtspfeil für **JSON laden**;
- Tabellenblatt für **Excel exportieren**;
- Druckersymbol für **PDF**;
- Datenbanksymbol mit Sicherungspfeil für **JSON sichern**.

Die Icons verwenden ein einheitliches Linienraster, `currentColor`, identische Strichstärken und keine externe Icon-Bibliothek.

## 3.4 Platzbedarf und Responsive Verhalten

- große Desktopbreite: Icon und kurze Textbeschriftung;
- mittlere Desktopbreite: Gruppenüberschriften entfallen zuerst;
- kompakte Breite: echte Icon-only-Schaltflächen;
- schmale Mobilansicht: Gruppen untereinander mit gleichmäßig verteilten Aktionen;
- Druck: Werkzeugleiste vollständig ausgeblendet.

Der Wechsel erfolgt ausschließlich über CSS-Media-Queries. Funktion und DOM-IDs ändern sich dabei nicht.

## 3.5 Zugänglichkeit

- vollständige Aktionsbezeichnungen über `aria-label`;
- native Tooltips über `title`;
- sichtbare Fokusrahmen;
- Dateiaktionen per Maus, Touch sowie Enter- und Leertaste erreichbar;
- dekorative SVGs mit `aria-hidden="true"`;
- reduzierte Bewegung ohne Hover-Translation bei `prefers-reduced-motion`.

## 3.6 Visuelle Priorisierung

- **Aktueller Monat:** dezenter Monatsakzent;
- **Monat leeren:** zurückhaltender Gefahrenton;
- **Serverstand neu laden:** sekundärer, ruhiger Ton;
- übrige Aktionen: neutrale weiße Werkzeugschaltflächen mit monatlich getöntem Rand.

---

# 4. Dienstarten und Personalpools

## 4.1 Bereitschaftsdienst

BD wird monatlich gegen individuelle Sollwerte und gegebenenfalls harte Maxima bewertet. Die Kandidatenliste berücksichtigt die am konkreten Datum aktive Rolle, Abwesenheiten, Wünsche, Qualifikation, bestehende Einteilungen und relevante Dienstfolgen.

## 4.2 Hintergrunddienst

HG steht nur tagesgültig HG-berechtigten Personen zur Verfügung. Die Bewertung berücksichtigt unter anderem bestehende BD-Einteilungen, Diensthäufungen, Kopplungsregeln, Abwesenheiten und kombinierte Monatslast.

## 4.3 Rufbereitschaft Neuroradiologie

Die erste RBN besitzt einen datumsabhängigen festen Pool. Die zweite RBN wird ausschließlich eingeblendet, wenn die Erstbesetzung fachlich eine zusätzliche Absicherung erfordert. Historische oder importierte Altwerte bleiben lesbar, werden aber nicht automatisch als erneut wählbar behandelt.

## 4.4 Tagesgültige Personalrollen

Personaldefinitionen können Aktivierungsdaten, Deaktivierungsdaten, Beförderungsdaten, Grundrollen, BD-Sollwerte, Maxima und Planungsberechtigungen enthalten. Qualifikationen werden für den konkreten Kalendertag aufgelöst, nicht pauschal aus dem aktuellen Status abgeleitet.

---

# 5. Bewertungs- und Konfliktmodell

## 5.1 Stufen

| Stufe | Bedeutung |
|---|---|
| **Grün** | fachlich geeignet oder positiv empfohlen |
| **Gelb** | Hinweis, Belastung oder nachrangige Konstellation |
| **Orange** | relevanter Konflikt, der besonders geprüft werden soll |
| **Rot** | schwerer Konflikt; Eintragung nur nach ausdrücklicher Bestätigung |
| **Grau** | am konkreten Tag nicht auswählbar |

## 5.2 Rote Ausnahmen

Rote Einteilungen bleiben bewusst möglich, erfordern jedoch eine explizite Bestätigung. Protokolliert werden Datum, Rolle, Person, Gründe, Zeitpunkt und optionaler Kommentar.

## 5.3 Regelgruppen

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

---

# 6. Saisonales Langzeit-Farbsystem

## 6.1 Grundlagen

Die frühere Zuordnung von zwölf Farben ausschließlich nach Monatsnummer wurde durch eine deterministische Ableitung aus **Jahr und Monat** ersetzt.

Das System kombiniert:

- **12 saisonale Monatsfamilien**;
- **vier handkuratierte Grundvarianten je Monat**;
- **24 kontrollierte Trend-Editionen**;
- insgesamt **288 eindeutige Monatspaletten**;
- einen definierten **24-Jahres-Zyklus** ab Referenzjahr **2026**.

Derselbe Monat desselben Jahres erhält auf jedem Gerät und bei jedem Neuladen exakt dieselbe Palette. Laufzeit-Zufall wird nicht verwendet.

## 6.2 Saisonale Familien

| Monat | Farbfamilie | Grundvarianten |
|---|---|---|
| Januar | Frost | Eisnebel, Polarlicht, Winterflieder, Arktischer Stahl |
| Februar | Beere | Rubinrose, Winterbeere, Orchideenrauch, Granatapfel |
| März | Botanik | Salbeigrün, Eukalyptus, Junge Olive, Celadon |
| April | Blüte | Lavendel, Wisteria, Irisblau, Fliederregen |
| Mai | Grün | Frühlingsgrün, Minzblatt, Chartreuse-Salbei, Maigrün |
| Juni | Wasser | Türkis, Lagune, Aqua Mineral, Meeresglas |
| Juli | Sonnenfrucht | Koralle, Persimone, Wassermelone, Sonnenuntergang |
| August | Gold | Bernstein, Safran, Aprikosengold, Ringelblume |
| September | Pflaume | Pflaume, Feige, Aubergine, Weinlese |
| Oktober | Erde | Kupfer, Terrakotta, Zimt, Bronze |
| November | Mineral | Schieferblau, Sturmblau, Petrolgrau, Indigonebel |
| Dezember | Immergrün | Tannengrün, Wacholder, Smaragdnacht, Winterwald |

## 6.3 Sichtbares Monatsbadge

Das Badge zeigt bewusst nur die **kuratierte Grundvariante**, beispielsweise:

```text
Monatskontrast · Eisnebel
```

Der technische Editionszusatz wie `Cloud Veil`, `Quiet Luxury` oder `Organic Modern` wird **nicht mehr im Badge angezeigt**. Er bleibt intern Bestandteil der deterministischen Palettenberechnung und der Metadaten, belastet aber die sichtbare Oberfläche nicht.

Auch der Tooltip wird reduziert und enthält nur noch Saison, Farbfamilie und Jahr. Die Edition bleibt weiterhin über `data-palette-edition` auf dem Wurzelelement technisch nachvollziehbar.

## 6.4 Farbwerte und Kontrast

Jede Palette enthält Grundakzent, starken Akzent, Glow, Paneltönung, Saison, Familie, Edition und eindeutigen Kalenderschlüssel. Aus dem Akzent werden Schriftton sowie sämtliche Tabellenflächen berechnet.

| Fläche | Anteil Monatsfarbe |
|---|---:|
| Wochentagsspalte | 46 % |
| Samstag | 14 % |
| Sonntag | 22 % |
| Feiertag | 30 % |

Die Tests prüfen alle 288 Paletten gegen sämtliche relevanten Flächen auf mindestens **WCAG AA mit 4,5:1**.

## 6.5 Übergänge

Monatswechsel werden zeitbasiert über `requestAnimationFrame` und `performance.now()` animiert. Die Interpolation erfolgt in OKLCH über den kürzeren Farbtonbogen. Bei reduzierter Bewegung wird die Zielpalette ohne Übergang gesetzt.

---

# 7. Abwesenheiten, Wünsche und Optionen

Unterstützt werden tagesbezogene Abwesenheiten, FZA, Sperrwünsche sowie positive oder negative Dienstoptionen. Markierungen können einzeln oder gesammelt gesetzt werden. Wirksame Abwesenheiten entfernen eine Person aus der tagesbezogenen Vergleichsgruppe.

Automatisch abgeleitete Freizeitausgleichsregeln werden ausschließlich dort erzeugt, wo sie fachlich ausdrücklich definiert sind. Manuelle und abgeleitete Quellen bleiben unterscheidbar; doppelte sichtbare Einträge werden vermieden.

---

# 8. RBN-Logik

- getrennte Felder für erste und zweite RBN;
- zweite RBN nur bei definierten Erstbesetzungen sichtbar;
- datumsabhängige Pools;
- defensive Behandlung importierter Altwerte;
- keine Einbeziehung der RBN in die BD-/HG-Statistik;
- vollständige Speicherung im Monatsdatensatz.

---

# 9. Statistik und offene Punkte

Die Statistik wird unmittelbar aus dem sichtbaren Monatsplan berechnet. Sie zeigt insbesondere BD, HG, Sollwerte, Restwerte und Wochenendlast. Die Liste „Offene Punkte“ priorisiert unbesetzte Rollen und erkannte Inkonsistenzen, ohne selbst Einteilungen zu verändern.

---

# 10. Persistenz und Datensicherheit

## 10.1 Lokaler Zustand

Jede Änderung wird unmittelbar lokal gesichert. Ein Debounce bündelt Serverspeicherungen, ohne die lokale Rückfallebene zu verzögern.

## 10.2 Cloudflare KV

Monatsdaten und Einstellungen werden über Pages Functions in Cloudflare KV gespeichert. Beim Öffnen eines Monats wird der aktuelle Serverstand geladen, sofern keine schützenswerten lokalen Änderungen entgegenstehen.

## 10.3 Konfliktvermeidung

- getrennte Dirty-Zustände je Monat;
- kein stilles Überschreiben lokaler Änderungen;
- defensive Normalisierung importierter Daten;
- Revision und Zeitstempel im Monatsobjekt;
- JSON-Sicherung als manuell transportierbares Rückfallformat.

---

# 11. Import und Export

## 11.1 Excel-Import

Der Import analysiert den Jahresplaner, ordnet Personalnamen defensiv zu und übernimmt unterstützte Monatsinformationen. Abweichende vorhandene Werte werden nur im vorgesehenen Importmodus ersetzt.

## 11.2 Excel-Export

Der sichtbare Monatsplan wird in ein Excel-kompatibles Arbeitsblatt mit Tageszeilen, Diensten, RBN und Markierungen übertragen.

## 11.3 PDF-/Druckausgabe

Die Druckansicht ist auf eine kompakte A4-Ausgabe ausgelegt. Vor dem Druck wird eine laufende Farbanimation beendet, damit keine Zwischenfarbe eingefroren wird.

## 11.4 JSON

Vollständige Sicherung und Wiederherstellung von Stammdaten, Einstellungen und Monatsständen.

---

# 12. Technische Architektur

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
| `js/ui-controls.js` | Werkzeugleistengruppen, Icon-Dekoration, Badge-Bereinigung, Tastaturzugang |
| `js/theme.js` | Langzeit-Paletten, Farbräume, Kontrastflächen, Animation |
| `js/state.js` | Laden, Speichern, Dirty-Zustände, Monatscache |
| `js/rules*.js` | Regelengine, Auswertung, Statistik, offene Punkte |
| `js/rbn.js` | RBN-Pools und zweite RBN |
| `js/holidays.js` | sächsische Feiertage und Werktage |
| `js/excel-import.js` | Arbeitsmappenanalyse und Zuordnung |
| `controls.css` | kompakte Icon-Werkzeugleiste und responsive Zustände |
| `styles.css` | Grundlayout, Tabelle, Glasoptik, Dialoge und Druck |
| `functions/api/*` | Cloudflare-API und KV-Zugriff |

`ui-controls.js` arbeitet progressiv: Fehlt das Zusatzmodul, bleiben die ursprünglichen Textschaltflächen vollständig funktionsfähig.

---

# 13. Tests und Qualitätssicherung

## 13.1 Syntaxprüfung

```bash
npm run check
```

Prüft sämtliche produktiven JavaScript-Module einschließlich `js/ui-controls.js`, Pages Functions und Testkonfigurationen.

## 13.2 Unit- und Regressionstests

```bash
npm test
```

Zusätzlich zur fachlichen Regelengine und dem Farbsystem werden geprüft:

- sichtbarer Palettenname ohne Editionszusatz;
- Tooltip ohne Editionsbezeichnung;
- exakt drei Werkzeugleistengruppen;
- zehn eindeutige Aktionen;
- vollständige Icon- und Beschriftungsmetadaten;
- exakt 288 Langzeit-Paletten;
- sichere Monatsüberläufe und 24-jähriger Zyklus;
- WCAG-AA-Kontrast sämtlicher Monatsflächen;
- farbtonerhaltende OKLCH-Interpolation.

## 13.3 End-to-End

```bash
npm run test:e2e
```

Prüft die Anwendung im Browser einschließlich Navigation, Interaktion und zentraler Planungsabläufe.

## 13.4 Vollständige Verifikation

```bash
npm run verify
```

Führt Syntaxprüfung, Unit-/Regressionstests und Playwright-End-to-End-Tests aus.

---

# 14. Lokale Entwicklung

```bash
npm ci
npm run check
npm test
npm run test:e2e
```

Für die reine Oberfläche kann ein statischer lokaler Webserver verwendet werden. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung und die vorgesehenen KV-Bindings.

---

# 15. Deployment

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Der Build-Stempel und sämtliche direkt eingebundenen statischen Assets tragen die Version `20260801.14`, damit die neue Werkzeugleiste und Badge-Darstellung nicht aus einem älteren Browsercache geladen werden.

Ein eigener Service Worker wird nicht verwendet; historisch vorhandene Registrierungen werden defensiv entfernt.

---

# 16. Projektstruktur

```text
.
├── index.html
├── styles.css
├── controls.css
├── manifest.webmanifest
├── Eignungsregeln.txt
├── icons/
│   ├── icon.svg
│   └── icon-animated.svg
├── js/
│   ├── app.js
│   ├── ui-controls.js
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
│   ├── theme.test.js
│   └── ui-controls.test.js
├── docs/
│   └── README-20260801.11.md
├── package.json
└── playwright.config.js
```

---

# 17. Unveränderliche Grundsätze

- Der Mensch plant; die Anwendung unterstützt und prüft.
- Keine verdeckte automatische Gesamtoptimierung.
- Konflikte werden erklärt, nicht nur eingefärbt.
- Positive Hinweise heben Konflikte nicht auf.
- Rote Ausnahmen bleiben möglich, aber protokollpflichtig.
- Historische Daten werden defensiv behandelt.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben sind deterministisch, saisonal, kontrastgeprüft und langfristig abwechslungsreich.
- Sichtbare UI-Texte bleiben knapp; technische Metadaten dürfen die Oberfläche nicht unnötig belasten.
- Änderungen an Funktion, Tests und Dokumentation gehören in denselben Änderungsvorgang.
