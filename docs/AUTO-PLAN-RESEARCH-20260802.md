# Auto-Plan – Recherche- und Architekturgrundlage

Stand: 02.08.2026

## Ziel

Der Auto-Plan ergänzt ausschließlich noch leere BD- und HG-Felder des sichtbaren Monats. Vorhandene Einteilungen bleiben gepinnt. Die Berechnung muss fachlich erklärbar, deterministisch reproduzierbar, vor der Übernahme vollständig prüfbar und gegenüber manipulierten beziehungsweise veralteten Vorschlägen abgesichert sein.

## Ausgewertete Quellen

### Constraint Programming und Workforce Scheduling

- Google OR-Tools: Employee Scheduling und CP-SAT Scheduling Recipes  
  https://developers.google.com/optimization/scheduling/employee_scheduling  
  https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md
- Timefold Employee Shift Scheduling: Constraints, Work Limits, Fairness und Self-Rostering  
  https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/constraints  
  https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/fairness/balance-shift-count  
  https://docs.timefold.ai/employee-shift-scheduling/latest/scenarios/self-rostering-and-optimization
- Operations Research Stack Exchange: Abgrenzung harter und weicher Restriktionen in Nurse Rostering  
  https://or.stackexchange.com/questions/11898/distinguishing-between-soft-and-hard-constraints

### Solver-Praxis und spezialisierte Community-Diskussionen

- Stack Overflow / OptaPlanner: Kombination verschiedener Move-Selectoren  
  https://stackoverflow.com/questions/73921116/what-is-the-difference-of-using-unionmoveselector-versus-putting-selectors-dir
- Stack Overflow / Employee Rostering: Pillar- und Swap-Moves zum Verlassen lokaler Optima  
  https://stackoverflow.com/questions/62819870/why-opta-planner-employee-rostering-not-assigning-employees-to-shift-even-though
- Stack Overflow / OptaPlanner: Vielfalt von Move-Typen in der lokalen Suche  
  https://stackoverflow.com/questions/41030758/advantages-and-disadvantages-of-having-more-move-selectors-in-the-union-in-local
- Stack Overflow / OptaPlanner: Change- und Swap-Moves als Standardnachbarschaften  
  https://stackoverflow.com/questions/32078031/optaplanner-changemoveselector

### Prüfoberfläche und Dialogsemantik

- WAI-ARIA Authoring Practices: Modal Dialog Pattern  
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W3C Technique für das native HTML-Dialogelement  
  https://www.w3.org/WAI/WCAG22/Techniques/html/H102
- WAI-ARIA Table Pattern: native HTML-Tabellen für statische tabellarische Daten  
  https://www.w3.org/WAI/ARIA/apg/patterns/table/

## Abgeleitete Architekturentscheidungen

### 1. Harte, mittlere und weiche Ebenen

- **Absolut hart:** technisch nicht wählbare beziehungsweise graue Regeln und die vor dem Lauf konfigurierten Mitarbeiterobergrenzen. Solche Varianten dürfen weder in der Null-Rot-Suche noch im Fallback überleben.
- **Machbarkeit:** vollständige Belegung aller offenen Pflichtfelder. Unbesetzte Felder sind schlechter als jede vollständige, technisch wählbare Lösung.
- **Bestätigungspflichtig:** rote, aber technisch überschreibbare Regeln. Sie sind erst in einer gesonderten Minimal-Rot-Stufe zulässig und werden nie still übernommen.
- **Weiche Qualität:** orange, gelb, Kopplungen, Wünsche, Optionen, Sollausgleich, kombinierte Last, AA-HG und Wochenenden.

Die Ebenen werden lexikografisch ausgewertet. Eine Verbesserung eines niedriger priorisierten Ziels kann eine Verschlechterung einer höheren Ebene nicht kompensieren.

### 2. Gepinnte Ausgangsdienste

Bestehende BD und HG werden wie veröffentlichte beziehungsweise gepinnte Schichten behandelt. Sie bleiben unveränderliche Fixpunkte; nur noch leere Felder sind Planungsvariablen.

### 3. Mehrstufige Konstruktion

- reguläre Null-Rot-Suche;
- vertiefte Null-Rot-Suche mit größerem Suchstrahl;
- optionaler Minimal-Rot-Fallback;
- dynamische Wahl knapper Dienstfelder;
- Forward-Checking gegen spätere leere Kandidatendomänen;
- exakte Restsuche in kleinen Restproblemen.

### 4. Mehrere lokale Nachbarschaften

Die iterative Qualitätsphase verwendet mehrere, fachlich vollständige Nachbarschaften:

- einzelne Neuzuweisung;
- paarweiser Tausch;
- Dreierkette;
- gemeinsamer Tausch vollständiger BD/HG-Tagespakete;
- lokale Neuplanung auffälliger Tage.

Jeder Nachbar wird erneut vollständig bewertet. Akzeptiert werden nur strikt lexikografisch bessere Gesamtzustände, die sämtliche harten Laufgrenzen einhalten.

### 5. Konfigurierbarer Lauf

Vor Beginn des Algorithmus werden im Studio verbindlich festgelegt:

- Suchintensität;
- Optimierungsschwerpunkt;
- Zahl iterativer Reparaturrunden;
- Budget lokaler Neuplanungen;
- Zulassung des Minimal-Rot-Fallbacks;
- maximale Zahl roter Vorschläge;
- maximale BD-, HG- und Gesamtdienste je Mitarbeitendem.

Die Parameter sind Bestandteil des Vorschlagsfingerprints und werden beim Übernehmen erneut geprüft.

### 6. Transparente Ergebnisprüfung

Die Vorschau verwendet eine native HTML-Tabelle mit einer Zeile je Kalendertag und gemeinsamen Spalten für BD und HG. Fixpunkte, neue Vorschläge, Bewertungsfarbe und Regelgründe bleiben in derselben Leserichtung sichtbar. Belastungsstatistik, verwendete Parameter, Suchtelemetrie und rote Bestätigungen sind vor jeder Mutation erreichbar.

### 7. Kontrollierte rote Ausnahmen

Eine rote Lösung ist nur zulässig, wenn:

- keine vollständige Null-Rot-Lösung gefunden wurde;
- der Fallback vorher ausdrücklich zugelassen wurde;
- die konfigurierte maximale Zahl roter Vorschläge nicht überschritten wird;
- jede rote Zelle einzeln geprüft wurde;
- besondere Ausnahmen zusätzlich begründet wurden;
- der vollständige Übernahmeaudit keine graue, unbesetzte oder obergrenzenwidrige Zelle erkennt.

## Abgrenzung

Die Anwendung implementiert keinen mathematischen Optimalitätsbeweis wie ein vollständiger externer MIP-/CP-SAT-Lauf. Sie kombiniert einen deterministischen, browsergeeigneten Constraint-Suchstrahl mit exakter Restsuche und mehreren lokalen Reparaturnachbarschaften. Die Oberfläche benennt dies als Optimierungsvorschlag und stellt Suchtelemetrie bereit, ohne eine nicht belegte globale Optimalitätsgarantie zu behaupten.
