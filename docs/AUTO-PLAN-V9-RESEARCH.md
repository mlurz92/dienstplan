# Auto-Plan Studio v9 — Forschungsbericht: Moderne Verfahren zum Auto-Verteilen von BD/HG

**Stand:** 2026-08-04 · **Autor:** Forschung im Auftrag des Betreibers von DienstplanRAD
**Rahmen:** Kostenfreier Betrieb auf Cloudflare Pages + Pages Functions + Workers KV, Browser-seitige Ausführung (kein bezahlter Server, keine kommerziellen Solver). Bewertungsobjekt: Auto-Plan-Algorithmus **v8.5** (Exhaustive Clean-Solution Observatory) und Empfehlung für **v9**.

---

## 0. Aufbau dieses Berichts

1. [Ausgangslage und Problemgröße (Kurzfassung der v8.5-Analyse)](#1)
2. [Bewertung des aktuellen Ansatzes v8.5 (Stärken / Schwächen)](#2)
3. [Katalog moderner Lösungswege — Erklärung + Eignung für v9](#3)
4. [Bewertungsmatrix (alle Ansätze im Überblick)](#4)
5. [Die entscheidende technische Erkenntnis: CP-SAT im Browser ist 2026 real](#5)
6. [Exakte Empfehlung für v9 (Architektur, Pipeline, Studio-Einstellungen)](#6)
7. [Migrationsplan v8.5 → v9 (Schritte)](#7)
8. [Risiken, Selbstkorrektur und offene Punkte](#8)
9. [Quellenverzeichnis](#9)

---

<a name="1"></a>
## 1. Ausgangslage und Problemgröße (Kurzfassung der v8.5-Analyse)

**Was das Problem ist.** In einem Monat (28–31 Tage) sind alle offenen Felder für **Bereitschaftsdienst (BD)** und **Hintergrunddienst (HG)** zu besetzen. Das ist ein *Personnel Rostering Problem* mit:

- **harten Constraints** (Qualifikation, Abwesenheit, Ruhezeit, Doppelbelegung, personengebundene Obergrenzen),
- **weichen Constraints** (Wünsche, Soll-Ausgleich, Wochenend-/Samstagslast, Kopplungen zwischen BD und HG),
- einer **streng lexikografischen Zielordnung**: `harte Laufgrenzen ≻ grau ≻ offen ≻ rot ≻ orange ≻ gelb ≻ weiche Ziele (Wünsche, Varianz, Spannweite)`.

**Problemgröße (aus dem Default-Stamm `js/defaults.js`):** 9 planbare Personen (davon 5–7 HG-/Samstags-berechtigt), je Tag 2 Felder (BD, HG) ⇒ **56–62 Entscheidungsvariablen**, je Feld ≤ 9 Kandidaten. Randbedingungen aus Vor- und Folgemonat werden als fixierte Felder mitgeführt (bis 13 Monate im Speicher, `js/state.js:346`).

**Wie v8.5 arbeitet** (`js/auto-planner-v8-5.js`, `js/auto-planner-engine.js`, `js/auto-planner-optimizer.js`):
1. **Analyse** → Fixpunkte, Laufgrenzen, Domänen je Feld.
2. **Konstruktion** → Beam-Suche mit Vorwärts-Checking (MRV-Variablenordnung), exaktes Restbacktracking für die letzten ≤ 7 Felder.
3. **Null-Rot-Intensivierung** → gestaffelte Wellen mit wachsendem Beam/Branch/Backtracking-Budget.
4. **Reparatur** → Tausch-/Dreierketten-/Tagespaket-Operatoren.
5. **Perfektion** → ALNS mit 8 Zerstörungs- + 3 Wiederaufbauoperatoren, adaptiver Ropke/Pisinger-Gewichtung, Late Acceptance, Luby-Neustarts, parallel in Web-Workern.
6. **Zertifizierung** → vollständiger Nachweis über Einzelumsetzung, Paartausch, Rollentausch, Dreierkette, Tagespaket, Wochenendpaket.

**Wichtig:** Die fachliche Regelengine (`js/rules-evaluation*.js`) ist die *einzige Wahrheitsquelle*; der Solver bewertet jede Kandidatenzelle durch exakt dieselbe Funktion wie die manuelle Eingabe. Es gibt **keine zweite, vereinfachte Regelengine**.

---

<a name="2"></a>
## 2. Bewertung des aktuellen Ansatzes v8.5

### Stärken
- **Sauberer fachlicher Vertrag.** Eine Wahrheitsquelle, strikte Null-Rot-Eskalation vor dem Rot-Fallback, verbindliche Zertifizierung — das ist solide und nachvollziehbar.
- **Gute Metrik-Architektur.** Inkrementelle Zählwerke, peer-relativer Fairness-Vergleich, lexikografische Zielordnung mit Spannweite als Tiebreak (`docs/AUTO-PLAN-V8-RESEARCH-20260803.md`).
- **Parallele Portfolio-Suche** mit Worker-Budget-Ableitung und Diversifikation (`js/auto-plan-runner.js`).
- **Valide für eine kostenfreie, rein browserseitige Architektur** — keine Server-CPU nötig.

### Schwächen (die v9 beheben sollte)
1. **Keine Optimalitätsgarantie.** Nur *lokale* Nachbarschaften werden zertifiziert; ein globales Optimum wird heuristisch nicht bewiesen (`auto-planner-v8-5.js` Zertifizierung über `NEIGHBOURHOODS` in `auto-planner-optimizer.js:157`). Bei 62 Variablen ist das eigentlich unnötig — ein exakter Beweis wäre in Millisekunden möglich.
2. **Keine untere Schranke (Lower Bound).** Es gibt kein Branch-and-Bound mit Schranke; man weiß nie, wie fern ein Plan vom Besten liegt.
3. **Keine Tages-übergreifende Constraint-Propagation in der Konstruktion.** Domänen je Feld werden isoliert gebildet (`basicallyEligiblePeers`); Wochenend- und Sequenzregeln wirken nur über die Bewertungsfunktion, nicht über echtes Pruning.
4. **Redundante Arbeit im Portfolio.** Mehrere strikte Profile bauen unabhängig inkl. eigenem Rescue auf (`auto-planner-v8-5.js:16`), was bei kleiner Instanz Rechenzeit verschwendet.
5. **Keine Warmstarts / kein Resume.** Jeder Lauf startet neu; nach Abbruch keine Fortsetzung.
6. **Fehlende Infeasibility-Diagnose.** „X Felder offen / blockiert" ist die einzige Auskunft — keine Ursachenanalyse (z. B. welche Regelkombination macht den Plan unzulässig).
7. **Nicht-deterministisch** durch `random()` + `seedSalt` im Optimierer — Ergebnisse variieren zwischen Läufen, obwohl `STAFF_ORDER` und Signaturen Determinismus vorgeben.
8. **Modellierungs-Inkonsistenz zwischen Solver-Zielfunktion und Regelengine.** Einige Regeln (R13 „HG vor BD am Werktag", M1 CT-Leitung, abgeleitete Becker-FZA) werden in der Zielfunktion nicht voll erfasst und tauchen nur in „Offene Punkte" auf. Das heißt: Ein vom Solver als „gut" bewerteter Plan kann fachlich trotzdem rote Befunde enthalten.

**Fazit v8.5:** Ein sehr guter *Heuristik-Standard* für das Jahr 2025, aber architektonisch überdimensioniert für die tatsächliche Problemgröße (62 Variablen) und methodisch unter seinen Möglichkeiten — ein exakter Solver würde hier in unter einer Sekunde ein beweisbar optimales Ergebnis liefern.

---

<a name="3"></a>
## 3. Katalog moderner Lösungswege — Erklärung + Eignung für v9

Jeder Eintrag: kurze präzise Erklärung, dann **Eignung für Auto-Plan v9** (Skala 1–5, wobei 5 = sehr gut geeignet) und Begründung. Die Bewertung unterstellt strikt den kostenfreien Cloudflare-Pages/KV-Kontext (Client-seitig, kein Gurobi/CPLEX, kein bezahltes Training).

### 3.1 CP-SAT (Constraint Programming mit SAT-Techniken) im Browser via WebAssembly
**Erklärung:** CP-SAT (Googles OR-Tools-Kern) kombiniert Constraint-Programming mit SAT- und Linearer-Optimierungstechnik. Man deklariert Variablen (`x[d,r] ∈ P_{d,r} ∪ {∅}`), harte Constraints (AllDifferent-artig, Ruhezeit, Kopplungen, Obergrenzen) und eine (lexikografische) Zielfunktion; der Solver liefert `OPTIMAL` mitsamt `bestObjectiveBound` (untere Schranke). **2026 lauffähig im Browser** durch `or-tools-wasm` (Axel Wickman, Apache-2.0, multithreaded WASM) bzw. `cpsat-js` (MIT, single-threaded WASM). OR-Tools gewinnt regelmäßig die MiniZinc-Challenge und löst typische Rostering-Instanzen exakt.
**Eignung: 5/5.** Für 62 Variablen/≤9 Kandidaten ist das in <1 s exakt lösbar. Liefert Optimalitätsbeweis + Schranke, Warm-Start über Lösungs-Hints, eingebaute LNS-Worker, lexikografische Zielfunktion und Infeasibility-Core (MUS) out of the box. Kostenlos, Open Source, clientseitig.

### 3.2 CP-SAT mit Large-Neighborhood-Search (LNS) als Reparatur
**Erklärung:** Statt voller Neu-Suchen definiert man LNS-Nachbarschaften (z. B. „fixiere alle Felder außer der HG-Felder von Person X") und lässt CP-SAT parallelisierte LNS-Worker laufen. Besonders nützlich, wenn das Gesamtmodell zu groß für exakt wird oder man nur *lokale Reparatur* nach einer manuellen Änderung will („Repair-on-Edit").
**Eignung: 5/5.** Ideal für das v9-Studio: nach jeder manuellen Änderung oder nach einem bestätigten Teilplan nur den betroffenen Ausschnitt exakt reparieren. Reduziert Rechenzeit dramatisch.

### 3.3 Lexikografische (Mehrfach-)Zieloptimierung
**Erklärung:** Statt gewichteter Summe wird die Zielordnung *lexikografisch* optimiert: zuerst harte Verletzungen auf 0, dann grau, dann rot, dann weiche Ziele in fachlicher Reihenfolge — exakt das, was v8.5 schon tut, nur sauber als mathematische Lex-Optimierung (Phasen: zuerst `min rote`, mit fixiertem Optimum dann `min orange`, usw.).
**Eignung: 5/5.** Bildet die bestehende `objectiveKey`-Ordnung (`auto-planner-engine.js:619`) exakt ab und macht sie *reproduzierbar* (kein RNG).

### 3.4 HiGHS (MILP) im Browser via WebAssembly
**Erklärung:** HiGHS (Uni Edinburgh, MIT) ist ein erstklassiger freier MIP/LP-Solver als WASM (`highs` / `highs-wasm`, MIT). Alle weichen Ziele werden zu Slack-Variablen; harte Constraints als lineare Ungleichungen.
**Eignung: 3/5.** Mächtig für Matheuristiken (Fix-and-Optimize), aber: (a) viele v8.5-Regeln sind *logisch/nicht-linear* (Kopplungen, bedingte Gleichheit, abgeleitete Abwesenheit), die sich in MILP mühsam linearisieren lassen; (b) bei 62 Variablen ist CP-SAT dem MILP überlegen. **Rolle in v9:** optional als Reparatur-Backend für rein lineare Teilprobleme, nicht als Haupt-Solver.

### 3.5 Matheuristik: Fix-and-Optimize / Relax-and-Fix
**Erklärung:** Teile der Variablen werden fixiert (z. B. alle bis auf eine Personen-/Wochengruppe), der Rest exakt gelöst, iterativ „geschüttelt". Turhan & Bilgen (2020) erzielten 7 neue Best-Known-Solutions auf Curtois-Instanzen.
**Eignung: 4/5.** Exzellent als *Fallback*, wenn CP-SAT bei sehr vollen Monaten oder vielen Fixpunkten Zeit braucht: schrittweise exakte Reparatur statt eines riesigen Modells. Rein in JS/WASM umsetzbar (nutzt CP-SAT oder HiGHS).

### 3.6 Adaptive Large Neighborhood Search (ALNS)
**Erklärung:** Ropke/Pisinger — zerstörende + reparierende Heuristiken mit adaptiver Roulette-Auswahl (Score-basiert, gleitendes Vergessen). v8/v8.5 nutzt das bereits.
**Eignung: 4/5.** Bleibt als **robustes, server-unabhängiges Fallback** und als Vergleichs-Basis wertvoll, besonders wenn WASM nicht lädt (z. B. älterer Browser ohne cross-origin isolation). Aber: für 62 Variablen überflüssig stark, und ohne Optimalitätsbeweis.

### 3.7 Late Acceptance Hill Climbing / Simulated Annealing / Step Counting Hill Climbing
**Erklärung:** Parameterarme Local-Search-Akzeptanzregeln. LAHC (Burke & Bykov, EJOR 2017) ist oft besser als SA bei weniger Tuning; LAHC ist Default-Akzeptanz in Timefold.
**Eignung: 3/5.** Als *einfache* Metaheuristik im Portfolio sinnvoll (klein, schnell), aber klar schwächer als ALNS und ohne Chance gegen exakten CP-SAT bei dieser Größe. Eher als „Schnell-Vorschlag" für das Studio.

### 3.8 Variable Neighborhood Search (VNS)
**Erklärung:** Systematischer Wechsel zwischen Nachbarschaften wachsender Reichweite (Abdelwanis et al., Journal of Heuristics 2026: umfassende Healthcare-Rostering-Review).
**Eignung: 3/5.** Solide Metaheuristik, aber rein heuristisch; bei 62 Variablen bringt sie gegenüber ALNS/CP-SAT keinen Vorteil, wohl aber Code-Pflegeaufwand.

### 3.9 Ejection Chains / Very-Large-Scale Neighborhoods (VLSN) + Dynasearch
**Erklärung:** Verkettete Tauschketten (Glover) bzw. DP-gestützte Riesennachbarschaften (Ahuja/Ergun/Orlin). Historisch Bestenlisten-prägend auf Curtois-Instanzen.
**Eignung: 2/5.** Sehr hoher Implementationsaufwand, schwer parallelisierbar, kein Optimalitätsbeweis. Lohnt erst bei hunderten Variablen. Für v9 *nicht* priorisieren.

### 3.10 Hyper-Heuristiken (Selection HH, LAST-RL)
**Erklärung:** Wählt/lernt Auswahl von Low-Level-Heuristiken (Kletzander & Musliu, AI 2024; LAST-RL mit RL-Akzeptanz).
**Eignung: 2/5.** Interessant für „Selbst-Konfiguration" des Studios, aber indirekter Suchraum, schwer debugbar, RL-Training datenhungrig. Bei 10 Personen Overkill.

### 3.11 Column Generation / Branch-and-Price
**Erklärung:** Zerlegt in Master (MIP) + Pricing (CP-Subproblem); liefert starke untere Schranken. He/C. Qu (Nottingham) zeigten CP-basierte CG für NRP.
**Eignung: 2/5.** Theoretisch schön (exakte Schranke), aber im Browser ohne kommerziellen Solver und bei 62 Variablen völlig überdimensioniert. Nur als *Konzept* für die Schrankenbildung relevant — CP-SAT liefert die Schranke aber schon eingebaut.

### 3.12 Branch-and-Bound / exaktes Backtracking (rein)
**Erklärung:** Systematische Baumsuche mit Bounding.
**Eignung: 4/5 *als Bestandteil von CP-SAT*.** Eigenimplementierung (wie in v8.5 `visit(seed)` für ≤7 Felder) ist überflüssig — CP-SAT macht das besser und für das Gesamtproblem.

### 3.13 Learning-to-Optimize / Neural LNS / Neural Diving
**Erklärung:** ML-gestützte Operator- oder Variablenwahl (DeepMind 2020). Benötigt tausende gelöste Instanzen zum Trainieren.
**Eignung: 1/5.** Eine Einzelklinik mit 10 Personen/60 Feldern erzeugt < 1.000 Plan-Varianten pro Jahrzehnt — weit unter Trainingsbedarf. FrontierCO (2025/26) zeigt zudem, dass ML-Co-Solver auf echten Instanzen oft schwächer als klassische Solver sind. **In v9 nicht.**

### 3.14 Reinforcement Learning / GNN für Rostering
**Erklärung:** DQN+Tabu, GNN-ALNS (Computers & OR 2024).
**Eignung: 1/5.** Selbiges Datenproblem; Black-Box-Entscheidungen passen nicht zum „eine Wahrheitsquelle / voll erklärbar"-Prinzip von DienstplanRAD.

### 3.15 LLM als Modellierer / Erklärer (kein Löser)
**Erklärung:** NL4Opt/OptiMUS/ORLM (2022–2024) wandeln natürlichsprachliche Constraints in Modelle; LLMs erklären Pläne. PlanBench (2024) zeigt: LLMs sind *unzuverlässige* Löser, aber brauchbare Assistenten.
**Eignung: 4/5 als *optionale Assistenz*.** Über Cloudflare Workers AI (Free: 10.000 Neurons/Tag) oder Transformers.js (WebGPU, clientseitig) nutzbar für: (a) Extraktion von Regeln aus Freitext, (b) natürlichsprachliche Begründung von Rot/Offen, (c) Vorschläge. **Nicht** für die Lösungssuche.

### 3.16 Leximin / Maximin-Fairness
**Erklärung:** Statt Varianz wird die Lastverteilung *lexikografisch nach sortierten Einzellasten* optimiert — zuerst die schwächste Person maximieren, dann die nächstschwächste usw. (Kidney-Exchange-Literatur 2026; Nurse-Rostering-Fairness-Studien 2023–2026). Robuster gegen „ein Ausreißer zieht die Varianz hoch".
**Eignung: 5/5.** Bildet v8.5-Spannweite sauber als *primäres* Fairnessziel aus und ist in CP-SAT/lexikografischer Optimierung direkt formulierbar (eine `λ`-Variable, die alle Einzellasten nach unten beschränkt, dann Lex-Opt über sortierte Lasten).

### 3.17 Ordered Weighted Average (OWA) / Gini als Fairness-Funktion
**Erklärung:** OWA gewichtet geordnete Lasten (Durchschnitt = Gini-artige Gleichverteilung; Olympic Average reduziert Ausreißer-Einfluss). 2024/25 stark in Fairness-Literatur.
**Eignung: 3/5.** Als *zusätzlicher, einstellbarer* Fairness-Modus im Studio nützlich („Gleichheit" vs. „Maximin" vs. „Spannweite"), aber mathematisch schwerer exakt zu handhaben als Leximin. Optional.

### 3.18 Infeasibility-Core / Minimal Unsatisfiable Subset (MUS) & IIS
**Erklärung:** Bei unzulässigem Modell liefert CP-SAT über *Assumptions* eine minimale Teilmenge von Constraints, die den Konflikt verursachen (Erhard/Schoenfelder/Fügener; OR-Tools `sufficient_assumptions_for_infeasibility`). Bei MILP das IIS (HiGHS unterstützt es).
**Eignung: 5/5.** Löst v8.5-Schwäche Nr. 6: statt „X Felder offen" bekommt der Nutzer „Dieser Plan ist unmöglich, weil: (1) Person Y wegen Urlaub nur an 3 Tagen verfügbar ist, aber 5 BD braucht; (2) …". Exzellent für das Studio.

### 3.19 Warm-Start / Solution Hinting & Resume
**Erklärung:** Eine bekannte (auch unvollständige) Lösung wird dem Solver als Hint übergeben → prunt den Suchbaum (CP-SAT-Primer; Warm-Start-Hybrid 2025 spart Laufzeit). CP-SAT behält den Hint durch `keep_all_feasible_solutions_in_presolve` bei.
**Eignung: 5/5.** v8.5 baut jedes Mal neu. In v9: der v8.5-Heuristik-Lauf (oder der bisherige Monat) liefert den Hint → CP-SAT findet das Optimum noch schneller und wird *deterministisch bei gleichem Hint*.

### 3.20 Constraint-based LNS mit exaktem Sub-Solver („guided LNS")
**Erklärung:** Eine Regel-Engine wählt die Nachbarschaft (z. B. „alle Wochenenden von FA"), CP-SAT löst den Ausschnitt exakt. Verbindet domänenwissen-gesteuerte Zerstörung mit exakter Reparatur.
**Eignung: 4/5.** Sehr gutes Pattern für das Studio („Repariere nur den Bereich, den der Nutzer gerade angefasst hat"), besonders in Kombination mit der bestehenden Zerstörungsoperator-Liste von v8.5.

---

<a name="4"></a>
## 4. Bewertungsmatrix (alle Ansätze im Überblick)

| # | Verfahren | Exakt? | Opt.-Beweis | Browser/WASM (kostenlos) | Aufwand v9 | Eignung |
|---|---|:--:|:--:|:--:|:--:|:--:|
| 3.1 | CP-SAT (WASM) | ja | **ja** | **ja** (or-tools-wasm / cpsat-js) | mittel | **5** |
| 3.2 | CP-SAT + LNS | teils | ja (pro Ausschnitt) | ja | gering | **5** |
| 3.3 | Lexikografische Optimierung | ja | ja | ja | gering | **5** |
| 3.4 | HiGHS MILP (WASM) | ja | ja | ja (MIT) | mittel | 3 |
| 3.5 | Fix-and-Optimize | teils | nein | ja | mittel | 4 |
| 3.6 | ALNS | nein | nein | ja (reines JS) | gering* | 4 |
| 3.7 | LAHC/SA/SCHC | nein | nein | ja (reines JS) | gering | 3 |
| 3.8 | VNS | nein | nein | ja (reines JS) | mittel | 3 |
| 3.9 | Ejection Chains/VLSN | nein | nein | ja (reines JS) | hoch | 2 |
| 3.10 | Hyper-Heuristiken | nein | nein | ja (reines JS) | hoch | 2 |
| 3.11 | Column Generation/B&P | ja | ja | schwer (kein komm. Solver) | sehr hoch | 2 |
| 3.12 | B&B (eigen) | ja | ja | ja | hoch | 4 (nur in CP-SAT) |
| 3.13 | Neural LNS/Diving | nein | nein | ja, aber **Daten fehlen** | hoch | 1 |
| 3.14 | RL / GNN | nein | nein | ja, aber **Daten fehlen** | hoch | 1 |
| 3.15 | LLM-Assistenz | n.v. | n.v. | ja (Workers AI / TF.js) | gering | 4 (Assistenz) |
| 3.16 | Leximin/Maximin | ja | ja | ja (in CP-SAT) | gering | **5** |
| 3.17 | OWA / Gini | ja | ja | ja | mittel | 3 |
| 3.18 | MUS / IIS-Erklärung | — | — | ja (CP-SAT/HiGHS) | gering | **5** |
| 3.19 | Warm-Start / Hint | — | — | ja (CP-SAT) | gering | **5** |
| 3.20 | Guided LNS (Regel→CP-SAT) | teils | ja | ja | mittel | 4 |

\* v8.5 enthält ALNS bereits; „gering" = Weiterführung, nicht Neuentwicklung.

---

<a name="5"></a>
## 5. Die entscheidende technische Erkenntnis: CP-SAT im Browser ist 2026 real

Drei Fakten machen die v9-Architektur konkret möglich:

1. **`or-tools-wasm` (Axel Wickman, Apache-2.0)** verpackt Googles OR-Tools CP-SAT als multithreaded WASM mit TypeScript-API und Worker-Bridge. Es läuft **direkt im Browser** (`npm install or-tools-wasm`, `import { CpModel, CpSolver } from 'or-tools-wasm/cp-sat'`). Es ist produktiv eingesetzt (PragmaPlanner).
2. **Cloudflare Pages unterstützt die nötigen Header.** Multithreaded WASM braucht *cross-origin isolation* via `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. Genau diese Header setzt man in Cloudflare Pages über die vorhandene `_headers`-Datei (die das Projekt schon nutzt) — sie werden auf statische Assets angewandt (Cloudflare Pages Docs, „Headers").
   - *Sicherheitshinweis:* `require-corp` blockiert cross-origin Subresources ohne CORP/CORS. Da DienstplanRAD alle Assets same-origin lädt, ist das unkritisch. Falls später externe Ressourcen dazukommen, reicht `credentialless` statt `require-corp`, oder man lädt das WASM selbst gehostet.
   - *Single-threaded Fallback:* `cpsat-js` (MIT) läuft **ohne** COOP/COEP (single-threaded WASM) — falls ein Browser/Deployment die Isolation nicht zulässt.
3. **Größe passt.** or-tools-wasm CP-SAT: ~7 MB unkomprimiert, ~2–2,5 MB gzip; Cloudflare Pages-Workers-Limit (Free) ist 3 MB gzip. Statische Pages-Assets haben praktisch kein solches Limit. Das WASM wird als statisches Asset ausgeliefert, nicht im Functions-Skript — passt also sicher.

**Server-Seite bleibt unangetastet:** Die 10-ms-CPU-Grenze der Cloudflare-Workers-Free-Stufe (Stand 2026) betrifft *nur* server-seitige Funktionen. Die gesamte Optimierung läuft im Browser des Nutzers — KV bleibt nur für Persistenz (wie bisher). Damit ist das „nichts Kostenpflichtiges in v9"-Ziel uneingeschränkt erfüllbar.

---

<a name="6"></a>
## 6. Exakte Empfehlung für v9

### 6.1 Kern-Empfehlung (in einem Satz)
**v9 hebt die Engine auf eine hybride, primär exakte Architektur: CP-SAT (WASM, kostenlos) ist der neue Lösungskern; der bestehende v8.5-Solver wird zum Warm-Start-/Fallback-Portfolio; die Regelengine bleibt die verpflichtende fachliche Audit-Instanz; MUS-Lösungserklärung und lexikografische Leximin-Fairness kommen neu hinzu.**

### 6.2 Empfohlene Kombination (nicht „entweder/oder")
| Schicht | v9-Komponente | Quelle/Bibliothek | Rolle |
|---|---|---|---|
| **Lösungskern (exakt)** | CP-SAT mit lexikografischer Zielfunktion + LNS | `or-tools-wasm/cp-sat` (Apache-2.0) | Liefert beweisbar optimalen Plan + untere Schranke in <1 s |
| **Warm-Start** | Lösungs-Hint aus v8.5-Heuristik oder Vormonat | CP-SAT `hint`/`fix_variables_to_their_hinted_value` | Deterministisch, schneller, Resume-fähig |
| **Fallback / Robustheit** | v8.5-ALNS-Portfolio (bereits vorhanden) | `js/auto-planner-optimizer.js` | Wenn WASM nicht lädt (alter Browser, kein COOP/COEP) |
| **Reparatur** | CP-SAT-LNS auf geändertem Ausschnitt („Repair-on-Edit") | `or-tools-wasm/cp-sat` | Nach jeder manuellen Änderung nur den Ausschnitt exakt reparieren |
| **Fachliche Wahrheit** | Regelengine als Post-Audit | `js/rules-evaluation*.js` | Jeder CP-SAT-Plan wird vor der Übernahme durch die *echte* Engine auditiert (verhindert Modellierungs-Lücke Nr. 8) |
| **Erklärbarkeit** | MUS/IIS bei Infeasibility; Begründung bei Rot/Offen | CP-SAT `assumptions` + Regelengine | „Warum geht kein sauberer Plan?" |
| **Fairness** | Leximin (primär) + Spannweite + Varianz (wählbar) | lexikografische Optimierung | Gerechtigkeit als primäres, messbares Ziel |
| **Optionale Assistenz** | LLM für Regel-Extraktion & Begründung | Cloudflare Workers AI (Free) / Transformers.js | Nur Erklärung, nicht Lösung |

### 6.3 Neue Pipeline (v9-Phasenvertrag)
```
Fixpunkte/Domänen
  → CP-SAT-Modellbau (Spiegel der Regelengine als harte + weiche Constraints)
  → Warm-Start aus v8.5-Hint oder Vormonat
  → CP-SAT exakt (lexikografisch: harte ≻ grau ≻ offen ≻ rot ≻ orange ≻ gelb ≻ Leximin-Fairness)
       · bei Zeitlimit: LNS-Verfeinerung, Return mit bestObjectiveBound (Schranke!)
  → fachliches Audit durch Regelengine (MUSS passen, sonst MUS-Diagnose)
  → bei Infeasibility: MUS → verständliche Meldung + optionaler Relaxationsmodus
  → Übernahme (atomar, wie v8.5)
```

### 6.4 Studio-Einstellungen für v9 („gerne mehr einstellbar")
Das Studio darf autonom erweitert werden. Vorgeschlagene neue/erweiterte Regler (Wertebereiche als Vorschlag):

1. **Solver-Backend**: `auto` (CP-SAT, Fallback ALNS) | `cp-sat-exact` | `cp-sat-lns` | `heuristic-alns` (Default: `auto`).
2. **Exaktheit**: Schalter `Beweisbare Optimalität erzwingen` (Default an). Bei aus: reines LNS mit Zeitbudget.
3. **Zeitbudget CP-SAT**: 1–60 s (Default 10 s; bei 62 Variablen meist OPTIMAL in <1 s — Rest ist Sicherheitspuffer).
4. **Worker-Parallelität CP-SAT**: 1–`hardwareConcurrency` (Default: min(4, Kerne)); braucht COOP/COEP.
5. **Warm-Start**: `aus Vormonat` | `aus Heuristik` | `kein` (Default: Vormonat+Heuristik).
6. **Fairness-Profil**: `Leximin (Maximin)` | `Spannweite` | `Varianz` | `Gini/OWA` (Default: Leximin). Jedes mit Gewichtung der Fairness-Komponente relativ zu den weichen Zielen.
7. **Lexikografische Reihenfolge (erweiterbar)**: nutzerdefinierte Gewichtung der weichen Ebenen (Wünsche / Soll / Wochenenden / HG-Last / Fairness) — aktuell fix in `softObjectiveKey` (`auto-planner-engine.js:605`).
8. **Rot-Strategie**: `null-rot zwingend` | `minimal-rot nach Eskalation` | `bestätigbares Rot erlauben` (wie v8.5, aber explizit editierbar).
9. **Repair-on-Edit**: Schalter „nach jeder manuellen Änderung automatisch exakt reparieren" (Default an) — nutzt CP-SAT-LNS nur auf dem betroffenen Ausschnitt.
10. **Infeasibility-Modus**: `MUS anzeigen` | `sanfte Relaxierung (Soft-Constraints schrittweise aufweichen)` | `nur melden` (Default: MUS + Relaxierungsoption).
11. **Determinismus**: `deterministisch (Seed fix)` | `variabel` (Default: deterministisch — löst v8.5-Schwäche Nr. 7).
12. **Erklärungs-Tiefe**: `kurz` | `ausführlich (mit Regel-IDs)` | `LLM-Begründung` (optional, Workers AI).

### 6.5 Warum genau diese Kombination
- **Optimalitätsbeweis + Schranke** ersetzt v8.5-Schwächen 1–2.
- **Tagesübergreifende Propagation** passiert automatisch im CP-SAT-Modell (Schwäche 3 behoben).
- **Keine redundante Portfolio-Arbeit** beim exakten Kern (Schwäche 4 behoben); ALNS nur noch als Fallback.
- **Warm-Start + Resume** (Schwächen 5 behoben).
- **MUS-Diagnose** (Schwäche 6 behoben).
- **Determinismus** (Schwäche 7 behoben).
- **Regel-Engine als Audit** schließt die Modellierungs-Lücke (Schwäche 8): CP-SAT liefert die *Struktur*, die Regelengine das *Gutachten*.

---

<a name="7"></a>
## 7. Migrationsplan v8.5 → v9 (Schritte)

1. **`_headers` erweitern** (Projekt besitzt schon `_headers`): COOP/COEP für cross-origin isolation hinzufügen, damit `or-tools-wasm` multithreaded läuft. Gleichzeitig `credentialless`-Alternative dokumentieren.
2. **`or-tools-wasm` als Dev-Dependency** einbinden; WASM-Asset im Build ablegen (es wird automatisch aus dem Import emittiert).
3. **CP-SAT-Modell-Brücke** (`auto-plan-cp-sat.js`) neu: übersetzt den Monatszustand (Fixpunkte, Domänen, Obergrenzen, Sequenz-/Kopplungsregeln, weiche Ziele) in ein `CpModelProto`. Dabei **jede** harte/weiche Regel aus `Eignungsregeln.txt`/`rules-evaluation*.js` explizit abbilden (inkl. R13, M1, Becker-FZA) — das ist die wichtigste, aufwändigste Neubau-Stelle.
4. **Lexikografische Zielfunktion** über Phasen (hart→grau→offen→rot→orange→gelb→Fairness) aufbauen; Fairness als Leximin-Variable.
5. **Warm-Start**: v8.5-Ergebnis in CP-SAT-Hint überführen (Mapping Feld→Person).
6. **Audit-Gate**: nach CP-SAT-Lauf jeden Vorschlag durch `evaluateCandidate` (`rules-evaluation-v2.js`) prüfen; bei Abweichung MUS-Diagnose.
7. **Pipeline in `buildAutoPlan`** umstellen: CP-SAT primär, ALNS als Fallback-Pfad (bestehender Code bleibt erhalten, wird nur degradiert).
8. **Studio-UI** (`auto-plan-studio-v9.js`) um die neuen Regler aus §6.4 erweitern; Phasentheater zeigt jetzt „Exakte Suche / Schranke / Zertifiziert OPTIMAL" statt nur „Wellen".
9. **Tests** ergänzen: (a) CP-SAT-Plan == Regelengine-audit grün; (b) OPTIMAL-Status bei kleiner Instanz; (c) MUS bei konstruierter Unzulässigkeit; (d) Determinismus bei fixem Seed; (e) Fallback auf ALNS wenn WASM fehlt.
10. **Doku** (`README.md`, `AUTO-PLAN-CHANGELOG.md`) auf v9 anheben; KV-Binding `DIENSTPLAN_KV` unverändert.

---

<a name="8"></a>
## 8. Risiken, Selbstkorrektur und offene Punkte

**Risiko A — „Zweite Wahrheitsquelle".** Ein eigenes CP-SAT-Modell kann von der Regelengine abweichen. *Gegenmaßnahme:* Die Regelengine bleibt verpflichtendes Post-Audit; Abweichungen triggern MUS-Diagnose und (im Zweifel) den ALNS-Fallback. Das ist exakt das etablierte Prinzip „produktive Regelengine = einzige Wahrheitsquelle" — nur nachgelagert statt vorgeschaltet.

**Risiko B — WASM-Ladezeit.** ~2–2,5 MB gzip beim ersten Besuch. *Gegenmaßnahme:* WASM lazy laden (erst beim Auto-Plan-Klick), im Worker laden, ggf. `cpsat-js` single-threaded als schlankere Alternative.

**Risiko C — COOP/COEP-Brekking.** Falls ein eingebundenes Asset später cross-origin kommt. *Gegenmaßnahme:* `credentialless` statt `require-corp`, oder Eigenhosting; ALNS-Fallback bleibt ohne Isolation nutzbar.

**Risiko D — Leximin kann bei zu strengen Obergrenzen selbst „optimal" einen unausgewogenen Plan liefern.** *Gegenmaßnahme:* sichtbare Schranke (`bestObjectiveBound`) und MUS; Studio-Regler „Fairness-Gewicht" und „Relaxierungsmodus".

**Offener Punkt — Modellierungs-Aufwand.** Die exakte Abbildung von R13/M1/Becker-FZA ist nicht trivial (bedingte Gleichheit, abgeleitete Abwesenheit). Das ist der Haupt-Arbeitsaufwand von v9, aber einmalig und testbar.

**Selbstkorrektur der Recherche:** Erste Einschätzung „ALNS ist das Beste" wurde revidiert — für 62 Variablen ist exakter CP-SAT überlegen (Beweis, Schranke, Determinismus, Propagation), während ALNS nur noch Fallback/Robustheit liefert. Ebenso wurde „ML/RL" (zunächst reizvoll) nach Datenbedarfs-Prüfung auf 1/5 herabgestuft.

---

<a name="9"></a>
## 9. Quellenverzeichnis (Auswahl, alle 2023–2026 sofern verfügbar)

**Solver / Browser-WASM**
- Axel Wickman, *or-tools-wasm* (GitHub, npm `or-tools-wasm`, Apache-2.0, 2026) — CP-SAT multithreaded WASM, Browser/Node/Deno/Bun. https://github.com/Axelwickm/or-tools-wasm
- Owen Lacey, *cpsat-js* (GitHub/npm, MIT, 2026) — single-threaded CP-SAT WASM, kein COOP/COEP nötig. https://github.com/owen-lacey/cpsat-js
- LOVASOA, *highs-js* / *highs-wasm* (MIT) — HiGHS MILP/LP WASM. https://github.com/lovasoa/highs-js
- Google OR-Tools, *CP-SAT Solver* Dokumentation. https://developers.google.com/optimization/cp/cp_solver
- CP-SAT Primer (LNS, Hints, Infeasibility/MUS). https://d-krupke.github.io/cpsat-primer/

**State of the Art / Surveys**
- *The Nurse Rostering Problem: Recent Advances and Future Perspectives* (2026, Applied AI / Taylor & Francis) — erste Survey mit ML-Fokus 2019–2025. https://www.tandfonline.com/doi/full/10.1080/08839514.2026.2690801
- Abdelwanis et al., *Variable neighborhood search for healthcare providers rostering* (Journal of Heuristics 32(1), 2026). https://doi.org/10.1007/s10732-025-09574-1
- Ngoo et al., *A survey of the nurse rostering solution methodologies* (IEEE Access 2022).
- Erhard, Schoenfelder, Fügener, Brunner, *State of the Art in physician scheduling* (EJOR 2018).
- Meier, Boeckmann, Thielen, *A General Framework for Physician Rostering Using MIP and a Web GUI* (arXiv:2511.14536, 2025).

**Metaheuristiken**
- Ropke & Pisinger, *ALNS* (Transportation Science 2006).
- Burke & Bykov, *Late Acceptance Hill-Climbing* (EJOR 2017).
- Turkeš et al., *Meta-analysis of the adaptive layer in ALNS* (PMC 2024).
- Kletzander & Musliu, *Hyper-heuristics for personnel scheduling* (AI 334, 2024).
- Turhan & Bilgen, *Hybrid fix-and-optimize and SA for NRP* (Comp. & Ind. Eng. 145, 2020).
- Ahuja, Ergun, Orlin, *VLSN search techniques* (Discrete Applied Math 123, 2002).

**Fairness**
- *Lexicographic max-min optimization* (Wikipedia); Kidney-Exchange-Leximin (arXiv:2605.20070, 2026).
- *Optimizing physician schedules with resilient break assignments* (Omega 2024).
- *Achieving compromise solutions in nurse rostering by automatically estimated acceptance thresholds* (EJOR 2021).
- *fairness / equity in nurse rostering … balancing night shifts and weekends* (2026, Sci-Bot Übersicht).

**ML/RL/LLM**
- DeepMind, *Learning to Combine / Neural Diving* (2020). https://arxiv.org/abs/2010.01913
- GNN-based ALNS for Nurse Rostering (Computers & OR 2024).
- NL4Opt / OptiMUS / ORLM (2022–2024); PlanBench (arXiv:2409.13373, 2024) — LLM als unzuverlässiger Löser.
- Cloudflare Workers AI Pricing (Free: 10k Neurons/Tag). https://developers.cloudflare.com/workers-ai/platform/pricing/
- Transformers.js v3 (WebGPU). https://github.com/huggingface/transformers.js

**Cloudflare**
- Cloudflare Pages *Headers* (`_headers`, COOP/COEP). https://developers.cloudflare.com/pages/configuration/headers/
- Cloudflare Workers *Limits* 2026 (Free: 10 ms CPU/Request, 100k Requests/Tag; Paid: 30 s–5 min CPU). https://developers.cloudflare.com/workers/platform/limits/
- web.dev *Cross-origin isolation guide*. https://web.dev/articles/cross-origin-isolation-guide

**Interne Basis (bereits im Repo)**
- `docs/AUTO-PLAN-V8-RESEARCH-20260803.md` — v8-Forschungsgrundlage (Metaheuristik, Fairness, Parallelität).
- `js/auto-planner-v8-5.js`, `js/auto-planner-engine.js`, `js/auto-planner-optimizer.js`, `js/rules-evaluation*.js`, `js/defaults.js`, `Eignungsregeln.txt` — analysierte Implementierung.

---

**Kurzfassung der Empfehlung:** Die Engine auf **v9 heben durch CP-SAT (WASM, kostenlos) als exakten Kern**, kombiniert mit dem vorhandenen ALNS als Fallback, **Regelengine als verpflichtendem Audit**, **Leximin-Fairness**, **Warm-Start/Resume** und **MUS-Erklärbarkeit** — alles clientseitig auf Cloudflare Pages/KV, ohne Kosten, mit `COOP/COEP` in der bestehenden `_headers`. Das behebt alle acht Schwächen von v8.5 und liefert erstmals einen beweisbar optimalen, deterministischen und erklärbaren Auto-Plan.
