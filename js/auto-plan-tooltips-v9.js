import { setRichTooltip } from './rich-tooltip-v8-5.js?v=20260803.4';

export const AUTO_PLAN_V9_TOOLTIPS = Object.freeze({
  autoPlanV9Mode: 'Laufprofil für CP-SAT und Exact-LNS. Schnell priorisiert die erste saubere Lösung, Nachweis reserviert mehr Zeit für Schranken, Infeasibility- und Optimalitätsbeweise. Harte Regeln ändern sich nicht.',
  autoPlanV9Goal: 'Neuplanung optimiert alle offenen Felder. Reparatur priorisiert wenige Änderungen. Minimaländerung setzt Planstabilität vor nachrangige Fairnessziele.',
  autoPlanV9Alternatives: 'Zahl qualitätsgebundener Vorschlagsvarianten. Weitere Varianten müssen dieselben harten Regeln erfüllen und einen Mindestabstand zur Hauptlösung besitzen.',
  autoPlanV9Gap: 'Zulässiger relativer Abstand zwischen bester gefundener Lösung und mathematischer Schranke. 0 % bedeutet: die jeweilige Zielstufe muss als optimal bewiesen werden oder bleibt ausdrücklich unbewiesen.',
  autoPlanV9Distance: 'Mindestzahl unterschiedlicher BD-/HG-Zellen zwischen zwei Varianten. Ein höherer Wert erzeugt sichtbar andere Pläne, kann aber die Zahl verfügbarer Alternativen reduzieren.',
  autoPlanV9MaxChanges: 'Obergrenze für Änderungen gegenüber bereits freigegebenen, aber nicht fixierten Zuordnungen. Leere Eingabe bedeutet keine zusätzliche Stabilitätsgrenze.',
  autoPlanV9Deterministic: 'Verwendet einen reproduzierbaren Seed und bevorzugt einen einzelnen CP-SAT-Suchstrang. Das erleichtert Audits, kann auf Mehrkernsystemen jedoch langsamer sein.',
  autoPlanV9ExactLns: 'Adaptive Exact Large Neighborhood Search: fachlich zusammenhängende Ausschnitte werden freigegeben und innerhalb ihres Teilmodells durch CP-SAT exakt neu gelöst.',
  autoPlanV9LnsMin: 'Kleinste Zahl freizugebender Dienstfelder je Exact-LNS-Runde. Kleine Ausschnitte sind schnell, verlassen tiefe lokale Optima aber seltener.',
  autoPlanV9LnsMax: 'Größte Zahl freizugebender Dienstfelder je Exact-LNS-Runde. Große Ausschnitte erhöhen die Suchtiefe, benötigen jedoch mehr Solverzeit.',
  autoPlanV9Remote: 'Nutzt den nativen OR-Tools-CP-SAT-Dienst über Cloudflare. Ist er nicht erreichbar, übernimmt automatisch der isolierte lokale v8.5-Warmstart ohne Datenverlust.',
  autoPlanV9RelaxAbsence: 'Erlaubt Abwesenheiten ausschließlich als nachgelagerte, einzeln bestätigungspflichtige Ausnahme. Der Solver minimiert zunächst ihre Anzahl und Schwere.',
  autoPlanV9RelaxMaximum: 'Darf personengebundene Laufobergrenzen in der Minimal-Relaxierungsphase überschreiten. Standardmäßig gesperrt, da Obergrenzen bewusst vor dem Lauf festgelegt werden.',
  autoPlanV9RelaxOrganizational: 'Erlaubt organisatorisch lösbare Kopplungsabweichungen erst nach ausgeschöpfter strikter Suche. Technische Ausschlüsse bleiben unveränderlich.',
  autoPlanV9ProofStatus: 'CP-SAT-Status: OPTIMAL beweist das Optimum der abgeschlossenen Zielstufe; FEASIBLE ist die beste gefundene Lösung; INFEASIBLE beweist Unlösbarkeit unter den aktiven Annahmen; UNKNOWN ist kein Beweis.',
  autoPlanV9BestBound: 'Beste mathematische Schranke des Solvers. Zusammen mit dem Zielfunktionswert ergibt sie den Optimality Gap.',
  autoPlanV9ConflictCore: 'Reduzierter Konfliktkern aus Solverannahmen. Er enthält eine hinreichende Menge gleichzeitig unvereinbarer Bedingungen, ist aber nicht zwingend der absolut kleinste Kern.'
});

export function installAutoPlanV9Tooltips(root = document) {
  for (const [id, text] of Object.entries(AUTO_PLAN_V9_TOOLTIPS)) {
    const element = root.getElementById?.(id) || root.querySelector?.(`#${id}`);
    if (element) setRichTooltip(element, text);
  }
  root.querySelectorAll?.('[data-v9-tooltip]').forEach(element => {
    const key = element.dataset.v9Tooltip;
    if (AUTO_PLAN_V9_TOOLTIPS[key]) setRichTooltip(element, AUTO_PLAN_V9_TOOLTIPS[key]);
  });
}
