# Auto-Plan-v9-Benchmarks

Der Benchmark-Harness prüft nicht nur Laufzeit, sondern zuerst die fachliche und mathematische Korrektheit des Solverpfads. Er verwendet die vom Solver selbst ausgewiesenen Status-, Schranken- und Suchstatistiken und speichert jeden Lauf als maschinenlesbaren JSON-Bericht.

## Integrierte synthetische Matrix

| Fall | Zweck | Erwartung |
| --- | --- | --- |
| `strict-feasible` | vollständige strikt zulässige BD-/HG-Belegung | `OPTIMAL` oder `FEASIBLE`, 56 Zuordnungen |
| `minimal-red-fallback` | strikte Unlösbarkeit mit anschließend kontrollierter Minimalrelaxierung | vollständige Lösung erst über den ausgewiesenen Rot-Fallback |
| `provably-infeasible` | unzureichende Personalstärke | `INFEASIBLE`, keine Zuordnungen, Konfliktkern |
| `minimal-change-warm-start` | Warmstart und Stabilitätsziel | vollständige, bei deterministischer Wiederholung identische Lösung |

Jeder deterministische Lösungsfall wird standardmäßig zweimal ausgeführt. Abweichende Zuordnungsfingerprints lassen den Harness fehlschlagen.

## Erfasste Metriken

- Solverstatus und Zahl der Zuordnungen;
- Zeit bis zum ersten gemeldeten Incumbent;
- gesamte externe und solverinterne Laufzeit;
- Zielfunktionswert, beste Schranke und relativer Gap;
- Branches, Konflikte und deterministische Zeit;
- vollständiger Vektor der lexikografischen Zielstufen;
- Exact-LNS-Runden, Nachbarschaften und Verbesserungen;
- Variantenanzahl, Konfliktkerngröße und Relaxierungsvorschläge;
- Ereigniszahl, Solverversion und stabiler Zuordnungsfingerprint.

## CI-Smoke-Benchmark

```bash
python solver/benchmarks/benchmark_v9.py \
  --smoke \
  --repetitions 2 \
  --output solver/benchmark-results/v9-smoke.json
```

Der CI-Lauf veröffentlicht `v9-smoke.json` als Artefakt. Ein unerwarteter Status, eine unvollständige Belegung oder ein Reproduzierbarkeitsfehler beendet das Qualitätsgate mit Fehler.

## Reale und mutierte Snapshots

Das Auto-Plan Studio kompiliert vor jedem nativen Lauf einen vollständig versionierten `SolverSnapshot`. Exportierte Snapshots können ohne UI und ohne Änderung des Inhalts wiederholt geprüft werden:

```bash
python solver/benchmarks/benchmark_v9.py \
  --snapshot fixtures/real-2026-09.json \
  --snapshot fixtures/mutation-missing-hg-domain.json \
  --repetitions 3 \
  --output solver/benchmark-results/real-and-mutated.json
```

Reale Snapshots verbleiben wegen möglicher personenbezogener Planungsdaten außerhalb des öffentlichen Repositorys. Für Regressionstests sollen sie pseudonymisiert, auf das erforderliche Minimum reduziert und über den vorgesehenen sicheren CI-Datenpfad bereitgestellt werden.

## Interpretation

- `OPTIMAL` bedeutet nur dann einen globalen Nachweis, wenn sämtliche lexikografischen Zielstufen optimal abgeschlossen wurden.
- `FEASIBLE` ist eine gültige Lösung, aber kein Optimalitätsnachweis.
- Laufzeiten verschiedener Rechner oder unterschiedlicher OR-Tools-Versionen sind nicht unmittelbar vergleichbar.
- Bei paralleler CP-SAT-Suche können interne Teilsolverstatistiken anders aggregiert sein. Der deterministische CI-Modus verwendet deshalb einen reproduzierbaren Suchpfad.
- Ein Assumption-Core ist ein hinreichender Unlösbarkeitsnachweis, nicht zwingend ein global minimaler Konfliktkern.
