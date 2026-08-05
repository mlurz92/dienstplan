# Auto-Plan v8 — Forschungsgrundlage und Bug-Inventar

Stand: 2026-08-03 · Grundlage für den Versionssprung von v7.5 auf v8

Dieses Dokument hält fest, worauf v8 aufbaut: die gesichtete Literatur, die
daraus abgeleiteten Entwurfsentscheidungen und das vollständige Inventar der
strukturellen Fehler, die v8 behebt. Es ist bewusst nachprüfbar geschrieben —
jede Entwurfsentscheidung nennt ihre Quelle und die Stelle im Code, an der sie
wirksam wird.

---

## 1. Ausgangslage

Der Auto-Plan besetzt in einem Monat alle offenen BD- und HG-Felder. Fachlich ist
das ein **Personnel Rostering Problem** mit

* harten Regeln (Qualifikation, Abwesenheit, Ruhezeit, Doppelbelegung),
* individuellen Obergrenzen (BD/HG/Gesamt je Person),
* einer lexikografischen Zielordnung über Regelstufen (grau ≻ rot ≻ orange ≻ gelb)
  und danach weichen Zielen (Wünsche, Sollausgleich, Lastvarianz, Wochenenden).

Die Größenordnung ist klein (≈ 62 Entscheidungsvariablen, ≈ 9 Kandidaten je
Feld), die **Bewertung einer Belegung ist aber teuer**: Die produktive
Regelengine ist die einzige fachliche Wahrheitsquelle und wird für jede Zelle
vollständig durchlaufen. Damit verschiebt sich der Engpass vollständig weg von
der Suchraumgröße hin zu den *Kosten pro Zielfunktionsauswertung*. Genau darauf
zielt v8.

---

## 2. Gesichtete Quellen

### 2.1 Metaheuristik und Nachbarschaftssuche

| Quelle | Ergebnis, das in v8 einfließt |
| --- | --- |
| Ropke & Pisinger, *An Adaptive Large Neighborhood Search Heuristic for the Pickup and Delivery Problem with Time Windows* (Transportation Science 2006) | Segmentweise Gewichtsanpassung der Destroy/Repair-Operatoren über ein Roulette-Rad: `w_{i,j+1} = w_{i,j}(1−λ) + λ·(π_i/θ_i)`. Reaktionsfaktor λ und Segmentlänge sind die einzigen zu wählenden Parameter. |
| Burke & Bykov, *The late acceptance Hill-Climbing heuristic* (EJOR 2017) | LAHC braucht keinen Abkühlplan; die Fensterlänge ist der einzige Parameter und skaliert mit der Laufzeit. Für Rostering-Probleme gleichwertig oder besser als Simulated Annealing. |
| Della Croce & Salassa u. a., Variable-Neighborhood-Search-Ansätze für Nurse Rostering; Übersichtsarbeit *Variable neighborhood search for healthcare providers rostering* (Journal of Heuristics 2025) | Systematischer Wechsel zwischen Nachbarschaften wachsender Reichweite schlägt eine einzelne große Nachbarschaft; nach jeder Annahme zurück zur billigsten Nachbarschaft. |
| Ropke/Pisinger, Regret-Insertion | Regret-k-Einfügung schlägt gierige Einfügung beim Wiederaufbau deutlich, weil sie Felder vorzieht, deren zweitbeste Option spürbar schlechter ist. |
| Luby, Sinclair & Zuckerman, *Optimal speedup of Las Vegas algorithms* | Universelle Neustartfolge (1,1,2,1,1,2,4,…) ist ohne Instanzwissen bis auf einen konstanten Faktor optimal. Ersetzt feste Stagnationsschwellen. |
| Gomes u. a. / Kautz & Horvitz, *Dynamic Restart Policies*; *On algorithm portfolios and restart strategies* | Portfolios aus mehreren, unterschiedlich parametrierten Läufen nutzen die Streuung stochastischer Suchen aus; der beste Lauf gewinnt. Genau das Muster des Worker-Portfolios. |

### 2.2 Inkrementelle Bewertung

| Quelle | Ergebnis |
| --- | --- |
| Timefold/OptaPlanner, *Performance tips — incremental score calculation* | Delta-Bewertung statt Vollbewertung ist der mit Abstand größte Hebel; der Gewinn skaliert mit der Problemgröße (dokumentiert bis Faktor ~500). |
| Praxisberichte zur Timefold-Optimierung (17-fache Beschleunigung durch Wechsel von Constraint Streams auf einen inkrementellen Score-Calculator) | Auch ohne vollständige Delta-Architektur bringt schon das Vermeiden wiederholter Vollscans (Zählwerke, sortierte Datumslisten, Vergleichsgruppen) ein Vielfaches. |

**Konsequenz für v8:** Eine vollständige numerische Zweitfassung der Regelengine
ist ausgeschlossen — sie wäre eine zweite Wahrheitsquelle und würde
unbemerkt abweichen. Inkrementell gemacht wird deshalb alles *um* die
Regelengine herum: Zählwerke, Datumsindizes, Vergleichsgruppen-Marken,
Slot-Listen. Die Regelbewertung selbst bleibt unverändert exakt.

### 2.3 Fairness in der ärztlichen Dienstplanung

| Quelle | Ergebnis |
| --- | --- |
| EasyChair-Preprint *Long-term workload equality on duty schedules* | Gleichverteilung über einen langen Horizont schlägt monatsweise Gleichverteilung; monatliche Sollwerte sind der praktikable Kompromiss. |
| *Optimizing physician schedules with resilient break assignments* (Omega 2024) | Minimierung der größten Differenz zwischen Personengruppen ist ein robusteres Fairnessmaß als reine Varianz. |
| Praxisliteratur zur Dienstplangerechtigkeit (Petal Health, Thrawn u. a.) | Ungleich verteilte Wochenend- und Nachtdienste sind ein Haupttreiber von Unzufriedenheit; Wochenendäquivalente gehören eigenständig in die Zielfunktion. |

Die bestehende Zielfunktion bildet das bereits ab (BD-Sollabweichung,
kombinierte Lastvarianz, AA/HG-Varianz, Wochenendvarianz, Samstagsstreuung).
v8 ergänzt sie um ein **Spannweitenmaß** als Nachrangkriterium: Bei gleicher
Varianz gewinnt die Lösung mit der kleineren Spannweite zwischen der am
stärksten und der am schwächsten belasteten Person.

### 2.4 Parallelität im Browser

| Quelle | Ergebnis |
| --- | --- |
| MDN/Praxisliteratur zu Web Workers und Worker-Pools | Ein Pool mit gemeinsamer Aufgabenschlange und `navigator.hardwareConcurrency` als Obergrenze ist das tragfähige Muster; ein Kern bleibt für die Oberfläche reserviert. |
| Vergleiche Worker vs. SharedArrayBuffer (2026) | `SharedArrayBuffer` lohnt erst bei großen Zahlenfeldern und verlangt Cross-Origin-Isolation. Für Objektgraphen mit Zeichenketten bleibt Nachrichtenaustausch die richtige Wahl — die Nutzlast wird stattdessen minimiert. |

**Konsequenz für v8:** Kein `SharedArrayBuffer` (die Anwendung liegt hinter
Cloudflare Pages ohne COOP/COEP-Isolation, und der Zustand ist ein Objektgraph).
Stattdessen: **eine** serialisierte Zustandskopie je Auftrag statt einer je
Nachricht, echte Aufgabenschlange mit Nachrücken, und ein Portfolio, dessen
Läufe sich nicht gegenseitig die Arbeit duplizieren.

---

## 3. Inventar der behobenen Fehler

### 3.1 Strukturell / architektonisch

| Nr. | Fundstelle | Befund | Behebung in v8 |
| --- | --- | --- | --- |
| B1 | `auto-planner-engine.js` `syncPeerCache` | Baut je Aufruf eine Zeichenkette aus allen ~30 Tagen (`token += …`). Der Aufruf steht in jedem Bewertungspfad. Reine Zeichenkettenarbeit dominierte die Laufzeit der Perfektionsphase. | Zwei Marken-Verfahren: im Optimierer eine exakte O(1)-Version über einen einzigen Schreibtrichter, in der Konstruktion eine allokationsarme Bildung über internierte Personal-Kennungen. |
| B2 | `auto-planner-engine.js` `monthDates` | `Object.keys().sort()` bei jedem Aufruf; aufgerufen aus `openSlots`, `proposedAssignments`, `auditProposal`, `fairnessSnapshot`, … also vielfach je Zielfunktionsauswertung. | Ergebnis je Monatsobjekt in einer `WeakMap` gehalten. |
| B3 | `auto-planner-engine.js` `buildAutoPlan` | `if (attempt.best && (compareVectors(…) < 0 \|\| attempt.stats.complete))` — ein *vollständiger, aber schlechterer* Lauf überschrieb einen besseren Amtsinhaber. Bei eingeschränktem `profileFilter` (Worker-Portfolio) tatsächlich erreichbar. | Übernahme nur noch bei echter Verbesserung der lexikografischen Zielordnung. |
| B4 | `auto-plan-runner.js` | Kurzschluss beim ersten erfolgreichen Aufbau nahm an, `runId 0` liege auf `pool[0]`. Sobald weniger Aufbau-Worker als Profile existieren, ist diese Zuordnung falsch, und es wurde der falsche Arbeitsstrang beendet. | Explizite Zuordnung `runId → workerIndex`; beendet wird anhand des tatsächlichen Index. |
| B5 | `auto-plan-runner.js` + `auto-planner-v6.js` | Der Worker für `confirmable-balanced` führte intern *erneut* die vollständige `strict-coverage`-Rescue aus, die ein anderer Worker bereits parallel rechnete. Bei drei Profilen wurde damit rund ein Drittel der Aufbauzeit doppelt verbraucht. | Der Fallback-Worker erhält `zeroRedRescue: false`; die Rescue verantwortet genau ein Strang. |
| B6 | `auto-planner-v6.js` `constructAutoPlan` | Im Inline-Betrieb lief `strict-coverage` zweimal: einmal in der Profilkette, danach erneut als Rescue mit denselben Voreinstellungen, wenn keine Verbreiterungswerte griffen. | Die Rescue läuft nur noch mit tatsächlich verbreiterten Werten und übernimmt den Amtsinhaber der Kette. |
| B7 | `auto-planner-optimizer.js` `exploreNeighbourhood` | Dreifach kopierte `if (exhausted) return null;`-Zeilen in drei Nachbarschaften (Kopierfehler aus einer früheren Fassung). | Entfernt; eine Prüfstelle je Schleife. |
| B8 | `auto-planner-optimizer.js` `recreate` | Wiederaufbau ausschließlich gierig/rangverzerrt. Bei großen Ausschnitten scheiterte er häufig und verbrauchte die Runde folgenlos (`repairFailures`). | Zusätzliche **Regret-2-Einfügung** als eigener, adaptiv gewählter Reparaturoperator. |
| B9 | `auto-planner-optimizer.js` `selectAdaptiveOperator` | Reines kostengewichtetes UCB ohne Vergessen: früh gesammelte Belohnungen dominierten dauerhaft, obwohl sich die Landschaft im Lauf ändert. | Segmentweise Gewichtsanpassung nach Ropke/Pisinger mit Reaktionsfaktor über dem UCB-Term (gleitendes Vergessen). |
| B10 | `auto-planner-optimizer.js` `runPerfection` | Neustart bei Stagnation über feste Modulo-Schwelle (`sinceImprovement % restartAfter`). Feste Schwellen sind instanzabhängig schlecht. | Luby-Folge als Neustartplan. |
| B11 | `auto-plan-studio-v5.js` `startPlanner` | `document.body.classList.remove('auto-plan-running')` im `finally`, ohne dass die Klasse je gesetzt wird — toter Code, der einen nie existierenden Zustand suggeriert. | Entfernt. |
| B12 | `auto-plan-studio-v5.js` `mergeSearchTelemetry` | Beendete Läufe blieben mit ihrem letzten Stand in der Summenbildung; Kennzahlen konnten dadurch nach dem Ende eines Strangs weiter „wachsen“, ohne dass gerechnet wurde. | Beendete Läufe werden aus der Summenbildung ausgetragen. |
| B13 | `auto-plan-runner.js` | Für jede Worker-Nachricht wurde `workerState()` neu gebildet und der vollständige Monatsgraph erneut serialisiert (N-fach bei N Workern). | Einmalige Bildung je Lauf, Wiederverwendung für alle Aufträge. |
| B14 | `auto-planner-engine.js` `signature` | Baute je Knoten eine Zeichenkette über alle offenen Felder; in `pruneBeam` für jeden erzeugten Nachfolger (Breite × Verzweigung je Feld). | Aufbau über ein vorbelegtes Feld und internierte Kennungen; Vergleich unverändert exakt. |
| B15 | `auto-planner-engine.js` `fairnessSnapshot` | Ohne Zählwerk je Person ein vollständiger Monatsscan (`countRoleInMonth`) — im Optimiererpfad bei jeder Zielfunktionsauswertung. | Zählwerk wird auch im Optimiererpfad mitgeführt. |

### 3.2 Fachlich / Qualität

| Nr. | Befund | Behebung |
| --- | --- | --- |
| Q1 | Die Zielordnung kennt nur Varianzen. Zwei Pläne mit gleicher Varianz, aber sehr unterschiedlicher Spannweite waren ununterscheidbar. | Spannweite von BD, Gesamtlast und Wochenendäquivalent als nachrangige Kriterien. |
| Q2 | Der Perfektionslauf startete in allen Strängen mit identischer Parametrierung; die Streuung entstand allein aus dem Startwert. | Diversifiziertes Portfolio: Strang 0 konvergenzbetont, weitere Stränge mit variierender Fensterlänge, Abstiegsfrequenz und Ausschnittsgröße. |
| Q3 | Die Zertifizierung prüfte Einzelumsetzung und Paartausch — Letzterer schließt den Rollentausch am selben Tag bereits ein. Ungeprüft blieb dagegen das **Tagespaket**, obwohl die Suchphase es als eigene Nachbarschaft kennt. Ein als „nicht weiter verbesserbar“ ausgewiesener Plan konnte damit eine Verbesserung enthalten, die der Algorithmus selbst kennt. | Zertifizierung umfasst zusätzlich das Tagespaket. Der Aufwand bleibt vertretbar: Gepaart werden Tage, nicht Dienstfelder. |
| Q4 | Der Wiederaufbau kannte nur eine Strategie; ein Scheitern kostete die ganze Runde. | Drei adaptiv gewählte Reparaturoperatoren (kleinster Spielraum, Regret-2, gierig) als zweite Lerndimension neben der Zerstörung. |

---

## 4. Entwurfsentscheidungen v8

1. **Die Regelengine bleibt unangetastet.** Jede Beschleunigung findet außerhalb
   der fachlichen Bewertung statt. Es gibt weiterhin genau eine Wahrheitsquelle.
2. **Exakte Marken statt geschätzter.** Der Vergleichsgruppen-Speicher wird nur
   dort auf eine O(1)-Marke umgestellt, wo genau ein Schreibtrichter existiert
   und dieser durch einen Test gegen die vollständige Neuberechnung abgesichert
   ist. Eine Streuwertmarke mit Kollisionsrisiko wird ausdrücklich nicht
   verwendet.
3. **Portfolio ohne Doppelarbeit.** Jeder Arbeitsstrang bearbeitet einen
   Suchraum, den kein anderer bearbeitet. Die Streuung entsteht aus
   unterschiedlicher Parametrierung, nicht aus wiederholter identischer Arbeit.
4. **Lastverteilung nach beobachteter Kapazität.** Die Zahl der Stränge folgt
   Kernen, Gerätespeicher, Problemgröße und Leistungsprofil; die Aufgaben werden
   über eine Schlange nachgezogen, sodass ein früh fertiger Strang sofort den
   nächsten Auftrag übernimmt statt leerzulaufen.
5. **Sichtbare Wahrheit.** Fortschritt, Telemetrie und Kommentar zeigen
   ausschließlich beobachtete Größen. Kein geschätzter Balken, keine erfundene
   Restzeit.

---

## 5. Quellen

- Ropke, S. & Pisinger, D. (2006). *An Adaptive Large Neighborhood Search Heuristic for the Pickup and Delivery Problem with Time Windows.* Transportation Science 40(4). https://www.researchgate.net/publication/220413334
- Burke, E. K. & Bykov, Y. (2017). *The late acceptance Hill-Climbing heuristic.* European Journal of Operational Research. https://www.sciencedirect.com/science/article/abs/pii/S0377221716305495
- *Adaptive neighborhood search for nurse rostering.* European Journal of Operational Research. https://www.sciencedirect.com/science/article/abs/pii/S0377221711010939
- *Variable neighborhood search for healthcare providers rostering: a comprehensive review and future research agenda.* Journal of Heuristics (2025). https://link.springer.com/article/10.1007/s10732-025-09574-1
- *Variable neighborhood search accelerated column generation for the nurse rostering problem.* https://www.sciencedirect.com/science/article/abs/pii/S1571065317300410
- *A Constraint-directed Local Search Approach to Nurse Rostering Problems.* https://arxiv.org/pdf/0910.1253
- *Adaptive large neighborhood search for a personnel task scheduling problem.* https://arxiv.org/pdf/2302.04494
- Timefold Solver — *Performance tips and tricks / incremental score calculation.* https://docs.timefold.ai/timefold-solver/latest/constraints-and-score/performance
- *How we made our client's Timefold solver 17x faster.* https://blog.dotsandlines.ai/17x-faster-timefold-part1-f6d54d2a4094
- *Multithreaded Constraint Solving With Incremental Score Calculation in OptaPlanner.* https://dzone.com/articles/multithreaded-constraint-solving-with-incremental
- *On algorithm portfolios and restart strategies.* Operations Research Letters. https://www.sciencedirect.com/science/article/abs/pii/S0167637710001392
- Kautz, H. & Horvitz, E. *Dynamic Restart Policies.* https://erichorvitz.com/drestart.pdf
- *On Maximum Speedup Ratio of Restart Algorithm Portfolios.* INFORMS Journal on Computing. https://dl.acm.org/doi/abs/10.1287/ijoc.1120.0497
- *Long-term workload equality on duty schedules.* EasyChair Preprint 444. https://easychair.org/publications/preprint/QrP5/open
- *Optimizing physician schedules with resilient break assignments.* Omega (2024). https://www.sciencedirect.com/science/article/pii/S0305048324001191
- Google OR-Tools — *Employee Scheduling.* https://developers.google.com/optimization/scheduling/employee_scheduling
- *Web Workers vs Worker Threads vs SharedArrayBuffer 2026.* https://www.pkgpulse.com/guides/web-workers-vs-worker-threads-vs-sharedarraybuffer-2026
- *Web Workers: Move Heavy Computation Off the Main Thread.* https://jsmanifest.com/web-workers-offload-heavy-computation
- Petal Health — *Why Equity Matters in Physician Shift Distribution.* https://blog.petal-health.com/why-equity-matters-physician-shift-distribution
