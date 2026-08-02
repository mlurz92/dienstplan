# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle mit wechselnden Monatsfarben" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Release-Token:** `20260801.11`  
> **Regelwerk:** Eignungsregeln `v4.6` mit gestuftem Override- und Prioritätsmodell  
> **Farbarchitektur:** Trend Atlas v3 mit 288 deterministischen Monatsprofilen  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die bewusste manuelle Planung von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung erzeugt keinen automatischen Gesamtplan. Jede Einteilung wird bewusst vorgenommen, transparent bewertet und gegen ein nachvollziehbares Regelwerk geprüft.

---

## 1. Planungsprinzip

DienstplanRAD ist ein **assistiertes manuelles Planungssystem**, kein automatischer Optimierer.

- keine automatische Monatsbelegung;
- keine selbstständige Umbesetzung oder Tauschlogik;
- keine verdeckte Gesamtoptimierung;
- vollständige Klartextbegründung jeder ausgelösten Regel;
- ausdrückliche Bestätigung und Protokollierung zulässiger roter Ausnahmen;
- lokale Sofortsicherung und zentrale Cloudflare-KV-Synchronisierung.

Die Eignungsprüfung ist seiteneffektfrei. Sie liest den vorhandenen Zustand, trägt aber keinen Gegenposten ein, verschiebt keine Einteilung und verändert weder Abwesenheiten noch Wünsche oder Protokolle. Erst eine bewusste Auswahl schreibt in den Monatsplan.

Der Monatsplan verwendet eine chronologische Zeile je Kalendertag. Datum, Wochentag, BD, HG, RBN, zweite RBN, Abwesenheiten sowie Wünsche und Optionen liegen in einer gemeinsamen Leserichtung. Dienstfolgen, Feiertage und Wochenendbelastungen bleiben unmittelbar erkennbar.

---

## 2. Benutzeroberfläche

### Monatsansicht

Die Oberfläche verbindet eine Excel-nahe Tabellenlogik mit kontrollierter Glasoptik:

- semitransparente, klar gefasste Panels;
- monatlich wechselnde Akzente und Tabellenflächen;
- deckend weiße Eingabeflächen für hohe Lesbarkeit;
- tabellarische Ziffern und kompakte Zeilenhöhen;
- eindeutige Wochenend- und Feiertagsflächen;
- reduzierte Bewegung über `prefers-reduced-motion`;
- deckende Ersatzflächen über `prefers-reduced-transparency`.

### Adaptive Werkzeugleiste

Die Werkzeugleiste passt ihre Dichte an den verfügbaren Platz an. Je nach Breite werden Gruppenüberschriften, Beschriftungen, reine Icons oder ein Überlaufmenü verwendet. Die vorhandenen Schaltflächen werden verschoben, nicht neu erzeugt; IDs, Ereignisbindungen und versteckte Datei-Eingaben bleiben erhalten.

### Dienst-Picker

Der Picker gruppiert alle aktiven Mitarbeitenden nach der tatsächlichen Entscheidungslage:

| Gruppe | Bedeutung |
|---|---|
| **Empfohlen** | eine fachlich priorisierte Empfehlung spricht dafür |
| **Möglich** | keine relevanten Konflikte |
| **Mit Hinweis** | wählbar, jedoch mit gelber Anmerkung |
| **Nachrangig** | orange; nur bei fehlender besserer Besetzung |
| **Bestätigung nötig** | roter, organisatorisch überschreibbarer Konflikt |
| **Nicht verfügbar** | fachlich oder strukturell nicht überschreibbar |

Die Suche filtert Name, Kurzname und Funktion. <kbd>↑</kbd>/<kbd>↓</kbd> wechseln die aktive Person, <kbd>Enter</kbd> übernimmt, <kbd>Esc</kbd> schließt. Die Auswahl ist semantisch als `combobox` mit gruppierter `listbox` umgesetzt.

### Begründungsreihenfolge

Die kompakte Kandidatenzeile zeigt immer zuerst den fachlich wichtigsten Grund:

1. rote Konflikte;
2. orange Konflikte;
3. gelbe Konflikte;
4. positive Empfehlungen;
5. neutrale Struktur- und Kontexthinweise.

Positive Wünsche, Optionen oder Ausgleichsempfehlungen können einen Konflikt weder verdecken noch vor ihn rücken. Alle weiteren Gründe bleiben im Detailbereich vollständig sichtbar.

---

## 3. Konflikt- und Bestätigungsmodell

### Nicht überschreibbar

Folgende Konstellationen sind rot und im Picker technisch gesperrt:

- fehlende Qualifikation, insbesondere AA als HG oder Samstags-BD;
- nicht aktive oder nicht planbare Person;
- gleichzeitige Einteilung derselben Person in BD und HG;
- eigener BD am unmittelbar vorhergehenden oder folgenden Kalendertag.

Diese Konstellationen können nicht über einen Bestätigungsdialog umgangen werden.

### Besondere rote Bestätigung

Folgende rote Konflikte bleiben auswählbar, verlangen aber eine **besondere Bestätigung mit begründendem Pflichtkommentar**:

- eingetragene oder fachlich abgeleitete Abwesenheit;
- Polednia-Sperre am Dienstag oder Sonntag;
- ausdrücklich hinterlegtes hartes BD-Monatsmaximum.

Fr. Hellmann besitzt ein BD-Soll und BD-Maximum von zwei. Ein dritter BD bleibt möglich, erfordert aber diese besondere Bestätigung. Für die Summe aus BD und HG besteht keine zusätzliche harte Gesamtobergrenze.

### Normale rote Planabweichung

Organisatorisch lösbare rote Konflikte bleiben nach gewöhnlicher ausdrücklicher Bestätigung wählbar. Hierzu gehören insbesondere widersprüchliche Kopplungen und benachbarte BD-Wochenenden. Ein Kommentar ist möglich, aber nicht zwingend.

### Bestätigte Ausnahmen

Eine bestätigte rote Einteilung bleibt unter **Offene Punkte** sichtbar, trägt aber den eigenen Status **bestätigte rote Ausnahme**. Angezeigt werden Bestätigungsart, Zeitpunkt, Kommentar und aktuelle Begründungen. Damit ist sie klar von einem noch ungeprüften Regelverstoß getrennt.

---

## 4. Fachliche Empfehlungskaskade

Empfehlungen werden nicht über eine frei addierte Punktsumme gegeneinander aufgerechnet. Innerhalb derselben Konfliktgruppe gilt eine lexikografische Priorität:

1. deterministische Kopplung;
2. ausdrücklicher positiver Dienstwunsch;
3. Option `BD möglich` beziehungsweise `HG möglich`;
4. Monats-, BD/HG- und AA-HG-Ausgleich;
5. Wochenendausgleich;
6. sonstige positive Empfehlung, insbesondere Urlaubsverlängerer.

Ein einzelnes höherrangiges Signal bleibt dadurch vor beliebig vielen schwächeren Signalen. Erst innerhalb derselben Kategorie entscheidet die jeweilige Signalstärke.

Der **Jahresverlauf** bleibt ein reiner Klartexthinweis. Er verändert weder Farbe noch Empfehlungswert und ist vollständig aus der automatischen Picker-Sortierung entfernt.

---

## 5. Fairness und Lastverteilung

Relative BD-, HG-, AA-HG-, Wochenend- und Überhangvergleiche berücksichtigen ausschließlich Personen, die am konkreten Tag **keinen roten Konflikt** besitzen. Orange und gelbe Kandidaten bleiben Teil der Vergleichsgruppe; rote oder technisch gesperrte Personen verfälschen den Tagesausgleich nicht.

### BD-Monatsausgleich

- persönlicher Richtwert grundsätzlich vier BD;
- abweichende Sollwerte für definierte Personen;
- relativer Monatsausgleich erst, wenn mindestens eine aktive Person ihr Soll erreicht hat;
- größter Sollrückstand wird bevorzugt;
- erreichtes Soll erzeugt einen gelben Richtwerthinweis;
- hartes Maximum erzeugt beim zusätzlichen BD einen roten Konflikt mit besonderer Bestätigung;
- erster notwendiger Überhang nach vollständigem Sollausgleich wird unter den dann nicht roten Personen bevorzugt Dr. Lurz angeboten, sofern kein positiver BD-Wunsch einer anderen Person entgegensteht.

### HG-Ausgleich

Für HG wird primär die kombinierte Monatslast `BD + HG` betrachtet. Bei einem HG zu einem Assistenzarzt-BD wird zusätzlich die bisherige Zahl belastender AA-HG ausgeglichen.

Der Picker zeigt beispielsweise:

```text
HG 1 · Gesamt 5
```

Nach der fachlichen Empfehlung wird bei HG sortiert nach:

1. kombinierter Monatslast;
2. Zahl bisheriger AA-HG;
3. reiner HG-Zahl;
4. Name.

---

## 6. Dienstfolgen und personelle Sonderregeln

- unmittelbar aufeinanderfolgende eigene BD: nicht überschreibbar rot;
- BD mit zwei oder drei Kalendertagen Abstand: gelb;
- werktägliches `BD–FZA–BD`: eigener gelber Hinweis;
- erneuter HG innerhalb von drei Kalendertagen: gelb;
- dritter HG in einer Dreierkette: orange;
- HG unmittelbar vor eigenem BD: grundsätzlich orange, mit definierter Freitags-/Samstags- und Facharzt-Ausnahme;
- nach gewöhnlichem BD kein automatisch erzeugtes FZA;
- ausschließlich nach Becker-Samstags-BD wird am nächsten regulären Werktag ein echtes FZA abgeleitet;
- Becker-Samstags-BD bleibt orange nachrangig;
- Dalitz-HG an Sonntag oder Montag bei Sebastian-BD bleibt orange;
- Becker und Martin dürfen an regulären Werktagen nicht gleichzeitig mit Urlaub oder FZA abwesend sein.

Prof. Schäfer ist nicht Bestandteil des aktiven Dienstpools. El Houba erhält ab dem hinterlegten Beförderungsdatum automatisch die entsprechenden Facharztberechtigungen. Fr. Hellmann ist ab Oktober 2026 aktiv.

---

## 7. Urlaub, Wochenenden und Kopplungen

### Urlaubsnähe

Ein Donnerstags-BD wird als Urlaubsverlängerer empfohlen, wenn der Montag der folgenden Kalenderwoche Bestandteil eines zusammenhängenden Urlaubsblocks ist. Ein Freitags-BD vor demselben Block bleibt orange nachrangig. Ein BD unmittelbar am Kalendertag vor einem eingetragenen Urlaubstag bleibt ebenfalls orange.

### Wochenendäquivalente

- Wochenende = Freitag bis Sonntag;
- mindestens ein BD im Wochenende = `1,0`;
- ausschließlich HG = `0,5`;
- regelkonformes gekoppeltes Standardwochenende aus Freitag-HG, Samstags-BD und Sonntag-HG derselben Person bleibt insgesamt `1,0`;
- zusätzliche, nicht durch die Kopplungsregeln erklärte Mehrfachbelastung erhält einen gesonderten gelben Hinweis;
- zweiter Samstags-BD derselben Person im Monat bleibt orange;
- zwei benachbarte BD-Wochenenden bleiben rot;
- sonstige benachbarte Dienstwochenenden bleiben orange;
- Oster- und Pfingstblock alternieren.

### Deterministische Kopplungen

- AA-BD am Freitag: Freitag-HG und Samstags-BD müssen personengleich sein;
- Facharzt-BD am Samstag: Sonntag-HG muss dieselbe Person übernehmen;
- AA-BD am Feiertagsvortag: Vortags-HG und Feiertags-BD müssen personengleich sein.

Sind Gegenposten bereits widersprüchlich belegt, entsteht eine normale rote Planabweichung. Ist ein Gegenposten noch leer, erscheint bereits ein neutraler Hinweis, welche spätere Besetzung mit der aktuellen Auswahl übereinstimmen muss. Es erfolgt niemals eine automatische Gegenbelegung.

---

## 8. Abwesenheiten, Wünsche und RBN

Unterstützt werden Urlaub, FZA, Weiterbildung, sonstige Abwesenheit, `Kein BD`, `Kein HG`, `Kein Dienst`, positive Dienstwünsche sowie die unabhängigen Optionen `BD möglich` und `HG möglich`.

Bei der Sammeleingabe ist die Auswahl die vollständige Aussage für den gewählten Typ: markiert bedeutet gesetzt, nicht markiert bedeutet entfernt; andere Typen desselben Tages bleiben unberührt.

Erste und zweite RBN werden getrennt geführt. Die zweite RBN erscheint nur bei einer dafür vorgesehenen Erstbesetzung. RBN fließt nicht in die BD/HG-Belastungsstatistik ein. Historische oder importierte Altwerte bleiben sichtbar, werden aber defensiv als nicht mehr gültiger Poolwert markiert.

---

## 9. Trend Atlas v3 und Monatswechsel

Trend Atlas v3 erzeugt für 24 Zyklusjahre 288 deterministische Monatsprofile. Die Auswahl berücksichtigt wahrnehmungsbasierte Abstände in OKLab/OKLCH, Farbton- und Helligkeitsabstand zum Vormonat, sechsmonatiges Farbgedächtnis, Vorjahresabstand und 18-monatigen Namens-Cooldown.

Die sichtbaren Namen stammen aus aktuellen Trendquellen und bleiben in ihrer englischen Originalform. Aus dem Monatsakzent werden kontrastgeprüfte Tabellen-, Panel-, Wochenend- und Feiertagsflächen abgeleitet.

Der Monatswechsel:

- lädt benachbarte Monate vor;
- bricht überholte Navigationen deterministisch ab;
- nutzt native View Transitions oder einen compositorbasierten Fallback;
- interpoliert die Monatsfarben in OKLCH;
- endet exakt auf dem kanonischen Zielprofil ohne nachgelagertes Blinken.

---

## 10. Speicherung, Import und Export

### Speicherung

- unmittelbare lokale Sicherung;
- Dirty-Status je Monat;
- Schutz gegen verspätete ältere Serverantworten;
- zentrale Speicherung über Cloudflare Pages Functions und KV;
- ganzzahlige Revisionen und defensive Normalisierung;
- Einzelbearbeiterbetrieb ohne konkurrierende Mehrbenutzerschreibvorgänge.

### Excel

Jahresplaner und Einzelpläne werden unterstützt. Monatsname, Blattstruktur und Kopfzeile werden unabhängig geprüft. Fehlende Jahres- oder Monatsangaben müssen bestätigt werden. Bestehende manuelle Dienste und Abwesenheiten bleiben beim Merge geschützt; unbekannte Namen werden transparent ausgewiesen.

### JSON und PDF

Der vollständige Zustand kann als JSON exportiert und streng validiert importiert werden. Ein fehlgeschlagener Serverimport versucht bereits geschriebene Schlüssel zurückzusetzen. Die Druckansicht ist für eine kompakte A4-Ausgabe optimiert; laufende Farbtransitionen werden vor dem Druck abgeschlossen.

---

## 11. Technische Architektur

- semantisches HTML und modulare ES-Module;
- CSS-Custom-Properties als visuelles System;
- keine Framework-Laufzeit;
- native Browser-APIs mit progressiven Fallbacks;
- SheetJS für Excel-Ein-/Ausgabe;
- Cloudflare Pages Functions und KV;
- Node-Test-Runner und Playwright.

| Modul | Verantwortung |
|---|---|
| `js/app.js` | Render- und Interaktionsfluss, Dialoge, Import und Export |
| `js/state.js` | Zustand, lokale Sicherung, Serverabgleich und Dirty-Status |
| `js/rules-core.js` | gemeinsame Datums-, Personal-, Last- und Zählfunktionen |
| `js/rules-evaluation.js` | Konfliktmodell, Empfehlungskaskade, Fairness und Kopplungen |
| `js/rules-reporting.js` | offene Punkte, bestätigte Ausnahmen und Statistik |
| `js/picker-view.js` | Picker-Gruppen, lexikografische Sortierung und Lastanzeige |
| `js/rbn.js` | RBN-Pools und Abhängigkeit der zweiten RBN |
| `js/holidays.js` | Feiertage Sachsen und reguläre Werktage |
| `js/color-atlas-data.js` | Trendquellen, Farbanker und Grenzwerte |
| `js/color-atlas-engine.js` | OKLab/OKLCH, Kandidaten und Farbgedächtnis |
| `js/color-director.js` | sichtbare Monatsfarben, Badge und Animation |

Der App-Shell und der vollständige Browser-Modulgraph verwenden einen einheitlichen Release-Token. Cloudflare erzwingt zugleich Revalidierung des Shell- und Modulbestands; ein früherer Service Worker wird durch ein vorgelagertes Cleanup und einen serverseitigen `/sw.js`-Grabstein entfernt.

---

## 12. Tests und Qualitätssicherung

```bash
npm run check
npm test
npm run test:e2e
npm run verify
```

Die Suite umfasst **234 Unit-/Regressionstests** und **22 Chromium-End-to-End-Tests**. Geprüft werden unter anderem:

- nicht überschreibbare Qualifikations-, Doppelrollen- und Folge-BD-Konflikte;
- besondere Bestätigung für Abwesenheit, Polednia-Sperre und hartes Maximum;
- normale rote Kopplungsabweichungen;
- Konfliktgründe vor positiven Empfehlungen;
- lexikografische Empfehlungskaskade;
- Ausschluss roter Personen aus relativen Fairnessvergleichen;
- kombinierte HG-Last und sekundärer AA-HG-Ausgleich;
- Neutralität des Jahresverlaufs für Bewertung und Sortierung;
- Donnerstag-/Freitag-Logik vor Urlaubsblock;
- prospektive Hinweise bei offenen Kopplungen;
- separat markierte bestätigte rote Ausnahmen;
- Wochenendäquivalente und zusätzliche nicht gekoppelte Mehrfachbelastung;
- Reihenfolgeunabhängigkeit und Selbstkonsistenz bestehender Einteilungen;
- Datenvalidierung, Import-Rollback, Offline- und Dirty-Schutz;
- 288 eindeutige Farbprofile, Kontrast, Farbgedächtnis und blinkfreier Monatswechsel.

---

## 13. Lokale Entwicklung und Deployment

```bash
npm ci
npm run verify
```

Für die reine Oberfläche genügt ein statischer lokaler Webserver. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung mit den vorgesehenen KV-Bindings.

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Der sichtbare Buildstempel und der Modulgraph verwenden den Release-Token `20260801.11`.

---

## 14. Projektstruktur

```text
.
├── index.html
├── styles.css
├── controls.css
├── transitions.css
├── manifest.webmanifest
├── Eignungsregeln.txt
├── icons/
├── js/
│   ├── app.js
│   ├── state.js
│   ├── defaults.js
│   ├── rules.js
│   ├── rules-core.js
│   ├── rules-evaluation.js
│   ├── rules-reporting.js
│   ├── picker-view.js
│   ├── rbn.js
│   ├── holidays.js
│   ├── excel-import.js
│   ├── color-atlas-data.js
│   ├── color-atlas-engine.js
│   ├── color-director.js
│   ├── month-transition-stability.js
│   └── month-view-transition.js
├── functions/api/
├── tests/
├── docs/
├── package.json
└── playwright.config.js
```

---

## 15. Unveränderliche Grundsätze

- Der Mensch plant; die Anwendung unterstützt und prüft.
- Keine verdeckte automatische Gesamtoptimierung.
- Konflikte werden erklärt, nicht nur eingefärbt.
- Positive Hinweise heben Konflikte nicht auf.
- Fachlich nicht überschreibbare Konstellationen dürfen nicht durch Bestätigung umgangen werden.
- Besondere rote Ausnahmen verlangen einen begründenden Kommentar.
- Bestätigte rote Ausnahmen bleiben revisionssicher und eindeutig markiert sichtbar.
- Relative Fairness darf nicht durch am konkreten Tag rote Personen verzerrt werden.
- Der Jahresverlauf bleibt reine Information ohne Sortier- oder Bewertungseinfluss.
- Empfehlungen folgen der dokumentierten fachlichen Kaskade, nicht einer intransparenten Punktsumme.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben bleiben deterministisch, kontrastgeprüft und wahrnehmungsbasiert verschieden.
- Überholte Navigationen dürfen keinen späteren Zustand festlegen.
- Regelwerk, Tests und Dokumentation werden gemeinsam geändert.
