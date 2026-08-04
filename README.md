# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.9.0`
> **Regelwerk:** Eignungsregeln `v5.0.0`
> **Auto-Plan:** `v9` — *CP-SAT Guided Adaptive Exact-LNS*
> **Feiertagsregion:** Sachsen (`SN`)
> **Frontend:** Cloudflare Pages + Pages Functions
> **Solver:** Durable Object + Cloudflare Container + Python/OR-Tools CP-SAT
> **Persistenz:** MonthState Durable Object; Workers KV als Migrations-, Export- und Degraded-Mode-Spiegel; lokale Browser-Sicherung

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer mathematisch modellierten Komplettierung offener **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben Fixpunkte. RBN und zweite RBN werden weiterhin manuell geplant.

---

## 1. Funktionsumfang

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Kandidatenlisten mit Grün/Gelb/Orange/Rot/Grau und vollständiger Begründung;
- Abwesenheiten, Dienstwünsche, Optionen, Notizen und revisionsfähige Ausnahmebestätigungen;
- Monatsstatistik, Sollvergleich, Wochenendäquivalente und offene Punkte;
- Excel-/JSON-Import, Excel-/PDF-/JSON-Export und lokale Offline-Sicherung;
- Auto-Plan Studio mit Laufprofilen, Ziel-Gap, Varianten, Stabilitätsgrenze, Exact-LNS und Relaxierungsrichtlinien;
- persistiertes Solver-Observatorium mit Status, Schranke, Gap, Branches, Konflikten, Zielstufen und Konfliktkern;
- unabhängiger Browseraudit vor jeder Übernahme;
- kontrollierter lokaler v8.5-Fallback, wenn der native Solver nicht erreichbar ist.

## 2. Fachliche Invarianten

1. Die produktive JavaScript-Regelengine bleibt die fachliche Wahrheits- und Auditschicht.
2. Auto-Plan verändert ausschließlich zuvor leere BD-/HG-Felder des sichtbaren Monats.
3. Fixpunkte, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
4. Fehlende Qualifikation, inaktive Personen, gleichzeitiger BD/HG und unmittelbar aufeinanderfolgende BD sind nicht relaxierbar.
5. Abwesenheit, Polednia-Sperre und harte Maxima sind nur entsprechend der expliziten Relaxierungsrichtlinie zulässig.
6. Personengebundene BD-, HG- und Gesamtobergrenzen gelten in jedem Suchpfad.
7. Rote Abweichungen werden erst nach nachgewiesen erfolgloser strikter Machbarkeitssuche betrachtet.
8. Bis zur bewussten Übernahme erfolgt keine Mutation des Monatsplans.
9. Vor der Übernahme werden Fingerprints, Fixpunkte und der vollständige Endzustand erneut auditiert.

## 3. Auto-Plan v9

### 3.1 Pipeline

```text
Versionierter Snapshot / Constraint Registry
  → Domänen- und Datenvalidierung
  → paralleler lokaler v8.5-Warmstart
  → strikte CP-SAT-Machbarkeit ohne Rot
  → optional kontrollierte Minimalrelaxierung
  → sequenzielle lexikografische Optimierung
  → adaptive Exact-LNS mit CP-SAT-Teilmodellen
  → qualitätsgebundene, hinreichend verschiedene Varianten
  → Konfliktkern und Relaxierungsvorschläge
  → unabhängiger Browseraudit
  → atomare Benutzerübernahme
```

### 3.2 Modell

Für jedes offene Dienstfeld und jeden zulässigen Kandidaten existiert eine binäre Entscheidungsvariable. Fixpunkte werden als Konstanten in dasselbe Modell aufgenommen. Das Modell enthält unter anderem:

- vollständige Belegung jedes offenen BD-/HG-Feldes;
- Qualifikation und zeitabhängige Rollen;
- kein gleichzeitiger BD und HG derselben Person;
- keine direkt aufeinanderfolgenden BD;
- werktäglicher HG unmittelbar vor eigenem BD;
- individuelle BD-, HG- und Gesamtobergrenzen;
- rote/orange/gelbe Regelkosten;
- Wunscherfüllung;
- maximale und gesamte BD-Sollabweichung;
- gewichtete Gesamtlast- und Wochenendspannweite;
- Planstabilität gegenüber Warmstart/Baseline;
- Mindestdistanz zwischen Varianten.

### 3.3 Lexikografische Ziele

Die Ziele werden nicht zu einer einzigen schwer interpretierbaren Großgewichtung zusammengezogen. Jede Stufe wird separat gelöst; ihr erreichter Wert wird vor der nächsten Stufe gebunden:

1. bestätigungspflichtige rote Ausnahmen;
2. bei Minimaländerung: Planstabilität;
3. orange Regelhinweise;
4. gelbe Regelhinweise;
5. Wünsche und Optionen;
6. maximale individuelle BD-Abweichung;
7. gesamte BD-Abweichung;
8. gewichtete Gesamtlast;
9. Wochenendlast;
10. nachrangige Stabilität.

`OPTIMAL` wird nur ausgewiesen, wenn jede Zielstufe im Nachweismodus mit Gap `0` abgeschlossen wurde. Ein durch Zeit- oder Gap-Grenzen beendeter Lauf wird korrekt als `FEASIBLE` bezeichnet.

### 3.4 Adaptive Exact-LNS

Die v8.5-Heuristik liefert einen frühen Incumbent. v9 wählt anschließend adaptive Teilmengen aus und löst die freigegebenen Dienstfelder als exaktes CP-SAT-Teilmodell neu. Operatoren umfassen schwache Zuordnungen, Wochenenden, Personenlast, Zeitfenster und Zufallsnachbarschaften. Nutzung, Laufzeit und Qualitätsgewinn werden gemessen; die Auswahl balanciert Exploration und Qualitätsgewinn pro Rechenzeit.

### 3.5 Erklärbarkeit

- Assumption Literals gruppieren fachlich zusammengehörige harte Bedingungen.
- Bei `INFEASIBLE` wird ein reduzierter hinreichender Konfliktkern bestimmt.
- Daraus entstehen konkrete Relaxierungsvorschläge.
- Hints sind ausschließlich Suchhinweise, niemals fachliche Constraints.
- Solverstatus, Zielfunktionswert, beste Schranke und relativer Gap werden getrennt angezeigt.

## 4. Laufprofile und Studioeinstellungen

| Profil | Zeitbudget | Varianten | Ziel-Gap | Exact-LNS |
| --- | ---: | ---: | ---: | --- |
| Schnell | 15 s | 1 | 10 % | 6–14 Felder |
| Ausgewogen | 60 s | 3 | 2 % | 8–24 Felder |
| Intensiv | 180 s | 5 | 1 % | 12–36 Felder |
| Nachweis | 600 s | 3 | 0 % | 14–48 Felder |

Zusätzlich einstellbar:

- Neuplanung, Reparatur oder Minimaländerung;
- maximale Zahl geänderter Felder;
- Mindest-Hamming-Distanz der Varianten;
- reproduzierbarer Ein-Worker-Modus und Seed;
- Remote-CP-SAT oder lokaler Fallback;
- Relaxierung von Abwesenheit, organisatorischen Regeln und harten Maxima;
- bestehende personenspezifische BD-/HG-/Gesamtgrenzen;
- Rot-Fallback und maximale Zahl roter Ausnahmen.

## 5. Architektur

```text
Browser / Auto-Plan Studio
  ├─ lokale v8.5-Worker: früher Warmstart + Offlinefallback
  └─ /api/autoplan/v9/runs
       └─ Pages-Service-Binding AUTO_PLAN_V9
            └─ AutoPlanJob Durable Object
                 ├─ SQLite: Zustand, Ereignisse, Ergebnis
                 └─ AutoPlanContainer
                      └─ FastAPI + OR-Tools CP-SAT

/api/month/:year/:month
  ├─ Pages-Service-Binding MONTH_STATE
  │    └─ MonthState Durable Object + SQLite/CAS/Mutation-ID
  ├─ DIENSTPLAN_KV: Migration, Spiegel, Export und Degraded Mode
  └─ Browser: Dirty-Marker und lokale Notfallsicherung
```

### Verantwortlichkeiten

- **Pages:** statische Anwendung und Release-Assets.
- **Pages Functions:** Eingangsvalidierung, API-Vertrag, Service-Routing und sichere Fehlerantworten.
- **AutoPlanJob:** idempotente Laufkennung, persistierte Events, Status, Wiederaufnahme und Abbruch.
- **Container:** nativer Python-Prozess und CP-SAT-Rechenlast.
- **MonthState:** serialisierte Monatsänderungen mit Expected Revision und Mutation-ID.
- **Workers KV:** nicht mehr Autorität für konkurrierende Monatswrites; weiterhin Migrations-/Exportspiegel und kontrollierter Fallback.
- **Browseraudit:** fachliche Endkontrolle unabhängig vom nativen Modell.

## 6. Startup-Stabilität

Der frühere Startabsturz entstand durch `insertBefore()` mit einem Referenzknoten, der kein direktes Kind des gewählten Toolbar-Containers war. v9 verwendet den tatsächlichen Elternknoten und kapselt UI-Initialisierungsschritte separat.

Zusätzliche Schutzschichten:

- globale Behandlung von `error` und `unhandledrejection`;
- Watchdog gegen dauerhaften Zustand „Lädt …“;
- sichtbare Diagnose-ID;
- nicht-destruktive Bereinigung ausschließlich eigener Legacy-Service-Worker und Caches;
- keine pauschale Löschung von Local Storage oder lokalen Dienstplandaten;
- Playwright-Regression mit absichtlich noch nicht reorganisierter Toolbar.

## 7. Sicherheit und Robustheit

- Pydantic-Modelle mit `extra="forbid"`, Größen- und Wertebereichen;
- Requestgrößenbegrenzung in Pages Functions und Solvercontainer;
- generische externe 5xx-Fehler mit Trace-ID, interne Details ausschließlich im Log;
- `Cache-Control: no-store` und `X-Content-Type-Options: nosniff` auf APIs;
- keine Internetverbindung des Solvercontainers;
- idempotente Lauf- und Monatsmutationen;
- persistierte Abbruchsignale und unmittelbare Container-Cancellation;
- Baseline-, Konfigurations- und Request-Fingerprints;
- HTML-Escaping für Solverkommentare und Diagnoseinhalte;
- kein Vertrauen in ein Remoteergebnis ohne lokalen Endaudit.

## 8. Datenmodell und Migration

### Solver-Snapshot `schemaVersion: 9`

- Planungszeitraum und Regelwerkversion;
- Personal, zeitabhängige Rolleneigenschaften und Limits;
- offene/fixe Slots und vollständig evaluierte Kandidatendomänen;
- Relationen und Fixpunkte;
- Baseline und Warmstarts;
- Solverkonfiguration;
- drei Fingerprints.

### Monatsdaten

- `year`, `month`, `revision`, `updatedAt`;
- Tagesfelder einschließlich BD/HG/RBN;
- Abwesenheiten, Wünsche, Optionen und Notizen;
- Override-/Bestätigungsnachweise.

Beim ersten Zugriff übernimmt `MonthState` einen vorhandenen KV-Datensatz oder einen normalisierten leeren Monat. Danach erfolgen Writes per Compare-and-Swap. Ein Revisionskonflikt liefert HTTP `409`; der lokale Dirty-Stand bleibt erhalten und wird nicht als Offlinefehler umgedeutet.

## 9. Lokale Entwicklung

### Frontend und Pages Functions

Voraussetzungen: Node.js 24, npm.

```bash
npm ci
npm run check
npm run check:v9
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

### Nativer Solver

Voraussetzungen: Python 3.13.7 und Docker.

```bash
python -m pip install --upgrade pip==25.2
python -m pip install -e './solver[dev]'
ruff check solver
mypy solver/app
python -m compileall -q solver/app solver/tests
pytest solver
docker build -t dienstplanrad-autoplan-v9 ./solver
```

### Cloudflare Worker

```bash
cd workers/autoplan-v9
npm install
npm run check
npx wrangler deploy --dry-run

cd ../month-state
npm install
npm run check
npx wrangler deploy --dry-run
```

## 10. Cloudflare-Konfiguration und Deployment

1. `workers/autoplan-v9` deployen.
2. `workers/month-state` deployen.
3. Pages-Service-Binding `AUTO_PLAN_V9` auf `dienstplanrad-autoplan-v9` setzen.
4. Pages-Service-Binding `MONTH_STATE` auf `dienstplanrad-month-state` setzen.
5. KV-Binding `DIENSTPLAN_KV` unverändert bereitstellen.
6. Preview-Bindings auf die jeweiligen `-preview`-Worker richten.
7. Pages neu deployen; Bindings werden erst nach Redeploy wirksam.
8. Health-, Solver-, Cancel-, Monats-GET/PUT- und Revisionskonflikt-Smoke-Tests ausführen.
9. Logs über Dashboard oder `wrangler pages deployment tail` kontrollieren.

Der native Remote-Solver ist optional fail-safe: Fehlt `AUTO_PLAN_V9` oder ist der Container nicht erreichbar, übernimmt der lokale auditierte Fallback. Fehlt `MONTH_STATE`, bleibt die frühere KV-Persistenz als ausdrücklich ausgewiesener `eventual-fallback` verfügbar.

## 11. Import, Export und Backup

- Excel-Import lädt alle Zielmonate vor dem Merge.
- JSON-Import validiert und normalisiert vor dem ersten Schreibzugriff.
- JSON-Backup kombiniert Serverstand mit neueren lokalen Dirty-Monaten.
- Excel-/PDF-Export verwenden lokale Kalendertage und den sichtbaren Monatsstand.
- KV bleibt Export-/Migrationsspiegel, während MonthState die konkurrierende Schreibautorität bildet.
- Vor Infrastrukturmigration ist ein vollständiger JSON-Export empfohlen.

## 12. Tests und Qualitätsgate

### JavaScript

- Regelengine, Berichte und Invarianten;
- Fixpunktschutz, harte Maxima, Null-Rot-Eskalation und Fallback;
- v9-Snapshot, Fingerprints, UI-Verträge, Tooltips und Proof-Kommentare;
- Remote-/Fallback-Orchestrierung, Abbruch und Worker-Lebenszyklus;
- Imports, Exports, Dirty-Marker und Konfliktpersistenz;
- Startup-Root-Cause und äußere Fehlergrenze.

### Python

- Schema- und Modellvalidierung;
- strikte Machbarkeit und Unlösbarkeit;
- lexikografische Zielstufen;
- Rot-Fallback, Limits und Warmstart;
- Exact-LNS-Metadaten und Varianten;
- FastAPI-Health-, Solve- und Cancel-Vertrag.

### Browser

- echter Chromium-Start ohne `pageerror`;
- kein dauerhafter Ladezustand;
- Monatsrendering und Toolbar-Regression;
- Legacy-Cache-/Service-Worker-Recovery;
- vorhandene Planungs-, Dialog-, Druck- und Accessibility-Pfade.

### CI-Gate

```text
Node-Syntax + 383+ Modultests + Playwright
Ruff + Mypy + Compileall + Pytest + Docker-Build
Wrangler TypeScript + Dry-Run AutoPlan Worker
Wrangler TypeScript + Dry-Run MonthState Worker
```

Ein Merge ist nur nach vollständig grünem Gate zulässig.

## 13. Projektstruktur v9

```text
js/constraint-registry-v9.js          Constraint IR und Snapshotcompiler
js/auto-planner-v9.js                 produktive v9-Fassade und Phasenvertrag
js/auto-plan-runner.js                Remote-/Warmstart-/Fallback-Orchestrierung
js/auto-plan-contracts-v9.js          Remoteergebnis und Browseraudit
js/auto-plan-studio-v9.js             Studioeinstellungen und Nachweisansicht
js/auto-plan-visualizer-v9.js         Solver-/Proof-Visualisierung
js/startup-health-v9.js               Startüberwachung und Recovery
functions/api/autoplan/v9/             Pages-Proxy für Solverläufe
functions/api/month/                   revisionsgebundene Monatsschnittstelle
workers/autoplan-v9/                   Job-DO und Containersteuerung
workers/month-state/                   stark konsistente Monatspersistenz
solver/app/                            FastAPI, Pydantic und OR-Tools CP-SAT
solver/tests/                          native Solvertests
tests/auto-plan-v9.test.js             v9-Integrationsverträge
tests/e2e/startup-v9.spec.js           Startup-Regression
```

## 14. Bewusste Grenzen

- Ein Status `FEASIBLE` ist kein Optimalitätsbeweis.
- Ein CP-SAT-Assumption-Core ist hinreichend, aber nicht zwingend global minimal; v9 reduziert ihn zeitgebunden weiter.
- Hints können die Suche beschleunigen, werden vom Solver jedoch nicht garantiert befolgt.
- Der Browserfallback ist fachlich auditiert, liefert aber keinen globalen CP-SAT-Nachweis.
- Eine Cloudflare-Binding-Änderung erfordert ein erneutes Pages-Deployment.
- RBN bleibt bewusst außerhalb der Auto-Plan-v9-Entscheidungsvariablen.
- Änderungen an Regelwerk oder Snapshotstruktur erfordern eine neue `rulesetVersion` beziehungsweise `schemaVersion`.

## 15. Lizenz und Betrieb

Das Repository enthält keine Secrets. Cloudflare-IDs, Tokens und produktive Bindings werden außerhalb des Quellcodes verwaltet. Vor jedem Produktivdeployment sind Preview-Smoke-Test, vollständiges CI-Gate, Backup und Diffkontrolle verpflichtend.
