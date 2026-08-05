# Auto-Plan v10.5 — Forschungsbericht, Audit und Implementierungsplan

**Stand:** 2026-08-05 · **Status:** Entscheidungsvorlage
**Gegenstand:** Automatische Verteilung offener Bereitschafts- (BD) und Hintergrunddienste (HG)
**Rahmen:** ausschließlich kostenfreie Bausteine · Rechnung im Browser · Hosting Cloudflare Pages · Speicher Workers KV
**Vorgänger:** `docs/AUTO-PLAN-V9-RESEARCH.md`, `docs/AUTO-PLAN-V9.5-FINAL.md`

---

## 0. Versions-Landkarte (Begriffsklärung)

Im Projekt laufen zwei Zählungen nebeneinander. Dieser Bericht verwendet durchgehend:

| Begriff | Bedeutung hier |
|---|---|
| **v10** | der **heute ausgelieferte Stand** (Paket `0.9.1`, Studio-Kennung „Hybrid Exact Observatory · v9“, Engine-Kette v8.5 → v9.5) |
| **v10.5** | der **Zielstand** dieses Berichts |
| **Engine v9.5** | die heutige Engine-Schicht (`js/auto-planner-v9.js` + `js/auto-plan-cp-sat.js`) |
| **Engine v10** | die vorgeschlagene neue Engine-Schicht für v10.5 |

Die Vorgabe „die Engine auf v9.5 heben“ ist nominell bereits erfüllt — **faktisch nicht**. Abschnitt 2 weist nach, dass der exakte Kern der Engine v9.5 in der Auslieferung **niemals ein Ergebnis liefert**. Der Sprung, um den es geht, ist deshalb real und nicht kosmetisch.

---

## 1. Kurzfassung

**Empfehlung in einem Satz:** v10.5 ersetzt das Integer-Codierungs-Modell der Engine v9.5 durch ein **reines Boolean-Zuordnungsmodell (One-Hot)** mit echter Reifikation über `onlyEnforceIf`, löst es **lexikografisch mit Blocking-Constraints und Warmstart-Hints**, setzt **Leximin über sortierte Lastvektoren** als Fairnesskern, diagnostiziert Unerfüllbarkeit über **Relaxationsliterale (MCS) statt Löschschleife**, behält die v8.5-ALNS als **Fallback und Anytime-Sicherung**, und macht den Lauf über **`onSolution`-Inkumbenten und `bestObjectiveBound`** erstmals ehrlich sichtbar.

**Warum das trägt — gemessen, nicht behauptet.** Ein Prototyp des vorgeschlagenen Modells wurde gegen das echte `cpsat-js`-WASM auf einer realen Monatsinstanz (30 Tage, 60 offene Felder, 8 planbare Personen) gefahren:

| Phase | Status | Zielwert | Untere Schranke | Zeit |
|---|---|---|---|---|
| Zulässigkeit | `OPTIMAL` | – | – | **218 ms** |
| Minimax BD-Last (Stufe 1 der Leximax-Kaskade) | `OPTIMAL` | 4 | 4 | **188 ms** |
| Lexikografisch (Minimax BD-Last → BD-Soll → Wochenende) | `OPTIMAL` je Stufe | 4 / 0 / 3 | 4 / 0 / 3 | **445 ms gesamt** |

Das Problem ist für einen exakten Solver **klein**. Beweisbare Optimalität ist in unter einer halben Sekunde erreichbar. Die heutige Engine erreicht sie nie — nicht wegen der Problemgröße, sondern wegen fünf konkreter Modellierungs- und Bindungsfehler.

**Kosten:** null. Jede empfohlene Komponente ist MIT/Apache-2.0 und läuft im Browser.

---

# TEIL A — Audit des heutigen Ansatzes (v10 / Engine v9.5)

## 2. Was tatsächlich läuft

Die Dokumentation beschreibt eine hybride, primär exakte Architektur. Die Auslieferung realisiert davon den heuristischen Teil. Fünf Defekte wurden **numerisch reproduziert** (Protokoll in Abschnitt 13).

### 2.1 Defekt 1 — Die Reifikation ist invertiert *(fatal)*

`addReifiedEqual(…)` (`js/auto-plan-cp-sat.js:114`) soll ein Literal `a` erzeugen mit `a = 1 ⇔ x == v`. Die erzeugte Klausel `neq_or: b1 + b2 ≥ 1` ist jedoch **unbedingt**, nicht an `a = 0` gebunden. Damit gilt in jeder Lösung `x ≥ v+1` oder `x ≤ v−1`, also **`x ≠ v` erzwungen** — das genaue Gegenteil der Absicht. `addReifiedNotEqual` hat denselben Fehler.

Erschöpfende Enumeration über den vollständigen Variablenraum eines solchen Blocks (`x ∈ [0..8]`, `a, b1, b2 ∈ {0,1}`, alle sechs Constraints):

```
target == value irgendwie erfüllbar?  false
target != value erfüllbar?            true
=> Encodiert: HARTES target != value
```

**Folge:** Die Wochenendketten-Modellierung erzeugt für **jede** Person `p` einen Block `chain_fri_*` und damit `x_bd(Freitag) ≠ p`. Über alle Personen zusammen bleibt für den Freitags-BD kein zulässiger Wert. **Jeder Monat mit einem Fr–Sa–So-Tripel offener BD-Felder ist per Konstruktion unerfüllbar.** Dasselbe gilt für Becker-FZA und für die Minimal-Perturbation, die dadurch nicht minimale, sondern **maximale** Abweichung vom Warmstart erzwingt.

### 2.2 Defekt 2 — Personenbezogene Zählungen zählen keine Personen *(fatal)*

Die Slot-Variablen sind ganzzahlige **Personencodes** `x ∈ {1..N}`. Obergrenzen, Fairness-Slack und BD-Soll summieren jedoch genau diese Codes:

```js
for (let index = 0; index < variables.length; index += 1) {
  if (variables[index].slot.role !== role) continue;
  terms.push([index, 1]);                      // Σ Personencodes
}
… { id: `limit_${role}_${staffId}`, terms, ub: max - fixedCount }
```

`Σ_Felder x` ist die Summe der Personennummern und hat mit der Einsatzzahl einer Person nichts zu tun. Messung am realen Modell:

```
limit_bd_* Constraints: 8
Termmenge identisch für ALLE Personen? true   → keine personenbezogene Zählung
Beispiel: limit_bd_lurz   Σ(x_bd) ≤ 4  bei 28 BD-Feldern
Coverage erzwingt          Σ(x_bd) ≥ 28  → UNERFÜLLBAR
```

Dasselbe Muster in `fairness_hi_*`, `fairness_lo_*`, `target_hi_*`, `target_lo_*`. **Sobald irgendeine Obergrenze gesetzt ist — und das ist der Normalfall —, ist das Modell unerfüllbar.** Mit ganzzahliger Wert-Codierung ist eine Kardinalitätsaussage über eine Person linear schlicht **nicht ausdrückbar**; das ist kein Flüchtigkeitsfehler, sondern eine falsche Modellierungsentscheidung an der Wurzel.

### 2.3 Defekt 3 — Die Solver-Bindung wählt den falschen Zweig *(fatal)*

`normalizeSolverApi` prüft zuerst `module?.CpModel && module?.CpSolver`. `cpsat-js` exportiert **beides**, also greift immer der erste Zweig (für `or-tools-wasm` geschrieben). Dieser ruft `new module.CpSolver()` auf — bei `cpsat-js` ist der Konstruktor privat und erwartet ein bereits geladenes WASM-Modul; die korrekte Fabrik ist `await CpSolver.create()`.

Der zweite, in `AUTO-PLAN-V9.5-FINAL.md` als „kritischer Brücken-Fix“ beschriebene Zweig (Status-Rückwärtstabelle, camelCase-Parameter) ist damit **unerreichbarer toter Code**. Der Solve wirft, wird vom `try/catch` in `solveCpSatModel` verschluckt und meldet `statusName: 'UNKNOWN'`.

### 2.4 Defekt 4 — Der lokale Vendor-Pfad kann im Browser nicht laden

`vendor/cpsat-js/dist/**` enthält den bloßen Bezeichner `from '@bufbuild/protobuf'`. `index.html` führt **keine Import-Map**. Ein `import('/vendor/cpsat-js/dist/index.portable.js')` scheitert im Browser zwingend an der Modulauflösung. Die dokumentierte Ladeordnung „lokal zuerst, CDN als Reserve“ ist faktisch „CDN allein“.

Verschärfend: `_headers` setzt global `Cross-Origin-Embedder-Policy: require-corp`. Das ist die richtige Wahl für den *threaded* Build — es stellt aber jede Fremdressource unter CORP/CORS-Vorbehalt. Der klassische `<script src="https://cdn.sheetjs.com/…">` in `index.html` trägt **kein** `crossorigin`-Attribut und wird deshalb im No-CORS-Modus geladen; unter `require-corp` ist das nur zulässig, wenn die Gegenstelle `Cross-Origin-Resource-Policy: cross-origin` sendet. Das ist eine Abhängigkeit von fremder Header-Politik an einer Stelle, an der der Excel-Import hängt. **Zu prüfen und zu entkoppeln.**

### 2.5 Defekt 5 — Alle neun `cpSat*Weight`-Gewichte sind mathematisch wirkungslos

Die Phasenordnung `FOCUS_PHASE_ORDER` minimiert **je Phase genau eine Komponente allein**. Innerhalb jeder Komponente tragen alle Terme dasselbe Gewicht — gemessen:

```
fairness       terme=   1  distinkte Gewichte=1
bdTarget       terme=   8  distinkte Gewichte=1
weekend        terme=  12  distinkte Gewichte=1
saturday       terme=   4  distinkte Gewichte=1
hgBurden       terme=  12  distinkte Gewichte=1
weekendChain   terme=  32  distinkte Gewichte=1
```

Die Minimalstelle einer Zielfunktion ändert sich nicht, wenn man sie mit einer positiven Konstanten skaliert. **Jeder der Gewichtsregler `cpSatFairnessWeight`, `cpSatWishWeight`, `cpSatBdTargetWeight`, `cpSatWeekendWeight`, `cpSatSaturdayWeight`, `cpSatHgWeight`, `cpSatCtLeadershipWeight`, `cpSatWeekendChainWeight`, `cpSatPerturbationWeight` ist ohne Wirkung.** Ergänzend:

- `hgBurden` steht in **keiner** Fokus-Reihenfolge → wird nie minimiert.
- `fairness` steht nur bei `fairnessProfile === 'leximin'` in der Reihenfolge; die Profile `spread`, `variance`, `owa` sind nirgends implementiert und bedeuten faktisch **„gar keine Fairness-Phase“**.
- `random_seed` und `log_search_progress` werden gebaut, aber von `cpsat-js` nicht entgegengenommen (`SolverParams` kennt nur `maxTimeInSeconds`, `numWorkers`, `enumerateAllSolutions`, `onSolution`). Die Determinismus-Zusage stützt sich auf das Defaultverhalten des Solvers, nicht auf den gesetzten Seed.

### 2.6 Der Folgeschaden: die Diagnose läuft ins Leere

Weil jeder Solve `UNKNOWN` meldet, gilt in `solveExactPhases` sofort `infeasible: true`. `diagnoseInfeasibility` startet daraufhin die zweistufige Löschdiagnose: Ebene 2 iteriert über **jeden einzelnen Constraint jeder essenziellen Gruppe** und startet je Constraint einen vollständigen Solve. Das reale Modell hat **1.984 harte Constraints und 1.016 Hilfsvariablen** für 56 offene Felder. Das ist eine Schleife mit vierstelliger Solve-Zahl, deren Ergebnis konstruktionsbedingt „alle Gruppen sind schuld“ lautet.

**Nettobefund:** Die ausgelieferte Anwendung baut ein ~3.000-Zeilen-Modell, verwirft es, durchläuft eine mehrtausendfache Diagnoseschleife ohne Aussagewert, und liefert am Ende **immer** das Ergebnis der v8.5-Heuristik. Das Exaktheitsnachweis-Panel zeigt entsprechend nie einen Beweis.

## 3. Was gut ist — die Heuristik

Der Teil, der tatsächlich arbeitet, ist solide gebaut und verdient das ausdrücklich:

| Baustein | Bewertung |
|---|---|
| **ALNS mit Ruin-and-Recreate** (8 Destroy-, mehrere Repair-Operatoren) | lehrbuchkonform nach Ropke/Pisinger; gute Operatorvielfalt |
| **Late Acceptance Hill Climbing** (`LateAcceptance`) | korrekt nach Burke/Bykov; ein einziger Parameter, robust gegen Fehlparametrisierung |
| **Luby-Neustartfolge** | richtige Wahl: instanzunabhängig, bis auf konstanten Faktor so gut wie die beste feste Schwelle |
| **xorshift32-RNG mit abgeleitetem Seed** | echter Determinismus, korrekt implementiert, keine Uhrzeit-Abhängigkeit |
| **Fortgeschriebenes Zählwerk (`ledger`) + Planversions-Marke** | inkrementelle Auswertung statt Vollscan — das ist genau der Trick, den Timefold als „incremental score calculation“ industrialisiert |
| **Lexikografischer Zielvektor** mit Regel-Audit als letzter Instanz | fachlich sauber: die Regelengine bleibt Wahrheitsquelle |

### 3.1 Präzise mathematische Anmerkungen zur Heuristik

1. **Kostenbewusste UCB-Auswahl** (`selectAdaptiveOperator`): `score = weight · reward/costMs · 100 + √(2·ln N / n)`. Der Ausbeutungsterm ist **unnormiert**, der Explorationsterm liegt in der Größenordnung 1. Damit ist das Verhältnis der beiden Terme skalenabhängig und nicht kalibriert. UCB1 setzt Belohnungen in `[0,1]` voraus. **Korrektur:** Belohnung auf den beobachteten Maximalwert des laufenden Segments normieren (`reward/maxReward ∈ [0,1]`), dann ist der Explorationsbonus wieder wirksam.
2. **`variance(values)`** ist die **Populationsvarianz** (÷ n). Für einen Vergleich fixer Personenmengen korrekt; sie darf nur nicht als Stichprobenvarianz interpretiert werden.
3. **`bdPenalty`** gewichtet Überlast mit 1,3 gegenüber Unterlast — eine bewusste Asymmetrie, sachlich begründbar, aber **kein Fairnessmaß im ordinalen Sinn**: sie ist ein utilitaristischer Summenterm und kann eine sehr ungleiche Verteilung gegen viele kleine Abweichungen eintauschen. Genau das behebt Leximin (Abschnitt 5.2).
4. **Benennungsfehler ohne Rechenfolge:** In `finalObjective` wird `saturdayVariance(...)` an den Parameter `weekendSpread` von `softObjectiveKey` übergeben. Der Wert ist korrekt und gewollt, der Name führt beim Lesen in die Irre. Umbenennen.
5. **`LateAcceptance.record`** übernimmt den neuen Wert nur, wenn er besser ist als der Historienwert. Das ist die Variante von Burke/Bykov (2017), nicht die Urform. Zulässig — bitte im Kommentar so kennzeichnen.

## 4. Gesamtnote v10

| Dimension | Note | Begründung |
|---|---|---|
| Fachliche Regelabbildung (Regelengine) | **sehr gut** | einzige Wahrheitsquelle, Schlussaudit verpflichtend, Fixpunkte unantastbar |
| Heuristische Suche (v8.5) | **gut** | ALNS + LAHC + Luby, deterministisch, inkrementell |
| Exakter Kern (v9.5) | **nicht funktionsfähig** | fünf bewiesene Defekte; liefert in der Auslieferung nie ein Ergebnis |
| Fairnessmodell | **mittel** | Varianz/Summenterme statt ordinaler Gerechtigkeit; Profile teils Attrappe |
| Erklärbarkeit | **mittel** | gutes Konzept (MUS), untragbare Umsetzung (Löschschleife über alle Constraints) |
| Einstellbarkeit | **schwach** | die Mehrzahl der v9-Regler ist mathematisch wirkungslos |
| Betrieb/Auslieferung | **mittel** | Vendor-Pfad nicht ladbar; COEP-Politik nicht zu Ende gedacht |

---

# TEIL B — Verfahrenskatalog

Bewertet wird durchgehend nach: **Eignung** (0–5) für das Auto-Plan Studio unter den harten Randbedingungen *kostenfrei · Browser-Rechnung · Cloudflare Pages/KV · 60 Felder, 8 Personen, Monatshorizont*.

## 5. B1 — Exakte Verfahren

### 5.1 CP-SAT mit Boolean-Zuordnungsmodell (One-Hot) — **Eignung 5/5** ★ Kernempfehlung

**Erklärung.** Statt einer Integer-Variablen je Feld mit Personencode wird je (Feld, Person)-Paar eine Binärvariable `y[f][p] ∈ {0,1}` eingeführt, beschränkt auf die tatsächlich zulässigen Kandidaten. `Σ_p y[f][p] = 1` besetzt jedes Feld genau einmal. Jede fachliche Regel wird damit zu einer **linearen Aussage über Zählungen**:

| Regel | Kodierung |
|---|---|
| BD ≠ HG am selben Tag | `y[bd_d][p] + y[hg_d][p] ≤ 1` |
| kein BD an Folgetagen | `y[bd_d][p] + y[bd_{d+1}][p] ≤ 1` |
| HG Mo–Do ⇒ kein BD am Folgetag | `y[hg_d][p] + y[bd_{d+1}][p] ≤ 1` |
| Obergrenze BD | `Σ_d y[bd_d][p] ≤ maxBd_p − fix_p` |
| Wochenendkette Fr-BD·Sa frei·So-BD | `k` mit `k ≥ y_fri + (1−y_satBD) + (1−y_satHG) + y_sun − 3`, `k` in der Zielfunktion |
| Qualifikation | Variable wird gar nicht erst erzeugt |

Der Gewinn ist nicht Bequemlichkeit, sondern **Ausdrucksmächtigkeit**: Kardinalität, Fairness und Wünsche sind erst in dieser Darstellung überhaupt formulierbar. Big-M entfällt vollständig; `onlyEnforceIf` liefert echte Halbreifikation ohne Hilfskonstruktion. Genau das ist die in der Literatur beschriebene Praxis („Boolean composition … auxiliary violation variables can be flexibly reused and combined with other logical conditions“).

**Modellgröße hier:** 60 Felder × Ø 6,2 Kandidaten ≈ **372 Binärvariablen** — gegenüber 56 Integer- plus **1.016 Hilfsvariablen** und 1.984 Constraints im heutigen Modell. Kleiner, korrekter, schneller.

**Gemessen:** `OPTIMAL` in 218 ms (Zulässigkeit), 188 ms (Minimax BD-Last), 445 ms (drei lexikografische Stufen).

**Eignung:** Bibliothek ist bereits vendorisiert, Apache-2.0, kostenfrei, läuft portabel ohne Cross-Origin-Isolation. **Keine Alternative kommt näher heran.**

### 5.2 Leximin über sortierte Lastvektoren — **Eignung 5/5** ★ Kernempfehlung

**Erklärung.** Leximin maximiert das Minimum, danach — bei festgehaltenem Minimum — das Zweitkleinste, und so weiter. Es ist die ordinale Gerechtigkeitsordnung: eine Verbesserung des Schlechtestgestellten wiegt schwerer als jeder Ausgleich weiter oben. Bouveret und Lemaître zeigen fünf CP-Algorithmen; der praktikabelste („successively maximizes the elements of a sorted objective vector“) ist für unsere Größenordnung ideal.

**Kodierung für BD/HG (Minimierung der Last, also Leximax auf Belastung):**

1. `L_p = Σ_d y[bd_d][p] + α · Σ_d y[hg_d][p]` — kombinierte Last je Person (α = Gewichtungsfaktor HG gegenüber BD, einstellbar).
2. Stufe 1: `M ≥ L_p ∀p`, `min M` → obere Belastungsschranke.
3. Stufe 2: `M` fixieren, Anzahl der Personen mit `L_p = M` minimieren (Indikator `t_p` mit `L_p ≤ M − 1 + t_p`, in CP-SAT als `add(L_p ≤ M − 1).onlyEnforceIf(¬t_p)` — ohne Big-M).
4. Weiter absteigend, bis der Vektor eindeutig ist — oder Abbruch nach `k` Stufen (Zeitbudget).

**Alternative Formulierung** über die Summe der `k` größten Lasten (`Σ_{i≤k} L_(i)`), linear darstellbar nach Ogryczak/Śliwiński; für monotone Gewichte ist die OWA-Zielfunktion sogar rein linear. Beide Wege sind exakt; die sortierte Variante ist besser erklärbar, die OWA-Variante schneller.

**Eignung:** Löst genau die Schwäche aus 3.1(3). Die Stufenzahl ist ein natürlicher Zeitbudget-Regler.

### 5.3 OWA / Gini / Jain als weiche Fairnessmaße — **Eignung 3/5**

**Erklärung.** OWA gewichtet die *sortierten* Werte mit absteigenden Gewichten; Leximin ist der Grenzfall, wenn die Gewichtsverhältnisse gegen unendlich gehen. Der Gini-Koeffizient ist die Summe aller paarweisen Absolutdifferenzen, normiert; Jains Index ist `(Σx)² / (n·Σx²)` mit Wertebereich `(0,1]`.

**Bewertung.** Als **Anzeige** hervorragend — Jains Index ist eine einzige, sofort verständliche Zahl für „wie gerecht ist dieser Monat“ und gehört ins Ergebnis-Panel. Als **Zielfunktion** in einem exakten Modell nachrangig: Gini erfordert quadratisch viele Hilfsvariablen, Jain ist nicht linear. **Empfehlung: als Kennzahl ja, als Optimierungsziel nein.**

### 5.4 MILP über HiGHS-js / glpk.js — **Eignung 3/5**

**Erklärung.** Dasselbe Boolean-Modell ist ein reines 0/1-MILP. `highs-js` (HiGHS als WASM) und `glpk.js` (GLPK als WASM) lösen es im Browser, beide kostenfrei.

**Bewertung.** Technisch tragfähig, aber CP-SAT ist auf genau dieser Problemklasse (viele logische Implikationen, Kardinalität, symmetrische Alternativen) das stärkere Werkzeug: Lazy Clause Generation, Presolve und Symmetriebehandlung sind hier entscheidend, nicht Simplex-Qualität. **Empfohlene Rolle: optionaler Zweitmeinungs-Solver für ein Regressions-Testtor**, nicht als Produktionspfad. Vorteil: `highs-js` ist deutlich kleiner als 6 MB und kann als Notfall-Reserve dienen, wenn CP-SAT nicht lädt.

### 5.5 SMT (Z3 via WASM) — **Eignung 2/5**

Combrink et al. (2025) vergleichen SMT (Z3) und MILP (Gurobi) auf einer generischen NRP-Formulierung: „the MILP solver generally performs better when the problem is highly constrained or infeasible, while the SMT solver performs better otherwise“; Z3 glänzt bei vielen Schichttypen und heterogenem Personal, ist aber **empfindlich gegenüber der Formulierung**. Unser Fall ist stark restringiert und muss Unerfüllbarkeit gut behandeln — das ist genau die Seite, auf der MILP/CP-SAT vorn liegt. **Nicht empfohlen.**

### 5.6 MaxSAT (partial weighted, core-guided) — **Eignung 3/5**

Staff Scheduling als Partial Weighted MaxSAT ist etabliert (INRC2-Instanzen wurden so erstmals modelliert). Core-guided Solver wie RC2 sind stark. **Für uns relevant nicht als Suchverfahren, sondern als Denkfigur für die Diagnose:** die Minimierung der Summe verletzter weicher Klauseln ist exakt die MCS-Formulierung aus Abschnitt 8.3, und die beherrscht CP-SAT selbst. **Übernehmen als Muster, nicht als Bibliothek.**

### 5.7 Branch-and-Price / Spaltengenerierung — **Eignung 1/5**

**Erklärung.** Das Standardverfahren für große Rostering-Instanzen: Das Masterproblem wählt aus einer Menge zulässiger *Personendienstpläne* (Spalten), das Pricing-Subproblem erzeugt neue Spalten über kürzeste Wege mit Ressourcen. Aktuelle Arbeiten (Chvátal–Gomory-Rang-1-Schnitte, Subset-Row-Cuts, {0,½}-Cuts; INRC-I/II 2025) verbessern die notorisch schwachen unteren Schranken der Spaltengenerierung erheblich — mit 91,5 % Zeitersparnis durch Vorabregeln bei den SRCs.

**Bewertung.** Wissenschaftlich der stärkste exakte Ansatz für **große** Instanzen. Unsere Instanz hat 60 Felder und 8 Personen und wird direkt in 0,2 s optimal gelöst. Branch-and-Price wäre hier ein Kran für eine Blumenvase — und die Implementierung in JavaScript wäre ein Vielfaches des Gesamtprojekts. **Klar abgelehnt, mit Begründung dokumentiert.**

### 5.8 Matheuristik: Fix-and-Optimize / Fix-and-Relax / Rolling Horizon — **Eignung 3/5**

**Erklärung.** Das Problem wird in Fenster zerlegt (typisch: Wochen), je Fenster exakt gelöst, der Rest fixiert; anschließend wandert das Fenster. Hybride aus F&R/F&O und Simulated Annealing sind für NRP gut belegt.

**Bewertung.** Für den Monatsplan **nicht nötig** — aber es ist die richtige **Notbremse**, wenn ein Monat einmal doch nicht in Budget löst (viele Fixpunkte, extreme Abwesenheiten): wochenweise Fenster mit fixiertem Rest, dann eine Glättungsrunde. **Als Eskalationsstufe einplanen, nicht als Standardpfad.**

## 6. B2 — Verbesserungsverfahren

### 6.1 ALNS (Adaptive Large Neighborhood Search) — **Eignung 5/5** ★ beibehalten

Bereits vorhanden und gut gebaut (Abschnitt 3). Rolle in v10.5: **Warmstart-Erzeuger, Anytime-Sicherung und Fallback**, nicht mehr Hauptpfad. Ein guter Warmstart-Hint verkürzt die exakte Suche messbar; umgekehrt ist ALNS die Versicherung, wenn WASM nicht lädt.

### 6.2 LNS **auf** CP-SAT (Variablen fixieren + neu lösen) — **Eignung 4/5**

**Erklärung.** Statt eigene Nachbarschaften zu programmieren, fixiert man einen Großteil der `y`-Variablen auf die Inkumbenten-Werte und lässt CP-SAT den Rest exakt neu optimieren. Neighborhoods: eine Person, ein Wochenende, ein Wochenfenster, alle Felder mit roter Bewertung. Das ist die Standardtechnik, wenn die exakte Suche in Budget nicht abschließt.

**Bewertung.** Für 60 Felder meist unnötig. **Aber**: genau dieser Mechanismus ist die saubere Antwort auf *Nachbesserung nach manueller Änderung* (Abschnitt 7.1) — er ändert wenig und begründet die Änderung exakt. **Aufnehmen als „Reparaturlauf“.**

### 6.3 LAHC / Simulated Annealing / Hyper-Heuristik — **Eignung 3/5**

LAHC ist bereits implementiert und ist gegenüber SA im Vorteil, weil es **einen** Parameter hat (Listenlänge) statt eines Abkühlungsschemas und damit weniger anfällig für Fehlparametrisierung ist. Kein Wechselbedarf. Hyper-Heuristiken (Operatorwahl über Bandit) sind über `selectAdaptiveOperator` bereits vorhanden — **mit der Normierungskorrektur aus 3.1(1)**.

### 6.4 Iterative Forward Search — **Eignung 2/5**

Müller/Rudová/Barták entwickelten IFS mit konfliktbasierter Statistik für Universitäts-Stundenpläne und speziell für das *minimal perturbation problem*. Konzeptionell verwandt mit dem vorhandenen Repair-Schritt; ein Wechsel bringt bei unserer Größe nichts. **Die Idee der konfliktbasierten Statistik** (welche Zuweisung verursacht wiederholt Rücknahmen?) ist dagegen als **Erklärungsquelle** wertvoll.

## 7. B3 — Stabilität und Unsicherheit

### 7.1 Minimal Perturbation Problem — **Eignung 5/5** ★ Kernempfehlung

**Erklärung.** Ändert sich die Eingabe (neue Abwesenheit, manuell gesetzter Dienst), soll die neue Lösung sich **so wenig wie möglich** von der bisherigen unterscheiden. Barták/Müller/Rudová haben das erstmals auf reale Stundenplaninstanzen angewandt; es gibt exakte IP- und MaxSAT-Formulierungen.

**Kodierung.** Für jede Zuweisung `(f, p)` des Vorstands ein Term `(1 − y[f][p])` in einer eigenen, **nachrangigen** lexikografischen Stufe. Das ist eine Zeile Code und ersetzt die heutige, invertierte Perturbationslogik vollständig.

**Bewertung.** Fachlich zentral: Ein Plan, der sich bei jeder Kleinigkeit umbaut, wird nicht benutzt. Als *letzte* Stufe der Leximin-Kaskade kostet Stabilität nichts an Qualität und macht den Vorschlag berechenbar.

### 7.2 Robuste / stochastische Rostering-Modelle — **Eignung 2/5 (jetzt), 4/5 (Ausblick)**

**Erklärung.** Zwei- und mehrstufige stochastische Programme, szenariobasierte robuste Optimierung und *distributionally robust optimization* modellieren Ausfälle und Nachfrageschwankungen explizit; ein Hurdle-Modell erzeugt realistische Ausfallszenarien für Robustheitstests.

**Bewertung.** Der volle Apparat ist hier überdimensioniert. **Der kostenlose Teil davon ist es nicht:** eine *Robustheitskennzahl* — „wie viele Felder werden rot, wenn eine beliebige Person einen Tag ausfällt?“ — lässt sich durch `n_Personen × n_Tage` Neubewertungen des fertigen Plans in Millisekunden berechnen und ist eine sehr aussagekräftige Qualitätsangabe. **Als Kennzahl aufnehmen, als Optimierungsziel vorerst nicht.**

### 7.3 Mehrperiodische Fairness (Carry-over über Monate) — **Eignung 4/5**

**Erklärung.** Fairness in einem einzelnen Monat ist nicht Fairness. Wer im März drei Wochenenden hatte, muss im April entlastet werden. Die Literatur zur periodischen Zuweisung („Schedules Need to be Fair Over Time“, „Fair Periodic Assignment Problem“) formalisiert genau das; die Praxis nennt es Equitable Distribution Index über kumulierte Daten.

**Bewertung.** Der Zustand enthält bereits alle Vormonate (`state.months`). Ein **Carry-over-Konto** je Person (BD, HG, Wochenendäquivalent, jeweils gleitend über *k* Monate) fließt als Startversatz in den Leximin-Lastvektor ein: `L_p = aktuelle Last + λ · Rückstand_p`. Das ist ein kleiner Eingriff mit großer wahrgenommener Wirkung. **Aufnehmen, mit Regler λ und Fensterlänge k.**

## 8. B4 — Erklärbarkeit und Konfliktdiagnose

### 8.1 MUS / QuickXplain — **Eignung 4/5**, aber **nicht so wie heute**

**Erklärung.** Ein Minimal Unsatisfiable Subset ist eine kleinste Constraint-Menge, die für sich unerfüllbar ist. QuickXplain findet ihn **dichotom** (rekursive Halbierung) statt durch lineare Löschung; MARCO kartiert die Grenze zwischen erfüllbaren und unerfüllbaren Teilmengen.

**Bewertung.** Das Konzept ist richtig. Die heutige Umsetzung (lineare Löschung über **jeden einzelnen Constraint**) ist es nicht. **Korrektur:** QuickXplain **auf Gruppenebene** (7 Gruppen → ≈ log₂ 7 · c Solves statt 1.984) — das ist die Auflösung, die eine Oberfläche ohnehin nur zeigen kann.

### 8.2 Assumptions / UNSAT-Core — **Eignung 3/5 (blockiert)**

CP-SAT beherrscht seit Version 8.2 `add_assumptions` und `sufficient_assumptions_for_infeasibility`. Das ist der eleganteste Weg: jeder relaxierbare Constraint bekommt ein Enforcement-Literal, das als Annahme gesetzt wird; der Solver liefert den Kern selbst zurück. Der Ergebniskern ist heuristisch reduziert und **nicht garantiert minimal**; für Minimalität minimiert man stattdessen die Summe der Literale.

**Blocker:** `cpsat-js` exportiert `assumptions` derzeit **nicht** über sein `SolverParams`/Proto-Interface. **Als Beitrag an das Upstream-Projekt vormerken**; bis dahin 8.3.

### 8.3 Minimum Correction Set über Relaxationsliterale — **Eignung 5/5** ★ Empfehlung

**Erklärung.** Jede relaxierbare Regelgruppe `g` erhält ein Literal `r_g`; alle Constraints der Gruppe werden mit `.onlyEnforceIf(r_g)` versehen. Dann `maximize Σ w_g · r_g`. Die Lösung sagt in **einem einzigen Solve**: „Dieser Monat ist lösbar, wenn genau *diese* Regeln aufgegeben werden“ — und liefert direkt den zugehörigen Plan mit. Das ist die MaxSAT-Denkfigur aus 5.6, ausgeführt von CP-SAT.

**Gemessen (künstlich unerfüllbar gemachte Instanz, 8 Relaxationsgruppen):** `FEASIBLE` nach 15 s Budget, 5 von 8 Regeln aufgegeben. Wichtige, ehrliche Beobachtung: **die Minimierung der Aufgabemenge ist selbst ein hartes Optimierungsproblem** und war in 15 s nicht beweisbar optimal. Konsequenz für die Umsetzung: MCS **anytime** führen (jede Verbesserung sofort anzeigen), mit kurzem Budget, und das Ergebnis als „so wenig wie in *t* Sekunden nachweisbar“ auszeichnen — nicht als Minimum behaupten.

**MUS und MCS sind komplementär:** MUS beantwortet „warum geht es nicht?“, MCS beantwortet „was müsste ich aufgeben?“. Die Oberfläche sollte beides zeigen; MCS zuerst, weil es handlungsleitend ist.

### 8.4 Schrittweise Erklärungen / LLM-Begründung — **Eignung 2/5**

Es gibt Rahmenwerke für schrittweise Erklärungen von Constraint-Lösungen und aktuelle Arbeiten zu LLM-gestützter Optimierungsmodellierung (SCHEDBench, LLM-MILP-Engines, Canonical Intermediate Representation). Für **Begründungstexte** interessant, für die **Suche** ungeeignet und im kostenfreien Rahmen nicht verlässlich. **Nicht in v10.5.** Die vorhandene `auto-plan-commentary.js` deckt den Bedarf regelbasiert und nachvollziehbar ab.

## 9. B5 — Lernende Verfahren

### 9.1 ML-gesteuerte LNS / Neural Diving / Learning-to-Branch — **Eignung 1/5**

Der Forschungsstand ist beeindruckend: Neural Diving erzeugt Startbelegungen, Neural Neighborhood Selection wählt Nachbarschaften und schlägt Referenzverfahren auf fünf großen realen MIP-Datensätzen; supervised LNS und LLM-gestützte Nachbarschaftswahl (LLM-LNS) sind 2025er Themen.

**Bewertung.** Voraussetzung ist eine **Trainingsverteilung ähnlicher Instanzen**. Wir haben 12 Instanzen pro Jahr, die in 0,2 s exakt gelöst werden. Es gibt nichts zu lernen und nichts zu beschleunigen. **Abgelehnt.** — Die bereits vorhandene **Bandit-Operatorwahl** ist die einzige lernende Komponente, die hier Sinn ergibt, weil sie *innerhalb eines Laufs* lernt und kein Training braucht.

### 9.2 WebGPU-parallele Nachbarschaftsauswertung — **Eignung 1/5**

WebGPU-Compute ist 2026 breit verfügbar (≈ 82 % Marktabdeckung), Safari hinkt bei Compute-Shadern nach. Für eine Suche, die in Millisekunden fertig ist, ist GPU-Parallelisierung sinnlos, und die Regelauswertung ist verzweigungsreich — der denkbar schlechteste GPU-Workload. **Abgelehnt.**

## 10. B6 — Ausführungsumgebung

### 10.1 `cpsat-js` portable vs. threaded — **Empfehlung: portable, ohne COEP-Zwang**

| | portable | threaded |
|---|---|---|
| `SharedArrayBuffer` | nein | ja |
| COOP/COEP nötig | **nein** | ja |
| `numWorkers` | auf 1 geklemmt | 8 (Default) |
| Referenzmessung (512-Variablen-Modell) | 4.065 ms | 431 ms |

Der Herstellerhinweis ist eindeutig: `numWorkers` wählt das Subsolver-Portfolio; **2 bis 5 Worker sind langsamer als 1**. Nur 1 oder ≥ 6 sind sinnvoll.

**Entscheidung für v10.5: portable.** Begründung: Unser Modell ist um zwei Größenordnungen kleiner als die zitierte Referenz und löst portabel in 0,2 s. Der Preis für threaded — anwendungsweite Cross-Origin-Isolation mit allen Folgen für Fremdressourcen (Defekt 4) — steht in keinem Verhältnis. **`Cross-Origin-Embedder-Policy: require-corp` kann und sollte entfallen**, was zugleich das SheetJS-Risiko beseitigt.

### 10.2 Web Worker — **zwingend**

`CpSolver.solve()` ist in `cpsat-js` **synchron** und blockiert den Thread vollständig. Die Engine läuft bereits in `js/auto-plan-worker.js`; das ist beizubehalten und strikt durchzuhalten. Die `onSolution`-Rückrufe feuern bei `numWorkers = 1` **live während des Solves** (`live: true` — verifiziert) und werden per `postMessage` an die Oberfläche gestreamt.

### 10.3 WASM-Auslieferung und Zwischenspeicherung

- **Import-Map ist Pflicht** (Defekt 4): `@bufbuild/protobuf` muss vendorisiert und über `<script type="importmap">` aufgelöst werden — sonst bleibt der lokale Pfad tot.
- **6 MB WASM** einmalig; `/vendor/*` trägt bereits `Cache-Control: public, max-age=31536000, immutable`. Zusätzlich Vorabladen per `Cache`-API beim ersten Öffnen des Studios, nicht beim Anwendungsstart.
- **Lazy Loading** bleibt richtig: erst beim Klick auf Auto-Plan.

### 10.4 Cloudflare-Rahmen — unkritisch, mit einer Ausnahme

Workers KV im kostenfreien Tarif: **100.000 Lesevorgänge/Tag, 1.000 Schreibvorgänge/Tag, 1 GB Speicher, 25 MB je Wert**, Rücksetzung täglich 00:00 UTC. Pages: 500 Builds/Monat; Pages Functions rechnen als Workers ab.

**Die einzige reale Grenze sind die 1.000 Schreibvorgänge pro Tag.** Ein Auto-Plan-Lauf darf deshalb **nie** Zwischenstände nach KV schreiben — nur die eine bestätigte Übernahme. Für Zwischenstände: `localStorage`/IndexedDB. Das entspricht dem heutigen Verhalten und ist beizubehalten; im Bericht ausdrücklich festgehalten, damit es nicht versehentlich verletzt wird.

### 10.5 Bibliotheken und Bausteine — Auswahl für v10.5

| Baustein | Lizenz | Kosten | Rolle | Urteil |
|---|---|---|---|---|
| `cpsat-js` (portable) | Apache-2.0 | frei | exakter Kern | **einbinden** (vendorisiert, Import-Map ergänzen) |
| `@bufbuild/protobuf` | Apache-2.0 | frei | Abhängigkeit von cpsat-js | **vendorisieren** (Pflicht) |
| `highs-js` | MIT | frei | Zweitmeinung/Notreserve | **optional**, hinter Fahne |
| `comlink` | Apache-2.0 | frei | Worker-RPC | **optional** — der vorhandene `postMessage`-Vertrag genügt |
| `d3-scale`, `d3-shape` | ISC | frei | Achsen/Pfade der Animation | **optional**, nur diese zwei Module |
| `MiniZinc.js` | MPL-2.0 | frei | Modellierungssprache | **abgelehnt** (Größe, zweite Modellsprache) |
| `or-tools-wasm` | Apache-2.0 | frei | CDN-Reserve | **beibehalten** als letzte Stufe |

Kein Framework-Wechsel. Der Bestand ist reines ESM ohne Build-Schritt; das ist für Cloudflare Pages die robusteste Auslieferung und soll so bleiben.

---

# TEIL C — Bewertungsmatrix

| # | Verfahren | Exaktheit | Browser-Tauglichkeit | Aufwand | Fachlicher Nutzen | **Eignung** | Rolle in v10.5 |
|---|---|---|---|---|---|---|---|
| 5.1 | CP-SAT Boolean One-Hot | ★★★★★ | ★★★★★ | mittel | ★★★★★ | **5/5** | **Kern** |
| 5.2 | Leximin (sortierter Vektor) | ★★★★★ | ★★★★★ | mittel | ★★★★★ | **5/5** | **Fairnesskern** |
| 7.1 | Minimal Perturbation | ★★★★★ | ★★★★★ | gering | ★★★★★ | **5/5** | **letzte Zielstufe** |
| 8.3 | MCS über Relaxationsliterale | ★★★★☆ | ★★★★★ | gering | ★★★★★ | **5/5** | **Diagnose** |
| 6.1 | ALNS (Bestand) | ★★☆☆☆ | ★★★★★ | – | ★★★★☆ | **5/5** | **Warmstart + Fallback** |
| 6.2 | LNS auf CP-SAT | ★★★★☆ | ★★★★★ | gering | ★★★★☆ | **4/5** | **Reparaturlauf** |
| 7.3 | Mehrperiodische Fairness | ★★★★☆ | ★★★★★ | gering | ★★★★★ | **4/5** | **Lastvektor-Versatz** |
| 8.1 | MUS/QuickXplain (Gruppen) | ★★★★☆ | ★★★★☆ | gering | ★★★★☆ | **4/5** | **Zweitdiagnose** |
| 5.3 | OWA/Gini/Jain | ★★★☆☆ | ★★★★★ | gering | ★★★☆☆ | **3/5** | **Kennzahl** |
| 5.4 | MILP (HiGHS-js) | ★★★★☆ | ★★★★☆ | mittel | ★★☆☆☆ | **3/5** | Testtor, Reserve |
| 5.6 | MaxSAT | ★★★★☆ | ★★★☆☆ | hoch | ★★★☆☆ | **3/5** | nur als Muster |
| 5.8 | Fix-and-Optimize | ★★★☆☆ | ★★★★★ | mittel | ★★★☆☆ | **3/5** | Eskalationsstufe |
| 6.3 | LAHC/SA/Hyper-Heuristik | ★★☆☆☆ | ★★★★★ | – | ★★★☆☆ | **3/5** | Bestand, kalibrieren |
| 7.2 | Robuste/stochastische Modelle | ★★★★☆ | ★★★☆☆ | hoch | ★★★☆☆ | **2/5** | nur Kennzahl |
| 8.2 | Assumptions/UNSAT-Core | ★★★★★ | ★★☆☆☆ | gering | ★★★★☆ | **3/5** | blockiert (Upstream) |
| 6.4 | Iterative Forward Search | ★★★☆☆ | ★★★★☆ | hoch | ★★☆☆☆ | **2/5** | abgelehnt |
| 5.5 | SMT (Z3) | ★★★★☆ | ★★★☆☆ | hoch | ★★☆☆☆ | **2/5** | abgelehnt |
| 8.4 | LLM-Erklärung | ★☆☆☆☆ | ★★★☆☆ | mittel | ★★☆☆☆ | **2/5** | abgelehnt |
| 5.7 | Branch-and-Price | ★★★★★ | ★☆☆☆☆ | sehr hoch | ★★☆☆☆ | **1/5** | abgelehnt |
| 9.1 | ML-gesteuerte LNS | ★★★☆☆ | ★★☆☆☆ | sehr hoch | ★☆☆☆☆ | **1/5** | abgelehnt |
| 9.2 | WebGPU-Parallelisierung | – | ★★★☆☆ | hoch | ★☆☆☆☆ | **1/5** | abgelehnt |

---

# TEIL D — Die exakte Empfehlung

## 11. Engine v10 — „Exact Boolean Rostering Core“

**Die Kombination, nicht die Einzelmaßnahme:**

```
1  ANALYSE        Fixpunkte, Domänen je Feld, Carry-over-Konten aus den Vormonaten
2  WARMSTART      v8.5-ALNS (unverändert) → vollständiger, regelgeprüfter Plan
                  → dient als Hint UND als garantierte Rückfallebene
3  MODELL         Boolean One-Hot y[f][p], nur zulässige Kandidaten
                  harte Regeln linear · weiche Regeln als Zählterme
                  jede relaxierbare Gruppe g trägt ein Literal r_g (onlyEnforceIf)
4  EXAKTE KASKADE lexikografisch, je Stufe: lösen → Wert per Blocking-Constraint
                  fixieren → Lösung als Hint in die nächste Stufe
     S0  Zulässigkeit + alle r_g = 1
     S1  Leximin auf kombinierter Last L_p (inkl. Carry-over)      [k Stufen]
     S2  Wunscherfüllung
     S3  BD-Soll-Abweichung
     S4  Wochenend- und Samstagsausgleich
     S5  Wochenendkette / CT-Leitung
     S6  Minimal-Perturbation gegen den Warmstart
5  AUDIT          Regelengine prüft den Vorschlag vollständig (unverändert)
                  besser als Warmstart → übernehmen, sonst Warmstart behalten
6  ZERTIFIKAT     bestObjectiveBound je Stufe → OPTIMAL beweisbar
7  BEI KONFLIKT   max Σ w_g·r_g  →  MCS anytime  (+ QuickXplain auf Gruppen)
8  BEI ÄNDERUNG   LNS auf CP-SAT: Umgebung der Änderung freigeben, Rest fixieren
```

**Warum genau diese Kombination und keine andere:**

- **CP-SAT Boolean** ist alternativlos, weil erst diese Darstellung Kardinalität, Fairness und Wünsche überhaupt ausdrückbar macht (Defekt 2 ist kein Bug, sondern die Quittung für die falsche Darstellung).
- **Leximin** statt Varianz, weil Gerechtigkeit ordinal ist und die Betroffenen sie ordinal erleben.
- **Blocking-Constraints + Hints** ist die von OR-Tools selbst empfohlene Prozedur: lösen, Zielwert festschreiben, Lösung als Hint übergeben, nächste Stufe. Der Hinweis des Maintainers — Blocking-Constraints machen jede Folgestufe schwerer, weil weniger Variablen fixiert sind — ist bei unserer Größe folgenlos und wird durch Hints kompensiert.
- **MCS vor MUS**, weil „was muss ich aufgeben“ handlungsleitend ist und „warum geht es nicht“ nur erklärend.
- **ALNS bleibt**, weil eine Engine, die ohne WASM nichts kann, keine Engine ist.
- **Minimal Perturbation ganz zuletzt**, weil Stabilität nie Qualität kosten darf, aber immer Gleichstände entscheiden soll.

## 12. Was ersatzlos entfällt

| Entfällt | Grund |
|---|---|
| `addNotEqual`, `addReifiedEqual`, `addReifiedNotEqual`, `BIG_M` | durch `onlyEnforceIf` und Booleans vollständig ersetzt; heute fehlerhaft |
| Integer-Slot-Variablen mit Personencodes | Wurzel von Defekt 2 |
| die neun `cpSat*Weight`-Regler | mathematisch wirkungslos (Defekt 5) |
| `fairnessProfile: spread/variance/owa` | nie implementiert |
| `diagnoseInfeasibility` Ebene 2 (Constraint-Löschschleife) | vierstellige Solve-Zahl ohne Aussagewert |
| `random_seed`/`log_search_progress` in `cpSatParameters` | von `cpsat-js` nicht entgegengenommen |
| `Cross-Origin-Embedder-Policy: require-corp` | für den portablen Build nicht nötig; gefährdet Fremdressourcen |

---

# TEIL E — Implementierungsplan v10.5

## 13. Verifikationsprotokoll (Grundlage der Planung)

Alle Aussagen dieses Berichts über den Ist-Zustand wurden ausgeführt, nicht gelesen:

| Prüfung | Methode | Ergebnis |
|---|---|---|
| Reifikation | erschöpfende Enumeration aller Belegungen eines `addReifiedEqual`-Blocks | `x == v` in **keiner** Belegung erfüllbar |
| Obergrenzen | Termmengen aller `limit_bd_*` am real gebauten Modell verglichen | für alle Personen **identisch**, = alle BD-Slots; `Σ ≥ 28 > ub = 4` |
| Gewichte | distinkte Gewichte je Zielkomponente gezählt | überall **genau 1** → Skalierung wirkungslos |
| Zweigwahl | `normalizeSolverApi`-Bedingung gegen die realen `cpsat-js`-Exporte | erster Zweig greift, zweiter ist tot |
| Modellgröße | `buildCpSatModel` auf 28-Tage-Monat | 56 Variablen, **1.016 Hilfsvariablen, 1.984 Constraints** |
| Neues Modell | Prototyp gegen echtes `cpsat-js`-WASM, 30 Tage/60 Felder/8 Personen | `OPTIMAL` 218 ms · Minimax BD-Last `OPTIMAL` 188 ms (Bound = Wert) · Kaskade 445 ms |
| MCS-Diagnose | 8 Relaxationsliterale, künstlich unerfüllbar | `FEASIBLE` in 15 s, 5/8 aufgegeben — **nicht beweisbar minimal** |
| Inkumbenten-Stream | `onSolution` mit `numWorkers: 1` | feuert **live** während des Solves (`live: true`) |

**Zwei API-Fallen von `cpsat-js`, die im Plan berücksichtigt sein müssen:**

1. **`IntVar.notEquals()` ist wirkungslos.** Die Methode erzeugt `BoundedLinearExpression(diff, INT_MIN, INT_MAX)`; `CpModel.add()` schreibt daraus die Domäne `[lb−offset, ub−offset]` — ein einziges Intervall ohne Loch. Der Quelltext kündigt eine Sonderbehandlung an (`// We'll handle this specially in CpModel.add()`), die **nicht existiert**. Ein `add(x.notEquals(y))` ist stillschweigend kein Constraint. → **In v10.5 nie verwenden**; Ungleichheit ausschließlich über Booleans.
2. **`LinearExpr.plus/minus` konvertiert nicht.** `IntVar.plus(x)` wandelt via `toLinearExpr`, `LinearExpr.plus(x)` erwartet bereits einen `LinearExpr` und wirft sonst `other.terms is not iterable`. → Eine Hilfsfunktion `sumOf(literals)` kapseln, die jeden Summanden explizit konvertiert. (Im Prototyp dreimal aufgelaufen — genau die Art Falle, die eine Bibliotheksschicht abfangen muss.)

## 14. Arbeitspakete

Reihenfolge ist bindend: jedes Paket ist für sich lauffähig und testbar.

### P0 — Ladefähigkeit herstellen *(Voraussetzung für alles)*
- `@bufbuild/protobuf` nach `vendor/bufbuild/` vendorisieren.
- `<script type="importmap">` in `index.html` **und** im Worker-Kontext (`import`-Map gilt nicht in Workern → im Worker den vollständigen Pfad importieren oder das Vendor-Bundle vorab zu einer Datei ohne bloße Bezeichner zusammenführen).
- `Cross-Origin-Embedder-Policy` aus `_headers` entfernen; `Cross-Origin-Opener-Policy: same-origin` darf bleiben.
- SheetJS entkoppeln: entweder lokal vendorisieren oder mit `crossorigin="anonymous"` laden.
- **Test:** Browser-E2E lädt `/vendor/cpsat-js/dist/index.portable.js` und löst ein Zwei-Variablen-Modell. Grün = P0 fertig.

### P1 — Solver-Brücke neu *(`js/auto-plan-solver.js`, ersetzt die Bindungsschicht)*
- Erkennung **cpsat-js zuerst** (`typeof module.CpSolver.create === 'function'`), danach `or-tools-wasm`.
- Einmalige `CpSolver.create()`-Instanz je Worker-Lebensdauer, wiederverwendet.
- `sumOf()`-Hilfsfunktion, Verbot von `notEquals` durch Lint-Regel/Kommentar.
- Parameterabbildung ausschließlich auf `maxTimeInSeconds`, `numWorkers`, `onSolution`.
- `onSolution` → `postMessage({ type: 'incumbent', objective, bound, assignment })`.
- **Test:** Unit-Test gegen ein Miniaturmodell mit bekanntem Optimum; Statusabbildung numerisch → Name.

### P2 — Modellbau neu *(`js/auto-plan-model.js`, ersetzt `buildCpSatModel`)*
- Boolean One-Hot mit Kandidatenfilter aus `basicallyEligiblePeers` (unverändert die fachliche Quelle).
- Harte Regeln: Belegung, BD≠HG, BD-Folgetage, HG(Mo–Do)→BD, Becker-FZA, Polednia-Sperren, Obergrenzen BD/HG/Gesamt.
- Weiche Terme: Wünsche, BD-Soll, Wochenende, Samstag, HG-Last, Wochenendkette, CT-Leitung, Perturbation.
- Jede Gruppe mit Literal `r_g` und `.onlyEnforceIf(r_g)`.
- **Vollständig solverfrei und in Node testbar** (wie heute — diese Eigenschaft war richtig und bleibt).
- **Test:** Für jede Regel ein Test, der einen regelverletzenden Plan als unzulässig und einen zulässigen als zulässig nachweist. Zusätzlich ein **Kreuztest gegen die Regelengine**: 200 zufällige Pläne, Modellzulässigkeit ⇔ kein graues/rotes Urteil. Das ist das Tor gegen Modell-Drift.

### P3 — Lexikografische Kaskade *(`js/auto-planner-v10.js`)*
- Stufenliste als Datenstruktur (id, Zielausdruck, Budgetanteil, Fixierungsart).
- Nach jeder Stufe: `add(expr.le(v))` **und** Lösung als Hint.
- Zeitbudget pro Stufe proportional, mit Restverteilung nach vorne (frühe Stufen sind wichtiger).
- Abbruchsignal respektieren, Zwischenstand bleibt gültig.
- **Test:** Kaskade auf Fixtures; jede Stufe muss `OPTIMAL` mit `bound == value` melden; Stufe *n* darf Stufe *n−1* nicht verschlechtern.

### P4 — Leximin + Carry-over
- `L_p = Σ BD + α·Σ HG + λ·Rückstand_p(k Monate)`.
- Stufenweises Absenken der Maximallast, `k` Stufen aus dem Zeitbudget.
- **Test:** konstruierte Instanz mit erzwungener Ungleichverteilung; Leximin muss den Schlechtestgestellten nachweislich anheben, ohne die Summe zu verschlechtern.

### P5 — Diagnose neu
- MCS: `maximize Σ w_g·r_g`, anytime über `onSolution`, Ergebnis als „nachgewiesen in *t* s“ ausweisen — **nicht** als Minimum behaupten.
- QuickXplain auf Gruppenebene als Zweitdiagnose (≈ 20 statt 1.984 Solves).
- Alte `diagnoseInfeasibility`-Ebene 2 entfernen.
- **Test:** unerfüllbare Fixture; MCS nennt die tatsächlich verletzte Gruppe; Laufzeit unter Budget.

### P6 — Reparaturlauf (LNS auf CP-SAT)
- Auslöser: manuelle Änderung nach einem Lauf.
- Freigabefenster: geänderter Tag ± 3 Tage, gleiches Wochenende, betroffene Person im ganzen Monat.
- Rest per `add(y.equals(1))` fixiert, Kaskade nur auf dem Fenster.
- **Test:** Änderung eines Feldes darf höchstens **25** weitere Felder bewegen. Dieser Schwellwert ist keine Annahme, sondern die obere Schranke des Freigabefensters selbst: 7 Tage × 2 Rollen (Tag ± 3) + 2 Tage × 2 Rollen (gleiches Wochenende, worst case ohne Überlappung mit dem Tagesfenster) + Ø 8 Felder der betroffenen Person über den ganzen Monat (60 Felder / 8 Personen der Referenzinstanz aus Abschnitt 1) = 26 Felder im Fenster; abzüglich des bereits geänderten Feldes selbst verbleiben **n = 25**. Da die Kaskade außerhalb des Freigabefensters ausschließlich `add(y.equals(1))`-Fixierungen sieht, kann kein Feld jenseits dieser Schranke bewegt werden — die Zusicherung ist damit für jede konkrete Instanz vorab berechenbar und automatisiert prüfbar.

### P7 — Studio-Einstellungen v10.5 *(Abschnitt 15)*

### P8 — Layout und Animation *(Abschnitte 16, 17)*

### P9 — Abschluss
- Versions-Token gemeinsam anheben (`index.html`, Manifest, Asset-Queries, Icon-Query, `package.json`).
- Dateiliste des `check`-Skripts in `package.json` nachziehen: `js/auto-plan-solver.js`, `js/auto-plan-model.js`, `js/auto-planner-v10.js` und `js/auto-plan-crystallize.js` ergänzen; `js/auto-planner-v9.js` und `js/auto-plan-cp-sat.js` (abgelöste Engine v9.5, siehe Abschnitt 0) entfernen. `npm run verify` ruft nur `check`, `test` und `test:e2e` auf (siehe `.github/workflows/ci.yml`) — ohne diesen Schritt liefe die neue Engine v10 ohne Syntaxprüfung durch die CI.
- `docs/AUTO-PLAN-CHANGELOG.md` fortschreiben.
- README-Abschnitt „Auto-Plan v10“ ersetzt „Auto-Plan v9“.
- Vollständiger Lauf `npm run verify`.

## 15. Studio-Einstellungen v10.5

**Entfernt** (wirkungslos): neun `cpSat*Weight`-Regler, `fairnessProfile` mit den Attrappen-Profilen, `cpSatWorkers` (portabel immer 1).

**Neu bzw. neu belegt** — jeder Regler verändert nachweislich das Ergebnis:

| Regler | Wertebereich | Wirkung |
|---|---|---|
| **Zielreihenfolge** | Drag-&-Drop-Liste der Stufen S1–S6 | *die* eigentliche Steuerung: lexikografische Priorität ist die ehrliche Form von „Gewichtung“ |
| **Leximin-Tiefe** `k` | 1–8 (Default 3) | wie viele Ränge des sortierten Lastvektors exakt festgezurrt werden |
| **HG-Faktor** `α` | 0,0–1,0 (Default 0,6) | wie stark ein HG gegenüber einem BD als Last zählt |
| **Carry-over-Fenster** `k` | 0–6 Monate (Default 3) | Länge des Fairness-Gedächtnisses |
| **Carry-over-Gewicht** `λ` | 0–100 % (Default 50) | wie stark Rückstände aus Vormonaten den Startversatz bestimmen |
| **Stabilitätsstufe** | aus / Gleichstand / streng | Rang der Minimal-Perturbation in der Kaskade |
| **Zeitbudget gesamt** | 2–60 s (Default 10) | wird proportional auf die Stufen verteilt |
| **Konfliktverhalten** | nur melden / MCS anzeigen / MCS anwenden | ersetzt `infeasibilityMode` |
| **Solver-Pfad** | auto / exakt / nur Heuristik | Diagnose- und Rückfallschalter |
| **Determinismus** | an/aus | fixiert Seed der Heuristik; CP-SAT ist bei festem Modell und `numWorkers=1` nur reproduzierbar, **solange jede Stufe der Kaskade innerhalb ihres Zeitbudgets `OPTIMAL` meldet** — bricht eine Stufe stattdessen wanduhrgebunden ab, hängt das Ergebnis von Maschine und Systemlast ab, und ein Ausgleich über `random_seed` ist nicht möglich, weil `cpsat-js` diesen Parameter nicht entgegennimmt (§2.5); **so ist es auch zu beschriften** |

**Jeder Regler bekommt eine Wirkungsanzeige**: unter dem Regler steht, was er im letzten Lauf bewirkt hat („Leximin-Tiefe 3 → Höchstlast 4, zweithöchste 4, dritthöchste 3“). Ein Regler ohne sichtbare Wirkung ist ein Regler, dem niemand traut.

## 16. Layout-Spezifikation — überlagerungsfrei per Konstruktion

Die v9.5-Korrekturen waren Einzelfallreparaturen. v10.5 legt stattdessen **Regeln** fest, aus denen Überlagerungsfreiheit folgt:

1. **Eine Gitterebene je Zone.** Der Dialog ist ein Grid mit benannten Bereichen (`ribbon`, `config`, `stage`, `result`, `actions`). Kein Bereich kennt die Position eines anderen.
2. **`min-height: 0` und `min-width: 0` auf jedem Grid- und Flex-Kind.** Ohne das erzwingt die Standard-`auto`-Mindestgröße das Überlaufen — die häufigste Ursache abgeschnittener Inhalte.
3. **`position: absolute` ausschließlich für Dekor**, immer innerhalb eines Containers mit `isolation: isolate`, immer `z-index: 0`, Inhalt immer `z-index: 1`. Ein Dekorelement darf nie ein Textelement überdecken.
4. **Scrollen ist Zoneneigenschaft.** Genau drei Zonen scrollen intern (`config`, `result`, Log). Der Dialog selbst scrollt nie.
5. **Container-Queries statt Viewport-Breakpoints.** `@container (min-width: 880px)` an der Laufansicht — die Zone reagiert auf ihren tatsächlichen Platz, nicht auf die Fensterbreite.
6. **Textfluss ist unantastbar:** `white-space: normal; overflow-wrap: anywhere;` auf allen Titeln. Kein `overflow: hidden` auf einem Container, der Text trägt.
7. **Automatische Prüfung.** Ein Playwright-Test öffnet das Studio bei 360, 768, 1024, 1440 und 1920 px, holt die `getBoundingClientRect()` aller sichtbaren Elemente einer Zone und schlägt fehl, sobald sich zwei Rechtecke schneiden, die nicht in einer Eltern-Kind-Beziehung stehen, oder ein Element aus seinem Container ragt. **Überlagerungsfreiheit wird damit zur Testeigenschaft, nicht zum Versprechen.**

## 17. Die Animation — „Kristallisation“

**Leitgedanke:** Was zu sehen ist, ist der Beweis selbst. Der Suchraum kollabiert, die Schranken schließen sich, der Plan kristallisiert. Nichts davon ist Dekor — jedes Element wird aus echten Solver-Daten gespeist.

### 17.1 Die vier Ebenen

**① Das Domänenfeld** *(Hauptfläche, Canvas)*
Ein Gitter aus 30 × 2 Zellen (Tage × Rolle). Jede Zelle zeigt ihre **Kandidatenmenge** als Fächer kleiner Personenmarken. Zu Beginn: 6 bis 8 Marken je Zelle, flirrend, unentschieden. Mit jedem eintreffenden Inkumbenten fallen die nicht gewählten Marken heraus — sie sinken, verblassen, lösen sich auf —, die gewählte rastet in die Zellenmitte ein und wird ruhig. Fixpunkte sind von Beginn an gerastet und matt. **Datenquelle:** `onSolution`-Zuweisungen, live aus dem Worker. Der Zuschauer sieht buchstäblich, wie der Suchraum zusammenfällt.

**② Die Schranken-Schere** *(schmales Band unter dem Feld)*
Zwei Kurven laufen aufeinander zu: oben der **Inkumbenten-Zielwert**, unten die **untere Schranke** `bestObjectiveBound`. Die Fläche dazwischen ist die verbleibende Ungewissheit und schrumpft sichtbar. **Im Moment der Berührung** — `objective == bound`, also bewiesene Optimalität — geht ein einzelner heller Puls von der Berührungsstelle aus über das gesamte Domänenfeld und lässt alle Zellen kurz aufleuchten: **die Kristallisation**. Das ist der einzige Effekt der ganzen Ansicht, der laut ist, und er tritt genau einmal ein, wenn etwas Beweisbares bewiesen wurde.

**③ Die Prioritätsleiter** *(rechte Spalte)*
Die lexikografischen Stufen S1–S6 als Sprossen. Die laufende Stufe pulsiert. Ist sie gelöst, **schließt sich ein Schloss** an der Sprosse und der erreichte Wert wird eingraviert („Leximin: 4 · 4 · 3“). Geschlossene Sprossen sind ab da unantastbar — die visuelle Entsprechung des Blocking-Constraints. Bei einem Konflikt **bricht** die betroffene Sprosse und fällt aus der Leiter: das ist die MCS-Anzeige, ohne ein einziges Wort Erklärung.

**④ Die Lastwaage** *(unterer Streifen)*
Ein horizontales Balkendiagramm der kombinierten Last je Person, **aufsteigend sortiert**. Leximin wird dadurch sichtbar, wie es funktioniert: Der **kürzeste Balken hebt sich zuerst**, dann der zweitkürzeste, und die Sortierung ordnet sich bei jeder Verbesserung neu. Ein feiner Strich markiert das Soll. Rechts steht Jains Index als eine Zahl.

### 17.2 Warum das trägt

- **Ehrlich:** Jede Bewegung entspricht einem echten Ereignis (Inkumbent, Schranke, Stufenabschluss). Kein Fortschrittsbalken, der Zeit interpoliert.
- **Lehrreich:** Wer zusieht, versteht ohne Text, was Leximin, was eine untere Schranke und was ein Konflikt ist.
- **Ruhig:** Eine einzige laute Geste (die Kristallisation), sonst gedämpfte, langsame Bewegungen — passend zur bereits beruhigten Animationspolitik des Projekts.
- **Robust:** Bei `prefers-reduced-motion` entfallen Fächern und Puls; Rasterung und Balken bleiben, als Zustandsanzeige ohne Bewegung.

### 17.3 Technik

- **Canvas 2D**, rahmenratenunabhängig (`requestAnimationFrame` mit `deltaTime`), keine DOM-Knoten je Marke — bei 60 Zellen × 8 Marken sind das 480 Objekte, für Canvas trivial.
- **Datenweg:** Worker → `postMessage` je Inkumbent (Zuweisung, Zielwert, Schranke, Stufe) → Ringpuffer auf dem Hauptthread → Interpolation in der Zeichenschleife. Der Solver blockiert seinen Worker; die Ansicht bleibt flüssig.
- **Entkopplung:** Trifft in 400 ms alles ein, wird die Darstellung über ~2 s gestreckt (die vorhandene `pace`-Idee, aber sauber als **Darstellungspuffer** statt als künstliche Verzögerung im Rechenpfad).
- **Farbe:** ausschließlich Monatsfarbe plus die vorhandene Schweregrad-Palette. Keine neue Farbwelt.
- Umsetzung in `js/auto-plan-crystallize.js`, ersetzt `auto-plan-visualizer.js` schrittweise; die Orbit-Ansicht bleibt als Alternative erhalten, umschaltbar.

---

# TEIL F — Mathematischer Anhang

## 18. Korrekte Formulierungen

**Variablen.** `y_{f,p} ∈ {0,1}` für jedes offene Feld `f = (d, r)`, `r ∈ {bd, hg}`, und jede *zulässige* Person `p ∈ C_f`.

**Belegung.** `Σ_{p ∈ C_f} y_{f,p} = 1  ∀ f`

**Zählungen.** `B_p = Σ_d y_{(d,bd),p} + b_p` , `H_p = Σ_d y_{(d,hg),p} + h_p` mit `b_p, h_p` = bereits fixierte Dienste.

**Obergrenzen.** `B_p ≤ maxBd_p` , `H_p ≤ maxHg_p` , `B_p + H_p ≤ maxTotal_p`

**Kombinierte Last mit Gedächtnis.**
`L_p = B_p + α·H_p + λ·( \bar{L} − \tilde{L}_p )` mit `\tilde{L}_p` = mittlere Last der Person über die letzten `k` Monate und `\bar{L}` deren Gruppenmittel. Positiver Rückstand hebt `L_p` an und macht die Person für den Leximin-Schritt attraktiver.

**Leximin (Minimierungsform, Stufe *j*).**
```
Stufe 1:  min M₁       u.d.N.  L_p ≤ M₁          ∀p
Stufe j:  min M_j      u.d.N.  L_p ≤ M_{j-1}     ∀p
                               M_{i} fixiert     ∀ i<j
                               Σ_p z_p^{(j)} ≤ j−1,   L_p ≥ M_{j-1} ⇒ z_p^{(j)}=1
```
Praktisch genügt die einfachere, äquivalente Kaskade: „minimiere die Höchstlast; fixiere sie; minimiere die Anzahl der Personen auf Höchstlast; fixiere; wiederhole“ — das ist Algorithmus 3 bei Bouveret/Lemaître in der für Zählvektoren spezialisierten Form.

**BD-Soll.** `dev_p ≥ |B_p − target_p|` linear über zwei Ungleichungen; Zielterm `Σ_p dev_p`.

**Wünsche.** Für einen erfüllbaren Wunsch `(p, f)`: Zielterm `(1 − y_{f,p})`.

**Wochenendkette Fr-BD · Sa frei · So-BD.**
`chain_{w,p} ≥ y_{fri,bd,p} + (1 − y_{sat,bd,p}) + (1 − y_{sat,hg,p}) + y_{sun,bd,p} − 3` , `chain ∈ {0,1}`, Zielterm `Σ chain`.
*(Vier Bedingungen, Schwelle 3 — das ist die korrekte UND-Untergrenze. Die heutige Fassung nutzt `present.length − 1` mit invertierten Literalen und ist dadurch zusätzlich zur Reifikationsfrage falsch skaliert.)*

**Minimal-Perturbation.** `Σ_{(f,p) ∈ Warmstart} (1 − y_{f,p})` als letzte Stufe.

**MCS.** `max Σ_g w_g · r_g` , alle Constraints der Gruppe `g` mit `.onlyEnforceIf(r_g)`.

**Kennzahlen (nur Anzeige).**
Jain: `J = (Σ L_p)² / (n · Σ L_p²)`, `J ∈ (0,1]`, `J = 1` bei Gleichverteilung.
Gini: `G = Σ_i Σ_j |L_i − L_j| / (2 n² \bar{L})`.
Robustheit: Anteil der (Person, Tag)-Paare, deren fiktiver Ausfall keine rote Bewertung erzeugt.

## 19. Zu korrigierende Stellen außerhalb des CP-Modells

| Ort | Befund | Korrektur |
|---|---|---|
| `auto-planner-optimizer.js:1506` | UCB-Ausbeutungsterm unnormiert gegen Explorationsterm der Größenordnung 1 | Belohnung auf Segmentmaximum normieren |
| `auto-planner-engine.js:697` | `saturdayVariance(...)` wird als `weekendSpread` übergeben | Parameter umbenennen |
| `auto-planner-engine.js:606` | `variance` = Populationsvarianz | im Kommentar festhalten |
| `auto-planner-optimizer.js:954` | LAHC-`record` in der 2017er-Variante | im Kommentar kennzeichnen |
| `auto-planner-v9.js:398` | `deterministic: false` ⇒ `randomSeed = undefined` ⇒ `randomSeed ?? 42` fixiert doch wieder | Verhalten klären und dokumentieren |

---

# TEIL G — Risiken

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|
| Import-Map löst im Worker nicht auf | hoch | Vendor-Bundle ohne bloße Bezeichner erzeugen; E2E-Test in P0 als Tor |
| Modell driftet gegen die Regelengine | mittel | Kreuztest in P2 (200 Zufallspläne, Äquivalenz Modell ⇔ Audit) |
| MCS in Budget nicht beweisbar minimal | **eingetreten (gemessen)** | anytime führen, Ergebnis als „in *t* s nachgewiesen“ ausweisen, nie als Minimum |
| WASM-Ladezeit beim ersten Studio-Öffnen | mittel | Lazy Load, `immutable`-Cache, Vorabladen bei Studio-Öffnung, sichtbarer Ladezustand |
| Entfernen der Regler irritiert | mittel | Migrationshinweis im Studio, alte Werte still verwerfen, Changelog-Eintrag |
| COEP-Entfernung schwächt Isolation | gering | COOP bleibt; `require-corp` war für den portablen Pfad ohnehin ohne Nutzen |
| KV-Schreibgrenze (1.000/Tag) | gering | unverändert: nur bestätigte Übernahmen schreiben, nie Zwischenstände |

---

# TEIL H — Quellen

**Verfahren und Modellierung**
- Erhard, Schoenfelder, Fügener, Brunner: *State of the art in physician scheduling*, EJOR 2018 — https://www.sciencedirect.com/science/article/abs/pii/S0377221717305787
- Burke, De Causmaecker, Vanden Berghe, Van Landeghem: *The State of the Art of Nurse Rostering*, Journal of Scheduling — https://link.springer.com/content/pdf/10.1023/B:JOSH.0000046076.75950.0b.pdf
- *Application of Constraint Programming with Satisfiability in Nurse Scheduling*, MDPI Engineering Proceedings — https://www.mdpi.com/2673-4991/134/1/32
- Brenndoerfer: *CP-SAT Rostering — Constraint Programming for Workforce Scheduling* — https://mbrenndoerfer.com/writing/cp-sat-rostering-constraint-programming-workforce-scheduling
- Combrink, Do, Bengtsson, Roselli, Fabian: *A Comparative Study of SMT and MILP for the Nurse Rostering Problem*, 2025 — https://arxiv.org/abs/2505.10328
- *Modeling and solving staff scheduling with partial weighted maxSAT*, Annals of OR — https://link.springer.com/article/10.1007/s10479-017-2693-y
- *A branch-and-price approach for the nurse rostering problem with multiple units*, 2023 — https://arxiv.org/abs/2311.05438
- *Chvátal–Gomory Cuts Applied to the Nurse Rostering Problem*, Systems 13(9):745, 2025 — https://www.mdpi.com/2079-8954/13/9/745
- *A hybrid fix-and-optimize and simulated annealing approach for nurse rostering*, C&IE 2020 — https://www.sciencedirect.com/science/article/abs/pii/S0360835220302655
- *An Effective Matheuristic Approach to Solve Nurse Rostering Problem*, Springer 2025 — https://link.springer.com/chapter/10.1007/978-3-031-85894-9_8

**Fairness**
- Bouveret, Lemaître: *Computing leximin-optimal solutions in constraint networks*, AIJ 2009 — https://www.sciencedirect.com/science/article/pii/S0004370208001495
- Bouveret, Lemaître: *Finding leximin-optimal solutions using constraint programming*, COMSOC 2006 — https://comsoc-community.org/assets/proceedings/comsoc-2006/Bouveret.pdf
- Ogryczak, Śliwiński: *On solving linear programs with the ordered weighted averaging objective*, EJOR 148:80–91, 2003 — https://www.ia.pw.edu.pl/~wogrycza/publikacje/artykuly/myejor03.pdf
- *A modeling framework for Ordered Weighted Average Combinatorial Optimization* — https://arxiv.org/pdf/1306.1426
- *Ordered weighted averaging* (Übersicht) — https://en.wikipedia.org/wiki/Ordered_weighted_averaging
- *Lexicographic max-min optimization* — https://en.wikipedia.org/wiki/Lexicographic_max-min_optimization
- *Schedules Need to be Fair Over Time*, Springer 2025 — https://link.springer.com/chapter/10.1007/978-3-032-11108-1_3
- *The Fair Periodic Assignment Problem*, 2025 — https://arxiv.org/pdf/2507.04537
- *End-to-End Optimization and Learning of Fair Court Schedules* (Fair OWA) — https://arxiv.org/pdf/2410.17415

**Suche und Verbesserung**
- Ropke, Pisinger: ALNS, Transportation Science 40(4), 2006
- Burke, Bykov: *The late acceptance Hill-Climbing heuristic*, EJOR 2017 — https://www.sciencedirect.com/science/article/abs/pii/S0377221716305495
- Bykov: *A Late Acceptance Strategy in Hill-Climbing for Exam Timetabling*, PATAT 2008 — https://patatconference.org/patat2008/proceedings/Bykov-HC2a.pdf
- *Adaptive large neighborhood search for a personnel task scheduling problem* — https://arxiv.org/pdf/2302.04494
- *Integrating Column Generation and Large Neighborhood Search for Bus Driver Scheduling*, 2025 — https://arxiv.org/pdf/2505.02485
- *Learning a Large Neighborhood Search Algorithm for Mixed Integer Programs* — https://arxiv.org/pdf/2107.10201
- *Supervised Large Neighbourhood Search for MIPs*, 2025 — https://arxiv.org/html/2501.10778v1

**Stabilität, Erklärbarkeit, Unsicherheit**
- Müller, Rudová, Barták: *Minimal Perturbation Problem in Course Timetabling*, PATAT 2005 — https://www.unitime.org/papers/patat05.pdf
- *Minimal Perturbation in University Timetabling with Maximum Satisfiability*, CPAIOR 2020 — https://link.springer.com/chapter/10.1007/978-3-030-58942-4_21
- *Integer programming for minimal perturbation problems in university course timetabling*, Annals of OR — https://link.springer.com/article/10.1007/s10479-015-2094-z
- Junker: *QuickXplain* — Erläuterung und formaler Beweis — https://arxiv.org/pdf/2001.01835
- Liffiton, Previti, Malik, Marques-Silva: *Fast, flexible MUS enumeration* (MARCO) — https://www.researchgate.net/publication/276905908_Fast_flexible_MUS_enumeration
- *Explanation in Constraint Satisfaction: A Survey*, IJCAI 2021 — https://www.ijcai.org/proceedings/2021/0601.pdf
- CPMpy: *Solving with assumptions / UnSAT core extraction* — https://cpmpy.readthedocs.io/en/latest/unsat_core_extraction.html
- OR-Tools: `assumptions_sample_sat.py` — https://github.com/google/or-tools/blob/main/ortools/sat/samples/assumptions_sample_sat.py
- *Nurse Staffing under Absenteeism: A Distributionally Robust Optimization Approach*, M&SOM — https://pubsonline.informs.org/doi/10.1287/msom.2023.0398
- *An analytics-driven optimization framework for nurse scheduling under uncertainty* — https://www.sciencedirect.com/science/article/pii/S277244252600016X

**Werkzeuge und Laufzeit**
- Lacey: *cpsat-js* — https://github.com/owen-lacey/cpsat-js
- Wickman: *or-tools-wasm* — https://github.com/Axelwickm/or-tools-wasm
- Krupke: *The CP-SAT Primer* — https://d-krupke.github.io/cpsat-primer/
- OR-Tools Discussion #4183: *Multiple objectives using blocking constraints* — https://github.com/google/or-tools/discussions/4183
- Google OR-Tools: *CP-SAT Solver* — https://developers.google.com/optimization/cp/cp_solver
- `highs-js` — https://github.com/lovasoa/highs-js · `highs-wasm` — https://github.com/fuglede/highs-wasm
- `glpk.js` — https://github.com/jvail/glpk.js · `MiniZinc.js` — https://github.com/MiniZinc/minizinc-js
- Timefold Solver: *Score calculation / Constraint Streams* — https://docs.timefold.ai/timefold-solver/latest/constraints-and-score/score-calculation
- web.dev: *Making your website cross-origin isolated using COOP and COEP* — https://web.dev/articles/coop-coep
- Steiner: *Setting COOP and COEP headers on static hosting*, 2025 — https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/
- Cloudflare: *Workers Pricing* — https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Blog: *Workers KV free tier* — https://blog.cloudflare.com/workers-kv-free-tier/
- Cloudflare: *Pages Headers* — https://developers.cloudflare.com/pages/configuration/headers/
- *SATViz: Real-Time Visualization of Clausal Proofs* — https://arxiv.org/pdf/2209.05838
- WebGPU Fundamentals: *Compute Shader Basics* — https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html

---

## 20. Fazit

Die Engine v9.5 ist als **Architektur** richtig gedacht und als **Modell** falsch gebaut. Die fünf nachgewiesenen Defekte sind keine Feinheiten: Sie machen den exakten Kern in der Auslieferung wirkungslos, und die Anwendung liefert seit dem v9-Release ausschließlich Heuristik-Ergebnisse — verpackt in ein Exaktheitsversprechen, das nie eingelöst wird.

Die gute Nachricht ist die Größenordnung. Dieses Problem hat 60 offene Felder und 8 planbare Personen. Der korrigierte Boolean-Ansatz löst es **beweisbar optimal in unter einer halben Sekunde**, lexikografisch über drei Zielstufen, mit passender unterer Schranke — gemessen, im Browser-WASM, kostenfrei. Der Aufwand liegt nicht in der Rechenleistung, sondern in einer sauberen Modellierung, die es hier bislang nicht gab.

**v10.5 sollte deshalb kein weiteres Verfahren hinzufügen, sondern das richtige Verfahren erstmals korrekt umsetzen** — und dabei drei Dinge nachholen, die dem Ganzen erst Wert geben: eine Gerechtigkeitsordnung, die diesen Namen verdient (Leximin über Monatsgrenzen hinweg), eine Konfliktdiagnose, die sagt, was zu tun ist (MCS), und eine Oberfläche, deren Regler und deren Animation zeigen, was wirklich passiert.
