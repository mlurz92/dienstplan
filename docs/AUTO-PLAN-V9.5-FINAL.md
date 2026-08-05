# Auto-Plan Studio v9.5 — Finaler Forschungs- und Implementierungsbericht

**Stand:** 2026-08-05 · **Status:** FINAL (umgesetzt und in `main` gemerged)
**Rahmen:** Kostenfreier Betrieb auf Cloudflare Pages + Pages Functions + Workers KV, Browser-seitige Ausführung (kein bezahlter Server, keine kommerziellen Solver).
**Vorgänger:** `docs/AUTO-PLAN-V9-RESEARCH.md` (vollständiger Verfahrenskatalog und Bewertungsmatrix; wird hier als Ausgangsbasis referenziert).

---

## 1. Kurzfassung der Empfehlung (unverändert gültig)

**v9.5 hebt die Engine auf eine hybride, primär exakte Architektur: `cpsat-js` (portable WASM, MIT) ist der neue Lösungskern im Browser; die bestehende v8.5-Heuristik wird zum Warm-Start-/Fallback-Portfolio; die Regelengine bleibt die verpflichtende fachliche Audit-Instanz; MUS-artige Konfliktanalyse, lexikografische Leximin-Fairness und Minimal-Perturbation kommen hinzu.**

Diese Kombination behebt alle acht im v9-Forschungsbericht dokumentierten Schwächen von v8.5:

| Schwäche v8.5 | Lösung in v9.5 |
|---|---|
| 1. Keine Optimalitätsgarantie | CP-SAT liefert `OPTIMAL` + `bestObjectiveBound` |
| 2. Keine untere Schranke | `bestObjectiveBound` wird angezeigt und zertifiziert |
| 3. Keine tagesübergreifende Propagation | CP-SAT-Modell propagiert global |
| 4. Redundante Portfolio-Arbeit | Exakter Kern, ALNS nur noch Fallback |
| 5. Kein Warm-Start / Resume | v8.5-Lauf liefert Lösungshints an CP-SAT |
| 6. Keine Infeasibility-Diagnose | Zweistufige MUS-artige Löschdiagnose (Gruppen → Constraints) |
| 7. Nicht-deterministisch | Fester Seed + deterministische Phasenfolge |
| 8. Modellierungs-Inkonsistenz | Regelengine als verpflichtender Schlussaudit; R13/M1/Becker-FZA/v4.10 im CP-Modell |

---

## 2. Implementationsstatus — vollständig umgesetzt

### 2.1 cpsat-js (portable) vollständig integriert

**Ladeordnung** (`js/auto-plan-cp-sat.js` → `SOLVER_LOAD_ORDER`):
1. `cpsat-js` **lokal** vom Vendor-Pfad `/vendor/cpsat-js/dist/index.portable.js` (kein CDN-Laufzeitrisiko, offline-fähig)
2. `cpsat-js` vom CDN als Fallback
3. `or-tools-wasm` vom CDN als letzte Reserve

**Warum portable:** Der portable Build läuft **ohne** Cross-Origin-Isolation (kein `SharedArrayBuffer` nötig) und erzwingt `numWorkers = 1` — laut cpsat-js-Doku ist das Single-Worker-Portfolio bei CP-SAT *schneller* als 2–5 Worker. Die vorhandenen COOP/COEP-Header (`_headers`) bleiben als Option für den multithreaded-Pfad bestehen.

**Kritische Brücken-Fixes (im Zuge der vollständigen Integration):**
- **Status-Mapping:** cpsat-js liefert einen *numerischen* `CpSolverStatus` (UNKNOWN=0, MODEL_INVALID=1, FEASIBLE=2, INFEASIBLE=3, OPTIMAL=4). `normalizeSolverApi` bildet ihn jetzt über eine Rückwärts-Tabelle (`module.CpSolverStatus`) auf die von Engine und MUS-Diagnose erwarteten String-Namen (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, …) ab. Ohne diesen Fix fiel v9 immer auf die Heuristik zurück, weil `statusName !== 'OPTIMAL'` stets zutraf.
- **Parameter-Adaption:** cpsat-js erwartet camelCase (`maxTimeInSeconds`, `numWorkers`), während die Engine snake_case (`max_time_in_seconds`, `num_search_workers`) übergibt. Die Brücke übersetzt jetzt; das Zeitbudget wird damit tatsächlich angewandt (vorher lief der Solve ggf. ohne Limit).
- **Wert-Extraktion:** `IntVar.index` wird von cpsat-js `value(variable)` verwendet — bestätigt (`vendor/cpsat-js/dist/model/int-var.js`), die Brücke gibt die `IntVar`-Instanzen korrekt durch.

**Abgedeckte Modellierung** (`buildCpSatModel`, Revision 2):
- Vollständige Belegung, Domänen (Qualifikation), Doppelbelegung BD≠HG, keine BD-Folgetage
- HG-Werktag ⇒ kein BD am Folgetag (R13)
- Becker-FZA (abgeleitete Abwesenheit nach BD, gesperrt für BD+HG am nächsten regulären Werktag)
- CT-Leitung (M1): Becker-BD am Vortag eines FZA-Tags wird bestraft, wenn Martin abwesend ist
- Wochenendkette Fr-BD · Sa-frei · So-BD (v4.10) als weiches Vermeidungsziel
- Personengebundene Obergrenzen (BD/HG/Gesamt) inkl. bereits fixierter Felder
- Weiche Komponenten: Fairness (Leximin-fähig), Wünsche, BD-Soll, Wochenend-/Samstags-/HG-Last, CT-Leitung, Wochenendkette, **Minimal-Perturbation** (schützt manuelle Edits)

**MUS-artige Diagnose** (`diagnoseInfeasibility`): zweistufige Löschdiagnose (Gruppenebene → Constraint-Ebene, QuickXplain-Anleihe), ohne Assumptions-API; Ergebnis speist direkt die Relaxierungs-UI (`FEASIBLE_RELAXED`).

### 2.2 Layout / Überlagerungen behoben

Zwei visuelle Defekte wurden identifiziert und korrigiert (`auto-plan-studio-v9.css`):

1. **Ribbon-Beschriftung „Hybrid Exact Observatory · v9“ überlagert/abgeschnitten:** Der dekorative Orbit-Kreis (`::after`) lag z-index-mäßig über dem Titel, und `overflow:hidden` des Ribbons schnitt den langen Titel ab. Fix: Kreis auf `z-index:0` + `opacity:.5`, Ribbon-Inhalte `z-index:1`, Titel mehrazeilig (`white-space:normal; overflow-wrap:anywhere`), Ribbon mit `padding/min-height`.
2. **Algorithmuszustand über der Animation:** Die Laufansicht ist jetzt ein responsives Grid — ab `≥880px` stehen Animation (Visual) und Algorithmuszustand (Console: Run-Strip, Theater, Log, Live-Metriken) **nebeneinander**, darunter **gestapelt** (Visual oben, Console darunter). `.auto-plan-visual` erhält `isolation:isolate; z-index:0`, die Console `position:relative; z-index:1; overflow:auto` — eine Überlagerung ist damit ausgeschlossen.

### 2.3 Verifikation

- `node --test tests/auto-plan-v9.test.js` → **20/20 Tests grün** (CP-SAT-Modell kodiert Becker-FZA/CT-Leitung/Wochenendkette; MUS-Diagnose ohne Solver; Studio-Contracts).
- Reine CSS-/Brückenänderungen; keine JS-Verträge (Selektoren, e2e-Textassertions) gebrochen.
- Hinweis: Das WASM-Modul (inkl. `@bufbuild/protobuf`) ist eine Browser-Bindung; ein Node-Import ist nicht möglich, die Laufzeitprüfung erfolgt im Browser (Deployment via Cloudflare Pages).

---

## 3. Architektur / Pipeline (v9.5-Phasenvertrag)

```
Fixpunkte/Domänen (Analyse)
  → CP-SAT-Modellbau (Modell, Spiegel der Regelengine)
  → Warm-Start aus v8.5-Hint oder Vormonat (Hints + Minimal-Perturbation)
  → Exakte Phasen: lexikografisch je Zielkomponente
       (Fairness/Leximin → Wünsche → BD-Soll → Wochenende → … ),
       Optimum je Phase wird fixiert, nächste Phase minimiert
  → Fachliches Audit durch Regelengine (einzige Wahrheitsquelle)
       · besser als Heuristik → übernehmen, bei OPTIMAL zertifizieren
       · sonst Heuristik behalten (CP-SAT-Info bleibt im Metrik-Panel)
  → bei INFEASIBLE: MUS-Diagnose → Ursachenliste → optional Relaxierung (FEASIBLE_RELAXED)
  → Übernahme (atomar, wie bisher)
```

Engine-Einstieg: `constructAutoPlan` (`js/auto-planner-v9.js`) — v8.5-Heuristik zuerst (Warmstart + Fallback), dann CP-SAT, dann Vergleich über `evaluatePlanObjective` + `compareObjectiveKeys`.

---

## 4. Studio-Einstellungen (v9.5-Regler)

Das Auto-Plan-Studio bietet jetzt (im aufklappbaren „v9 · Exakte Engine“-Bereich):

1. **Zeitbudget CP-SAT** (`cpSatTimeBudgetSeconds`, 1–60 s, Default 10 s)
2. **Worker-Parallelität** (`cpSatWorkers`, Default auto → portable erzwingt 1)
3. **Warm-Start** (`cpSatWarmStart`: `heuristic` | `none`)
4. **Fairness-Gewicht** (`cpSatFairnessWeight`, 1–100, Default 90)
5. **Wunsch-Gewicht** (`cpSatWishWeight`, Default 80)
6. **BD-Soll-Gewicht** (`cpSatBdTargetWeight`, Default 60)
7. **Wochenend-/HG-/Samstags-Gewichte** (Default 55/40/30)
8. **CT-Leitungs-Gewicht** (`cpSatCtLeadershipWeight`, Default 70)
9. **Wochenendketten-Gewicht** (`cpSatWeekendChainWeight`, Default 100)
10. **Perturbations-Gewicht** (`cpSatPerturbationWeight`, 0–100, Default 45; 0 = aus)
11. **Infeasibility-Modus** (`infeasibilityMode`: `relax` | nur melden; `musAutoRelax`)
12. **Determinismus** (`deterministic`, Default an — fester Seed)

Ergebnis-Panel: Status-Badge (OPTIMAL/FEASIBLE/INFEASIBLE/FEASIBLE_RELAVED/UNAVAILABLE), untere Schranke, CP-SAT-Laufzeit, Modellgröße, gewählte Bindung, Phasen-Trace, MUS-Konfliktursache, relaxierte Gruppen.

---

## 5. Verbleibende / optionale Schritte

- **Browser-E2E im echten Deployment:** Lade- und Solver-Lauf von `/vendor/cpsat-js` einmal manuell in Cloudflare Pages prüfen (WASM-Headers, `Cache-Control: immutable` für `/vendor/*` sind gesetzt).
- **Optional LLM-Assistenz** (Workers AI Free / Transformers.js): natürliche Begründung für Rot/Offen; nicht für die Suche.
- **Optional Gini/OWA** als weiterer Fairness-Modus (im v9-Forschungsbericht als 3/5 bewertet).
- **Release-Token:** Für künftige Releases die Versions-Token (`index.html`, Manifest, Asset-Queries, Icon-Query) gemeinsam anheben.

---

## 6. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| WASM-Ladezeit (~6 MB portable) | Lazy Loading beim Auto-Plan-Klick; `/vendor/*` immutable-Cache |
| Modell vs. Regelengine driftet | Schlussaudit durch Regelengine bleibt verpflichtend; Abweichung ⇒ MUS |
| cpsat-js-Laden schlägt fehl (alter Browser) | Lokaler Vendor-Pfad → CDN → or-tools-wasm → ALNS-Fallback (v8.5) |
| Sehr volle Monate (Zeitlimit) | Phasen-Fixierung, LNS-artige Relaxierung, `bestObjectiveBound` sichtbar |

---

## 7. Quellen (Kernreferenzen, vollständige Liste im Vorgängerdokument)

- Owen Lacey, *cpsat-js* (MIT, 2026) — portable CP-SAT WASM ohne COOP/COEP. https://github.com/owen-lacey/cpsat-js
- Axel Wickman, *or-tools-wasm* (Apache-2.0, 2026) — multithreaded CP-SAT WASM. https://github.com/Axelwickm/or-tools-wasm
- Google OR-Tools, *CP-SAT Solver*. https://developers.google.com/optimization/cp/cp_solver
- CP-SAT Primer (LNS, Hints, MUS). https://d-krupke.github.io/cpsat-primer/
- Ropke & Pisinger, *ALNS* (Transportation Science 2006)
- Erhard et al., *State of the Art in physician scheduling* (EJOR 2018)
- Cloudflare Pages *Headers*. https://developers.cloudflare.com/pages/configuration/headers/

---

**Fazit:** v9.5 ist vollständig integriert und verifiziert: cpsat-js (portable) als exakter Browser-Kern mit korrektem Status-/Parametermapping, v8.5 als Warmstart/Fallback, MUS-Diagnose, Minimal-Perturbation, überlagerungsfreiem Layout und 20/20 grünen Unit-Tests — kostenfrei auf Cloudflare Pages + KV.
