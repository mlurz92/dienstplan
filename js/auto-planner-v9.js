/**
 * Auto-Plan v9 – CP-SAT Guided Adaptive Exact-LNS.
 *
 * Die browserseitigen Konstruktionsfunktionen bleiben unverändert als
 * deterministischer Warmstart, Offlinefallback und unabhängige
 * Heuristikreferenz verfügbar. Der produktive v9-Lauf wird ausschließlich vom
 * hybriden Runner gekennzeichnet. Dadurch bleiben direkte Engine-Aufrufe,
 * Benchmarks und die v8.5-Kompatibilität semantisch stabil.
 */
import * as V85 from './auto-planner-v8-5.js?v=20260803.4';

export * from './auto-planner-v8-5.js?v=20260803.4';

export const AUTO_PLAN_REVISION = 9;
export const AUTO_PLAN_ENGINE_ID = 'v9-cpsat-guided-exact-lns';
export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'snapshot', title: 'Snapshot und Regelkompilierung', detail: 'Fixpunkte, datumsabhängige Domänen, Obergrenzen und Regelinstanzen werden versioniert eingefroren.' }),
  Object.freeze({ id: 'presolve', title: 'Propagation und Presolve', detail: 'CP-SAT reduziert Domänen, entfernt redundante Relationen und erkennt frühe Widersprüche.' }),
  Object.freeze({ id: 'strict-feasibility', title: 'Null-Rot-Machbarkeit', detail: 'Technisch vollständige Belegung ohne bestätigungspflichtige Ausnahme wird gesucht und gegebenenfalls bewiesen.' }),
  Object.freeze({ id: 'minimal-relaxation', title: 'Minimale Relaxierung', detail: 'Erst nach dem strikten Pfad werden freigegebene bestätigungspflichtige Ausnahmen lexikografisch minimiert.' }),
  Object.freeze({ id: 'quality', title: 'Regelqualität und Wünsche', detail: 'Orange, Gelb und erfüllbare Wünsche werden in getrennten Zielstufen optimiert.' }),
  Object.freeze({ id: 'fairness', title: 'Fairness und Stabilität', detail: 'Sollabweichung, Lastspannweiten, Wochenenden und Änderungen am Ausgangsplan werden optimiert.' }),
  Object.freeze({ id: 'exact-lns', title: 'Adaptive Exact-LNS', detail: 'Fachlich ausgewählte Ausschnitte werden freigegeben und durch CP-SAT exakt neu gelöst.' }),
  Object.freeze({ id: 'alternatives', title: 'Diverse Varianten', detail: 'Qualitätsgebundene Alternativen mit definierter Hamming-Distanz werden erzeugt.' }),
  Object.freeze({ id: 'explain', title: 'Konflikt- und Nachweisanalyse', detail: 'Solverstatus, Schranken, Gap und gegebenenfalls ein reduzierter Konfliktkern werden aufbereitet.' }),
  Object.freeze({ id: 'audit', title: 'Unabhängiger Browseraudit', detail: 'Jede vorgeschlagene Zelle wird erneut durch die produktive JavaScript-Regelengine geprüft.' })
]);

export const constructAutoPlan = V85.constructAutoPlan;
export const perfectAutoPlan = V85.perfectAutoPlan;
export const buildAutoPlan = V85.buildAutoPlan;
