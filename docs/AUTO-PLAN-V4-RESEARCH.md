# Auto-Plan v4 – Recherche- und Entwurfsgrundlage

Stand: 2. August 2026

## Ziel

Die Recherche diente nicht dazu, einen externen Solver ungeprüft in DienstplanRAD einzubauen. Sie wurde verwendet, um die bestehende browserseitige Architektur gegen etablierte Prinzipien aus Constraint Programming, Employee Rostering, Fairness, Local Search und barrierearmen Modaloberflächen zu prüfen.

## 1. Harte, mittlere und weiche Ziele

### Quellen

- Timefold Employee Shift Scheduling – Constraints: https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/constraints
- Timefold Task Scheduling – Constraints: https://docs.timefold.ai/job-scheduling/latest/user-guide/constraints
- Timefold Employee Shift Scheduling – Terminology: https://docs.timefold.ai/employee-shift-scheduling/1.29.x/user-guide/terminology

### Übertragung auf DienstplanRAD

- Nicht überschreibbare Qualifikations- und Strukturregeln werden als absolute Machbarkeitsgrenze behandelt.
- Vollständige Belegung steht vor weichen Fairness- und Wunschzielen.
- Bestätigbare rote Abweichungen werden nicht mit grauen Sperren vermischt, sondern nur in einem ausdrücklich aktivierten Fallback betrachtet.
- Nutzerdefinierte BD-, HG- und Gesamtobergrenzen sind harte Laufbedingungen und können auch im Minimal-Rot-Fallback nicht überschritten werden.
- Die Optimierung verwendet eine lexikografische Ordnung statt einer unkontrollierten frei gewichteten Gesamtsumme.

## 2. Globale Optimierung, gepinnte Fixpunkte und Präferenzen

### Quellen

- Timefold – Self-rostering and optimization: https://docs.timefold.ai/employee-shift-scheduling/latest/scenarios/self-rostering-and-optimization
- Timefold – Employee resource constraints: https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/employee-resource-constraints
- Google OR-Tools – Employee Scheduling: https://developers.google.com/optimization/scheduling/employee_scheduling

### Übertragung auf DienstplanRAD

- Bereits vorhandene Einteilungen sind gepinnt und werden durch den Auto-Plan niemals umgebucht.
- Wünsche und Optionen bleiben weiche Eingaben, solange sie nicht als Sperre formuliert sind.
- Der Solver bewertet den gesamten sichtbaren Monat, nicht jeden Tag isoliert.
- Zeitabhängige Qualifikation, Abwesenheiten, Dienstfolgen und monatsübergreifende Regeln werden im jeweiligen vollständigen Simulationszustand geprüft.

## 3. Fairness und Lastenausgleich

### Quellen

- Timefold – Fairness: https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/fairness/fairness
- Timefold – Balance shift count: https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/fairness/balance-shift-count
- Timefold – Balance time worked: https://docs.timefold.ai/employee-shift-scheduling/1.28.x/employee-resource-constraints/fairness/balance-time-worked
- Uhde et al. – Fairness and Decision-making in Collaborative Shift Scheduling Systems: https://arxiv.org/abs/2001.09755

### Übertragung auf DienstplanRAD

- Fairness wird mehrdimensional ausgewiesen: BD-Sollabweichung, kombinierte BD/HG-Last, AA-HG-Last und Wochenendäquivalente.
- Die Vergleichsgruppe wird anhand der konkreten Tagesqualifikation bestimmt.
- Fairness darf harte Regeln und vollständige Abdeckung nicht verdrängen.
- Die Ergebnisoberfläche zeigt Vorher-Nachher-Werte und macht die algorithmische Verteilung vor der menschlichen Entscheidung sichtbar.

## 4. Engpasswahl, Forward-Checking und Resttiefensuche

### Quellen

- Google OR-Tools – Employee Scheduling: https://developers.google.com/optimization/scheduling/employee_scheduling
- Patel et al. – CP-WSP: A Declarative CP-SAT Framework for Configurable Multi-Constraint Workforce Scheduling: https://arxiv.org/abs/2607.05177
- PyJobShop – Constraint Programming for Scheduling: https://arxiv.org/abs/2502.13483

### Übertragung auf DienstplanRAD

- Das nächste Dienstfeld wird anhand der aktuell kleinsten Kandidatendomäne gewählt.
- Kandidatendomänen werden nach jeder hypothetischen Zuteilung neu berechnet.
- Forward-Checking verwirft Zustände, die absehbar ein späteres Feld ohne zulässige Besetzung hinterlassen.
- Ein begrenzter exakter Suchschritt vervollständigt kleine Restprobleme.
- Mehrere Beam-Search-Profile werden nacheinander verwendet, bevor ein roter Fallback zulässig wird.

## 5. Iterative Local Search, Tausche und Mehrfachbewegungen

### Spezialisierte Diskussionsquellen

- Stack Overflow – Non-cyclic workforce scheduling: https://stackoverflow.com/questions/18152567/algorithm-for-non-cyclic-workforce-scheduling
- Stack Overflow – Tabu search and employee pairs: https://stackoverflow.com/questions/44868669/tabu-search-how-to-implement-employee-working-in-pairs-constraint
- Operations Research Stack Exchange – Local search for assignment problems: https://or.stackexchange.com/questions/8799/how-to-do-local-search-when-using-greedy-random-heuristics-for-gap/8839
- Stack Overflow – Staff rostering algorithms: https://stackoverflow.com/questions/207512/staff-rostering-algorithms
- Stack Overflow – Local minima with tabu search and simulated annealing: https://stackoverflow.com/questions/29026155/stuck-too-early-in-local-minima-with-tabu-and-simulated-annealing

### Übertragung auf DienstplanRAD

Die Forumserfahrungen stützen zwei zentrale Entscheidungen:

1. Eine gute erste Belegung sollte anschließend durch Local Search verbessert werden.
2. Gekoppelte Regeln benötigen Bewegungen, die mehr als eine einzelne Zelle verändern können.

Deshalb prüft Auto-Plan v4 iterativ:

- Einzelumbesetzungen;
- rollengleiche Paar-Tausche;
- Dreierrotationen;
- gemeinsame BD/HG-Tagespaket-Tausche;
- lokale Ruin-and-Recreate-Neuplanung kleiner konfliktbelasteter Bereiche.

Jede Bewegung wird im vollständigen Monatszustand neu auditiert. Nur strikt bessere Ergebnisse werden akzeptiert. Die beste bisher gefundene Lösung bleibt erhalten.

## 6. Benutzerkontrolle und Visualisierung

### Quellen

- Stack Overflow – Staff rostering algorithms: https://stackoverflow.com/questions/207512/staff-rostering-algorithms
- Musliu et al. – Efficient generation of rotating workforce schedules: https://arxiv.org/abs/cs/0002018
- W3C WAI-ARIA – Modal Dialog Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W3C WAI-ARIA – Modal Dialog Example: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/

### Übertragung auf DienstplanRAD

- Der Benutzer legt Grenzen und Suchprofil vor dem Lauf fest.
- Der Algorithmus schreibt nichts, bevor die vollständige Vorschau geprüft wurde.
- Die Vorschau entspricht strukturell der vertrauten Diensttabelle: eine Zeile je Datum, BD und HG nebeneinander.
- Große semantische Strukturen bleiben scrollbar; Titel, Schließen und Aktionsleiste bleiben erreichbar.
- Der Fokus wird beim Öffnen auf den Dialogtitel gesetzt und nach dem Schließen an den Auslöser zurückgegeben.
- Rote Abweichungen werden einzeln geprüft und nicht über eine unstrukturierte Sammelbestätigung verdeckt.

## 7. Bewusste Grenzen der Implementierung

- DienstplanRAD behauptet keinen mathematischen Beweis globaler Optimalität.
- Die browserseitige Kombination aus Beam Search, Forward-Checking, exakter Resttiefensuche und Local Search ist ein tiefer, deterministischer Heuristikverbund.
- Das Ergebnis wird vollständig durch dieselbe Fachregelengine auditiert, die auch die manuelle Planung verwendet.
- Suchtelemetrie und Iterationsdiagnostik machen die Arbeitstiefe transparent, ersetzen jedoch keinen Optimalitätsbeweis.
- Die menschliche Letztentscheidung bleibt Bestandteil des Systems.

## 8. Daraus abgeleitete Prüfanforderungen

- Harte Grenzen müssen vor der Suche validiert werden.
- Fixpunkte dürfen in keiner Nachbarschaft verändert werden.
- Eine Null-Rot-Lösung darf durch die iterative Phase nicht rot oder grau werden.
- Jeder akzeptierte Nachbar muss die lexikografische Qualität strikt verbessern.
- Laufparameter und finale Änderungsliste müssen beim Apply erneut fingerprintgeprüft werden.
- Tagesvorschau, Statistik, rote Gründe und Übernahme müssen bei kleinen Viewports erreichbar bleiben.
- Die neue Werktagsregel HG vor eigenem Folge-BD muss in beiden Eingabereihenfolgen, im Auto-Plan und in offenen Punkten identisch bewertet werden.
