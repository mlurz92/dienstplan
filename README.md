# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle mit wechselnden Monatsfarben" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.3.0`  
> **Regelwerk:** Eignungsregeln `v4.8` mit gestuftem Override-, Prioritäts- und Auto-Plan-Modell  
> **Auto-Plan:** deterministische BD/HG-Optimierung mit vertiefter Null-Rot-Suche, bestätigungspflichtigem Minimal-Rot-Fallback und vollständiger Vorschau  
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

Der Button **Auto-Plan** verteilt ausschließlich noch leere BD- und HG-Felder des sichtbaren Monats. Der Algorithmus schreibt während der Berechnung nichts in den Plan. Nach dem Lauf erscheint eine vollständig scrollbar prüfbare Vorschau; erst **Vorschläge übernehmen** führt die atomare Änderung aus.

Unverändert bleiben:

- bestehende BD- und HG-Einteilungen;
- RBN und zweite RBN;
- Abwesenheiten, Wünsche und Optionen;
- Notizen;
- bestehende Override- und Importprotokolle.

Der Auto-Plan versucht zuerst eine vollständige Variante ohne rote Regelverletzung. Ist diese auch nach einer vertieften Suche nicht erreichbar, kann eine vollständige **Minimal-Rot-Variante** vorgeschlagen werden. Sie bleibt gesperrt, bis sämtliche roten Zuteilungen und Gründe sichtbar geprüft und ausdrücklich bestätigt wurden. Graue beziehungsweise technisch nicht wählbare Sperren werden niemals verwendet.

---

## 2. Auto-Plan-Algorithmus

### 2.1 Verbindliche Regelinstanz

Der Auto-Planer besitzt keine parallele oder vereinfachte Regelkopie. Für jede hypothetische Einteilung wird die bestehende Funktion `evaluateCandidate()` auf dem jeweiligen simulierten Monatszustand ausgeführt.

**In allen Suchstufen absolut ausgeschlossen** sind:

- sämtliche grauen oder technisch nicht wählbaren Kandidaten;
- fehlende Qualifikation;
- nicht aktive oder nicht planbare Personen;
- gleichzeitiger BD und HG derselben Person;
- unmittelbar aufeinanderfolgende eigene BD;
- unbekannte oder strukturell ungültige Personalwerte.

**Nur im gesonderten Minimal-Rot-Fallback zulässig** sind technisch wählbare rote Kandidaten, beispielsweise:

- Abwesenheiten und Polednia-Sperren mit besonderer Bestätigung;
- harte BD-Maxima mit besonderer Bestätigung;
- organisatorisch bestätigbare Kopplungs- oder Verteilungsabweichungen;
- sonstige rote, aber ausdrücklich überschreibbare Planabweichungen.

Der Auto-Plan erzeugt keine stillen Ausnahmen. Bei bestätigter Minimal-Rot-Übernahme wird jede rote Zelle einzeln im Override-Protokoll mit Zeitstempel, Gründen, Bestätigungstyp, Quelle und optionalem Kommentar dokumentiert.

### 2.2 Globale Suche statt Tages-Greedy

Die Planung erfolgt als deterministische mehrstufige **Beam Search**:

1. Schutz und Analyse aller bestehenden Fixpunkte;
2. reguläre globale Null-Rot-Suche;
3. bei Bedarf vertiefte Null-Rot-Suche mit verbreitertem Suchstrahl;
4. nur bei erneutem Scheitern globale Minimal-Rot-Suche;
5. je Suchlauf globale Verteilung der offenen BD;
6. anschließende globale Verteilung der offenen HG auf dem simulierten BD-Plan;
7. Fairness-Politur der überlebenden Gesamtvarianten;
8. vollständiger Schlussaudit aller vorgeschlagenen Einteilungen.

Dienstfelder mit kleiner Kandidatendomäne und kritischen Wochenendkopplungen werden zuerst bearbeitet. Je Dienstfeld werden mehrere Kandidatenvarianten weiterverfolgt. Dadurch kann eine lokal attraktive Auswahl verworfen werden, wenn sie spätere Kopplungen, Wochenenden oder den Monatsausgleich verschlechtert. Die Suche hält parallel mehrere globale Planvarianten offen und reduziert sie nach jedem Schritt auf die fachlich besten, voneinander verschiedenen Zustände.

### 2.3 Lexikografische Optimierung

Die Zielordnung ist bewusst nicht als intransparente freie Punktsumme implementiert.

**Null-Rot-Suche:**

1. keine grauen Vorschläge;
2. vollständige Besetzung aller offenen Felder;
3. keine roten Vorschläge;
4. möglichst wenige orange, danach gelbe Konstellationen;
5. deterministische Kopplungen;
6. positive Dienstwünsche;
7. Optionen `BD möglich` beziehungsweise `HG möglich`;
8. BD-Sollausgleich;
9. kombinierter BD/HG-Ausgleich;
10. sekundärer AA-HG-Ausgleich;
11. Wochenend- und Samstagsrotation;
12. sonstige positive Empfehlungen;
13. deterministische stabile Tie-Breaks.

**Minimal-Rot-Fallback:**

1. keine grauen Vorschläge;
2. vollständige Besetzung aller offenen Felder;
3. minimale Zahl roter Zuteilungen;
4. bei Gleichstand minimale Zahl besonders bestätigungspflichtiger roter Zuteilungen;
5. anschließend dieselbe Qualitäts-, Wunsch- und Fairnesskaskade wie oben.

Ein höherrangiges Signal kann nicht durch eine beliebige Summe niedrigerer Signale verdrängt werden.

### 2.4 Fairnessdimensionen

Die globale Bewertung berücksichtigt:

- individuellen BD-Richtwert und Überhänge;
- definierte abweichende Sollwerte;
- harte BD-Maxima;
- kombinierte Monatslast `BD + HG` der HG-berechtigten Facharztgruppe;
- Zahl belastender HG zu Assistenzarzt-BD;
- Wochenendäquivalente;
- Rotation der Samstags-BD;
- Oster-/Pfingstblock;
- positive Wünsche und Optionen;
- Urlaubsverlängerer;
- bestehende Einteilungen als vorgegebene Last.

Aktivität, HG-Berechtigung, Samstagsberechtigung und Beförderungen werden am konkreten Diensttag ausgewertet. Damit wird etwa El Houba ab dem **22.09.2026** exakt ab diesem Datum als Facharzt mit HG- und Samstagsberechtigung berücksichtigt, nicht pauschal für den gesamten Monat.

Der Jahresverlauf bleibt wie im manuellen Picker ein reiner Kontexthinweis und beeinflusst die automatische Rangfolge nicht.

### 2.5 Kopplungen

Die Suchreihenfolge plant zunächst BD und anschließend HG. Dadurch können die deterministischen Gegenposten auf dem vollständigen simulierten BD-Plan aufgebaut werden:

- AA-BD am Freitag: Freitag-HG = Samstags-BD;
- Facharzt-BD am Samstag: Sonntag-HG = Samstags-BD;
- AA-BD am Feiertagsvortag: Vortags-HG = Feiertags-BD.

Der Schlussaudit bewertet anschließend jede vorgeschlagene Zelle erneut im vollständigen Endzustand. Widersprüchliche, aber technisch bestätigbare Kopplungen können ausschließlich als deutlich ausgewiesene Minimal-Rot-Ausnahme erscheinen.

### 2.6 Atomare Übernahme und Schutz vor veralteten Vorschlägen

Beim Start wird ein deterministischer Planungsfingerprint gebildet. Er umfasst:

- Monat, Schema, Revision und Zeitstempel;
- sämtliche BD/HG-Fixpunkte;
- Abwesenheiten, Wünsche und Optionen;
- die aktuelle Personaldefinition einschließlich Aktivitäts- und Beförderungsdaten;
- alle geladenen Monatsstände, soweit sie für monatsübergreifende Regeln relevant sein können.

Unmittelbar vor der Übernahme werden Fingerprint, Feldbelegung und sämtliche vorgeschlagenen Zellen erneut vollständig geprüft.

Die Übernahme wird verweigert, wenn:

- Planungsdaten, Personal oder geladene Nachbarmonate zwischen Berechnung und Bestätigung verändert wurden;
- ein vorgeschlagenes Feld zwischenzeitlich belegt wurde;
- ein Vorschlag doppelt, manipuliert oder strukturell ungültig ist;
- der erneute Audit eine graue beziehungsweise nicht überschreibbare Besetzung erkennt;
- offene Felder verblieben sind;
- rote Zuteilungen vorliegen, ohne dass die Minimal-Rot-Bestätigung erteilt wurde.

Erst danach werden alle Änderungen in einer einzigen lokalen Monatsmutation übernommen und synchronisiert.

---

## 3. Animierter Optimierungslauf und Prüfoberfläche

Der Auto-Plan-Lauf besitzt eine eigenständige, performante Visualisierung:

- Canvas-basierte Constraint-Konstellation mit bis zu 62 BD/HG-Knoten;
- animierte Verbindungen zwischen bereits bewerteten Dienstfeldern;
- pulsierender Fortschrittskern;
- Phasenanzeige für Fixpunkte, BD, HG, Fairness und Audit;
- sichtbare Suchstufen für reguläre, vertiefte und gegebenenfalls Minimal-Rot-Suche;
- Live-Anzeige von Kandidatenzahl, Beam-Varianten, Fixpunkten und offenen Feldern;
- progressive Dienstfeldmatrix;
- abschließende Ergebnisinszenierung mit Audit-, Fairness-, Wunsch- und Hinweiskarten;
- vollständige Vorschlagsliste;
- Vorher-Nachher-Verteilungsbild je Person;
- bei Bedarf vollständige Liste jeder roten Zuteilung mit sämtlichen Gründen und Bestätigungstyp.

Die Berechnung gibt zwischen den Dienstfeldern an den Browser zurück. Animation, Eingaben und Abbruch bleiben dadurch responsiv. Die Auto-Plan-Inszenierung läuft regulär mit der vollständigen Animation.

Die Ergebnisansicht verwendet einen echten, höhengebundenen Haupt-Scrollbereich:

- Kopfzeile und untere Aktionsleiste bleiben sichtbar;
- sämtliche konkreten Zuteilungen sind vollständig erreichbar;
- die vollständige BD/HG-/Wochenendstatistik bleibt einsehbar;
- rote Gründe, Kommentarfeld und Bestätigung bleiben auch bei kleinen Fenstern erreichbar;
- die inneren Listen schneiden keine Einträge mehr ab.

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
| **Bestätigung nötig** | roter, überschreibbarer Konflikt |
| **Nicht verfügbar** | fachlich oder strukturell nicht überschreibbar |

Die kompakte Kandidatenzeile zeigt Gründe in der Reihenfolge rot, orange, gelb, positive Empfehlung, neutraler Hinweis.

---

## 5. Konflikt- und Bestätigungsmodell

### Nicht überschreibbar

- fehlende Qualifikation;
- nicht aktive oder nicht planbare Person;
- gleichzeitige Einteilung derselben Person in BD und HG;
- eigener BD am unmittelbar vorhergehenden oder folgenden Kalendertag.

Diese Fälle bleiben auch im Minimal-Rot-Fallback absolut ausgeschlossen.

### Besondere rote Bestätigung

- eingetragene oder abgeleitete Abwesenheit;
- Polednia-Sperre Dienstag oder Sonntag;
- hartes BD-Monatsmaximum.

Diese Sonderfälle werden in den Null-Rot-Suchen ausgeschlossen. Sie dürfen nur dann in einer vollständigen Minimal-Rot-Variante erscheinen, wenn keine saubere Komplettbelegung gefunden wurde, und benötigen vor der Übernahme eine ausdrückliche besondere Bestätigung.

### Normale rote Planabweichung

Organisatorisch lösbare rote Konflikte können manuell bestätigt werden. Im Auto-Plan bleiben sie in den Null-Rot-Suchen ausgeschlossen und können ausschließlich im deutlich ausgewiesenen Minimal-Rot-Fallback erscheinen.

Bestätigte manuelle und automatische Ausnahmen bleiben unter **Offene Punkte** revisionssicher sichtbar.

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
| `js/auto-planner.js` | Null-Rot-/Minimal-Rot-Beam-Search, Schlussaudit, Planungsfingerprint und atomare Übernahme |
| `js/auto-plan-ui.js` | Auto-Plan-Button, Canvas-Visualisierung, scrollbare Vorschau und Bestätigung |
| `auto-plan.css` | animierte Grunddarstellung des Auto-Plan Studios |
| `auto-plan-review.css` | Minimal-Rot-Prüfung, feste Dialoggeometrie und vollständiger Ergebnis-Scrollbereich |
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
- strikte Null-Rot-Priorität;
- bestätigungspflichtigen Minimal-Rot-Fallback;
- absolute Sperre grauer oder technisch nicht wählbarer Kandidaten;
- Unveränderlichkeit des Eingangszustands;
- Schutz vorhandener Fixpunkte;
- deterministische Reproduzierbarkeit;
- Priorisierung positiver Wünsche;
- vollständige Wochenendkopplung;
- zeitabhängige Beförderung und Qualifikation;
- atomare Übernahme;
- vollständigen Planungsfingerprint einschließlich Personal, Markierungen und geladenen Nachbarmonaten;
- erneuten vollständigen Audit unmittelbar vor der Übernahme;
- Erkennung manipulierter Vorschläge;
- Override-Protokollierung jeder bestätigten roten Zelle;
- Blockierung selbst im Fallback unlösbarer Monate;
- animierten Browserlauf;
- keine Servermutation vor Bestätigung;
- Speicherung erst nach Klick auf **Vorschläge übernehmen**;
- vollständige Scrollbarkeit von Zuteilungen und Statistik bei geringer Fensterhöhe.

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
├── auto-plan-review.css
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
- Eine vollständige Null-Rot-Variante besitzt immer Vorrang.
- Rote Kandidaten dürfen nur im gesonderten Minimal-Rot-Fallback verwendet werden und benötigen eine ausdrückliche Bestätigung.
- Graue oder technisch nicht wählbare Kandidaten bleiben in jeder Suchstufe ausgeschlossen.
- Jede bestätigte rote Auto-Plan-Zelle wird revisionsfest protokolliert.
- Ein unvollständiger oder technisch nicht wählbarer Lauf kann nicht übernommen werden.
- Die Regelengine bleibt die einzige fachliche Wahrheitsquelle.
- Positive Hinweise heben Konflikte nicht auf.
- Empfehlungen folgen der dokumentierten Kaskade.
- Relative Fairness wird nicht durch rote Personen verzerrt.
- Zeitabhängige Aktivität und Qualifikation werden am konkreten Datum ausgewertet.
- Der Jahresverlauf bleibt reine Information.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben bleiben deterministisch und kontrastgeprüft.
- Regelwerk, Algorithmus, Tests und Dokumentation werden gemeinsam geändert.