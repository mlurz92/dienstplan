# Auto-Plan v6 – Recherche- und Architekturentscheidung

Stand: 03.08.2026

## Ziel

Die Wahrscheinlichkeit unnötiger roter Auto-Plan-Fallbacks soll weiter sinken, ohne:

- die produktive Regelengine zu duplizieren,
- harte Regeln in weiche Regeln umzudeuten,
- Fixpunkte zu verändern,
- einen externen Dienst oder ein schwergewichtiges Solver-Runtime in die Cloudflare-Pages-Anwendung einzuführen.

## Recherchierte Muster

### Constraint Programming und Personalplanung

Google OR-Tools beschreibt Personaleinsatzplanung als Constraint-Problem: Zunächst muss eine vollständige Belegung alle zwingenden Bedingungen erfüllen; Präferenzen und Lastverteilung werden danach über eine Zielfunktion optimiert.

Quellen:

- https://developers.google.com/optimization/cp
- https://developers.google.com/optimization/scheduling/employee_scheduling
- https://developers.google.com/optimization/service/scheduling/workforce_scheduling

Übertragen auf DienstplanRAD:

1. **Machbarkeit vor Qualität.**
2. **Harte Regeln niemals durch Zielfunktionsgewichte ersetzen.**
3. **Rote Abweichungen als ausdrückliche letzte Eskalation behandeln.**
4. **Infeasibility nicht mit einem unvollständigen Plan kaschieren.**

### Large Neighborhood Search

Aktuelle und etablierte Rostering-Arbeiten bestätigen die Kombination aus konstruktionaler Constraint-Suche und adaptiver Large Neighborhood Search. Unterschiedliche Destroy-/Repair-Operatoren helfen, lokale Optima zu verlassen; die Annahmeregel darf zeitweise nicht verbessernde Zustände zulassen, während der beste Zustand separat geschützt bleibt.

Quellen:

- Gutjahr, Parragh, Tricoire: *Adaptive large neighborhood search for a personnel task scheduling problem*, 2023  
  https://arxiv.org/abs/2302.04494
- *An improved adaptive large neighborhood search for the home health care routing and scheduling problem*, Information Sciences 719, 2025  
  https://doi.org/10.1016/j.ins.2025.122458
- Burke, Bykov: Late-Acceptance-Prinzip  
  https://doi.org/10.1016/j.ejor.2016.07.012

DienstplanRAD besitzt diese Perfektionsphase bereits. v6 ersetzt sie nicht, sondern verbessert die Machbarkeitseskalation davor.

### Tooltips und Accessibility

Für zusätzliche Inhalte bei Hover oder Fokus fordert WCAG 2.2, dass sie:

- per Tastatur erreichbar,
- mit `Escape` schließbar,
- hoverbar,
- persistent genug zum Lesen sind.

Quellen:

- https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR39
- https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
- https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus

## Gefundene Schwachstelle

Die öffentliche Konfigurationsnormalisierung bewahrte die abgeleitete HG-Obergrenze `0` nur dann sicher, wenn die Oberfläche die vollständige Mitarbeitendentabelle mitsendete. Bei partiellen API-Aufrufen ging `maxHg` auf `null` zurück. Damit konnte ein Integrationsaufruf eine fachlich abgeleitete Laufgrenze unabsichtlich verlieren.

v6 führt deshalb jede partielle Laufkonfiguration zuerst mit den datumsabhängigen Standardgrenzen zusammen. Ein ausdrücklich gesetztes `null` bleibt weiterhin eine bewusste Aufhebung; nur `undefined` übernimmt den Standard.

## Zielarchitektur v6

```text
Reguläre Null-Rot-Suche
        │
        ├─ vollständige Null-Rot-Lösung → Perfektion
        │
        └─ keine vollständige Lösung
                │
                ▼
Adaptive Null-Rot-Rescue
  - größerer Suchstrahl
  - breiterer Kandidatenfächer
  - höheres Backtracking-Budget
  - ausschließlich strikte Profile
                │
                ├─ vollständige Null-Rot-Lösung → Perfektion
                │
                └─ keine vollständige Lösung
                        │
                        ├─ Fallback deaktiviert → blockiertes Ergebnis
                        └─ Fallback freigegeben → Minimal-Rot-Suche
```

## Warum kein OR-Tools-/Server-Wechsel

Ein vollständiger Solver-Wechsel wäre nur sinnvoll, wenn sämtliche fachlichen Regeln als zweites Modell exakt nachgebildet würden. Das widerspräche der zentralen Architekturentscheidung, dass `evaluateCandidate()` und die bestehende Regelengine die einzige fachliche Wahrheitsquelle sind. Zusätzlich entstünden:

- Modell- und Regel-Drift,
- zusätzliche Laufzeit-/Deployment-Abhängigkeiten,
- ein zweiter Auditpfad,
- höherer Wartungs- und Testaufwand,
- potenziell andere Ergebnisse zwischen manueller Auswahl und Auto-Plan.

Die v6-Rescue bleibt deshalb innerhalb der bestehenden Engine und erhöht ausschließlich die Suchbreite.

## UI-Entscheidungen

- Sichtbarer **Null-Rot-Guardrail** erklärt die Eskalationsfolge.
- Laufansicht nennt die aktuelle fachliche Phase statt nur abstrakte Aktivität.
- Animation bleibt aus der Monatskontrastfarbe abgeleitet.
- Tooltips ersetzen native `title`-Blasen durch eine tastaturfähige, hoverbare und per `Escape` schließbare Implementierung.
- `prefers-reduced-motion` und Forced Colors bleiben berücksichtigt.

## Abnahmekriterien

- Partielle Laufkonfigurationen bewahren alle abgeleiteten Standardgrenzen.
- Ein Minimal-Rot-Lauf wird erst nach protokollierter Null-Rot-Rescue freigegeben.
- Rescue verwendet ausschließlich strikte Profile.
- Fixpunkte, harte Regeln und Übernahmeaudit bleiben unverändert.
- Studio bleibt bei kleiner Fensterhöhe vollständig scrollbar.
- Alle Tooltips sind per Fokus und Pointer erreichbar.
- Syntaxprüfung, Unit-Tests und Browser-Tests bleiben grün.
