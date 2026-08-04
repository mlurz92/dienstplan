# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.9.0`  
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** `v9` — *Free Browser Hybrid Constraint Engine*  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · bestehender Workers-KV-Namespace · lokale Browser-Sicherung  
> **Laufende Zusatzkosten der v9-Engine:** keine

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung offener **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden weiterhin manuell geplant.

---

## 1. Funktionsumfang

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Kandidatenlisten mit Grün, Gelb, Orange, Rot und Grau;
- vollständige Begründungen und tastaturfähige Rich Tooltips;
- Abwesenheiten, Dienstwünsche, Optionen, Notizen und Ausnahmeprotokoll;
- personenspezifische BD-, HG- und Gesamtobergrenzen;
- Monatsstatistik, Sollvergleich, Wochenendäquivalente und offene Punkte;
- Excel-/JSON-Import sowie Excel-/PDF-/JSON-Export;
- server-first Synchronisierung mit lokaler Sicherung;
- Auto-Plan Studio für Konfiguration, Live-Beobachtung, Vorschlagsprüfung und kontrollierte Übernahme;
- Hell-/Dunkelmodus mit monatsabhängiger Kontrastfarbe;
- vollständig clientseitige v9-Optimierung ohne Solver-Server.

## 2. Verbindliche Planungsprinzipien

1. Die produktive Regelengine ist die einzige fachliche Wahrheitsquelle.
2. Auto-Plan verändert ausschließlich zuvor leere BD-/HG-Felder des sichtbaren Monats.
3. Fixpunkte, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
4. Graue beziehungsweise technisch nicht wählbare Besetzungen sind in jeder Stufe ausgeschlossen.
5. Personengebundene BD-, HG- und Gesamtobergrenzen gelten in Konstruktion, Reparatur, ALNS und exakter Suche.
6. Null-Rot wird immer vor einem bestätigungspflichtigen Fallback verfolgt.
7. `UNKNOWN` bedeutet nur Zeit-/Knotenlimit und niemals Unlösbarkeit.
8. Rote Vorschläge werden nur nach echtem striktem `INFEASIBLE`-Nachweis zusätzlich angeboten.
9. Bis zur bewussten Übernahme erfolgt keine Mutation des Monatsplans.
10. Vor der Übernahme wird der vollständige Vorschlag erneut mit derselben Regelengine auditiert.
11. Ein v9-Ergebnis darf unter derselben lexikografischen Zielordnung nicht absichtlich schlechter als sein v8.5-Incumbent gewählt werden.
12. Globale Optimalität wird ausschließlich bei vollständig abgeschlossenem Suchraum als `OPTIMAL` bezeichnet.
13. Lokale v8.5-Nachbarschaftsstabilität wird niemals als globaler Beweis ausgegeben.
14. Solverfortschritt und Zwischenzustände werden nicht in KV geschrieben.

---

## 3. Architektur und Nullkostenentscheidung

### 3.1 Zielarchitektur

```text
Cloudflare Pages
├── statische Anwendung
├── Auto-Plan Studio v9
├── produktive Regelengine
├── v8.5 Beam-/ALNS-Engine
├── exakte v9-Constraint-Tiefensuche
└── Modul-Web-Worker
        │
        │ Bootstrap, Lesen und finale Übernahme
        ▼
Pages Functions / bestehender KV-Worker
        ▼
Workers KV
```

Die kombinatorische Suche läuft im Browser. Pages Functions und der KV-Worker übernehmen weiterhin nur kleine API-Aufgaben, Validierung und Persistenz. Es werden keine Cloudflare Containers, Durable Objects, D1, R2, Workflows, Workers AI oder externen Solver-APIs benötigt.

### 3.2 Weshalb die exakte Suche im Browser läuft

Die Anwendung bleibt bewusst innerhalb der kostenlosen Cloudflare-Kontingente. Statische Pages-Assets werden ohne Solver-Server ausgeliefert. Pages Functions und der KV-Worker übernehmen keine langlaufende Optimierung. Dadurch entstehen keine laufenden Solver-, Container- oder Datenbankgebühren.

### 3.3 Entscheidung gegen einen produktiven Community-WASM-Port

Für v9 wurde ein OR-Tools-/CP-SAT-WebAssembly-Port gegen die Projektanforderungen bewertet. Der verfügbare Browser-Port ist jung, nicht offizieller Bestandteil der Google-OR-Tools-Distribution und hätte für die bestehende ungebündelte Pages-Anwendung zusätzliche Binär-, Thread-, Cross-Origin- und Supply-Chain-Risiken eingeführt.

Der Produktionspfad verwendet deshalb den kostenlosen, kontrollierbaren Browserpfad:

- dieselbe JavaScript-Regelengine wie die manuelle Planung;
- v8.5 als schneller Incumbent und Fallback;
- verlustfreie MRV-Constraint-Tiefensuche für globale Nachweise bei beherrschbarer Problemgröße;
- keine native Binärabhängigkeit;
- keine externe Laufzeitverbindung;
- reproduzierbare statische Auslieferung.

Die Solvergrenze ist bewusst ehrlich dokumentiert: Bei großen vollständigen Monatsräumen endet die exakte Suche häufig mit `FEASIBLE` oder `UNKNOWN`, nicht mit einem behaupteten Optimalitätsbeweis.

### 3.4 Additive Auslieferungsgeneration

Der bestehende v8.5-Modulgraph bleibt als stabile Basisschicht erhalten. v9 wird als additive, separat versionierte Modulschicht geladen. Dadurch bleiben bestehende Integrationsverträge funktionsfähig, während die produktive Engine eindeutig als Generation 9 markiert wird. Ein Delivery-Test lässt genau den bisherigen Shell-/v8.5-Token und den v9-Token zu und verhindert vermischte Modulstände innerhalb einer Datei.

---

## 4. Auto-Plan v9

### 4.1 Verbindliche Pipeline

```text
unveränderlicher Monatssnapshot
  → Fixpunkt- und Domänenanalyse
  → v8.5-Konstruktionsportfolio
  → strikte Null-Rot-Eskalation
  → iterative Tausch- und lokale Reparatur
  → adaptive ALNS-Perfektion
  → exakte MRV-Constraint-Tiefensuche
  → unabhängiger Schlussaudit
  → lokale Vorschau
  → ausdrückliche Übernahme
```

Alle Stufen verwenden dasselbe Monatsmodell und dieselbe Regelbewertung. Es existiert keine vereinfachte zweite Regelengine.

### 4.2 v8.5 als Incumbent und Fallback

Die bewährte v8.5-Schicht bleibt vollständig erhalten:

- Beam Search;
- Forward Checking;
- strikte Eskalationswellen;
- exaktes Restbacktracking kleiner Restmengen;
- Einzel-, Paar-, Rollen- und Dreierkettenzüge;
- Tages- und Wochenendpakete;
- lokale Teilneuplanung;
- acht ALNS-Zerstörungsoperatoren;
- mehrere Wiederaufbauoperatoren einschließlich Regret-2;
- adaptive Operatorgewichte;
- Late Acceptance;
- Luby-Neustarts;
- parallele Portfolio-Worker;
- lokaler Nachbarschaftsaudit.

v8.5 erzeugt einen starken Startplan. Fällt die exakte v9-Schicht aus oder ist im Modus **Schnell** deaktiviert, bleibt die Anwendung vollständig funktionsfähig.

### 4.3 Exakte v9-Suche

`js/auto-planner-v9-exact.js` führt eine zeit- und knotenbegrenzte vollständige Tiefensuche aus:

- Minimum-Remaining-Values-Auswahl des nächsten Feldes;
- Domänenbildung ausschließlich über `evaluateCandidate()`;
- Ausschluss grauer und technisch nicht wählbarer Kandidaten;
- Laufgrenzen über `planRespectsLimits()`;
- v8.5-Incumbent als bevorzugte Verzweigungsreihenfolge;
- verlustfreies Forward Checking gegen leere Folgedomänen;
- deduplizierte vollständige Zustände;
- Vergleich über dieselbe lexikografische Zielfunktion;
- Abbruchsignal, Zeitlimit und Knotenlimit;
- gedrosselte Live-Telemetrie;
- unabhängige Materialisierung und Schlussprüfung.

Rote Bewertungen können in einem Teilzustand von noch offenen, später erfüllbaren Kopplungen abhängen. Die produktive strikte v9-Suche entfernt solche Zwischenzweige deshalb **nicht** vorzeitig. Sie enumeriert technisch wählbare rote Zwischenzustände mit, bewertet aber ausschließlich vollständige Monatspläne. Da Rot in der Zielfunktion vor allen weichen Zielen steht, ist das global beste vollständige Ergebnis automatisch Null-Rot, sofern eine Null-Rot-Belegung existiert.

Wird der gesamte relevante Suchraum abgeschlossen, ist das Ergebnis ein globaler Nachweis innerhalb des implementierten Regel- und Zielmodells.

### 4.4 Solverstatus

| Status | Bedeutung |
| --- | --- |
| `OPTIMAL` | Zulässige beste Lösung gefunden und vollständiger Suchraum abgeschlossen. |
| `FEASIBLE` | Zulässige Lösung vorhanden; Zeit-, Knoten- oder First-Feasible-Limit vor vollständigem Nachweis erreicht. |
| `INFEASIBLE` | Vollständiger strikter Suchraum abgeschlossen; keine Null-Rot-Lösung vorhanden. |
| `UNKNOWN` | Limit erreicht, bevor eine Lösung oder ein Unmöglichkeitsnachweis vorlag. |

Der sichtbare Ergebnistext und die Nachweiskarte werden nach jedem Ergebnis aus `metrics.proof` erzeugt. Veraltete Formulierungen wie „global zertifiziert“ werden entfernt, wenn lediglich `FEASIBLE` oder `UNKNOWN` vorliegt.

### 4.5 Strikter Lauf und Minimal-Rot-Fallback

Die produktive Suche verfolgt zuerst Null-Rot. Der exakte Enumerator untersucht dabei verlustfrei alle technisch wählbaren Zwischenzweige und leitet den strikten Status erst aus dem global besten vollständigen Ergebnis ab:

- global bestes vollständiges Ergebnis hat `0` Rot: striktes `OPTIMAL`;
- Suchraum vollständig, global bestes Ergebnis bleibt rot: striktes `INFEASIBLE`;
- Suchraum nicht vollständig: `FEASIBLE` oder `UNKNOWN`, aber kein Unmöglichkeitsnachweis.

Nur nach einem vollständigen strikten `INFEASIBLE`-Nachweis darf der bereits im selben Suchlauf gefundene globale Minimal-Rot-Plan angeboten werden. Ein identischer zweiter Exaktlauf ist nicht erforderlich. Im Diagnosemodus bleibt der rote Fallback gesperrt. `UNKNOWN` öffnet keinen automatischen Rot-Fallback.

### 4.6 Lexikografische Zielordnung

Die Qualitätsreihenfolge bleibt hart priorisiert:

1. Laufgrenzen;
2. graue beziehungsweise nicht wählbare Belegungen;
3. offene Felder;
4. überschrittene Rot-Obergrenze;
5. Rot und besondere rote Ausnahmen;
6. Orange;
7. Gelb;
8. Empfehlungsvektor;
9. Wünsche;
10. BD-Soll und FTE-normalisierte Gesamtlast;
11. HG-Verteilung der Assistenzärzte;
12. Wochenendverteilung;
13. Spannweiten und Varianzen entsprechend dem gewählten Fokus.

Eine bessere Fairness darf niemals einen zusätzlichen harten, roten, orangefarbenen oder gelben Konflikt erkaufen.

### 4.7 Fortschritts- und Gewinnervertrag

- v8.5-Aufbau und -Perfektion werden in den reservierten Bereich bis 80 Prozent abgebildet;
- interne v8.5-Endereignisse werden in der v9-Pipeline nicht als terminal weitergereicht;
- der Runner klemmt den Gesamtfortschritt monoton, sodass die Prozentanzeige nicht zurückspringt;
- die exakte Suche übernimmt den Schlussbereich;
- bei objektiv identischen Plänen gewinnt der stärkere Nachweis;
- ein `OPTIMAL`-Ergebnis kann dadurch nicht von einem später eintreffenden, lediglich heuristischen Gleichstand verdrängt werden.

---

## 5. Solvermodi und Studioparameter

### 5.1 Solvermodus

| Modus | Verhalten |
| --- | --- |
| **Schnell · v8.5 lokal** | Beam-/ALNS-Portfolio ohne globale v9-Tiefensuche. |
| **Hybrid · empfohlen** | v8.5-Incumbent plus ausgewogene exakte Prüfung und Verbesserung. |
| **Exakt · maximales Budget** | Größter Zeitanteil für die vollständige Tiefensuche. |
| **Diagnose · strikt Null-Rot** | Kein roter Fallback; untersucht ausschließlich den strikten Null-Rot-Anspruch. |

Direkte ältere API-Aufrufe ohne v9-Vertrag bleiben aus Kompatibilitätsgründen im schnellen v8.5-Modus. Das Studio überträgt seinen gewählten v9-Vertrag vor dem Start ausdrücklich an Worker und Inline-Fallback.

### 5.2 Nachweisziel

| Ziel | Wirkung |
| --- | --- |
| **Erste gültige Lösung** | Stoppt nach dem ersten zulässigen Ergebnis beziehungsweise übernimmt einen bereits sauberen Incumbent; geringster Exaktanteil. |
| **Hohe Qualität** | Nutzt einen moderaten Anteil des Zeit- und Knotenbudgets für exakte Verbesserung. |
| **Bestmöglich im Zeitrahmen** | Verwendet das ausgewogene Standardbudget bis Zeit- oder Knotenlimit. |
| **Optimum beweisen** | Reserviert deutlich mehr Zeit und Knoten für den Versuch, den Suchraum vollständig abzuschließen. |

Die Ziele sind nicht nur Beschriftungen: Sie verändern Exaktanteil, Knotenlimit und gegebenenfalls das Abbruchverhalten.

### 5.3 Weitere Parameter

- Suchintensität der v8.5-Incumbent-Phase;
- Optimierungsfokus: ausgewogen, Wünsche, Belastung oder Wochenenden;
- gesamter Zeitrahmen;
- Reparaturrunden;
- lokales Neuplanungsbudget;
- Late-Acceptance-Fenster;
- maximale Zahl roter Vorschläge;
- rote Fallbacks;
- personenspezifische BD-/HG-/Gesamtobergrenzen;
- parallele Portfolio-Worker und UI-Reserve.

Alte v8.5-Integrationsmarker bleiben additiv erhalten, die produktive Generation steht separat als v9 bereit.

---

## 6. Auto-Plan Studio v9

### 6.1 Viewportfestes Layout

Das Studio verwendet:

- `100dvh` statt einer starren Fensterhöhe;
- einen gemeinsam scrollbaren Inhaltsbereich zwischen Kopf und Fuß;
- explizite Grid-Zeilen für Phasen, Worker, Phasentheater, Log und Metriken;
- `min-width: 0` und `min-height: 0` an verschachtelten Grid-/Flex-Elementen;
- stabile Scrollbarflächen;
- einspaltige Umordnung bei kleineren Fenstern;
- zwei- beziehungsweise einspaltige Phasenkarten auf schmalen Ansichten.

Damit bleiben Phasenkarten, Protokoll, Kennzahlen, Vorschlagstabelle, Statistik, Bestätigung und Übernahmebutton erreichbar. Eine Browserregression prüft die Dialoggrenzen, Grid-Zeilen und die letzte Phasenkarte bei 1375 × 760 Pixeln.

### 6.2 Wahrheitsgetreue, dauerhaft aktive Animation

Die Visualisierung basiert ausschließlich auf echten Fortschrittsereignissen:

- reale Phasenaktivierung;
- vier unabhängige Portfolio-Lanes;
- Qualitätsimpuls nur bei einer gemeldeten Verbesserung;
- eigener exakter Suchring;
- Knoten-, Lösungs- und Sackgassenzähler;
- Zeitanteilsanzeige;
- finaler Beweisstatus.

Die Animation verändert keine Solverentscheidung. Entsprechend der Produktvorgabe existiert kein Modus für reduzierte Bewegung. Eine zuletzt geladene v9-Motionsschicht hält die vollständige Algorithmusanimation auch dann aktiv, wenn das Betriebssystem `prefers-reduced-motion: reduce` meldet.

### 6.3 Tooltips und Tastaturbedienung

Jedes relevante Konfigurations-, Status- und Ergebnisfeld erhält einen Rich Tooltip oder einen erklärenden Eltern-Tooltip:

- Maus und Tastaturfokus;
- `role="tooltip"`;
- Verknüpfung über `aria-describedby`;
- Schließen mit `Escape`;
- automatische Positionierung;
- Tooltips für Solvermodus, Nachweisziel, Zeitrahmen, Limits, Phasen, Worker, Metriken, Protokoll und Übernahme;
- generierte Erklärungen für dynamisch eingefügte Tabellen- und Kennzahlenfelder;
- MutationObserver für nachträglich gerenderte Elemente.

### 6.4 Ergebnisnachweis

Die Ergebnisansicht zeigt getrennt:

- Solverstatus;
- global vollständig oder zeitbegrenzt;
- Null-Rot- oder Minimal-Rot-Nachweis;
- Abbruchursache;
- untersuchte Knoten;
- gefundene vollständige Lösungen;
- Kostenmodell `0 €`;
- Regel-Audit und rote Einzelbestätigung.

`js/auto-plan-v9-truth.js` ersetzt mehrdeutige v8.5-Kurztexte durch die tatsächlich belegte v9-Semantik. `FEASIBLE` wird als zulässige, aber nicht global bewiesene Lösung bezeichnet; `UNKNOWN` bleibt ein offener Zeit-/Knotenabbruch.

---

## 7. Command Bar und Erscheinungsbild

### 7.1 Pictogrammbasierte Befehlsleiste

Die Werkzeugleiste ist semantisch in Planung, Daten und Ausgabe gegliedert. Beschriftungen werden nur gezeigt, wenn die gemessene Containerbreite dies zulässt. Theme-Schalter und Einstellungen bleiben dauerhaft erreichbar.

### 7.2 Hell-/Dunkelmodus

Die Auswahl wird lokal vor Abschluss des Bootstraps angewendet. Die Monatsfarbe bleibt Akzentquelle für Fokus, Glasränder, Wochenenden, Feiertage, Auto-Plan und Statuszustände.

### 7.3 Dunkle Diensttabelle v9

`app-v9.css` definiert für die Diensttabelle:

- helle Primär- und Sekundärschrift;
- eigenständige dunkle Zell- und Alternierungsflächen;
- kontrastreiche Kopfzeilen;
- klar getrennte Gitterlinien;
- lesbare Samstag-, Sonntag- und Feiertagszeilen;
- kontrastgehärtete Buttons und Picker;
- sichtbare Fokusindikatoren;
- lesbare semantische Grün-/Gelb-/Orange-/Rot-/Grau-Texte;
- `forced-colors`-Fallback.

Die Browserregression misst für eine normale Tabellenzelle mindestens ein Kontrastverhältnis von 4,5:1.

---

## 8. Performance und Stabilität

- Konstruktion, ALNS und exakte Suche in Modul-Web-Workern;
- nur der erste Perfektionsstrang führt die globale exakte Suche aus;
- weitere Stränge liefern diversifizierte ALNS-Incumbents;
- UI-Kerne bleiben reserviert;
- gedrosselte Fortschrittsnachrichten;
- monotoner Gesamtfortschritt;
- Abbruch durch Workerbeendigung beziehungsweise Abort-Signal;
- `requestAnimationFrame()` für visuelle Aktualisierungen;
- passive Scroll-Listener;
- `contain` und `content-visibility` für große Bereiche;
- compositorfreundliche Animationen;
- keine Mutation des produktiven Monats während der Suche;
- idempotente UI-, Observer- und Tooltipinstallation;
- vollständiger Inline-Fallback, falls Web Worker nicht verfügbar ist;
- stärkerer Nachweis als Tiebreak bei identischem Zielvektor.

---

## 9. Datenmodell und Persistenz

### 9.1 Monatsobjekt

Ein Monatsobjekt enthält unter anderem:

- `schemaVersion`;
- `year`, `month`;
- `revision`, `updatedAt`;
- Tageswerte für BD, HG, RBN, zweite RBN und Notizen;
- Abwesenheiten und Quellen;
- Wünsche und Optionen;
- Ausnahme- und Importprotokolle.

### 9.2 Planungsresultat v9

Ein v9-Ergebnis enthält zusätzlich:

- Engine- und Algorithmusrevision;
- Ausgangsfingerprint;
- normalisierte Laufkonfiguration;
- Solverstatus und Beweisumfang;
- Kennzeichnung `global-strict`, `global-relaxed`, `feasible-incumbent` oder `unresolved`;
- exakte Suchmetriken;
- vollständigen Zielvektor;
- geplanten Monat;
- Änderungsliste;
- Regel-Audit;
- rote Einzelverletzungen;
- Fairness- und Wunschmetriken.

### 9.3 Workers KV

KV bleibt für den aktuellen Nutzungskontext geeignet, weil die Daten klein und überwiegend lesend genutzt werden. Nicht in KV geschrieben werden:

- laufende Solverfortschritte;
- Zwischenzustände;
- jeder ALNS-Zug;
- umfangreiche Suchlogs.

Gespeichert werden nur fachliche Daten und die finale bestätigte Monatsänderung.

KV ist eventual consistent. Gleichzeitige Schreibvorgänge auf denselben Schlüssel können einander überschreiben; die zuletzt ankommende Schreiboperation gewinnt. Änderungen können an anderen Standorten verzögert sichtbar sein. Die Anwendung reduziert dieses Risiko durch Revisionsstände, Dirty-Marker, server-first Abgleich und eine einzelne finale Übernahme. KV allein stellt jedoch keine globale atomare Compare-and-Swap-Garantie bereit.

---

## 10. Import, Export und Sicherung

### 10.1 Excel

- Import vorhandener Jahres-/Monatsdaten;
- Erhalt unbekannter Altbelegungen als externe Zuweisung;
- Export der sichtbaren Planung und Statistik.

### 10.2 JSON

- vollständige lokale Sicherung;
- Import mit Schema- und Plausibilitätsprüfung;
- geeignet für Backup, Übertragung und Wiederherstellung.

### 10.3 PDF

- druckoptimierte Monatsansicht;
- sichtbare Dienste, Abwesenheiten, Wünsche und Statistik;
- unabhängige Druckfarben und Seitenumbrüche.

Empfehlung: Vor größeren Stammdaten-, Import- oder Regeländerungen einen JSON-Export sichern.

---

## 11. Lokale Entwicklung

Voraussetzungen:

- Node.js 24;
- npm;
- Chromium für Playwright.

```bash
npm ci
npm run check
npm run check:v9
npm test
npx playwright install chromium
npm run test:e2e
```

Vollständiges Gate:

```bash
npm run verify
```

Ein einfacher lokaler Server genügt für die statischen Browserprüfungen:

```bash
python3 -m http.server 4173
```

---

## 12. Tests und Qualitätssicherung

### 12.1 Syntax- und Vertragsprüfung

`npm run check` prüft sämtliche produktiven JavaScriptmodule. `npm run check:v9` prüft zusätzlich explizit:

- v9-Exact-Solver;
- v9-Orchestrierung;
- v9-Studio;
- Schichtenvertrag;
- eindeutige Ergebnis- und Nachweissprache;
- Always-Motion-Lader;
- Shellintegration;
- v9-Unit- und Browsertests.

### 12.2 Modultests

- Regelengine und Regelberichte;
- Import, Export und Persistenz;
- Auto-Plan-Invarianten und Fixpunktschutz;
- lexikografische Zielordnung;
- v8.5-Regressionen;
- v9-Revisions- und Phasenvertrag;
- Solvermodus-/Nachweiszielableitung;
- voneinander verschiedene Zeit-/Knotenbudgets der Nachweisziele;
- Statussemantik;
- funktionaler globaler Kleinproblemnachweis;
- verlustfreie Behandlung roter Zwischenzweige;
- strikte Fallbackreihenfolge;
- monotone Fortschrittsabbildung;
- Nullkostenarchitektur;
- Studio-, Kontrast-, Layout-, Wahrheits- und Animationsverträge.

### 12.3 Browsertests

- vollständiger Browser-Bootstrap;
- Monatsplanung und Picker;
- Batchverwaltung und Druck;
- Command-Bar-Dichte;
- Auto-Plan Konfiguration, Lauf, Abbruch, Vorschau und Übernahme;
- kleine Fensterhöhen und Scrollbarkeit;
- v9-Viewportgrenzen;
- sieben v9-Phasenkarten ohne Abschneiden;
- Rich Tooltips per Fokus und `Escape`;
- vollständige Tooltipabdeckung sichtbarer Studiofelder;
- gemessener Dunkelmoduskontrast;
- eindeutige `FEASIBLE`-Ergebnissprache ohne falsche Zertifizierung;
- dauerhaft aktive Animation auch unter emulierter OS-Reduktionspräferenz;
- Legacy-v8.5-Integrationsvertrag.

### 12.4 CI

GitHub Actions verwendet:

- `actions/checkout@v6`;
- `actions/setup-node@v6` mit Node 24 und npm-Cache;
- `npm ci`;
- `npm run check`;
- `npm run check:v9`;
- vollständige Node-Tests;
- Chromium-/Playwright-Regressionen;
- Diagnoseartefakte bei Erfolg und Fehler.

Veraltete Läufe desselben Branches werden durch die Concurrency-Gruppe abgebrochen.

---

## 13. Cloudflare-Betrieb

### 13.1 Pages

Cloudflare Pages wird direkt aus dem Repository-Root ausgeliefert. Es ist kein kostenpflichtiger Build- oder Solverdienst erforderlich.

### 13.2 Functions und Binding

Das KV-Binding lautet:

```text
DIENSTPLAN_KV
```

Pages Functions stellen Bootstrap-, Monats-, Personal-, RBN-, Einstellungs-, Import- und Exportendpunkte bereit.

### 13.3 Umgebungen

Empfohlen:

- lokaler Entwicklungsstand;
- Cloudflare Preview Deployment pro Pull Request;
- Produktion aus `main`.

Secrets dürfen weder in Quellcode noch in exportierten Sicherungen abgelegt werden.

### 13.4 Free-Plan-Budget

Die v9-Engine erzeugt keine serverseitige Solverlast. Für die vorhandene Größenordnung sind die kostenlosen Pages-/Workers-/KV-Kontingente vorgesehen. Bei Überschreitung eines Cloudflare-Free-Limits schlagen weitere Operationen fehl; die Anwendung erzeugt keine automatische kostenpflichtige Hochstufung.

---

## 14. Projektstruktur v9

```text
js/auto-planner.js                       produktiver Export auf v9
js/auto-planner-v9.js                    Hybrid-Orchestrierung, strikter Suchvertrag und Solverstatus
js/auto-planner-v9-exact.js              rohe exakte MRV-Constraint-Tiefensuche
js/auto-planner-v8-5.js                  Incumbent, Eskalation und Fallback
js/auto-planner-v8.js                    ALNS-/VNS-Perfektionsbasis
js/auto-planner-engine.js                gemeinsames Modell, Zielordnung und Audit
js/auto-plan-runner.js                   Workerportfolio, Fortschritt und Nachweis-Tiebreak
js/auto-plan-worker.js                   Modul-Worker-Einstieg
js/auto-plan-studio-v9.js                v9-Steuerung, Telemetrie und Tooltips
js/auto-plan-studio-v9-contract.js       additiver v8.5/v9-Integrationsvertrag
js/auto-plan-v9-truth.js                 eindeutige sichtbare Nachweissprache
js/auto-plan-v9-motion.js                Lader der dauerhaft aktiven Animation
js/auto-plan-studio-v8-5.js              bewährte Studio-Basisschicht
js/rich-tooltip-v8-5.js                  zentrale ARIA-Tooltips
js/ui-v9.js                              additive v9-Shellintegration
auto-plan-studio-v9.css                  v9-HUD, Telemetrie und Ergebnisdarstellung
auto-plan-studio-v9-contract.css         viewportfestes Schichtenlayout
auto-plan-studio-v9-always-motion.css    vollständige Animation ohne Reduktionsmodus
app-v9.css                                Dunkelmodus- und Fokuskontrast
tests/auto-plan-v9.test.js               v9-Solver- und Architekturverträge
tests/e2e/auto-plan-v9.spec.js           Layout-, Tooltip-, Wahrheits-, Animations- und Kontrastregressionen
```

---

## 15. Release 0.9.0

### Engine

- produktiver Export auf Auto-Plan v9;
- v8.5 als schneller Incumbent und vollständiger Fallback;
- exakte zeit-/knotenbegrenzte MRV-Tiefensuche im Browser;
- verlustfreie strikte Suche über technisch wählbare Zwischenzustände;
- ehrliche Statuswerte `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN`;
- Minimal-Rot-Ausgabe nur nach vollständigem Null-Rot-Unlösbarkeitsnachweis;
- unterschiedliche Budgets für alle Nachweisziele;
- monotone Fortschrittsabbildung;
- stärkerer Nachweis als Gleichstandsentscheidung;
- globale Nachweiskennzeichnung nur bei vollständig beendetem Suchraum;
- keine kostenpflichtige Solver- oder Cloudkomponente.

### Studio

- Solvermodus und Nachweisziel;
- sieben reale Phasen;
- exakte Knoten-, Lösungs- und Sackgassentelemetrie;
- finaler wahrheitsgetreuer Beweisstatus;
- überarbeitete energie- und qualitätsabhängige Animation;
- vollständige Animation ohne Reduktionsmodus;
- flächendeckende Rich Tooltips;
- korrektes Scroll- und Responsive-Verhalten;
- keine abgeschnittenen Phasenkarten oder Ergebnisbereiche.

### Oberfläche

- kontrastgehärtete Diensttabelle im Dunkelmodus;
- klare Wochenend- und Feiertagsabstufungen;
- sichtbare Fokusindikatoren;
- Forced-Colors-Fallback;
- eindeutige Ergebnis- und Nachweissprache.

### Qualität

- Paketversion `0.9.0`;
- separates `check:v9`;
- funktionaler Exakt-Solver-Test;
- neue Unit- und Playwright-Regressionen;
- CI mit Node 24, Chromium und Diagnoseartefakten;
- v8.5-Kompatibilitätstests bleiben erhalten;
- Delivery-Test für atomare v8.5-/v9-Modulgenerationen.

---

## 16. Bekannte Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein.
- Die exakte Suche kann bei großen Monatsproblemen ihr Zeit- oder Knotenlimit erreichen.
- `FEASIBLE` ist eine gültige Lösung, aber kein globaler Optimalitätsbeweis.
- `UNKNOWN` ist weder ein Machbarkeits- noch ein Unmöglichkeitsnachweis.
- Die JavaScript-Tiefensuche ist bei sehr großen Suchräumen langsamer als ein nativer CP-SAT-Prozess; sie wurde zugunsten der kostenlosen, statischen und kontrollierbaren Zielarchitektur gewählt.
- v8.5-Zertifizierung bleibt ein lokaler Nachbarschaftsnachweis.
- Workers KV ist eventual consistent und nicht für globale atomare Konkurrenzkoordination geeignet.
- RBN und zweite RBN bleiben manuell.
- Browserleistung, Kernzahl und Speicherdruck beeinflussen die erreichbare Suchtiefe.
- Die vollständige Animation bleibt gemäß Produktvorgabe auch bei einer Betriebssystempräferenz für reduzierte Bewegung aktiv.
