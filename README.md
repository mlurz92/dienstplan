# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle mit wechselnden Monatsfarben" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.3.0`  
> **Regelwerk:** Eignungsregeln `v4.7` mit gestuftem Override-, Prioritäts- und Auto-Plan-Modell  
> **Auto-Plan:** globale, deterministische BD/HG-Optimierung mit verpflichtender Vorschau und Bestätigung  
> **Farbarchitektur:** Trend Atlas v3 mit 288 deterministischen Monatsprofilen  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt sowohl die bewusste manuelle Einzelplanung als auch eine bestätigungspflichtige automatische Komplettierung aller noch offenen **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)** des aktuell angezeigten Monats. Bereits eingetragene Dienste bleiben unveränderliche Fixpunkte. **RBN** und zweite RBN werden vom Auto-Planer nicht verändert.

---

## 1. Planungsmodi

### Manuelle Planung

- direkte Auswahl je BD- oder HG-Feld;
- vollständige Kandidatenbewertung durch dieselbe Regelengine;
- klare Trennung zwischen geeignet, Hinweis, nachrangig, bestätigungspflichtig und nicht wählbar;
- vollständige Klartextbegründung aller ausgelösten Regeln;
- besondere Bestätigung mit Pflichtkommentar bei definierten roten Ausnahmen;
- sofortige lokale Sicherung und Cloudflare-KV-Synchronisierung.

### Auto-Plan

Der Button **Auto-Plan** verteilt ausschließlich noch leere BD- und HG-Felder des sichtbaren Monats. Der Algorithmus schreibt während der Berechnung nichts in den Plan. Nach dem Lauf erscheint eine vollständige Vorschau; erst **Vorschläge übernehmen** führt die atomare Änderung aus.

Unverändert bleiben:

- bestehende BD- und HG-Einteilungen;
- RBN und zweite RBN;
- Abwesenheiten, Wünsche und Optionen;
- Notizen;
- Override- und Importprotokolle.

Kann kein vollständiger Plan ohne rote Regelverletzung erzeugt werden, wird die Übernahme technisch nicht freigegeben.

---

## 2. Auto-Plan-Algorithmus

### 2.1 Verbindliche Regelinstanz

Der Auto-Planer besitzt keine parallele oder vereinfachte Regelkopie. Für jede hypothetische Einteilung wird die bestehende Funktion `evaluateCandidate()` auf dem jeweiligen simulierten Monatszustand ausgeführt.

Automatisch ausgeschlossen werden:

- sämtliche grauen, fachlich nicht wählbaren Kandidaten;
- sämtliche roten Kandidaten, auch wenn eine manuelle Bestätigung grundsätzlich möglich wäre;
- fehlende Qualifikation;
- nicht aktive oder nicht planbare Personen;
- gleichzeitiger BD und HG derselben Person;
- unmittelbar aufeinanderfolgende eigene BD;
- Abwesenheiten und Polednia-Sperren;
- harte BD-Maxima;
- widersprüchliche Kopplungen;
- sonstige rote Planabweichungen.

Der Auto-Planer erzeugt daher **keine automatischen Overrides** und keine stillen Ausnahmen.

### 2.2 Globale Suche statt Tages-Greedy

Die Planung erfolgt als deterministische mehrstufige **Beam Search**:

1. Schutz und Analyse aller bestehenden Fixpunkte;
2. globale Verteilung der offenen BD;
3. globale Verteilung der offenen HG auf dem bereits simulierten BD-Plan;
4. Fairness-Politur der überlebenden Gesamtvarianten;
5. vollständiger Schlussaudit aller vorgeschlagenen Einteilungen.

Je Dienstfeld werden mehrere regelkonforme Kandidaten weiterverfolgt. Dadurch kann eine lokal attraktive Auswahl verworfen werden, wenn sie spätere Kopplungen, Wochenenden oder den Monatsausgleich verschlechtert. Die Suche hält parallel mehrere globale Planvarianten offen und reduziert sie nach jedem Schritt auf die fachlich besten, voneinander verschiedenen Zustände.

### 2.3 Lexikografische Optimierung

Die Zielordnung ist bewusst nicht als intransparente freie Punktsumme implementiert. Sie folgt einer festen lexikografischen Hierarchie:

1. keine roten oder grauen Vorschläge;
2. vollständige Besetzung aller offenen Felder;
3. möglichst wenige orange, danach gelbe Konstellationen;
4. deterministische Kopplungen;
5. positive Dienstwünsche;
6. Optionen `BD möglich` beziehungsweise `HG möglich`;
7. BD-Sollausgleich;
8. kombinierter BD/HG-Ausgleich;
9. sekundärer AA-HG-Ausgleich;
10. Wochenend- und Samstagsrotation;
11. sonstige positive Empfehlungen;
12. deterministische stabile Tie-Breaks.

Ein höherrangiges Signal kann nicht durch eine beliebige Summe niedrigerer Signale verdrängt werden.

### 2.4 Fairnessdimensionen

Die globale Bewertung berücksichtigt:

- individuellen BD-Richtwert und Überhänge;
- definierte abweichende Sollwerte;
- harte BD-Maxima;
- kombinierte Monatslast `BD + HG` der Facharztgruppe;
- Zahl belastender HG zu Assistenzarzt-BD;
- Wochenendäquivalente;
- Rotation der Samstags-BD;
- Oster-/Pfingstblock;
- positive Wünsche und Optionen;
- Urlaubsverlängerer;
- bestehende Einteilungen als vorgegebene Last.

Der Jahresverlauf bleibt wie im manuellen Picker ein reiner Kontexthinweis und beeinflusst die automatische Rangfolge nicht.

### 2.5 Kopplungen

Die Suchreihenfolge plant zunächst BD und anschließend HG. Dadurch können die deterministischen Gegenposten auf dem vollständigen simulierten BD-Plan aufgebaut werden:

- AA-BD am Freitag: Freitag-HG = Samstags-BD;
- Facharzt-BD am Samstag: Sonntag-HG = Samstags-BD;
- AA-BD am Feiertagsvortag: Vortags-HG = Feiertags-BD.

Der Schlussaudit bewertet anschließend jede vorgeschlagene Zelle erneut im vollständigen Endzustand.

### 2.6 Atomare Übernahme und Schutz vor veralteten Vorschlägen

Beim Start wird ein Fingerprint aus Monat, Revision, Zeitstempel und sämtlichen BD/HG-Fixpunkten gebildet. Vor der Übernahme wird dieser Fingerprint erneut geprüft.

Die Übernahme wird verweigert, wenn:

- der Monat zwischen Berechnung und Bestätigung verändert wurde;
- ein vorgeschlagenes Feld zwischenzeitlich belegt wurde;
- der Lauf nicht vollständig erfolgreich war;
- der Schlussaudit rote oder graue Vorschläge enthält;
- offene Felder verblieben sind.

Erst danach werden alle Änderungen in einer einzigen lokalen Monatsmutation übernommen und synchronisiert.

---

## 3. Animierter Optimierungslauf

Der Auto-Plan-Lauf besitzt eine eigenständige, performante Visualisierung:

- Canvas-basierte Constraint-Konstellation mit bis zu 62 BD/HG-Knoten;
- animierte Verbindungen zwischen bereits bewerteten Dienstfeldern;
- pulsierender Fortschrittskern;
- Phasenanzeige für Fixpunkte, BD, HG, Fairness und Audit;
- Live-Anzeige von Kandidatenzahl, Beam-Varianten, Fixpunkten und offenen Feldern;
- progressive Dienstfeldmatrix;
- abschließende Ergebnisinszenierung mit Audit-, Fairness-, Wunsch- und Hinweiskarten;
- vollständige Vorschlagsliste;
- Vorher-Nachher-Verteilungsbild je Person.

Die Berechnung gibt zwischen den Dienstfeldern an den Browser zurück. Animation, Eingaben und Abbruch bleiben dadurch responsiv. `prefers-reduced-motion` reduziert bewegte Effekte, ohne Informationen oder Funktionen zu entfernen.

---

## 4. Benutzeroberfläche

### Monatsansicht

- Excel-nahe Tabelle mit einer Zeile je Kalendertag;
- BD, HG, RBN und zweite RBN in einer Leserichtung;
- Urlaub/FZA und Wünsche/Optionen direkt daneben;
- eindeutige Wochenend- und Feiertagsflächen;
- Statistik und offene Punkte unterhalb des Plans;
- monatlich wechselndes, kontrastgeprüftes Farbsystem.

### Adaptive Werkzeugleiste

Die Werkzeugleiste misst ihren tatsächlichen Platzbedarf und verwendet die Stufen:

1. `full`;
2. `groups`;
3. `secondary`;
4. `icons`;
5. `overflow`.

Der Auto-Plan-Button bleibt in der Planungsgruppe. Daten- und Ausgabeaktionen wechseln bei geringer Breite in das Überlaufmenü.

### Dienst-Picker

| Gruppe | Bedeutung |
|---|---|
| **Empfohlen** | fachlich priorisierte Empfehlung |
| **Möglich** | keine relevanten Konflikte |
| **Mit Hinweis** | gelb, weiterhin wählbar |
| **Nachrangig** | orange, nur bei fehlender besserer Besetzung |
| **Bestätigung nötig** | roter, manuell überschreibbarer Konflikt |
| **Nicht verfügbar** | fachlich oder strukturell nicht überschreibbar |

Die kompakte Kandidatenzeile zeigt Gründe in der Reihenfolge rot, orange, gelb, positive Empfehlung, neutraler Hinweis.

---

## 5. Konflikt- und Bestätigungsmodell

### Nicht überschreibbar

- fehlende Qualifikation;
- nicht aktive oder nicht planbare Person;
- gleichzeitige Einteilung derselben Person in BD und HG;
- eigener BD am unmittelbar vorhergehenden oder folgenden Kalendertag.

### Besondere rote Bestätigung

- eingetragene oder abgeleitete Abwesenheit;
- Polednia-Sperre Dienstag oder Sonntag;
- hartes BD-Monatsmaximum.

Diese manuell möglichen Sonderfälle werden vom Auto-Planer trotzdem nie verwendet.

### Normale rote Planabweichung

Organisatorisch lösbare rote Konflikte können manuell bestätigt werden. Der Auto-Planer schließt sie vollständig aus.

Bestätigte manuelle Ausnahmen bleiben unter **Offene Punkte** revisionssicher sichtbar.

---

## 6. Dienstfolgen, Wochenenden und Sonderregeln

- Folge-BD an direkt benachbarten Kalendertagen: nicht überschreibbar;
- BD mit zwei oder drei Tagen Abstand: gelb;
- werktägliches `BD–FZA–BD`: gelb;
- erneuter HG innerhalb drei Tagen: gelb;
- dritter HG in einer Dreierkette: orange;
- HG am Tag vor eigenem BD: grundsätzlich orange mit definierten Ausnahmen;
- Becker-Samstags-BD: orange, nächster regulärer Werktag als abgeleitetes FZA;
- Polednia Dienstag/Sonntag: rote besondere Sperre;
- Dalitz-HG Sonntag/Montag bei Sebastian-BD: orange;
- Becker und Martin nicht gleichzeitig mit Urlaub/FZA an regulären Werktagen;
- Wochenende Freitag bis Sonntag;
- mindestens ein BD = `1,0` Wochenendäquivalent;
- ausschließlich HG = `0,5`;
- regelkonformes gekoppeltes Standardwochenende bleibt `1,0`;
- nicht gekoppelte Mehrfachbelastung wird gesondert markiert;
- Samstags-BD rotieren;
- Oster-/Pfingstblock alterniert.

---

## 7. Abwesenheiten, Wünsche und RBN

Unterstützt werden:

- Urlaub;
- FZA/Frei;
- Weiterbildung;
- sonstige Abwesenheit;
- `Kein BD`;
- `Kein HG`;
- `Kein Dienst`;
- `BD bevorzugt`;
- `HG bevorzugt`;
- `Dienst bevorzugt`;
- `BD möglich`;
- `HG möglich`.

RBN und zweite RBN bleiben eigenständige manuelle Rollen. Die zweite RBN erscheint nur bei zulässiger Erstbesetzung. RBN fließt nicht in die BD/HG-Last ein und wird vom Auto-Plan nicht verändert.

---

## 8. Trend Atlas v3 und Monatswechsel

Trend Atlas v3 erzeugt 288 deterministische Monatsprofile über einen 24-jährigen Zyklus. Die Auswahl berücksichtigt OKLab-/OKLCH-Abstände, Farbton, Helligkeit, Buntheit, Vorjahresabstand, Farbgedächtnis und Namens-Cooldown.

Der Monatswechsel:

- lädt Nachbarmonate und bisherigen Jahresverlauf vor;
- bricht überholte Navigationen deterministisch ab;
- nutzt View Transitions oder einen compositorbasierten Fallback;
- interpoliert Monatsfarben in OKLCH;
- endet ohne nachgelagertes Blinken.

---

## 9. Speicherung, Import und Export

### Speicherung

- unmittelbare lokale Sicherung;
- Dirty-Status je Monat;
- Schutz vor verspäteten Serverantworten;
- Cloudflare Pages Functions und KV;
- ganzzahlige Revisionen;
- Einzelbearbeiterbetrieb.

### Excel

Jahresplaner und Einzelpläne werden unterstützt. Bestehende manuelle Dienste und Abwesenheiten bleiben beim Merge geschützt. Unbekannte Namen werden transparent als externe Altwerte erhalten.

### JSON und PDF

Der vollständige Zustand kann als JSON exportiert und streng validiert importiert werden. Die Druckansicht ist für eine kompakte A4-Ausgabe optimiert; laufende Farbtransitionen werden vor dem Druck abgeschlossen.

---

## 10. Technische Architektur

- semantisches HTML;
- modulare ES-Module;
- keine Framework-Laufzeit;
- native Browser-APIs mit progressiven Fallbacks;
- SheetJS für Excel;
- Cloudflare Pages Functions und KV;
- Node-Test-Runner;
- Playwright.

| Modul | Verantwortung |
|---|---|
| `js/app.js` | Monatsansicht, Dialoge, Import und Export |
| `js/state.js` | Zustand, lokale Sicherung, Serverabgleich und Dirty-Status |
| `js/rules-core.js` | Datum, Personal, Lasten und Zählfunktionen |
| `js/rules-evaluation.js` | Konflikte, Empfehlungen, Fairness und Kopplungen |
| `js/rules-reporting.js` | offene Punkte, Ausnahmen und Statistik |
| `js/auto-planner.js` | globale Beam Search, Schlussaudit, Fingerprint und atomare Übernahme |
| `js/auto-plan-ui.js` | Auto-Plan-Button, Canvas-Visualisierung, Vorschau und Bestätigung |
| `auto-plan.css` | spektakuläre, responsive und bewegungsreduzierbare Auto-Plan-Darstellung |
| `js/picker-view.js` | Picker-Gruppen und lexikografische Sortierung |
| `js/rbn.js` | RBN-Pools |
| `js/holidays.js` | Feiertage Sachsen |
| `js/color-atlas-*` | Monatsfarben und wahrnehmungsbasierte Auswahl |

---

## 11. Tests und Qualitätssicherung

```bash
npm ci
npm run check
npm test
npm run test:e2e
npm run verify
```

Zusätzlich zur bestehenden Regel-, Import-, Speicher-, Farb- und Browserabdeckung prüfen Auto-Plan-Tests:

- vollständige Besetzung aller offenen BD/HG;
- Null rote beziehungsweise graue Vorschläge;
- Unveränderlichkeit des Eingangszustands;
- Schutz vorhandener Fixpunkte;
- deterministische Reproduzierbarkeit;
- Priorisierung positiver Wünsche;
- vollständige Wochenendkopplung;
- atomare Übernahme;
- Fingerprint-Schutz gegen zwischenzeitliche Änderungen;
- Blockierung unlösbarer Monate;
- animierter Browserlauf;
- keine Servermutation vor Bestätigung;
- Speicherung erst nach Klick auf **Vorschläge übernehmen**.

---

## 12. Lokale Entwicklung und Deployment

```bash
npm ci
npm run verify
```

Für die Oberfläche genügt ein statischer Webserver. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung mit den vorgesehenen KV-Bindings.

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt.

---

## 13. Projektstruktur

```text
.
├── index.html
├── styles.css
├── controls.css
├── auto-plan.css
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
│   ├── auto-planner.js
│   ├── auto-plan-ui.js
│   ├── picker-view.js
│   ├── rbn.js
│   ├── holidays.js
│   └── color-atlas-*.js
├── functions/api/
├── tests/
├── docs/
├── package.json
└── playwright.config.js
```

---

## 14. Unveränderliche Grundsätze

- Bestehende Einteilungen bleiben Fixpunkte.
- Auto-Plan verändert ausschließlich leere BD/HG-Felder des sichtbaren Monats.
- RBN wird niemals automatisch geplant.
- Kein Vorschlag wird vor ausdrücklicher Bestätigung geschrieben.
- Auto-Plan verwendet keine roten oder grauen Kandidaten und erzeugt keine Overrides.
- Ein unvollständiger oder nicht regelkonformer Lauf kann nicht übernommen werden.
- Die Regelengine bleibt die einzige fachliche Wahrheitsquelle.
- Positive Hinweise heben Konflikte nicht auf.
- Empfehlungen folgen der dokumentierten Kaskade.
- Relative Fairness wird nicht durch rote Personen verzerrt.
- Der Jahresverlauf bleibt reine Information.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben bleiben deterministisch und kontrastgeprüft.
- Regelwerk, Algorithmus, Tests und Dokumentation werden gemeinsam geändert.
