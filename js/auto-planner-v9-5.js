/**
 * Auto-Plan v9.5 – Correct Boolean Matheuristic Observatory.
 *
 * Pipeline:
 * 1. v8.5-Heuristik als schneller, vollständig regelgeprüfter Warmstart.
 * 2. korrektes Boolean-CP-SAT-Modell mit einer Variablen je Slot/Person.
 * 3. strikte lexikografische Optimierung; FEASIBLE ist nie ein Beweis.
 * 4. constraint-gesteuerte LNS auf dem besten zulässigen Stand.
 * 5. vollständiger Schlussaudit durch die produktive Regelengine.
 * 6. weitere nichtdominierte Schwerpunktvarianten als Studio-Alternativen.
 */

import * as V9 from './auto-planner-v9.js?v=20260803.4';
import * as V85 from './auto-planner-v8-5.js?v=20260803.4';

export * from './auto-planner-v9.js?v=20260803.4';

import {
  compareObjectiveKeys,
  evaluatePlanObjective,
  listOpenSlots,
  listProposedAssignments,
  planningFingerprint,
  validateAutoPlanConfig
} from './auto-planner-engine.js?v=20260803.4';
import {
  assignmentHintsFromMonth,
  buildBooleanAutoPlanModel,
  materializeBooleanSolution
} from './auto-plan-model-v9-5.js?v=20260805.1';
import {
  diagnoseConflictGroupsV95,
  loadV95Solver,
  phaseOrderForConfig,
  runConstraintLnsV95,
  solveLexicographicV95,
  v95SolverLoadState
} from './auto-plan-solver-v9-5.js?v=20260805.1';

export const AUTO_PLAN_REVISION = 9.5;
export const AUTO_PLAN_ENGINE_ID = 'v9.5-correct-boolean-matheuristic';
export const AUTO_PLAN_RELEASE = '20260805.1';

export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'analysis', title: 'Fixpunkte und Domänen', detail: 'Ausgangsplan, personengebundene Grenzen und regelkonforme Kandidatendomänen werden katalogisiert.' }),
  Object.freeze({ id: 'warmstart', title: 'Heuristischer Warmstart', detail: 'Die robuste v8.5-Pipeline erzeugt schnell einen vollständigen regelgeprüften Incumbent.' }),
  Object.freeze({ id: 'model', title: 'Boolean-Modellbau', detail: 'Für jede mögliche Slot-Person-Kombination entsteht eine eigene 0/1-Variable; interne Personenindizes haben keine mathematische Bedeutung.' }),
  Object.freeze({ id: 'exact', title: 'Lexikografische CP-SAT-Suche', detail: 'Sicherheitsstufen, Fairness, Split-Wochenenden, Wünsche und Empfehlungen werden strikt phasenweise optimiert.' }),
  Object.freeze({ id: 'lns', title: 'Constraint-LNS', detail: 'Konflikt-, Belastungs- und Wochenendnachbarschaften werden gezielt freigegeben und exakt neu verbunden.' }),
  Object.freeze({ id: 'audit', title: 'Regelengine-Schlussaudit', detail: 'Jede Lösung wird vollständig durch die produktive Regelengine bewertet; bei Abweichung gewinnt deren Zielordnung.' }),
  Object.freeze({ id: 'alternatives', title: 'Alternativen', detail: 'Ausgewogene, wunschorientierte und wochenendorientierte Schwerpunktvarianten werden als nachvollziehbare Auswahl erzeugt.' }),
  Object.freeze({ id: 'certify', title: 'Nachweis', detail: 'Ein Modellnachweis gilt nur, wenn jede ausgeführte Zielphase OPTIMAL ist und der Schlussaudit bestanden wurde.' })
]);

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function deterministicSeed(config, state, monthData) {
  let seed = 2166136261;
  const text = `${JSON.stringify(stableValue(config))}|${planningFingerprint(state, monthData)}`;
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function normalizeInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}

export function normalizeV95Config(state, monthData, runConfig = null) {
  const validation = validateAutoPlanConfig(state, monthData, runConfig);
  if (!validation.valid) throw new Error(`Auto-Plan-Konfiguration ungültig: ${validation.errors.join(' ')}`);
  const source = runConfig && typeof runConfig === 'object' ? runConfig : {};
  const settings = state?.settings?.autoPlan && typeof state.settings.autoPlan === 'object'
    ? state.settings.autoPlan
    : {};
  const pick = key => source[key] === undefined ? settings[key] : source[key];
  return {
    ...validation.config,
    v95Exactness: pick('v95Exactness') === 'any' ? 'any' : 'strict',
    v95LnsRounds: normalizeInteger(pick('v95LnsRounds'), 0, 20, 6),
    v95NeighborhoodPercent: normalizeInteger(pick('v95NeighborhoodPercent'), 10, 60, 28),
    v95AlternativeCount: normalizeInteger(pick('v95AlternativeCount'), 1, 4, 3),
    v95SplitWeekendWeight: normalizeInteger(pick('v95SplitWeekendWeight'), 1, 30, 8),
    v95LnsBudgetMs: normalizeInteger(
      pick('v95LnsBudgetMs'),
      500,
      30_000,
      Math.max(1200, Math.round(Number(validation.config.cpSatTimeBudgetSeconds || 10) * 350))
    ),
    v95LogSearch: pick('v95LogSearch') === true
  };
}

function elapsedSince(startedAt) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.round(now - startedAt);
}

function fairnessIndex(objective) {
  if (!objective || objective.audit.gray || objective.unfilled || objective.limitViolations) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

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

function resultFromMonth({ template, state, baseline, plannedMonth, config, startedAt }) {
  const objective = evaluatePlanObjective(state, plannedMonth, baseline, config);
  const changes = listProposedAssignments(plannedMonth, baseline);
  const openSlots = listOpenSlots(baseline);
  const complete = !objective.limitViolations
    && !objective.audit.gray
    && !objective.unfilled
    && !objective.redLimitExceeded
    && changes.length === openSlots.length;
  const requiresConfirmation = complete && objective.audit.red > 0;
  const status = !complete ? 'blocked' : requiresConfirmation ? 'confirmation_required' : 'clean';
  return {
    ...(template || {}),
    success: complete,
    complete,
    requiresConfirmation,
    status,
    algorithmRevision: AUTO_PLAN_REVISION,
    baseline,
    plannedMonth: clone(plannedMonth),
    changes,
    redViolations: objective.audit.entries
      .filter(entry => entry.evaluation.level === 'red')
      .map(redViolation),
    openSlots: openSlots.length,
    elapsedMs: elapsedSince(startedAt),
    objectiveKey: objective.key.map(value => Number(value) || 0),
    runConfig: clone(config),
    runConfigFingerprint: JSON.stringify(stableValue(config)),
    metrics: {
      ...(template?.metrics || {}),
      proposed: changes.length,
      unfilled: objective.unfilled,
      red: objective.audit.red,
      specialRed: objective.audit.specialRed,
      gray: objective.audit.gray,
      orange: objective.audit.orange,
      yellow: objective.audit.yellow,
      wishesFulfilled: objective.wishes.fulfilled,
      wishesPossible: objective.wishes.possible,
      fairnessIndex: fairnessIndex(objective),
      bdTargetPenalty: Number(objective.fairness.bdPenalty.toFixed(2)),
      combinedLoadVariance: Number(objective.fairness.combinedVariance.toFixed(3)),
      aaHgVariance: Number(objective.fairness.aaHgVariance.toFixed(3)),
      weekendVariance: Number(objective.fairness.weekendVariance.toFixed(3)),
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

function annotateFallback(result, reason = 'heuristic-portfolio') {
  if (!result) return result;
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  result.metrics.cpSatUsed = false;
  result.metrics.v95FallbackReason = reason;
  result.metrics.certification = {
    status: 'SOLVER_UNAVAILABLE_FALLBACK',
    proven: false,
    scope: 'none'
  };
  result.certified = false;
  result.certification = result.metrics.certification;
  return result;
}

function adaptiveWorkers(config) {
  if (Number.isInteger(config.cpSatWorkers)) return config.cpSatWorkers;
  const cores = Math.max(1, Number(globalThis.navigator?.hardwareConcurrency || 2));
  const isolated = globalThis.crossOriginIsolated === true;
  return isolated ? Math.max(1, Math.min(4, cores - (cores > 1 ? 1 : 0))) : 1;
}

function exactLeader(runConfig = {}) {
  const portfolioIndex = Number(runConfig.portfolioVariant ?? runConfig.seedSalt ?? 0);
  return !Number.isFinite(portfolioIndex) || portfolioIndex === 0;
}

function objectiveOf(state, baseline, config) {
  return monthData => evaluatePlanObjective(state, monthData, baseline, config);
}

function uniqueAlternativeKey(monthData, baseline) {
  return listProposedAssignments(monthData, baseline)
    .map(change => `${change.dateIso}|${change.role}|${change.staffId}`)
    .sort()
    .join(';');
}

async function buildAlternatives({
  model,
  api,
  state,
  baseline,
  config,
  primaryMonth,
  randomSeed,
  maxWorkers,
  signal,
  onProgress
}) {
  const wanted = Math.max(1, Number(config.v95AlternativeCount || 3));
  if (wanted <= 1) return [];
  const variants = [
    { id: 'wishes', label: 'Wünsche priorisiert' },
    { id: 'weekends', label: 'Wochenenden priorisiert' },
    { id: 'workload', label: 'Belastung priorisiert' }
  ];
  const alternatives = [];
  const seen = new Set([uniqueAlternativeKey(primaryMonth, baseline)]);
  const budget = Math.max(300, Math.floor(Number(config.cpSatTimeBudgetSeconds || 10) * 1000 * .18));

  for (let index = 0; index < variants.length && alternatives.length < wanted - 1; index += 1) {
    if (signal?.aborted) break;
    const variant = variants[index];
    await onProgress?.({
      phase: 'alternatives',
      stage: 'cp-sat-v9.5',
      progress: .92 + index * .02,
      message: `Alternative ${index + 1}: ${variant.label}`
    });
    const solved = await solveLexicographicV95(model, api, {
      config,
      phaseOrder: phaseOrderForConfig(model, config, variant.id),
      timeBudgetMs: budget,
      maxWorkers,
      randomSeed: Number(randomSeed) + 300 + index,
      strictCertification: false,
      signal,
      variant: variant.id
    });
    if (!Object.keys(solved.solution || {}).length) continue;
    const monthData = materializeBooleanSolution(model, baseline, solved.solution);
    const key = uniqueAlternativeKey(monthData, baseline);
    if (seen.has(key)) continue;
    seen.add(key);
    const objective = evaluatePlanObjective(state, monthData, baseline, config);
    if (objective.limitViolations || objective.audit.gray || objective.unfilled || objective.redLimitExceeded) continue;
    alternatives.push({
      id: variant.id,
      label: variant.label,
      status: solved.status,
      certified: solved.certified,
      objectiveKey: objective.key,
      plannedMonth: monthData,
      metrics: {
        red: objective.audit.red,
        orange: objective.audit.orange,
        yellow: objective.audit.yellow,
        wishesFulfilled: objective.wishes.fulfilled,
        wishesPossible: objective.wishes.possible,
        fairnessIndex: fairnessIndex(objective),
        weekendVariance: Number(objective.fairness.weekendVariance.toFixed(3)),
        changes: listProposedAssignments(monthData, baseline).length
      }
    });
  }
  return alternatives;
}

/**
 * Konstruktion bleibt die robuste v8.5-Pipeline. Im Worker-Portfolio laufen
 * dadurch mehrere unterschiedliche Heuristikprofile, ohne jeweils erneut einen
 * mehrthreadigen CP-SAT-Gesamtlauf zu starten.
 */
export async function constructAutoPlan(parameters) {
  const result = await V85.constructAutoPlan(parameters);
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  result.metrics.v95Stage = 'warmstart';
  return result;
}

/**
 * Nur der führende Perfektionsstrang führt den exakten v9.5-Pfad aus. Weitere
 * Portfolio-Stränge bleiben diversifizierte v8.5-ALNS-Läufe und konkurrieren
 * anschließend über dieselbe produktive Zielordnung.
 */
export async function perfectAutoPlan(parameters) {
  const { state, constructed, runConfig = {}, onProgress = null, signal = null } = parameters;
  const heuristic = await V85.perfectAutoPlan(parameters);
  if (!state || !heuristic?.baseline || !heuristic?.plannedMonth) return annotateFallback(heuristic, 'missing-context');
  if (!exactLeader(runConfig)) return annotateFallback(heuristic, 'parallel-heuristic-variant');

  const config = normalizeV95Config(state, heuristic.baseline, runConfig);
  if (config.solverBackend === 'heuristic-alns') return annotateFallback(heuristic, 'heuristic-selected');
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const randomSeed = config.deterministic === false
    ? Math.floor(Math.random() * 0x7fffffff)
    : deterministicSeed(config, state, heuristic.baseline);
  const maxWorkers = adaptiveWorkers(config);

  await onProgress?.({
    phase: 'model',
    stage: 'boolean-v9.5',
    progress: .56,
    message: 'v9.5 · Korrektes Boolean-Modell wird aus Regelzustand und Warmstart kompiliert'
  });

  const api = await loadV95Solver({ signal });
  if (!api) {
    const fallback = annotateFallback(heuristic, 'solver-unavailable');
    fallback.metrics.cpSat = { available: false, loader: v95SolverLoadState() };
    return fallback;
  }

  const hints = config.cpSatWarmStart === 'none'
    ? []
    : assignmentHintsFromMonth(heuristic.plannedMonth, heuristic.baseline);
  const model = buildBooleanAutoPlanModel({
    state,
    monthData: heuristic.baseline,
    baseline: heuristic.baseline,
    config,
    hints
  });

  const cpSatInfo = {
    available: true,
    loadedFrom: api.loadedFrom || null,
    model: model.counts,
    modelId: model.id,
    modelFingerprint: model.fingerprint,
    workers: maxWorkers
  };

  const solved = await solveLexicographicV95(model, api, {
    config,
    timeBudgetMs: Math.max(1000, Number(config.cpSatTimeBudgetSeconds || 10) * 1000),
    maxWorkers,
    randomSeed,
    strictCertification: config.v95Exactness !== 'any',
    onProgress,
    signal,
    progressStart: .58,
    progressSpan: .13
  });
  cpSatInfo.status = solved.status;
  cpSatInfo.trace = solved.trace;
  cpSatInfo.certified = solved.certified;
  cpSatInfo.wallTimeMs = solved.wallTimeMs;

  if (!Object.keys(solved.solution || {}).length) {
    if (solved.infeasible || solved.status === 'INFEASIBLE') {
      const diagnosis = await diagnoseConflictGroupsV95(model, api, {
        timeLimitMs: Math.min(4000, Math.max(1200, Number(config.cpSatTimeBudgetSeconds || 10) * 300)),
        maxWorkers: 1,
        randomSeed
      });
      cpSatInfo.conflictCore = diagnosis;
    }
    const fallback = annotateFallback(heuristic, solved.status === 'INFEASIBLE' ? 'exact-infeasible' : 'exact-no-solution');
    fallback.metrics.cpSat = cpSatInfo;
    return fallback;
  }

  await onProgress?.({
    phase: 'audit',
    stage: 'rule-engine',
    progress: .72,
    message: 'CP-SAT-v9.5-Vorschlag wird vollständig durch die produktive Regelengine auditiert'
  });

  let exactMonth = materializeBooleanSolution(model, heuristic.baseline, solved.solution);
  const evaluate = objectiveOf(state, heuristic.baseline, config);
  let exactObjective = evaluate(exactMonth);
  const heuristicObjective = evaluate(heuristic.plannedMonth);
  let bestMonth = compareObjectiveKeys(exactObjective.key, heuristicObjective.key) <= 0
    ? exactMonth
    : heuristic.plannedMonth;
  let source = bestMonth === exactMonth ? 'cp-sat-v9.5' : 'heuristic-v8.5';

  const lns = await runConstraintLnsV95({
    model,
    api,
    baseline: heuristic.baseline,
    initialMonth: bestMonth,
    config,
    evaluateMonth: evaluate,
    compareObjectives: compareObjectiveKeys,
    randomSeed,
    maxWorkers,
    onProgress,
    signal
  });
  if (lns?.monthData) {
    const lnsObjective = evaluate(lns.monthData);
    const bestObjective = evaluate(bestMonth);
    if (compareObjectiveKeys(lnsObjective.key, bestObjective.key) < 0) {
      bestMonth = lns.monthData;
      source = 'cp-sat-lns-v9.5';
      exactObjective = lnsObjective;
    }
  }

  const result = resultFromMonth({
    template: heuristic,
    state,
    baseline: heuristic.baseline,
    plannedMonth: bestMonth,
    config,
    startedAt
  });
  const finalObjective = evaluate(bestMonth);
  const exactSelected = source !== 'heuristic-v8.5';
  const auditPassed = result.complete && finalObjective.audit.gray === 0 && finalObjective.limitViolations === 0;
  const modelCertified = exactSelected && solved.certified && auditPassed && finalObjective.audit.red === 0;

  result.searchProfile = `${result.searchProfile || 'Auto-Plan'} · ${source}`;
  result.metrics.cpSatUsed = exactSelected;
  result.metrics.cpSat = cpSatInfo;
  result.metrics.lns = {
    rounds: lns?.rounds || [],
    improvements: Number(lns?.improvements || 0)
  };
  result.metrics.certification = {
    status: modelCertified
      ? 'MODEL_OPTIMAL_AUDITED'
      : solved.status === 'FEASIBLE'
        ? 'BEST_FOUND_FEASIBLE'
        : exactSelected
          ? 'MODEL_OPTIMAL_AUDIT_NOT_CLEAN'
          : 'HEURISTIC_WON_RULE_OBJECTIVE',
    proven: modelCertified,
    scope: modelCertified ? 'v9.5-boolean-model' : 'none',
    allPhasesOptimal: solved.certified,
    auditPassed,
    source
  };
  result.certified = modelCertified;
  result.certification = result.metrics.certification;

  result.alternatives = await buildAlternatives({
    model,
    api,
    state,
    baseline: heuristic.baseline,
    config,
    primaryMonth: bestMonth,
    randomSeed,
    maxWorkers,
    signal,
    onProgress
  });
  result.metrics.alternativeCount = result.alternatives.length;

  await onProgress?.({
    phase: 'certify',
    stage: 'abschluss-v9.5',
    progress: 1,
    message: modelCertified
      ? `v9.5 abgeschlossen · modelloptimal und regelgeprüft · ${result.changes.length} Vorschläge`
      : `v9.5 abgeschlossen · bester regelgeprüfter Stand · ${result.changes.length} Vorschläge · ${result.metrics.red} rot`,
    result
  });

  return result;
}

export async function buildAutoPlan(parameters) {
  const constructed = await constructAutoPlan(parameters);
  if (parameters.signal?.aborted) return constructed;
  return perfectAutoPlan({ ...parameters, constructed });
}

export { loadV95Solver, v95SolverLoadState } from './auto-plan-solver-v9-5.js?v=20260805.1';
export { buildBooleanAutoPlanModel } from './auto-plan-model-v9-5.js?v=20260805.1';
export const LEGACY_V9_ENGINE_ID = V9.AUTO_PLAN_ENGINE_ID;
