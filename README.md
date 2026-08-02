# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – abstrakte gläserne Dienstplantabelle" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Release-Token:** `20260801.11`  
> **Farbarchitektur:** Seasonal Spectrum Director mit **288 deterministischen Spektrumprofilen**  
> **Monatswechsel:** atomar, flimmerfrei und ohne erneutes Ausblenden der Tabelle  
> **Bedienung:** kompakte, semantisch gruppierte Icon-Werkzeugleiste  
> **Paketversion:** `0.2.0` · **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die bewusste manuelle Planung von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung erstellt keinen automatischen Gesamtplan. Jede Einteilung wird ausdrücklich durch den Benutzer vorgenommen und gegen ein transparentes fachliches Regelwerk geprüft.

Die frühere ausführliche Referenz bleibt als historischer Snapshot unter [`docs/README-20260801.11.md`](docs/README-20260801.11.md) erhalten. Die vorliegende README beschreibt den aktuellen produktiven Stand.

---

## Inhaltsübersicht

1. [Planungsprinzip](#1-planungsprinzip)
2. [Benutzeroberfläche](#2-benutzeroberfläche)
3. [Seasonal Spectrum Director](#3-seasonal-spectrum-director)
4. [Dienstarten und Personalpools](#4-dienstarten-und-personalpools)
5. [Bewertungs- und Konfliktmodell](#5-bewertungs--und-konfliktmodell)
6. [Abwesenheiten, Wünsche und Optionen](#6-abwesenheiten-wünsche-und-optionen)
7. [RBN-Logik](#7-rbn-logik)
8. [Statistik und offene Punkte](#8-statistik-und-offene-punkte)
9. [Speicherung und Datensicherheit](#9-speicherung-und-datensicherheit)
10. [Import und Export](#10-import-und-export)
11. [Technische Architektur](#11-technische-architektur)
12. [Tests und Qualitätssicherung](#12-tests-und-qualitätssicherung)
13. [Lokale Entwicklung und Deployment](#13-lokale-entwicklung-und-deployment)
14. [Projektstruktur](#14-projektstruktur)
15. [Unveränderliche Grundsätze](#15-unveränderliche-grundsätze)

---

## 1. Planungsprinzip

DienstplanRAD ist ein **assistiertes manuelles Planungssystem**, kein automatischer Optimierer.

- keine automatische Monatsbelegung;
- keine selbstständige Umbesetzung oder Tauschlogik;
- keine verdeckte Gesamtoptimierung;
- keine automatisch erzeugten Gegenposten bei Kopplungsregeln;
- vollständige Klartextbegründung ausgelöster Regeln;
- ausdrückliche Bestätigung und Protokollierung roter Ausnahmen;
- lokale Sofortsicherung und zentrale Cloudflare-KV-Synchronisierung.

Der Monatsplan verwendet eine chronologische Zeile je Kalendertag. Datum, Wochentag, BD, HG, RBN, zweite RBN, Abwesenheiten sowie Wünsche und Optionen liegen in einer gemeinsamen Leserichtung. Dienstfolgen, Feiertage und Wochenendbelastungen bleiben dadurch unmittelbar erkennbar.

---

## 2. Benutzeroberfläche

### 2.1 Monatsnavigation

- Vormonat und Folgemonat über Pfeiltasten;
- direkte Monats- und Jahresauswahl;
- Sprung zum aktuellen Monat;
- dynamische Ergänzung historischer oder zukünftiger Jahre;
- sofortiges Rendern des neuen Kalendergerüsts vor dem Serverabruf;
- atomarer Farbabschluss noch vor dem nächsten Browser-Paint;
- kein erneutes Ausblenden von Tabelle, Überschrift oder Statistik;
- Vorladen benachbarter Monate für monatsübergreifende Regeln.

#### Flimmerfreier Wechsel

Der Monatswechsel besitzt bewusst **nur einen sichtbaren Endzustand**. Zuvor liefen drei Mechanismen zeitlich gegeneinander:

1. `app.js` renderte den neuen Monat sofort;
2. eine historische Richtungsanimation setzte die bereits sichtbare Tabelle anschließend wieder auf `opacity: 0`;
3. Basistheme und Seasonal Spectrum Director aktualisierten die Farbe nacheinander.

Dadurch konnte der neue Plan kurz erscheinen, wieder verschwinden und anschließend mit einer leicht veränderten Farbe zurückkehren.

Die aktuelle Umsetzung verhindert diesen Ablauf auf zwei Ebenen:

- `js/month-transition-stability.js` beendet jede laufende Spektruminterpolation innerhalb desselben Ereigniszyklus und schreibt einmalig das endgültige Profil des ausgewählten Monats;
- `controls.css` erzwingt für die historischen Klassen `.month-enter-next` und `.month-enter-prev` jederzeit `opacity: 1` und deaktiviert deren Ausblendanimation.

Auswahlereignisse und Änderungen von `data-month` beziehungsweise `data-year` werden noch vor dem nächsten Paint synchronisiert. Auch bei verzögerter Serverantwort bleibt die bereits gerenderte Tabelle durchgehend sichtbar und farbstabil.

### 2.2 Kompakte Icon-Werkzeugleiste

Die Aktionsleiste ist in drei klar erkennbare Funktionsgruppen gegliedert:

| Gruppe | Aktionen |
|---|---|
| **Planung** | Aktueller Monat, Abwesenheiten, Wünsche / Optionen, Monat leeren |
| **Daten** | Serverstand neu laden, Excel importieren, JSON laden |
| **Ausgabe** | Excel exportieren, PDF drucken, JSON sichern |

Alle Aktionen besitzen:

- ein eigenständiges Inline-SVG-Icon;
- eine kurze sichtbare Beschriftung;
- einen vollständigen Tooltip;
- ein präzises `aria-label`;
- sichtbare Tastaturfokussierung;
- responsive Icon-only-Darstellung bei geringer Breite.

Dateiaktionen bleiben per Maus, Tastatur, Enter und Leertaste bedienbar. „Aktueller Monat“, „Neu laden“ und „Monat leeren“ werden über zurückhaltende Tonstufen priorisiert, ohne die Leiste visuell zu überladen.

### 2.3 Tabellenbearbeitung

- direkte Auswahl für BD und HG;
- native Auswahlfelder für RBN;
- bedingt eingeblendete zweite RBN;
- Löschen bestehender Einteilungen;
- Einzelerfassung tagesbezogener Markierungen;
- Sammelerfassung mehrerer Tage;
- vollständiges Leeren des sichtbaren Monats nach Bestätigung;
- automatische lokale Sicherung und Server-Synchronisierung.

### 2.4 Gestaltungsprinzip

Die Oberfläche kombiniert eine Excel-nahe Tabellenlogik mit kontrollierter Glasoptik:

- ruhige, klar gefasste Panels;
- monatlich gefärbte Kanten und Tabellenflächen;
- deckend weiße Eingabefelder für maximale Lesbarkeit;
- tabellarische Ziffern;
- reduzierte Bewegung über `prefers-reduced-motion`;
- deckende Ersatzflächen über `prefers-reduced-transparency`;
- keine externe Icon- oder UI-Bibliothek.

---

## 3. Seasonal Spectrum Director

### 3.1 Zielsetzung

Das frühere Langzeit-Farbsystem erzeugte zwar 288 eindeutige Farben, bewegte sich aber überwiegend in ähnlich hellen und ähnlich gedämpften Mitteltönen. Die Unterschiede waren technisch vorhanden, visuell jedoch teilweise zu gering.

Der **Seasonal Spectrum Director** erhöht deshalb die wahrnehmbare Vielfalt auf mehreren unabhängigen Achsen:

- Farbton;
- Helligkeit;
- Buntheit beziehungsweise Chroma;
- Wärme- und Kältewirkung;
- helle, mittlere und tiefe Spektralstufen;
- ruhige, mineralische, botanische, juwelenartige und expressive Jahrescharaktere.

Die saisonale Identität bleibt erhalten. Januar wirkt weiterhin winterlich, Mai botanisch, Juli sommerlich, Oktober erdig und Dezember immergrün. Innerhalb dieser Identität ist der zulässige Farbkorridor jedoch deutlich breiter.

### 3.2 12 saisonale Farbkorridore

Jeder Kalendermonat besitzt ein eigenes Spektrum mit acht kuratierten sichtbaren Farbnamen:

| Monat | Spektralfamilie | Beispiele |
|---|---|---|
| Januar | Eis · Polarlicht | Gletscherblau, Polarviolett, Fjordtürkis, Frostindigo |
| Februar | Beere · Lack | Himbeerlack, Cassis, Rubin, Magentawein |
| März | Keimgrün · Botanik | Keimgrün, Jade, Junge Olive, Frühlingspetrol |
| April | Blüte · Himmel | Iris, Wisteria, Krokus, Frühlingshimmel |
| Mai | Blattgrün · Zitrus | Maigrün, Chartreuse, Lindenblatt, Zitrusblatt |
| Juni | Wasser · Küste | Lagune, Aqua, Küstenblau, Seegrün |
| Juli | Frucht · Sonnenuntergang | Koralle, Persimone, Papaya, Hibiskus |
| August | Gold · Ernte | Safran, Bernstein, Erntegelb, Goldolive |
| September | Wein · Pflaume | Weinlese, Pflaume, Brombeere, Dahlie |
| Oktober | Kupfer · Erde | Kupfer, Terrakotta, Rostrot, Ahorn |
| November | Mineral · Sturm | Sturmblau, Schiefer, Graphitblau, Regentief |
| Dezember | Immergrün · Festlicht | Tannengrün, Smaragdnacht, Mistel, Festpetrol |

### 3.3 24 Jahrescharaktere

Der 24-jährige Zyklus verwendet zusätzlich 24 stilistische Jahrescharaktere, beispielsweise Kristall, Juwel, Botanisch, Lack, Mineral, Solar, Nordisch, Velours, Elektrisch, Organisch, Aurora, Signal, Porzellan, Dämmerung, Prisma und Atelier.

Diese Charaktere verändern nicht nur den Farbton, sondern auch Helligkeit und Chroma. Ein Monat kann dadurch in einem Jahr hell und kristallin, im nächsten tief und juwelenartig, später mineralisch oder elektrisch erscheinen.

### 3.4 Wahrnehmungsbasierte Kandidatenauswahl

Für jeden der 288 kanonischen Kalendermonate werden mehrere Kandidaten innerhalb des jeweiligen saisonalen Korridors erzeugt. Die endgültige Auswahl maximiert den Abstand zu:

1. dem unmittelbar vorherigen Kalendermonat;
2. demselben Monat des Vorjahres.

Der Abstand wird im **OKLab-Farbraum** berechnet. OKLab bildet wahrgenommene Unterschiede wesentlich besser ab als ein einfacher Vergleich von RGB- oder Hexwerten. Zwei Farben müssen daher nicht nur rechnerisch, sondern auch sichtbar voneinander abweichen.

### 3.5 Niedrig-diskrepante Verteilung

Die Kandidaten werden über deterministische niedrig-diskrepante Zahlenfolgen erzeugt. Diese verteilen Farbton, Helligkeit und Chroma gleichmäßiger als ein einfacher linearer Offset oder Laufzeit-Zufall.

Eigenschaften:

- derselbe Monat desselben Jahres bleibt auf jedem Gerät identisch;
- kein Zufall bei Seitenaufruf oder Neuladen;
- 288 eindeutige kanonische Akzentfarben;
- definierter 24-Jahres-Zyklus ab 2026;
- sichere positive Modulo-Abbildung für frühere und spätere Jahre;
- breite Verteilung innerhalb jedes Jahres;
- starke Variation desselben Monats über aufeinanderfolgende Jahre.

### 3.6 Sichtbare und technische Metadaten

Das Badge zeigt bewusst nur den kuratierten Farbnamen:

```text
Monatskontrast · Polarviolett
```

Der Tooltip ergänzt Saison, Spektralfamilie, Jahr und Jahrescharakter. Zusätze wie „Cloud Veil“ erscheinen nicht mehr im Badge.

Am Wurzelelement werden unter anderem folgende Datenattribute gesetzt:

- `data-color-director="seasonal-spectrum-v1"`;
- `data-spectrum-key="JJJJ-MM"`;
- `data-spectrum-palette`;
- `data-spectrum-mood`;
- `data-month-transition="atomic-spectrum-v1"`.

### 3.7 Vollständige Oberflächenableitung

Der Spektrumdirector verändert nicht nur einen Akzentwert. Aus dem gewählten Profil werden gemeinsam abgeleitet:

- Hauptakzent;
- kräftiger Interaktionsakzent;
- dunkler Schrift- und Konturton;
- Glow;
- Paneltönung;
- Wochentagsspalte;
- Samstag;
- Sonntag;
- Feiertag.

Die Tabellenhierarchie bleibt erhalten: Samstag ist am zurückhaltendsten, Sonntag kräftiger, Feiertage stärker, die Wochentagsspalte trägt die deutlichste Orientierungstönung.

### 3.8 Gamut Mapping

Expressive OKLCH-Farben können außerhalb des darstellbaren sRGB-Farbraums liegen. Das Modul reduziert in diesem Fall iterativ nur die Buntheit, bis ein gültiger sRGB-Wert erreicht ist. Farbton und Helligkeitscharakter bleiben dabei möglichst stabil.

### 3.9 Übergänge, Priorität und atomarer Abschluss

Der Director schreibt die abgeleiteten CSS-Variablen mit gezielter Priorität auf das Wurzelelement. Das bestehende Basistheme bleibt als robuste Rückfallebene erhalten.

`color-director.js` besitzt weiterhin eine zeitbasierte OKLCH-Interpolation für isolierte Nutzung. In der produktiven Monatsnavigation übernimmt jedoch `month-transition-stability.js` den abschließenden Vertrag:

1. Auswahl von Jahr und Monat lesen;
2. eventuell laufende Spektruminterpolation abbrechen;
3. endgültiges Spektrumprofil ohne Animation schreiben;
4. Badge und Metadaten auf denselben Monat festlegen;
5. den Zustand noch vor dem nächsten Browser-Paint abschließen.

Damit gibt es während eines Monatswechsels keine zweite Farbe, keinen Zwischenframe mit Basistheme und kein erneutes Erscheinen nach einem Opazitätsloch.

### 3.10 Objektive Qualitätsgrenzen

Automatisierte Tests prüfen:

- exakt 288 deterministische Profile;
- 288 eindeutige Akzentfarben;
- mindestens acht unterschiedliche 30-Grad-Farbsektoren pro Jahr;
- definierte Mindestdynamik von Helligkeit und Chroma;
- Mindestabstand benachbarter Kalendermonate;
- Mindestabstand desselben Monats in Folgejahren;
- mindestens 22 unterschiedliche Ausprägungen je Monat im 24-Jahres-Zyklus;
- mindestens sieben sichtbare Farbnamen je Monat;
- WCAG-AA-Kontrast aller abgeleiteten Tabellenflächen;
- durchgehende Sichtbarkeit und unveränderte Zielfarbe in jedem gezeichneten Frame des Monatswechsels.

---

## 4. Dienstarten und Personalpools

### Bereitschaftsdienst

BD wird gegen individuelle Sollwerte, harte Maxima, Abwesenheiten, Wünsche, Qualifikation, bestehende Einteilungen und relevante Dienstfolgen bewertet.

### Hintergrunddienst

HG steht nur tagesgültig HG-berechtigten Personen zur Verfügung. Die Prüfung berücksichtigt BD am selben oder folgenden Tag, Diensthäufungen, Kopplungsregeln, Abwesenheiten und kombinierte Monatslast.

### Rufbereitschaft Neuroradiologie

Die erste RBN besitzt einen datumsabhängigen Pool. Die zweite RBN wird nur eingeblendet, wenn die Erstbesetzung fachlich eine zusätzliche Absicherung erfordert. Historische oder importierte Altwerte bleiben lesbar, werden aber nicht automatisch erneut angeboten.

### Tagesgültige Rollen

Personaldefinitionen können Aktivierungsdaten, Deaktivierungsdaten, Beförderungsdaten, Grundrollen, BD-Sollwerte, Maxima und Planungsberechtigungen enthalten. Qualifikationen werden für den konkreten Kalendertag aufgelöst.

---

## 5. Bewertungs- und Konfliktmodell

| Stufe | Bedeutung |
|---|---|
| **Grün** | fachlich geeignet oder positiv empfohlen |
| **Gelb** | Hinweis, Belastung oder nachrangige Konstellation |
| **Orange** | relevanter Konflikt, besonders zu prüfen |
| **Rot** | schwerer Konflikt; Eintragung nur nach Bestätigung |
| **Grau** | am konkreten Tag nicht auswählbar |

Die höchste Konfliktstufe bestimmt die sichtbare Bewertung. Sämtliche relevanten Gründe bleiben in Klartext erhalten. Positive Hinweise heben Konflikte nicht rechnerisch auf.

Geprüft werden unter anderem:

- tagesgültige Aktivität und Qualifikation;
- Urlaub, FZA und Sperrwünsche;
- gleiche Person in inkompatiblen Rollen;
- individuelle BD-Sollwerte und harte Maxima;
- monatsbezogener Ausgleich;
- Dienstabstände und Dienstfolgen;
- Wochenendnachbarschaften;
- HG-Häufungen;
- fachliche Kopplungen zwischen BD und HG;
- personenspezifische Sonderregeln;
- sicher geladene historische Monatsdaten;
- reiner Jahreskontext ohne verdeckte Bewertungswirkung.

Rote Einteilungen bleiben bewusst möglich, erfordern aber eine ausdrückliche Bestätigung. Protokolliert werden Datum, Rolle, Person, Gründe, Zeitpunkt und optionaler Kommentar.

---

## 6. Abwesenheiten, Wünsche und Optionen

Unterstützt werden Urlaub, FZA und echte dienstfreie Tage, der Sperrwunsch „Kein Dienst“, positive BD- und HG-Wünsche sowie die Optionen „BD möglich“ und „HG möglich“.

Wirksame Abwesenheiten entfernen eine Person aus der tagesbezogenen Vergleichsgruppe. Automatisch abgeleiteter FZA wird ausschließlich dort erzeugt, wo er fachlich ausdrücklich definiert ist. Manuelle und abgeleitete Quellen bleiben unterscheidbar; doppelte sichtbare Einträge werden vermieden.

---

## 7. RBN-Logik

- getrennte Felder für erste und zweite RBN;
- zweite RBN nur bei definierten Erstbesetzungen sichtbar;
- datumsabhängige Personalpools;
- defensive Behandlung importierter Altwerte;
- keine Einbeziehung der RBN in die BD-/HG-Statistik;
- vollständige Speicherung im Monatsdatensatz.

---

## 8. Statistik und offene Punkte

Die Statistik wird unmittelbar aus dem sichtbaren Monatsplan berechnet. Sie zeigt insbesondere BD, HG, Sollwerte, Restwerte und Wochenendlast.

Die Liste „Offene Punkte“ priorisiert unbesetzte Rollen, inaktive oder unzulässige Besetzungen, inkonsistente zweite RBN sowie weitere fachliche oder strukturelle Auffälligkeiten. Sie verändert keine Einteilung selbstständig.

---

## 9. Speicherung und Datensicherheit

### Lokaler Zustand

Jede Änderung wird unmittelbar lokal gesichert. Ein Debounce bündelt Serverspeicherungen, ohne die lokale Rückfallebene zu verzögern.

### Cloudflare KV

Monatsdaten und Einstellungen werden über Pages Functions in Cloudflare KV gespeichert. Beim Öffnen eines Monats wird der aktuelle Serverstand geladen, sofern keine schützenswerten lokalen Änderungen entgegenstehen.

### Konfliktvermeidung

- getrennte Dirty-Zustände je Monat;
- keine stillen Überschreibungen lokaler Änderungen;
- serielle Speicherung desselben Monats;
- defensive Normalisierung importierter Daten;
- Revision und Zeitstempel im Monatsobjekt;
- JSON-Sicherung als transportierbares Rückfallformat;
- Schutz lokaler Offline-Änderungen nach einem Neustart.

Ein eigener Service Worker wird nicht verwendet. Historische eigene Registrierungen und Caches werden defensiv entfernt.

---

## 10. Import und Export

### Excel-Import

Der Import analysiert Jahresplaner, ordnet Personalnamen defensiv zu und übernimmt unterstützte Monatsinformationen. Zielmonate werden vor einem Merge verlässlich geladen. Abweichende vorhandene Werte werden nur im vorgesehenen Importmodus ersetzt.

### Excel-Export

Der sichtbare Monatsplan wird als Excel-kompatibles Arbeitsblatt mit Tageszeilen, Diensten, RBN und Markierungen ausgegeben.

### PDF-/Druckausgabe

Die Druckansicht ist auf eine kompakte A4-Ausgabe ausgelegt. Monatsfarben bleiben erhalten. Laufende Farbanimationen werden vor dem Druck beendet, damit keine Zwischenfarbe eingefroren wird.

### JSON

Vollständige Sicherung und Wiederherstellung von Stammdaten, Einstellungen und Monatsständen.

---

## 11. Technische Architektur

Die Anwendung verwendet native Webtechnologien ohne Frontend-Framework:

- semantisches HTML;
- CSS Custom Properties und moderne Farbfunktionen;
- ES-Module;
- Cloudflare Pages Functions;
- Cloudflare KV;
- SheetJS für Excel;
- Node-Test-Runner;
- Playwright für End-to-End-Tests.

Wesentliche Module:

| Modul | Aufgabe |
|---|---|
| `js/app.js` | UI, Navigation, Dialoge, Rendering, Import-/Exportsteuerung |
| `js/theme.js` | saisonales Basistheme, Farbräume und Rückfallebene |
| `js/color-director.js` | Spektrumprofile, Abstandsoptimierung, Gamut Mapping und Oberflächenableitung |
| `js/month-transition-stability.js` | atomarer Farbabschluss und Synchronisierung konkurrierender Monatswechsel-Signale |
| `js/ui-controls.js` | kompakte Werkzeugleiste, Icons und Einbindung der progressiven UI-Schichten |
| `js/state.js` | Laden, Speichern, Dirty-Zustände und Monatscache |
| `js/rules*.js` | Regelengine, Auswertung, Statistik und offene Punkte |
| `js/rbn.js` | RBN-Pools und zweite RBN |
| `js/holidays.js` | sächsische Feiertage und Werktage |
| `js/excel-import.js` | Arbeitsmappenanalyse und Zuordnung |
| `functions/api/*` | Cloudflare-API und KV-Zugriff |

Die Farbarchitektur ist dreistufig:

1. `theme.js` liefert eine vollständige, eigenständig funktionierende Basis;
2. `color-director.js` setzt die stärker differenzierte wahrnehmungsoptimierte Darstellung;
3. `month-transition-stability.js` stellt sicher, dass ein Monatswechsel nur den endgültigen Spektrumzustand zeichnet.

Fällt die progressive Spektrumebene aus, bleibt die Anwendung mit dem Basistheme vollständig bedienbar.

---

## 12. Tests und Qualitätssicherung

### Syntaxprüfung

```bash
npm run check
```

Prüft sämtliche produktiven JavaScript-Module, Pages Functions und Testkonfigurationen, einschließlich `js/color-director.js` und `js/month-transition-stability.js`.

### Unit- und Regressionstests

```bash
npm test
```

Geprüft werden unter anderem:

- Regelengine und personenspezifische Sonderregeln;
- Persistenz, Dirty-Zustände und Offline-Schutz;
- Import, Export und Datenvalidierung;
- RBN-Pools und zweite RBN;
- 288 Basispaletten und 288 Spektrumprofile;
- Wahrnehmungsabstände in OKLab;
- Helligkeits- und Chromadynamik;
- Gamut Mapping;
- Kontrast sämtlicher Tabellenflächen;
- Werkzeugleistengruppen und Badgeformat;
- nachgelagerte Einbindung der Monatswechsel-Stabilisierung;
- endgültige Spektrumsetzung mit `animate: false`;
- CSS-Invariante `opacity: 1` für historische Monatswechselklassen.

### End-to-End

```bash
npm run test:e2e
```

Playwright prüft die Anwendung im Browser, einschließlich Navigation, Auswahl- und Konfliktdialoge, Werkzeugleiste, Dateiaktionen, Monatsbadge, Seasonal Spectrum Director sowie Monats- und Jahresvariation.

Der spezielle Flimmer-Regressionsfall verzögert die Monats-API bewusst und zeichnet den Wechsel mit `requestAnimationFrame` auf. Für jeden Ziel-Frame werden geprüft:

- `#printArea` bleibt mit Deckkraft `1` sichtbar;
- `display` wird niemals `none`;
- die vollständige erwartete Tageszahl bleibt im DOM;
- die Spektrumfarbe ändert sich nach Erreichen des Zielmonats nicht erneut;
- Badge und Überschrift bleiben konsistent;
- `data-month-transition="atomic-spectrum-v1"` ist aktiv.

### Vollständige Verifikation

```bash
npm run verify
```

Führt Syntaxprüfung, Unit-/Regressionstests und Playwright-End-to-End-Tests nacheinander aus.

---

## 13. Lokale Entwicklung und Deployment

```bash
npm ci
npm run check
npm test
npm run test:e2e
```

Für die reine Oberfläche genügt ein statischer lokaler Webserver. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung und die vorgesehenen KV-Bindings.

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Der vollständige Browser-Modulgraph verwendet einen einheitlichen Release-Token. Neue Module müssen sowohl in die Syntaxprüfung als auch in die Modulauflösungs- und Auslieferungstests aufgenommen werden.

---

## 14. Projektstruktur

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
│   ├── theme.js
│   ├── color-director.js
│   ├── month-transition-stability.js
│   ├── ui-controls.js
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
│   ├── color-director.test.js
│   ├── month-navigation.test.js
│   ├── month-transition-stability.test.js
│   ├── theme.test.js
│   └── e2e/
│       ├── app.spec.js
│       ├── color-director.spec.js
│       └── month-transition-stability.spec.js
├── docs/
│   └── README-20260801.11.md
├── package.json
└── playwright.config.js
```

---

## 15. Unveränderliche Grundsätze

- Der Mensch plant; die Anwendung unterstützt und prüft.
- Keine verdeckte automatische Gesamtoptimierung.
- Konflikte werden erklärt, nicht nur eingefärbt.
- Positive Hinweise heben Konflikte nicht auf.
- Rote Ausnahmen bleiben möglich, aber protokollpflichtig.
- Historische Daten werden defensiv behandelt.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben sind deterministisch, saisonal, kontrastgeprüft und sichtbar voneinander unterscheidbar.
- Farbvielfalt wird wahrnehmungsbasiert und nicht nur anhand unterschiedlicher Hexwerte bewertet.
- Ein Monatswechsel darf keinen bereits sichtbaren Plan erneut ausblenden oder nachträglich umfärben.
- Regelwerk, Tests und Dokumentation werden gemeinsam geändert.
