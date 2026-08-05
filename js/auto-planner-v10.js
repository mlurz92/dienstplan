/**
 * Auto-Plan v10 — Exakter Boolescher Dienstplankern.
 *
 * ARCHITEKTUR
 *
 *   Analyse  →  Warmstart (v8.5-Heuristik)  →  Modellbau (Boolean One-Hot)
 *            →  lexikografische Kaskade mit Sperrschnitten und Hinweisen
 *            →  Schlussaudit der Regelengine  →  Optimalitätsnachweis
 *            →  bei Unerfüllbarkeit: Korrekturmengen-Diagnose
 *
 * Die Heuristik bleibt vollwertig: Sie liefert den Warmstart, sie ist die
 * Rückfallebene ohne WebAssembly, und sie gewinnt, wenn ihr Ergebnis nach der
 * Zielordnung der Regelengine besser ist. Die exakte Suche muss sich also in
 * jedem Lauf verdienen, was sie beansprucht.
 *
 * LEXIKOGRAFISCH STATT GEWICHTET
 *
 * Gewichte über unvergleichbare Ziele sind eine Scheingenauigkeit: Niemand kann
 * angeben, wie viele Wunscherfüllungen eine Einheit Ungleichverteilung wert
 * sind. Stattdessen wird stufenweise optimiert und der erreichte Wert je Stufe
 * durch einen Sperrschnitt festgeschrieben — die Reihenfolge der Stufen ist die
 * ehrliche Form der Gewichtung und in der Oberfläche frei sortierbar.
 * Das ist zugleich das von OR-Tools empfohlene Vorgehen: lösen, Zielwert
 * fixieren, Lösung als Hinweis übergeben, nächste Stufe.
 *
 * FAIRNESS ALS LEXIMIN
 *
 * Varianz und Summenstrafen tauschen eine sehr ungleiche Verteilung gegen viele
 * kleine Abweichungen ein. Leximin tut das nicht: Zuerst wird die Höchstlast
 * gesenkt, dann die Zahl der Personen auf dieser Höchstlast, dann die nächste
 * Stufe. Umgesetzt über die Summe der Überschüsse oberhalb absteigender
 * Schwellen — die lineare Form der geordneten Mittelwertbildung.
 */

import * as V85 from './auto-planner-v8-5.js?v=20260806.1';

export * from './auto-planner-v8-5.js?v=20260806.1';

import {
  buildPlanModel,
  solutionToAssignments,
  carryOverOffsets,
  RELAX_GROUPS,
  OBJECTIVE_COMPONENTS
} from './auto-plan-model.js?v=20260806.1';
import { loadSolver, solveModel, termBounds, solverDiagnostics } from './auto-plan-solver.js?v=20260806.1';
import {
  beginEvaluationEpoch,
  currentEvaluationEpoch,
  evaluatePlanObjective,
  compareObjectiveKeys,
  isObjectiveAdmissible,
  listOpenSlots,
  listProposedAssignments,
  planRespectsLimits,
  planningContextFor,
  candidateEvaluationVector,
  planProfileIds,
  syncPeerCache,
  adoptPeerCacheToken,
  validateAutoPlanConfig
} from './auto-planner-engine.js?v=20260806.1';
import { getStaffById } from './rules.js?v=20260806.1';
import { basicallyEligiblePeers } from './rules-core.js?v=20260806.1';

export {
  beginEvaluationEpoch,
  currentEvaluationEpoch,
  evaluatePlanObjective,
  compareObjectiveKeys,
  isObjectiveAdmissible,
  listOpenSlots,
  listProposedAssignments,
  planRespectsLimits,
  planningContextFor,
  candidateEvaluationVector,
  planProfileIds,
  syncPeerCache,
  adoptPeerCacheToken
} from './auto-planner-engine.js?v=20260806.1';

export { RELAX_GROUPS, OBJECTIVE_COMPONENTS } from './auto-plan-model.js?v=20260806.1';
export { isSolverReady, loadSolver, solverDiagnostics } from './auto-plan-solver.js?v=20260806.1';

export const AUTO_PLAN_REVISION = 10;
export const AUTO_PLAN_ENGINE_ID = 'v10-exact-boolean-rostering-core';
const VERSION_MARKER = '20260806.1';
const OPTIMIZER_REVISION = 5;

export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'analysis', title: 'Fixpunkte und Domänen', detail: 'Bestehende Einteilungen werden gesichert, Kandidatenmengen je Feld bestimmt, das Fairness-Gedächtnis der Vormonate gelesen.' }),
  Object.freeze({ id: 'warmstart', title: 'Warmstart', detail: 'Die bewährte Heuristik erzeugt eine vollständige, regelgeprüfte Startlösung — Hinweis für die exakte Suche und Rückfallebene zugleich.' }),
  Object.freeze({ id: 'model', title: 'Modellbau', detail: 'Je Feld und zulässiger Person eine Binärvariable; jede Regel wird zu einer linearen Aussage über Zählungen.' }),
  Object.freeze({ id: 'exact', title: 'Lexikografische Kaskade', detail: 'Stufe für Stufe wird ein Ziel exakt minimiert und sein Wert durch einen Sperrschnitt festgeschrieben.' }),
  Object.freeze({ id: 'repair', title: 'Reparatur und Nachbarschaft', detail: 'Bleibt Zeit oder fehlt der exakte Kern, glättet die Tauschreparatur den besten Aufbau.' }),
  Object.freeze({ id: 'perfect', title: 'Perfektion', detail: 'Adaptive Ruin-and-Recreate-Suche; bei bewiesener Optimalität entfällt sie.' }),
  Object.freeze({ id: 'audit', title: 'Regelengine-Schlussaudit', detail: 'Jeder Vorschlag wird vollständig gegen die produktive Regelengine geprüft; sie entscheidet.' }),
  Object.freeze({ id: 'certify', title: 'Optimalitätsnachweis', detail: 'Trifft der Zielwert die untere Schranke, ist die Stufe beweisbar optimal.' })
]);

/**
 * Voreingestellte Stufenreihenfolgen je Optimierungsschwerpunkt.
 * `perturbation` wird abhängig von der Stabilitätsstufe angehängt.
 */
const DEFAULT_STAGE_ORDER = Object.freeze({
  balanced: ['fairness', 'wishes', 'bdTarget', 'weekendChain', 'weekend', 'saturday', 'hgBurden', 'ctLeadership'],
  wishes: ['wishes', 'fairness', 'bdTarget', 'weekendChain', 'weekend', 'saturday', 'hgBurden', 'ctLeadership'],
  workload: ['fairness', 'bdTarget', 'weekend', 'weekendChain', 'wishes', 'saturday', 'hgBurden', 'ctLeadership'],
  weekends: ['weekend', 'saturday', 'weekendChain', 'fairness', 'wishes', 'bdTarget', 'hgBurden', 'ctLeadership']
});

const STAGE_IDS = new Set([...Object.keys(OBJECTIVE_COMPONENTS)]);

function cloneMonth(monthData) {
  if (typeof structuredClone === 'function') return structuredClone(monthData);
  return JSON.parse(JSON.stringify(monthData));
}

function elapsedSince(startedAt) {
  return Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function planningFingerprintOf(state, monthData) {
  return V85.planningFingerprint(state, monthData);
}

function deterministicSeed(config, state, monthData) {
  let seed = 2166136261;
  const text = `${JSON.stringify(stableValue(config))}|${planningFingerprintOf(state, monthData)}|${String(config.randomSeed ?? '')}`;
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

/**
 * Ergänzt die v10-Felder um ihre Voreinstellungen. Die Engine-Normalisierung
 * bleibt zuständig für den Altvertrag; hier kommt nur hinzu, was v10 neu kennt.
 */
export function normalizeV10Config(state, monthData, runConfig) {
  const validation = validateAutoPlanConfig(state, monthData, runConfig);
  if (!validation.valid) throw new Error(`Auto-Plan-Konfiguration ungültig: ${validation.errors.join(' ')}`);
  const base = validation.config;
  const settings = state?.settings?.autoPlan && typeof state.settings.autoPlan === 'object' ? state.settings.autoPlan : {};
  const pick = key => (runConfig?.[key] === undefined ? settings[key] : runConfig[key]);

  const requested = Array.isArray(pick('stageOrder')) ? pick('stageOrder').filter(id => STAGE_IDS.has(id)) : null;
  const fallbackOrder = DEFAULT_STAGE_ORDER[base.optimizationFocus] || DEFAULT_STAGE_ORDER.balanced;
  const stageOrder = requested && requested.length
    ? [...requested, ...fallbackOrder.filter(id => !requested.includes(id))]
    : [...fallbackOrder];

  const stabilityLevel = ['off', 'tiebreak', 'strict'].includes(pick('stabilityLevel'))
    ? pick('stabilityLevel')
    : (base.protectBaseline === false ? 'off' : 'tiebreak');
  const conflictMode = ['report', 'show', 'apply'].includes(pick('conflictMode'))
    ? pick('conflictMode')
    : (base.infeasibilityMode === 'relax' ? 'apply' : 'show');

  // Prozentwerte in der Oberfläche, Anteile im Modell: Die Umrechnung gehört
  // genau hierher, damit weder das Schema Gleitkommazahlen normalisieren muss
  // noch das Modell Prozentzeichen kennt.
  return {
    ...base,
    stageOrder,
    leximinDepth: clampInt(pick('leximinDepth'), 1, 8, 3),
    hgLoadFactor: clampFloat(pick('hgLoadPercent'), 0, 100, 60) / 100,
    carryOverWindow: clampInt(pick('carryOverWindow'), 0, 6, 3),
    carryOverWeight: clampFloat(pick('carryOverPercent'), 0, 100, 50) / 100,
    stabilityLevel,
    conflictMode,
    exactTimeBudgetSeconds: clampInt(pick('cpSatTimeBudgetSeconds'), 2, 60, base.cpSatTimeBudgetSeconds || 10)
  };
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

/* ------------------------------------------------------------------------- *
 * Kennzahlen
 * ------------------------------------------------------------------------- */

/**
 * Jains Fairness-Index: (Σx)² / (n · Σx²), Wertebereich (0,1].
 * Eins bedeutet vollkommene Gleichverteilung. Anders als die Varianz ist er
 * skaleninvariant und damit über Monate hinweg vergleichbar.
 */
export function jainIndex(values) {
  const list = values.filter(value => Number.isFinite(value));
  if (!list.length) return 1;
  const sum = list.reduce((total, value) => total + value, 0);
  const squares = list.reduce((total, value) => total + value * value, 0);
  if (squares <= 0) return 1;
  return (sum * sum) / (list.length * squares);
}

/**
 * Gini-Koeffizient über die mittlere absolute Differenz aller Paare.
 * Null bedeutet Gleichverteilung, eins vollständige Konzentration.
 */
export function giniIndex(values) {
  const list = values.filter(value => Number.isFinite(value));
  const n = list.length;
  if (n < 2) return 0;
  const mean = list.reduce((total, value) => total + value, 0) / n;
  if (mean <= 0) return 0;
  let differences = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) differences += Math.abs(list[i] - list[j]);
  }
  return differences / (2 * n * n * mean);
}

/**
 * Ausfallrobustheit: Anteil der besetzten Felder, für die es mindestens eine
 * andere grundsätzlich wählbare Person gäbe.
 *
 * Das ist keine stochastische Optimierung, sondern die billigste ehrliche
 * Auskunft auf die Frage, die in der Praxis wirklich gestellt wird: „Was
 * passiert, wenn jemand ausfällt?"
 */
export function fallbackRobustness(state, monthData) {
  let covered = 0;
  let total = 0;
  for (const dateIso of Object.keys(monthData?.days || {})) {
    for (const role of ['bd', 'hg']) {
      const staffId = monthData.days[dateIso]?.[role];
      if (!staffId) continue;
      total += 1;
      const probe = cloneMonth(monthData);
      probe.days[dateIso][role] = '';
      const alternatives = basicallyEligiblePeers(state, probe, dateIso, role)
        .filter(person => person.id !== staffId);
      if (alternatives.length) covered += 1;
    }
  }
  return total ? covered / total : 1;
}

function loadVector(state, monthData, hgFactor) {
  const loads = new Map();
  for (const person of state?.staff || []) loads.set(person.id, 0);
  for (const dateIso of Object.keys(monthData?.days || {})) {
    const day = monthData.days[dateIso] || {};
    if (day.bd) loads.set(day.bd, (loads.get(day.bd) || 0) + 1);
    if (day.hg) loads.set(day.hg, (loads.get(day.hg) || 0) + hgFactor);
  }
  return [...loads.values()];
}

/* ------------------------------------------------------------------------- *
 * Leximin
 * ------------------------------------------------------------------------- */

/**
 * Erzeugt die Zusatzvariablen der Leximin-Kaskade.
 *
 * `Lmax` ist die Höchstlast, `excess[j][p]` der Überschuss der Person p über
 * die Schwelle der Stufe j. Die Summe der Überschüsse über absteigende
 * Schwellen zu minimieren ist die lineare Form der geordneten Mittelwert-
 * bildung und liefert für ganzzahlige Lasten genau die Leximin-Ordnung.
 */
function buildLeximinScaffold(model, depth) {
  const base = model.vars.length;
  const extraVars = [];
  const staffIds = [...model.loadTerms.keys()];
  let maxLoad = 0;
  let minConstant = 0;
  for (const [, entry] of model.loadTerms) {
    const [low, high] = termBounds(entry.terms, model.vars);
    maxLoad = Math.max(maxLoad, high + entry.constant);
    minConstant = Math.min(minConstant, low + entry.constant);
  }
  const lmaxIndex = base + extraVars.length;
  extraVars.push({ index: lmaxIndex, name: 'leximin_max', lb: Math.min(0, Math.round(minConstant)), ub: Math.max(1, Math.round(maxLoad)), meta: { leximin: 'max' } });

  const excess = [];
  for (let level = 1; level < depth; level += 1) {
    const row = new Map();
    for (const staffId of staffIds) {
      const index = base + extraVars.length;
      extraVars.push({ index, name: `leximin_excess_${level}_${staffId}`, lb: 0, ub: Math.max(1, Math.round(maxLoad)), meta: { leximin: level, staffId } });
      row.set(staffId, index);
    }
    excess.push(row);
  }
  return { extraVars, lmaxIndex, excess, staffIds, maxLoad };
}

/**
 * Constraints, die die Höchstlast an `Lmax` binden: L_p ≤ Lmax.
 */
function leximinMaxConstraints(model, lmaxIndex) {
  const constraints = [];
  for (const [staffId, entry] of model.loadTerms) {
    if (!entry.terms.length) continue;
    const terms = [...entry.terms, [lmaxIndex, -1]];
    const [low] = termBounds(terms, model.vars);
    constraints.push({
      id: `leximin_bind_${staffId}`,
      group: 'leximin',
      terms,
      lb: low,
      ub: -entry.constant,
      enforce: null
    });
  }
  return constraints;
}

/**
 * Constraints der Stufe `level`: excess_p ≥ L_p − threshold.
 */
function leximinExcessConstraints(model, excessRow, threshold) {
  const constraints = [];
  for (const [staffId, entry] of model.loadTerms) {
    const excessIndex = excessRow.get(staffId);
    if (excessIndex === undefined || !entry.terms.length) continue;
    const terms = [...entry.terms, [excessIndex, -1]];
    const [low] = termBounds(terms, model.vars);
    constraints.push({
      id: `leximin_excess_${threshold}_${staffId}`,
      group: 'leximin',
      terms,
      lb: low,
      ub: Math.round(threshold) - entry.constant,
      enforce: null
    });
  }
  return constraints;
}

/* ------------------------------------------------------------------------- *
 * Kaskade
 * ------------------------------------------------------------------------- */

function stagePlan(config, model) {
  const stages = [];
  for (const id of config.stageOrder) {
    if (id === 'fairness') {
      stages.push({ id: 'fairness', kind: 'leximin', label: 'Gleichmäßige Gesamtlast (Leximin)' });
      continue;
    }
    const component = model.components[id];
    if (!component || !component.terms.length) continue;
    stages.push({ id, kind: 'component', label: component.label, terms: component.terms });
  }
  if (config.stabilityLevel !== 'off' && model.components.perturbation.terms.length) {
    const stage = { id: 'perturbation', kind: 'component', label: OBJECTIVE_COMPONENTS.perturbation, terms: model.components.perturbation.terms };
    if (config.stabilityLevel === 'strict') stages.unshift(stage);
    else stages.push(stage);
  }
  return stages;
}

/**
 * Führt die lexikografische Kaskade aus.
 */
async function runCascade({ model, api, config, signal, onProgress, onIncumbent }) {
  const stages = stagePlan(config, model);
  const scaffold = buildLeximinScaffold(model, config.leximinDepth);
  const fixedValues = Object.values(model.relaxLiterals).map(index => [index, 1]);
  const carried = [];
  const trace = [];
  let hintValues = null;
  let bestValues = null;
  let leximinTop = null;

  const totalUnits = stages.reduce((sum, stage) => sum + (stage.kind === 'leximin' ? config.leximinDepth : 1), 0) + 1;
  const budgetPerUnit = Math.max(400, Math.floor((config.exactTimeBudgetSeconds * 1000) / Math.max(1, totalUnits)));
  let unit = 0;
  const progress = () => 0.30 + 0.42 * (unit / Math.max(1, totalUnits));

  const solveStep = (label, options) => {
    unit += 1;
    return solveModel(model, api, {
      timeLimitMs: budgetPerUnit,
      workers: 1,
      extraVars: scaffold.extraVars,
      fixedValues,
      hintValues,
      onIncumbent: onIncumbent ? update => onIncumbent({ ...update, stageLabel: label }) : null,
      ...options
    });
  };

  // Stufe 0: Zulässigkeit. Sie kostet fast nichts und trennt sauber zwischen
  // „unlösbar" und „lösbar, aber nicht in Budget optimierbar".
  await onProgress?.({ phase: 'exact', stage: 'cp-sat', progress: 0.28, message: 'Exakte Suche: Zulässigkeit wird geprüft' });
  const feasibility = solveStep('Zulässigkeit', { extraConstraints: [...leximinMaxConstraints(model, scaffold.lmaxIndex)] });
  trace.push({ id: 'feasibility', label: 'Zulässigkeit', status: feasibility.statusName, value: null, bound: null, wallTimeMs: feasibility.wallTimeMs });
  if (feasibility.statusName !== 'OPTIMAL' && feasibility.statusName !== 'FEASIBLE') {
    return { values: null, trace, infeasible: feasibility.statusName === 'INFEASIBLE', reason: feasibility.reason || feasibility.statusName, stages };
  }
  bestValues = feasibility.values;
  hintValues = feasibility.values;

  for (const stage of stages) {
    if (signal?.aborted) break;
    if (stage.kind === 'leximin') {
      // Ebene 1: Höchstlast senken.
      await onProgress?.({ phase: 'exact', stage: 'cp-sat', progress: progress(), message: 'Leximin 1: Höchstlast wird gesenkt', cpSatPhase: 'fairness' });
      const bind = leximinMaxConstraints(model, scaffold.lmaxIndex);
      const first = solveStep('Leximin · Höchstlast', {
        extraConstraints: [...carried, ...bind],
        objectiveTerms: [[scaffold.lmaxIndex, 1]]
      });
      if (!accept(first)) break;
      leximinTop = Math.round(first.objectiveValue);
      carried.push(...bind, { id: 'leximin_fix_max', group: 'leximin', terms: [[scaffold.lmaxIndex, 1]], lb: scaffold.extraVars[0].lb, ub: leximinTop, enforce: null });
      bestValues = first.values;
      hintValues = first.values;
      trace.push({ id: 'fairness:1', label: 'Leximin · Höchstlast', status: first.statusName, value: leximinTop / model.loadScale, bound: first.bestBound === null ? null : first.bestBound / model.loadScale, wallTimeMs: first.wallTimeMs });

      // Ebene 2..k: Überschuss über absteigende Schwellen minimieren.
      for (let level = 1; level < config.leximinDepth; level += 1) {
        if (signal?.aborted) break;
        const threshold = leximinTop - level * model.loadScale;
        if (threshold <= scaffold.extraVars[0].lb) break;
        const row = scaffold.excess[level - 1];
        const excessConstraints = leximinExcessConstraints(model, row, threshold);
        if (!excessConstraints.length) break;
        const objective = [...row.values()].map(index => [index, 1]);
        await onProgress?.({
          phase: 'exact', stage: 'cp-sat', progress: progress(),
          message: `Leximin ${level + 1}: Überschuss über ${(threshold / model.loadScale).toFixed(2)} wird minimiert`,
          cpSatPhase: 'fairness'
        });
        const step = solveStep(`Leximin · Rang ${level + 1}`, {
          extraConstraints: [...carried, ...excessConstraints],
          objectiveTerms: objective
        });
        if (!accept(step)) break;
        carried.push(...excessConstraints, {
          id: `leximin_fix_${level}`, group: 'leximin', terms: objective,
          lb: 0, ub: Math.round(step.objectiveValue), enforce: null
        });
        bestValues = step.values;
        hintValues = step.values;
        trace.push({
          id: `fairness:${level + 1}`, label: `Leximin · Rang ${level + 1}`, status: step.statusName,
          value: step.objectiveValue / model.loadScale,
          bound: step.bestBound === null ? null : step.bestBound / model.loadScale,
          wallTimeMs: step.wallTimeMs
        });
      }
      continue;
    }

    await onProgress?.({
      phase: 'exact', stage: 'cp-sat', progress: progress(),
      message: `Stufe „${stage.label}" wird minimiert`, cpSatPhase: stage.id
    });
    const step = solveStep(stage.label, {
      extraConstraints: [...carried],
      objectiveTerms: stage.terms
    });
    if (!accept(step)) break;
    const [low] = termBounds(stage.terms, [...model.vars, ...scaffold.extraVars]);
    carried.push({
      id: `fix_${stage.id}`, group: 'stage', terms: stage.terms,
      lb: low, ub: Math.round(step.objectiveValue), enforce: null
    });
    bestValues = step.values;
    hintValues = step.values;
    trace.push({
      id: stage.id, label: stage.label, status: step.statusName,
      value: step.objectiveValue, bound: step.bestBound, wallTimeMs: step.wallTimeMs
    });
  }

  return { values: bestValues, trace, infeasible: false, stages, leximinTop };

  function accept(result) {
    return result.statusName === 'OPTIMAL' || result.statusName === 'FEASIBLE';
  }
}

/* ------------------------------------------------------------------------- *
 * Konfliktdiagnose
 * ------------------------------------------------------------------------- */

/**
 * Korrekturmengen-Diagnose.
 *
 * Statt Constraint für Constraint zu löschen — was bei mehreren tausend
 * Constraints ebenso viele Solver-Läufe kostet und am Ende „alle sind schuld"
 * sagt — wird jede relaxierbare Gruppe an ein Literal gebunden und die
 * gewichtete Summe der eingehaltenen Gruppen maximiert. Ein einziger Lauf sagt
 * damit, welche Regeln aufgegeben werden müssten, und liefert den zugehörigen
 * Plan gleich mit.
 *
 * Ehrlichkeit über die Grenze: Die Minimierung der Aufgabemenge ist selbst ein
 * hartes Problem. Innerhalb des Budgets nachgewiesen ist nicht dasselbe wie
 * minimal — das Ergebnis wird deshalb als „in t Sekunden nachgewiesen"
 * ausgewiesen und nie als Minimum behauptet.
 */
export async function diagnoseConflicts(model, api, { timeLimitMs = 6000, onIncumbent = null } = {}) {
  const groups = Object.entries(model.relaxLiterals);
  const objective = groups.map(([group, index]) => [index, RELAX_GROUPS[group]?.weight ?? 100]);
  const result = solveModel(model, api, {
    timeLimitMs,
    workers: 1,
    objectiveTerms: objective,
    maximize: true,
    onIncumbent
  });
  if (result.statusName !== 'OPTIMAL' && result.statusName !== 'FEASIBLE') {
    return {
      solvable: false,
      status: result.statusName,
      dropped: [],
      kept: [],
      proven: false,
      detail: 'Auch nach Aufgabe aller relaxierbaren Regeln bleibt der Monat unlösbar. Die Ursache liegt außerhalb des Modells — bitte Fixpunkte und Abwesenheiten prüfen.',
      values: null,
      wallTimeMs: result.wallTimeMs
    };
  }
  const dropped = [];
  const kept = [];
  for (const [group, index] of groups) {
    const entry = { id: group, label: RELAX_GROUPS[group]?.label || group };
    if (Number(result.values[index]) === 1) kept.push(entry);
    else dropped.push(entry);
  }
  return {
    solvable: true,
    status: result.statusName,
    proven: result.statusName === 'OPTIMAL',
    dropped,
    kept,
    values: result.values,
    wallTimeMs: result.wallTimeMs,
    detail: dropped.length
      ? `Lösbar, wenn aufgegeben wird: ${dropped.map(entry => entry.label).join(', ')}.`
      : 'Alle Regelgruppen sind gemeinsam erfüllbar.'
  };
}

/* ------------------------------------------------------------------------- *
 * Ergebnisaufbau
 * ------------------------------------------------------------------------- */

function redViolation(entry) {
  return {
    dateIso: entry.dateIso,
    role: entry.role,
    staffId: entry.staffId,
    level: entry.evaluation.level,
    confirmationType: entry.evaluation.meta?.confirmationType || 'standard',
    reasons: entry.evaluation.reasons || []
  };
}

function fairnessIndexOf(objective) {
  if (!objective || objective.audit.gray || objective.unfilled || objective.limitViolations) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function makeResult({ state, baseline, plannedMonth, config, searchProfile, startedAt, exact = null, conflict = null }) {
  const objective = evaluatePlanObjective(state, plannedMonth, baseline, config);
  const changes = listProposedAssignments(plannedMonth, baseline);
  const slots = listOpenSlots(baseline);
  let fixedAssignments = 0;
  for (const iso of Object.keys(baseline?.days || {})) {
    const day = baseline.days?.[iso] || {};
    if (day.bd || day.hg) fixedAssignments += 1;
  }
  const complete = !objective.limitViolations && !objective.audit.gray && !objective.unfilled
    && changes.length === slots.length && !objective.redLimitExceeded;
  const requiresConfirmation = complete && objective.audit.red > 0;
  const status = !complete ? 'blocked' : requiresConfirmation ? 'confirmation_required' : 'clean';
  const loads = loadVector(state, plannedMonth, config.hgLoadFactor ?? 0.6);
  return {
    success: complete,
    complete,
    requiresConfirmation,
    status,
    searchProfile,
    year: baseline.year,
    month: baseline.month,
    baselineFingerprint: planningFingerprintOf(state, baseline),
    runConfig: cloneMonth(config),
    runConfigFingerprint: JSON.stringify(stableValue(config)),
    baseline,
    plannedMonth: cloneMonth(plannedMonth),
    changes,
    redViolations: objective.audit.entries.filter(entry => entry.evaluation.level === 'red').map(redViolation),
    fixedAssignments,
    openSlots: slots.length,
    elapsedMs: elapsedSince(startedAt),
    objectiveKey: objective.key.map(value => Number(value) || 0),
    metrics: {
      proposed: changes.length,
      unfilled: objective.unfilled,
      red: objective.audit.red,
      specialRed: objective.audit.specialRed,
      gray: objective.audit.gray,
      orange: objective.audit.orange,
      yellow: objective.audit.yellow,
      wishesFulfilled: objective.wishes.fulfilled,
      wishesPossible: objective.wishes.possible,
      fairnessIndex: fairnessIndexOf(objective),
      jainIndex: Number(jainIndex(loads).toFixed(4)),
      giniIndex: Number(giniIndex(loads).toFixed(4)),
      bdTargetPenalty: Number(objective.fairness.bdPenalty.toFixed(2)),
      combinedLoadVariance: Number(objective.fairness.combinedVariance.toFixed(3)),
      aaHgVariance: Number(objective.fairness.aaHgVariance.toFixed(3)),
      weekendVariance: Number(objective.fairness.weekendVariance.toFixed(3)),
      exact: exact || null,
      conflict: conflict || null,
      engine: AUTO_PLAN_ENGINE_ID
    },
    audit: objective.audit.entries.map(entry => ({
      dateIso: entry.dateIso,
      role: entry.role,
      staffId: entry.staffId,
      level: entry.evaluation.level,
      canSelect: entry.evaluation.canSelect,
      confirmationType: entry.evaluation.meta?.confirmationType || null,
      reasons: entry.evaluation.reasons || []
    }))
  };
}

/**
 * Ergänzt die Verteilungskennzahlen an jedem Ergebnis — gleich, ob es aus der
 * exakten Suche oder aus der Heuristik stammt. Eine Kennzahl, die nur auf einem
 * der beiden Wegen erscheint, ist in der Oberfläche schlimmer als keine.
 */
function withLoadMetrics(result, state, hgFactor) {
  if (!result?.plannedMonth) return result;
  const loads = loadVector(state, result.plannedMonth, hgFactor);
  result.metrics ||= {};
  result.metrics.jainIndex = Number(jainIndex(loads).toFixed(4));
  result.metrics.giniIndex = Number(giniIndex(loads).toFixed(4));
  return result;
}

function annotate(result, exact = null, conflict = null) {
  if (!result) return result;
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  const perfectionEnabled = result.optimizerConfig?.perfectionEnabled !== false;
  result.metrics.phaseContract = {
    mandatory: AUTO_PLAN_STAGES.map(stage => stage.id),
    perfectionEnabled,
    certificationEnabled: perfectionEnabled
  };
  if (exact) result.metrics.exact = exact;
  if (conflict) result.metrics.conflict = conflict;
  return result;
}

/**
 * Zieht die Konfigurationsabschnitte nach, die sonst die Heuristik-Kette setzt.
 */
function finalizeConstructed(result, state, parameters) {
  if (!result) return result;
  const runConfig = parameters?.runConfig || {};
  if (!result.optimizerConfig) {
    const optimizer = V85.optimizerDefaults(runConfig);
    result.optimizerConfig = optimizer;
    result.optimizerConfigFingerprint = V85.optimizerFingerprint(optimizer);
    result.optimizerRevision = OPTIMIZER_REVISION;
  }
  if (!result.iterativeConfig) {
    const intensity = runConfig.searchIntensity;
    const fallback = intensity === 'maximum' ? 18 : intensity === 'standard' ? 5 : 11;
    const iterative = {
      repairIterations: Number.isInteger(Number(runConfig.repairIterations))
        ? Math.max(0, Math.min(30, Number(runConfig.repairIterations)))
        : fallback,
      localRebuildBudget: Number.isInteger(Number(runConfig.localRebuildBudget))
        ? Math.max(200, Math.min(12000, Number(runConfig.localRebuildBudget)))
        : intensity === 'maximum' ? 7000 : 3200
    };
    result.iterativeConfig = iterative;
    result.iterativeConfigFingerprint = JSON.stringify(stableValue(iterative));
    result.metrics ||= {};
    result.metrics.iterative ||= { rounds: 0, neighbors: 0, improvements: 0, reassignments: 0, swaps: 0, chains: 0, dayBundles: 0, localRebuilds: 0, localNodes: 0 };
  }
  if (!result.executionConfig) {
    result.executionConfig = {
      performanceProfile: runConfig.performanceProfile || state?.settings?.autoPlan?.performanceProfile || 'adaptive',
      parallelSearches: runConfig.parallelSearches ?? state?.settings?.autoPlan?.parallelSearches ?? null
    };
  }
  if (!result.proposalFingerprint) {
    result.proposalFingerprint = JSON.stringify(stableValue({
      baselineFingerprint: result.baselineFingerprint,
      runConfigFingerprint: result.runConfigFingerprint,
      iterativeConfigFingerprint: result.iterativeConfigFingerprint,
      changes: result.changes
    }));
  }
  return result;
}

function applyAssignments(baseline, state, assignments) {
  const planned = cloneMonth(baseline);
  for (const { dateIso, role, staffId } of assignments) {
    if (planned.days?.[dateIso] && getStaffById(state.staff, staffId)) planned.days[dateIso][role] = staffId;
  }
  return planned;
}

/* ------------------------------------------------------------------------- *
 * Öffentliche Läufe
 * ------------------------------------------------------------------------- */

export async function constructAutoPlan(parameters) {
  const { state, monthData, year = monthData?.year, month = monthData?.month, runConfig = null, onProgress = null, signal = null, onIncumbent = null } = parameters;
  if (!state || !monthData || !Number.isInteger(year) || !Number.isInteger(month)) {
    throw new TypeError('Auto-Plan benötigt Zustand, Monatsdaten, Jahr und Monat.');
  }
  const config = normalizeV10Config(state, monthData, runConfig);
  const baseline = cloneMonth(monthData);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const randomSeed = config.deterministic === false ? undefined : deterministicSeed(config, state, monthData);
  const openSlots = listOpenSlots(baseline);

  await onProgress?.({
    phase: 'analysis',
    progress: 0.03,
    message: `${AUTO_PLAN_ENGINE_ID} · ${openSlots.length} offene Felder · Fairness-Gedächtnis über ${config.carryOverWindow} Monate`,
    fixed: openSlots.length,
    total: openSlots.length
  });

  // 1. Warmstart und Rückfallebene.
  const heuristicRunConfig = {
    ...(runConfig || {}),
    ...(randomSeed !== undefined ? { seedSalt: String(randomSeed % 100000) } : {})
  };
  const heuristic = await V85.constructAutoPlan({
    ...parameters,
    runConfig: heuristicRunConfig,
    onProgress: update => onProgress?.({
      ...update,
      stage: update.phase === 'search' || update.phase === 'propagate' ? 'warmstart' : update.stage
    })
  });

  const backend = config.solverBackend || 'auto';
  const exactDesired = backend === 'auto' || backend === 'cp-sat-exact' || backend === 'cp-sat-lns';
  if (!exactDesired || signal?.aborted) {
    annotate(heuristic, { available: false, status: 'DISABLED' });
    return withLoadMetrics(heuristic, state, config.hgLoadFactor);
  }

  const api = await loadSolver({ signal });
  if (!api) {
    withLoadMetrics(heuristic, state, config.hgLoadFactor);
    annotate(heuristic, { available: false, status: 'UNAVAILABLE', diagnostics: solverDiagnostics() });
    await onProgress?.({
      phase: 'polish', stage: 'fallback', progress: 0.7,
      message: `Heuristik-Ergebnis · exakter Kern nicht ladbar · ${heuristic?.changes?.length || 0} Vorschläge`
    });
    return heuristic;
  }

  // 2. Modellbau.
  await onProgress?.({ phase: 'model', stage: 'cp-sat', progress: 0.2, message: 'Modellbau: Binärvariablen je Feld und zulässiger Person' });
  const hints = config.cpSatWarmStart === 'none' ? [] : assignmentsOf(heuristic?.plannedMonth, baseline);
  const model = buildPlanModel({ state, monthData, baseline, config, hints });
  const exactInfo = {
    available: true,
    loadedFrom: { id: api.id, origin: api.origin, url: api.url },
    model: model.counts,
    carryOver: [...model.carryOver.entries()].map(([staffId, value]) => ({ staffId, value: Number(value.toFixed(3)) }))
  };

  await onProgress?.({
    phase: 'model', stage: 'cp-sat', progress: 0.26,
    message: `Modell: ${model.counts.assignments} Zuordnungsvariablen · ${model.counts.constraints} Bedingungen`,
    modelCounts: model.counts
  });

  // 3. Kaskade.
  const cascade = await runCascade({ model, api, config, signal, onProgress, onIncumbent });
  exactInfo.trace = cascade.trace;
  exactInfo.stages = cascade.stages?.map(stage => stage.id) || [];
  const certifiedStages = cascade.trace.filter(entry => entry.status === 'OPTIMAL').length;
  exactInfo.certifiedStages = certifiedStages;
  exactInfo.status = cascade.infeasible ? 'INFEASIBLE' : cascade.trace.at(-1)?.status || 'UNKNOWN';
  exactInfo.optimal = !cascade.infeasible && cascade.trace.length > 0 && cascade.trace.every(entry => entry.status === 'OPTIMAL');
  exactInfo.wallTimeMs = cascade.trace.reduce((sum, entry) => sum + (entry.wallTimeMs || 0), 0);

  let conflict = null;
  let values = cascade.values;

  // 4. Konfliktdiagnose bei Unerfüllbarkeit.
  if (cascade.infeasible) {
    await onProgress?.({ phase: 'exact', stage: 'cp-sat', progress: 0.5, message: 'Unerfüllbar · Korrekturmengen-Diagnose läuft' });
    conflict = await diagnoseConflicts(model, api, { timeLimitMs: Math.max(2000, config.exactTimeBudgetSeconds * 400) });
    exactInfo.conflict = conflict;
    await onProgress?.({ phase: 'exact', stage: 'cp-sat', progress: 0.56, message: conflict.detail });
    if (config.conflictMode === 'apply' && conflict.solvable && conflict.values) values = conflict.values;
    else values = null;
  }

  // 5. Audit und Vergleich.
  if (values && !signal?.aborted) {
    await onProgress?.({ phase: 'audit', stage: 'cp-sat', progress: 0.75, message: 'Vorschlag wird durch die Regelengine auditiert' });
    const planned = applyAssignments(baseline, state, solutionToAssignments(model, values));
    const exactResult = makeResult({ state, baseline, plannedMonth: planned, config, searchProfile: 'exact-boolean', startedAt, exact: exactInfo, conflict });
    const exactObjective = evaluatePlanObjective(state, planned, baseline, config);
    const heuristicObjective = heuristic ? evaluatePlanObjective(state, heuristic.plannedMonth, baseline, config) : null;
    const exactWins = !heuristicObjective || compareObjectiveKeys(exactObjective.key, heuristicObjective.key) <= 0;
    const winner = exactWins ? exactResult : heuristic;
    winner.metrics ||= {};
    winner.metrics.exactUsed = exactWins;
    winner.metrics.exact = exactInfo;
    winner.metrics.conflict = conflict;
    winner.certified = exactWins && exactInfo.optimal === true;
    withLoadMetrics(winner, state, config.hgLoadFactor);
    finalizeConstructed(winner, state, parameters);
    annotate(winner, exactInfo, conflict);
    if (winner.certified) {
      await onProgress?.({
        phase: 'certify', stage: 'cp-sat', progress: 0.88,
        message: `Optimalitätsnachweis: ${certifiedStages} von ${cascade.trace.length} Stufen mit erreichter unterer Schranke`
      });
    }
    await onProgress?.({
      phase: 'complete', progress: 0.94,
      message: `v10: ${exactWins ? 'exakte Suche' : 'Heuristik'} gewinnt · ${winner.changes?.length || 0} Vorschläge · ${winner.metrics?.red || 0} rot`,
      improvements: winner.metrics?.red === 0 ? 1 : 0
    });
    return winner;
  }

  annotate(heuristic, exactInfo, conflict);
  heuristic.metrics ||= {};
  heuristic.metrics.exactUsed = false;
  withLoadMetrics(heuristic, state, config.hgLoadFactor);
  await onProgress?.({
    phase: 'polish', stage: 'fallback', progress: 0.7,
    message: `Heuristik-Ergebnis · exakte Suche ohne verwertbares Ergebnis (${exactInfo.status}) · ${heuristic?.changes?.length || 0} Vorschläge`
  });
  return heuristic;
}

function assignmentsOf(plannedMonth, baseline) {
  const result = [];
  for (const dateIso of Object.keys(plannedMonth?.days || {})) {
    for (const role of ['bd', 'hg']) {
      if (baseline?.days?.[dateIso]?.[role]) continue;
      const staffId = plannedMonth.days[dateIso]?.[role];
      if (staffId) result.push({ dateIso, role, staffId });
    }
  }
  return result;
}

export async function perfectAutoPlan(parameters) {
  const constructed = parameters.constructed;
  if (constructed?.metrics?.exactUsed === true && constructed?.certified) {
    finalizeConstructed(constructed, parameters.state, parameters);
    constructed.metrics ||= {};
    constructed.metrics.certification = { mode: 'exact-lexicographic', proven: true };
    return annotate(constructed, constructed.metrics.exact, constructed.metrics.conflict);
  }
  const runConfig = parameters?.runConfig || {};
  const config = normalizeV10Config(parameters.state, parameters.constructed?.plannedMonth || parameters.monthData, runConfig);
  const randomSeed = config.deterministic === false ? undefined : deterministicSeed(config, parameters.state, parameters.constructed?.plannedMonth || parameters.monthData);
  const heuristicRunConfig = {
    ...runConfig,
    ...(randomSeed !== undefined ? { seedSalt: String(randomSeed % 100000) } : {})
  };
  const result = await V85.perfectAutoPlan({ ...parameters, runConfig: heuristicRunConfig });
  withLoadMetrics(result, parameters.state, config.hgLoadFactor);
  return annotate(result, parameters.constructed?.metrics?.exact || null, parameters.constructed?.metrics?.conflict || null);
}

export async function buildAutoPlan(parameters) {
  const constructed = await constructAutoPlan({ ...parameters });
  if (parameters.signal?.aborted) return constructed;
  return perfectAutoPlan({ ...parameters, constructed });
}

/**
 * Reparaturlauf nach einer manuellen Änderung.
 *
 * Statt den Monat neu zu planen, wird ein Fenster um die Änderung geöffnet und
 * alles außerhalb auf den bestehenden Stand fixiert. Das Ergebnis ist exakt für
 * das Fenster und lässt den Rest des Plans in Ruhe — der Unterschied zwischen
 * einem Werkzeug, dem man vertraut, und einem, das man fürchtet.
 */
export async function repairAutoPlan({ state, monthData, baseline, changedSlots = [], runConfig = null, windowDays = 3, signal = null, onProgress = null }) {
  const config = normalizeV10Config(state, baseline || monthData, runConfig);
  const api = await loadSolver({ signal });
  if (!api) return { applied: false, reason: 'solver-unavailable' };
  const model = buildPlanModel({ state, monthData: baseline || monthData, baseline: baseline || monthData, config, hints: assignmentsOf(monthData, baseline || monthData) });

  const touched = new Set();
  const staffTouched = new Set();
  for (const slot of changedSlots) {
    staffTouched.add(monthData?.days?.[slot.dateIso]?.[slot.role] || '');
    const anchor = new Date(`${slot.dateIso}T12:00:00`).getTime();
    for (const day of model.days) {
      const distance = Math.abs(new Date(`${day}T12:00:00`).getTime() - anchor) / 86400000;
      if (distance <= windowDays) touched.add(day);
    }
  }

  const fixedValues = Object.values(model.relaxLiterals).map(index => [index, 1]);
  model.slots.forEach((slot, index) => {
    if (touched.has(slot.dateIso)) return;
    const current = monthData?.days?.[slot.dateIso]?.[slot.role];
    for (const [staffId, variableIndex] of model.assign[index]) {
      if (staffTouched.has(staffId)) continue;
      fixedValues.push([variableIndex, staffId === current ? 1 : 0]);
    }
  });

  await onProgress?.({ phase: 'repair', progress: 0.5, message: `Reparaturfenster: ${touched.size} Tage werden neu optimiert` });
  const result = solveModel(model, api, {
    timeLimitMs: Math.max(1500, config.exactTimeBudgetSeconds * 500),
    workers: 1,
    fixedValues,
    objectiveTerms: model.components.perturbation.terms.length ? model.components.perturbation.terms : null
  });
  if (result.statusName !== 'OPTIMAL' && result.statusName !== 'FEASIBLE') {
    return { applied: false, reason: result.statusName, wallTimeMs: result.wallTimeMs };
  }
  return {
    applied: true,
    status: result.statusName,
    assignments: solutionToAssignments(model, result.values),
    window: [...touched],
    wallTimeMs: result.wallTimeMs
  };
}

export { buildPlanModel, carryOverOffsets } from './auto-plan-model.js?v=20260806.1';
export const AUTO_PLAN_RELEASE = VERSION_MARKER;
