# Auto-Plan v7: Recherche, Zielarchitektur und Messprotokoll

Stand: 3. August 2026

## 1. Ausgangspunkt

Auto-Plan v6 kombinierte bereits strikte Beam-Suche, Forward Checking, MRV innerhalb einer Rolle, Null-Rot-Rescue, iterative Reparatur, ALNS/Ruin-and-Recreate, Late Acceptance und lokale Zertifizierung. Die Code- und Laufzeitanalyse zeigte vier verbleibende Engpässe:

1. Die Konstruktion plante alle BD vor allen HG. Ein später knapper HG konnte dadurch von einer früheren BD-Entscheidung verbraucht werden.
2. Monatszähler für BD, HG, Grenzen und Last wurden in heißen Kandidatenschleifen wiederholt aus dem ganzen Monat rekonstruiert.
3. Die ALNS-Operatorwahl honorierte Ergebnisqualität, aber nicht die dafür aufgewendete Rechenzeit.
4. Die Workerzahl hing fast ausschließlich an `hardwareConcurrency` und war weder problem- noch speicherabhängig.

Reproduzierbare Ausgangsmessung: leerer Oktober 2026, Standardprofil, striktes Profil, kein Rot-Fallback, 62 offene Felder. v6 benötigte rund 22,7 Sekunden, prüfte 45.288 Kandidaten und meldete korrekt einen blockierten strikten Lauf.

## 2. Wissenschaftliche und technische Quellen

### Constraint- und Dienstplanung

- [Google OR-Tools: Employee Scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling) modelliert Abdeckung, individuelle Einschränkungen und faire Verteilung als kombinatorisches Constraint-Problem.
- [OR-Tools Scheduling Recipes](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md) beschreibt etablierte Modellierungsbausteine und die Trennung harter Machbarkeit von Optimierungszielen.
- Fang He und Rong Qu, [A Constraint-directed Local Search Approach to Nurse Rostering Problems](https://arxiv.org/abs/0910.1253), zeigen, dass Auswahl und Größe der zu reparierenden Problemzone entscheidend für LNS in stark eingeschränkten Dienstplänen sind.
- Rahimian, Akartunalı und Levine, [A Hybrid Integer Programming and Constraint Programming Approach to Nurse Rostering](https://strathprints.strath.ac.uk/89392/), DOI 10.1016/j.cor.2017.01.016, stützen die hybride Trennung von Machbarkeit und Verbesserung.
- Burke, Li und Qu, [A hybrid model of integer programming and variable neighbourhood search for nurse rostering problems](https://www.storre.stir.ac.uk/handle/1893/15730), DOI 10.1016/j.ejor.2009.07.036, stützen systematisch wechselnde Nachbarschaften.
- Gutjahr, Parragh und Tricoire, [A framework for the solution of staff scheduling problems with flexible activities](https://arxiv.org/abs/2302.04494), verwenden ALNS für flexible Personaleinsatzplanung.
- Cai, Kadioglu und Dilkina, [Balans: Multi-Armed Bandits-based Adaptive Large Neighborhood Search](https://arxiv.org/abs/2412.14382), zeigen online lernende Neighborhood-Auswahl ohne Offline-Training.
- [BALANCE: Learning to Select Operators for Online Large Neighborhood Search](https://arxiv.org/abs/2312.16767) verbindet Bandit-Auswahl mit wechselnden Neighborhood-Größen.

### Parallelität und Browser

- [OR-Tools CP-SAT Troubleshooting](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/troubleshooting.md) zeigt, dass parallele Solver nicht nur identische Läufe vervielfachen, sondern verschieden spezialisierte Subsolver kombinieren.
- [MDN: `navigator.hardwareConcurrency`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency) warnt, dass der Browser eine reduzierte Kernzahl melden kann und der Wert kein absolutes Hardwareversprechen ist.
- [MDN: `navigator.deviceMemory`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory) liefert bewusst grob gerundete Speicherklassen und ist deshalb nur als konservatives Budgetsignal geeignet.
- [web.dev: Off-main-thread](https://web.dev/articles/off-main-thread) begründet Worker für geringere Main-Thread-Konkurrenz und bessere Interaktionslatenz.
- [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks) beschreibt lange Aufgaben ab etwa 50 ms und kooperatives Yielding als Responsivitätsmaßnahme.
- [WHATWG: Worker termination under memory pressure](https://github.com/whatwg/html/issues/11205) dokumentiert den offenen Plattformkontext für Worker unter Speicherdruck.

### Accessibility und UX

- [W3C WAI-ARIA APG: Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) fordert eingeschlossenen Tab-Fokus, Escape-Schließen, Fokussetzung beim Öffnen und Fokus-Rückgabe.
- [WCAG 2.2 Technique H102](https://www.w3.org/WAI/WCAG22/Techniques/html/H102) empfiehlt das native HTML-`dialog`-Element, weil Browser Inert-Schaltung, Fokusbegrenzung und Escape-Verhalten übernehmen.
- [Microsoft: Windows app design principles](https://learn.microsoft.com/en-us/windows/apps/design/design-principles) stützt ruhige Farbhierarchie, Layering und kohärente Windows-11-Flächen.

### Community-Signale, nicht als alleinige Designgrundlage

- [OR-Tools Issue #3842](https://github.com/google/or-tools/issues/3842) dokumentiert einen früheren Mehrworker-Overflowfehler und begründet deterministische Vergleichstests bei Parallelisierung.
- [OR-Tools Discuss: large data and memory reduction](https://groups.google.com/g/or-tools-discuss/c/Ie3YU5hE3NM) zeigt aus der Praxis, dass größere Planungsmodelle und mehr Worker schnell speicherlimitiert werden.
- [OR-Tools Discuss: real-world employee scheduling](https://groups.google.com/g/or-tools-discuss/c/u2pm4Io4R-w) liefert einen aktuellen Praxisvergleich für monatliche regulierte Personaleinsatzplanung.

Communityberichte wurden ausschließlich als Risikosignal verwendet und gegen offizielle Dokumentation, Papers und lokale Messungen abgeglichen.

## 3. Gewählte v7-Architektur

### 3.1 Globale Fail-first-Konstruktion

Alle offenen BD- und HG-Slots bilden eine gemeinsame Menge. In jeder Welle wird die echte Kandidatendomäne berechnet. Das kleinste Feld wird zuerst verzweigt; kritische Wochenendfelder und ein stabiler Datum-/Rollen-Tie-Break sichern Reproduzierbarkeit. Beam-Pruning, Forward Checking und vollständiger Finalaudit bleiben erhalten.

### 3.2 Inkrementelles Assignment Ledger

Jeder unveränderliche Suchknoten besitzt zwei Zähltabellen, `bd` und `hg`. Beim Setzen eines Kandidaten wird der Monatszustand kopiert, der kleine Ledger dagegen nur flach kopiert und um exakt einen Zähler erhöht. Die Ledger-Zuordnung liegt zusätzlich in einer `WeakMap`, sodass Kandidatenauflösung denselben Stand ohne erneute Monatsabtastung findet. Mutierbare Optimizer-Zustände verwenden diesen Cache nicht blind.

### 3.3 Cost-aware Online-Bandit

Die ALNS-Auswahl nutzt Upper Confidence Bound. Der Exploitationsanteil ist `Reward / Rechenzeit`, der Explorationsanteil wächst bei selten verwendeten Operatoren. Jeder Operator wird vor der Ausnutzung mindestens einmal erprobt. Reward unterscheidet Annahme, Verbesserung des aktuellen Zustands und neuen Bestwert. Das Verfahren lernt pro Monatsinstanz ohne Trainingskorpus.

### 3.4 Adaptives Worker-Portfolio

Das Worker-Budget ist das Minimum aus Kernbudget, Speicherklasse, Leistungsprofil und Problemgröße. Ein oder zwei Kerne bleiben reserviert. Kleine Monate sowie Geräte bis 2 GiB erhalten einen Worker; leistungsfähige Power-Läufe maximal sechs. Wenn weniger Worker als Konstruktionsprofile verfügbar sind, werden Profile nicht verworfen, sondern geordnet im bestehenden Pool ausgeführt. Die Perfektion verwendet unterschiedliche deterministische Seeds.

### 3.5 Settings und Studio

Settings-Schema v3 kapselt Darstellung und Auto-Plan-Defaults. Der native Dialog ist über Zahnrad erreichbar, fokussiert seine Überschrift, bleibt vollständig tastaturbedienbar und gibt den Fokus zurück. Das Studio zeigt vor dem Start Worker-Plan und UI-Reserve; nach dem Lauf Ledger-, Portfolio- und Bandit-Telemetrie. Monatsfarbe, System-Reduced-Motion und explizite App-Bewegungsreduktion wirken gemeinsam.

## 4. Sicherheitsinvarianten

- Die produktive Regelengine bleibt die einzige fachliche Wahrheit.
- Ledger und Rough Domains dürfen nur vorfiltern oder beschleunigen.
- Jeder Finalist und jede Übernahme wird vollständig bewertet.
- Fixpunkte sind nie Teil der veränderbaren Slotmenge.
- Rot bleibt nachgelagerte, explizit freizugebende Ausnahme.
- Parallelität verändert nicht die lexikografische Ergebnisordnung.
- Workerfehler führen zum sicheren Inline-Fallback oder zu einem benannten Fehler, nie zu einer Teilübernahme.

## 5. Messung

Lokaler A/B-Stressfall, identische Daten und striktes Standardprofil:

| Kennzahl | v6 | v7 | Veränderung |
|---|---:|---:|---:|
| Laufzeit | ca. 22.676 ms | ca. 1.732 ms | rund 13× kürzer |
| Kandidatenbewertungen | 45.288 | 9.738 | rund 78 % weniger |
| Ergebnisstatus | blockiert | blockiert | fachlich unverändert |
| Ledger-Treffer v7 | – | 7.358 | neue Diagnostik |

Wandzeiten sind lokale Diagnosewerte und keine harte CI-Grenze. CI prüft deterministische Arbeitsmengen, Invarianten, Cachetelemetrie und echte Browserabläufe.

## 6. Bewusst verworfene Wege

- CP-SAT/WASM: zweites Regelmodell, großer Transfer- und Speicherpreis.
- externer Solverdienst: Verlust von Offlinefähigkeit, zusätzlicher Datenschutz- und Betriebsaufwand.
- SharedArrayBuffer: COOP/COEP- und Deploymentkomplexität ohne Beleg für den maßgeblichen Engpass.
- WebGPU: verzweigungsreiche Regeln und Objekt-/Datumslogik passen nicht zu flachen SIMD-Kernels.
- vortrainierte ML-Policy: keine repräsentativen Trainingsdaten und schlechtere Erklärbarkeit.
