# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.5.1`<br>
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** Algorithmus `v6` mit Null-Rot-Guardrail, adaptiver Strict-Rescue, iterativer Tauschreparatur, ALNS-Perfektion und Zertifizierung  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD verbindet eine bewusst kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung aller offenen **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden nicht automatisch geplant.

---

## 1. Leitprinzipien

- Die produktive Regelengine ist die einzige fachliche Wahrheitsquelle.
- Auto-Plan verändert ausschließlich leere BD- und HG-Felder des sichtbaren Monats.
- Vorhandene BD/HG, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
- Während Konfiguration und Berechnung wird nichts in den sichtbaren oder gespeicherten Plan geschrieben.
- Erst **Vorschläge übernehmen** führt nach einem erneuten vollständigen Audit zu einer atomaren Monatsmutation.
- Graue beziehungsweise technisch nicht wählbare Besetzungen werden in keiner Suchstufe zugelassen.
- Harte personengebundene Laufobergrenzen gelten auch in jedem Fallback.
- Rote Abweichungen dürfen nur nach vollständig ausgeschöpfter strikter Suche und ausdrücklicher Freigabe erscheinen.
- Jede bestätigte rote Auto-Plan-Ausnahme wird revisionsfest protokolliert.

---

## 2. Funktionsumfang

### Monatsplanung

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Vorschlagslisten mit Grün/Gelb/Orange/Rot/Grau;
- vollständige Begründungen und Bestätigungspfad für rote Ausnahmen;
- Abwesenheiten, Dienstwünsche, Optionen und Freitextnotizen;
- Monatsstatistik, Sollvergleich und offene Punkte;
- Sachsen-Feiertage;
- Excel-, PDF- und JSON-Export;
- Excel- und JSON-Import;
- Cloud-Synchronisierung mit lokaler Fallback-Sicherung.

### Auto-Plan Studio

Das Studio besitzt drei getrennte Arbeitsphasen in einem einzigen durchgehend scrollbaren Dialog:

1. **Konfiguration**
2. **animierter Optimierungslauf**
3. **vollständige Prüfung und bewusste Übernahme**

Konfigurierbar sind:

- Suchintensität `Standard`, `Tief` oder `Maximum`;
- Optimierungsschwerpunkt `Ausgewogen`, `Wünsche`, `Lastenausgleich` oder `Wochenenden`;
- Zeitrahmen der Perfektionsphase;
- iterative Reparaturrunden;
- lokales Neuplanungsbudget;
- Late-Acceptance-Fenster;
- Aktivierung der Perfektionsphase;
- Freigabe des Minimal-Rot-Fallbacks;
- maximale Zahl roter Vorschläge;
- maximale BD-, HG- und Gesamtzahl je Mitarbeitendem.

Alle Felder besitzen erklärende, tastaturfähige Tooltips. Die Mitarbeitendentabelle zeigt vorhandene Dienste und Laufobergrenzen gemeinsam. Die Konfiguration wird vor dem Start vollständig validiert.

---

## 3. Null-Rot-Guardrail v6

### 3.1 Eskalationsfolge

Der Algorithmus darf nicht unmittelbar von einer erfolglosen Standardsuche in rote Vorschläge wechseln.

```text
1. reguläre strikte Null-Rot-Suche
           │
           ├─ vollständig → iterative Reparatur und Perfektion
           │
           └─ nicht vollständig
                    │
                    ▼
2. adaptive Null-Rot-Rescue
   - größerer Suchstrahl
   - breiterer Kandidatenfächer
   - höheres Backtracking-Budget
   - ausschließlich strikte Profile
                    │
                    ├─ vollständig → iterative Reparatur und Perfektion
                    │
                    └─ nicht vollständig
                             │
                             ├─ Fallback deaktiviert → keine Übernahme
                             └─ Fallback freigegeben
                                      │
                                      ▼
3. Minimal-Rot-Fallback als letzte Eskalation
```

Damit wird Rot nicht als Optimierungsabkürzung, sondern ausschließlich als nachgelagerte, bestätigungspflichtige Ausnahme behandelt.

### 3.2 Partielle Konfigurationen

`mergeAutoPlanRunConfig()` ergänzt partielle Integrations- oder Testkonfigurationen um sämtliche abgeleiteten Standardgrenzen. Relevant ist insbesondere:

- Personen ohne datumsabhängige HG-Qualifikation erhalten standardmäßig `maxHg = 0`;
- ein ausgelassener Wert (`undefined`) übernimmt den Standard;
- ein ausdrücklich gesetztes `null` hebt die zusätzliche Laufgrenze bewusst auf;
- bereits gesetzte Fixpunkte zählen auf jede Grenze;
- eine Grenze unterhalb des vorhandenen Bestands wird vor dem Lauf abgewiesen.

### 3.3 Ergebniskennzahlen

`metrics.zeroRedRescue` dokumentiert:

- ob die Rescue ausgeführt wurde;
- ob sie eine vollständige Null-Rot-Lösung fand;
- ihre Laufzeit;
- Zahl roter beziehungsweise offener Felder vor der Rescue.

Der Suchprofiltext weist die Rescue ebenfalls aus.

---

## 4. Algorithmusarchitektur

### 4.1 Pipeline

```text
Ausgangsmonat
    │
    ├─ Konstruktion
    │   Beam Search · MRV · Forward Checking · strikte Profile
    │
    ├─ Null-Rot-Rescue v6
    │   verbreiterte Strict-Suche vor jedem Fallback
    │
    ├─ iterative Tauschreparatur
    │   Einzelumsetzung · Paartausch · Dreierkette · Tagespaket · lokale Neuplanung
    │
    ├─ Perfektionsphase
    │   Adaptive Large Neighborhood Search
    │   Ruin-and-Recreate · Late Acceptance · absteigende Nachbarschaften
    │
    └─ Zertifizierung und Schlussaudit
        vollständige Einzelumsetzungen und Paartausche
```

### 4.2 Konstruktion

Die Konstruktion verarbeitet ausschließlich Slots, die im Ausgangsmonat leer waren. Für jeden Zwischenzustand werden:

- technisch nicht wählbare Kandidaten entfernt;
- strikte Profile zusätzlich von roten Kandidaten bereinigt;
- personengebundene Obergrenzen geprüft;
- die aktuell engsten Domänen bevorzugt;
- Kandidaten anhand Regelstufe, Empfehlungsvektor und Last sortiert;
- künftige Sackgassen durch Forward Checking verworfen;
- nur die besten entdoppelten Varianten im Suchstrahl behalten.

Die Zielordnung ist lexikografisch. Harte Kriterien dominieren jede weiche Qualität:

1. Laufobergrenzen
2. graue/nicht wählbare Einträge
3. offene Felder
4. Überschreitung der Rot-Obergrenze
5. rote Einträge
6. besonders bestätigungspflichtige rote Einträge
7. orange Einträge
8. gelbe Einträge
9. Schwerpunkt und Empfehlungsvektor
10. Wünsche
11. BD-Soll, Gesamtlast, AA-HG und Wochenenden

### 4.3 Iterative Reparatur

Nach der Konstruktion werden wiederholt geprüft:

- Einzelumsetzungen;
- Paartausche;
- Dreierketten;
- vollständige Tagespakete;
- lokale Neuplanung auffälliger Tage.

Jede Änderung muss die vollständige produktive Regelbewertung überstehen und die lexikografische Zielordnung verbessern.

### 4.4 Perfektionsphase

Die adaptive Large Neighborhood Search entfernt gezielt einen Ausschnitt der selbst geplanten Dienste und baut ihn neu auf. Verwendet werden unter anderem:

- Zufallsfelder;
- schwächste Zellen;
- Tagesfenster;
- Wochenenden;
- Personallast;
- verwandte Felder;
- Rollenblöcke;
- Sollabweichungen.

Late Acceptance erlaubt kontrollierte Zwischenverschlechterungen, während der beste gefundene Zustand separat geschützt bleibt. Die Ausschnittsgröße reagiert auf verbleibende Zeit und Stagnation.

### 4.5 Zertifizierung

Am Ende werden sämtliche Einzelumsetzungen und sämtliche Paartausche ohne Suchabkürzung geprüft. Findet sich keine Verbesserung, ist der Plan bezüglich dieser Nachbarschaften lokal optimal. Ein Zeitlimit kann einen vollständigen Nachweis verhindern; der Vorschlag bleibt dennoch vollständig regelgeprüft.

### 4.6 Fixpunktschutz

Fixpunkte sind mehrfach abgesichert:

1. Sie erscheinen nicht in der Slotliste.
2. Der Optimierer akzeptiert Änderungen nur für bekannte offene Slots.
3. Vor und nach der Perfektionsphase wird der Ausgangsmonat gegen das Ergebnis geprüft.
4. Die Übernahme lehnt zwischenzeitlich belegte Felder ab.
5. Vor dem Schreiben läuft ein vollständiger erneuter Audit.

---

## 5. Mehrkern-Ausführung

Der Auto-Plan läuft in Modul-Web-Workern.

- reguläre Suchprofile laufen parallel;
- der bisherige Fallback-Strang führt in v6 zuerst die adaptive Strict-Rescue aus;
- mehrere Perfektionsläufe verbessern denselben Aufbau mit unterschiedlichen deterministischen Startwerten;
- der beste Lauf gewinnt anhand derselben Zielordnung, die auch intern optimiert wird;
- ein Kern bleibt für Anzeige und Animation frei;
- ohne Worker-Unterstützung fällt die Anwendung auf den Anzeigestrang zurück.

Die produktive Regelengine wird nicht dupliziert. Worker und Hauptthread importieren dieselben Module.

---

## 6. Laufansicht und Animation

Die Canvas-Visualisierung bildet den tatsächlichen Lauf ab:

- jedes BD- und HG-Feld ist ein Knoten;
- Fixpunkte leuchten von Beginn an;
- neue Entscheidungen zünden Knoten und erzeugen Kometen sowie Druckwellen;
- Kopplungsfäden stellen zeitliche und rollenbezogene Beziehungen dar;
- Aktivität, Verbesserungen und Fortschritt steuern Energie und Bewegung;
- die Farbwelt wird aus der aktuellen Monatskontrastfarbe abgeleitet;
- ein Phasenkommentar erklärt die aktuelle Rechenstufe;
- die Verlaufslinie visualisiert Qualitätsverbesserungen;
- `prefers-reduced-motion` wird respektiert.

Der v6-Guardrail macht zusätzlich sichtbar, dass der Minimal-Rot-Fallback erst nach der verbreiterten Strict-Rescue erreicht werden kann.

### App-Icon

Das App-Icon verbindet die Kalenderfläche der Monatsplanung mit dem konzentrischen Constraint-Netz der Auto-Plan-Animation. Zwölf farbige Außenknoten greifen das Monatsspektrum auf; Ringe, Kopplungslinien und der leuchtende Kern stehen für Suche, Propagation und Optimierung.

- `icons/icon.svg`: statisches Vektormaster für Markenbild und skalierbares Favicon;
- `icons/icon-animated.svg`: separate animierte Designvariante mit `prefers-reduced-motion`;
- `icons/icon-32.png`: Raster-Fallback für kleine Browserkontexte;
- `icons/icon-180.png`: Apple-Touch-Icon;
- `icons/icon-192.png` und `icons/icon-512.png`: installierbare PWA-Icons;
- `icons/icon-maskable-512.png`: vollflächige Maskable-Variante mit allen wesentlichen Formen innerhalb der sicheren Mittelzone.

Das Icon enthält keine Schrift. Die zentrale Metapher bleibt auch bei 32 Pixeln erkennbar; für Maskable-Kontexte wird nicht dieselbe transparente Datei wiederverwendet.

---

## 7. Accessibility

- semantischer Dialog mit Fokus-Rückgabe;
- vollständige Tastaturbedienung;
- sichtbare Fokusindikatoren;
- semantische Tabellenköpfe;
- ARIA-Live-Bereiche für Status und Algorithmuskommentar;
- Tooltip-Container mit `role="tooltip"` und `aria-describedby`;
- Tooltips auf Hover und Fokus;
- Tooltip-Schließen mit `Escape`;
- hoverbare und ausreichend persistente Tooltip-Inhalte;
- Reduced-Motion-Unterstützung;
- Forced-Colors-Anpassungen;
- horizontales Tabellenscrolling auf schmalen Ansichten;
- ein gemeinsamer vertikaler Scrollbereich ohne unerreichbare Aktionsleisten.

---

## 8. Datenmodell und Persistenz

### Monat

Ein Monatsobjekt enthält unter anderem:

- `year`, `month`, `schemaVersion`, `revision`, `updatedAt`;
- Tagesdaten mit `bd`, `hg`, `rbn1`, `rbn2`, `notes`;
- `absences`;
- `preferences`;
- `options`;
- `overrideLog`;
- `importLog`.

### Persistenz

- Cloudflare KV speichert Monats-, Personal- und Einstellungsdaten.
- Browser-Sicherung schützt vor vorübergehenden Netzwerkfehlern.
- Revisionen und Fingerprints erkennen veraltete oder manipulierte Planungsstände.
- Auto-Plan-Vorschläge werden erst nach erneutem Audit übernommen.
- KV ist eventual consistent; Schreib- und Konfliktlogik muss deshalb über Revisionen und explizite Neuladung abgesichert bleiben.

---

## 9. Projektstruktur

```text
index.html
styles.css
controls.css
transitions.css
auto-plan-studio.css
auto-plan-studio-v6.css

icons/
  icon.svg
  icon-animated.svg
  icon-32.png
  icon-180.png
  icon-192.png
  icon-512.png
  icon-maskable-512.png

js/
  app.js
  state.js
  rules.js
  rules-core.js
  rules-evaluation*.js
  rules-reporting*.js
  defaults.js

  auto-planner.js
  auto-planner-engine.js
  auto-planner-v3.js
  auto-planner-v4.js
  auto-planner-v5.js
  auto-planner-v6.js
  auto-planner-optimizer.js

  auto-plan-runner.js
  auto-plan-worker.js
  auto-plan-ui.js
  auto-plan-studio-v5.js
  auto-plan-studio-v6.js
  auto-plan-guardrail.js
  auto-plan-tooltip.js
  auto-plan-visualizer.js
  auto-plan-commentary.js

functions/
  _utils.js
  api/
  sw.js.js

tests/
  *.test.js
  e2e/*.spec.js

docs/
  AUTO-PLAN-V6-RESEARCH-20260803.md
```

---

## 10. Lokale Entwicklung

### Voraussetzungen

- Node.js 18 oder neuer
- npm
- für Browsertests installierte Playwright-Browser

### Installation

```bash
npm ci
npx playwright install --with-deps chromium
```

### Syntaxprüfung

```bash
npm run check
```

### Modultests

```bash
npm test
```

### Browsertests

```bash
npm run test:e2e
```

### Vollständige Verifikation

```bash
npm run verify
```

Für eine lokale statische Vorschau kann ein beliebiger HTTP-Server im Repository-Wurzelverzeichnis verwendet werden. Direkter `file://`-Betrieb ist wegen ES-Modulen nicht vorgesehen.

---

## 11. Cloudflare-Betrieb

### Pages

- Build-Ausgabe: Repository-Wurzel
- Frontend: statische Dateien
- API: Pages Functions unter `functions/`

### KV

Der KV-Namespace muss entsprechend der Cloudflare-Konfiguration an die Functions gebunden werden. Umgebungen für Entwicklung, Preview und Produktion sollten getrennte Namespaces verwenden.

### Sicherheit

- keine Secrets im Repository;
- Eingabevalidierung in allen Functions;
- Größen- und Typgrenzen für Imports;
- CORS nur soweit erforderlich;
- konsistente Security Header;
- keine dynamische Codeausführung;
- keine zweite, abweichende Regelengine im Worker;
- Vorschlags- und Konfigurationsfingerprints vor der Übernahme.

---

## 12. Tests und Qualitätsgates

Die CI führt aus:

1. `npm ci`
2. Syntaxprüfung aller produktiven JavaScript-Dateien
3. Node-Test-Suite
4. Playwright-Browsertests

Neue v6-Regressionstests prüfen insbesondere:

- Erhalt abgeleiteter HG-Grenzen bei partiellen Konfigurationen;
- bewusste Aufhebung durch explizites `null`;
- ausschließlich strikte Profile in der Rescue;
- protokollierte Rescue vor einem Minimal-Rot-Fallback.
- plattformneutrale Syntax-Gate-Pfade unter Windows und POSIX;
- identische Quelltextprüfungen bei LF- und CRLF-Zeilenenden.

Ein Merge nach `main` ist nur nach erfolgreicher CI vorgesehen.

---

## 13. Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein, wenn Fixpunkte, Qualifikationen, Abwesenheiten und harte Obergrenzen gemeinsam keine zulässige Lösung erlauben.
- Der Auto-Plan verändert keine Fixpunkte und lockert keine harten Grenzen, um Vollständigkeit zu erzwingen.
- Die Zertifizierung beweist lokale Optimalität für die vollständig geprüften Nachbarschaften, nicht globale Optimalität des gesamten kombinatorischen Problems.
- Mehr Zeit und mehr Kerne erhöhen die Suchtiefe, garantieren aber bei einem NP-schweren Rostering-Problem keinen globalen Optimalitätsbeweis.
- RBN und zweite RBN bleiben manuell.

---

## 14. Recherche und Entscheidungsprotokoll

Die fachliche und technische Begründung der v6-Architektur einschließlich Constraint-Programming-, ALNS- und Accessibility-Quellen steht in:

- [`docs/AUTO-PLAN-V6-RESEARCH-20260803.md`](docs/AUTO-PLAN-V6-RESEARCH-20260803.md)
- [`docs/AUTO-PLAN-RESEARCH-20260802.md`](docs/AUTO-PLAN-RESEARCH-20260802.md)
- [`docs/AUTO-PLAN-HARDENING-20260802.md`](docs/AUTO-PLAN-HARDENING-20260802.md)

---

## 15. Release 0.5.1

- Auto-Plan-Algorithmus v6;
- adaptive Null-Rot-Rescue vor jedem bestätigbaren Fallback;
- vollständige Standardgrenzen auch bei partiellen API-Konfigurationen;
- sichtbarer Null-Rot-Guardrail im Studio;
- phasenbezogene Klartextbeschreibung des Algorithmuslaufs;
- stärker in die Monatsfarbe integrierte Laufanimation;
- WCAG-orientierte Rich Tooltips;
- zusätzliche v6-Regressionsabdeckung;
- aktualisierte Architektur-, Betriebs- und Testdokumentation.
- neues Algorithmus-Spektrum-App-Icon als statische und bewegte SVG-Variante;
- vollständige 32/180/192/512-Pixel-Ableitungen und separates Maskable-PWA-Icon;
- plattformneutrale Qualitätsgates für Windows-, macOS- und Linux-Arbeitskopien;
- deterministische E2E-Synchronisation des Monatsfarbverlaufs über echte Start- und Abschlusszustände statt fester Wartezeit;
- einheitlicher Release-Token `20260803.2` im vollständigen Browser-Modulgraphen und ein Gate gegen künftige Teilversionen;
- GitHub-CI-Actions mit nativer Node-24-Laufzeit ohne Node-20-Abkündigungswarnung.
