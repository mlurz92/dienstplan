/**
 * Auto-Plan v9 – Hybrid Exakte Observatoriums-Engine.
 *
 * v9 hebt die Engine auf eine primär exakte Architektur, ohne den fachlichen
 * Vertrag zu brechen:
 *
 * 1. **Warmstart und Fallback bleiben die v8.5-Heuristik.** Die bewährte
 *    Beam-/ALNS-Pipeline läuft unverändert; ihr Ergebnis dient als Lösungs-
 *    Hinweis (Hint) für CP-SAT und als Garant, falls der exakte Pfad nicht
 *    verfügbar ist (kein WebAssembly, keine COOP/COEP-Header, CDN-Sperre).
 * 2. **CP-SAT (WASM) ist der neue Lösungskern.** Das Monatsmodell wird in
 *    ein lineares Constraint-Modell übersetzt und lexikografisch gelöst:
 *    Maximin-Fairness zuerst, danach die weichen Ziele in der Reihenfolge des
 *    Optimierungsschwerpunkts. OPTIMAL liefert eine beweisbare untere
 *    Schranke und damit den ersten echten Optimalitätsnachweis des Projekts.
 * 3. **Die Regelengine bleibt die einzige fachliche Wahrheitsquelle.** Jeder
 *    CP-SAT-Vorschlag wird durch `evaluatePlanObjective` vollständig
 *    auditiert; das Ergebnis ist ausschließlich die lexikografische
 *    Zielordnung der produktiven Engine. Weicht das CP-Modell ab, gewinnt
 *    das bessere der beiden Ergebnisse – niemals ein stilles Teilversprechen.
 * 4. **Infeasibility wird erklärbar.** Bei INFEASIBLE läuft die MUS-artige
 *    Relaxations-Diagnose; auf Wunsch (`infeasibilityMode: 'relax'`) werden
 *    Constraint-Gruppen in fachlicher Reihenfolge aufgeweicht und die
 *    aufgegebenen Gruppen im Ergebnis ausgewiesen.
 * 5. **Determinismus.** Bei aktiviertem Determinismus leiten sich alle
 *    Zufallsströme (CP-SAT-Seed, Heuristik-Seed) aus der Laufkonfiguration ab.
 *
 * VERTRAGSWAHRUNG
 *
 * Die v9-Schicht reicht die ursprünglichen Laufparameter unverändert an die
 * v8.5-Heuristik durch (`enrichedRunConfig` dort leitet alle abgeleiteten
 * Felder selbst ab). Die Engine-Normalisierung wird nur für die exakten
 * v9-Felder verwendet und ersetzt niemals den öffentlichen Vertrag der
 * Heuristik (Perfektionsschalter, iterative Parameter, Fingerprints).
 */

import * as V85 from './auto-planner-v8-5.js?v=20260803.4';

// Die vollständige öffentliche API bleibt erhalten: Konfigurations-,
// Bewertungs- und Übernahmefunktionen der Engine sowie v8.5-Werkzeuge.
// Die expliziten v9-Exporte unten (Revision, Stufen, Lauf-Pipeline) haben
// Vorrang vor den Stern-Re-Exporten. Namen, die die v8.5-Kette bereits mit
// eigener Bedeutung bereitstellt (validateAutoPlanConfig, applyAutoPlanProposal
// u. a.), werden bewusst nicht überschrieben.
export * from './auto-planner-v8-5.js?v=20260803.4';

import {
  buildCpSatModel,
  diagnoseInfeasibility,
  loadCpSatSolver,
  relaxGroupOrder,
  solveCpSatModel
} from './auto-plan-cp-sat.js?v=20260803.4';
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
} from './auto-planner-engine.js?v=20260803.4';
import { getStaffById } from './rules.js?v=20260803.4';

// Bewertungs- und Konfigurationswerkzeuge der Engine explizit re-exportieren:
// Sie gehören zur öffentlichen API, sind aber nicht durch die v8.5-Kette
// durchgereicht.
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
} from './auto-planner-engine.js?v=20260803.4';

export const AUTO_PLAN_REVISION = 9;
export const AUTO_PLAN_ENGINE_ID = 'v9-hybrid-exact-observatory';

export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'analysis', title: 'Fixpunkte und Domänen', detail: 'Bestehende Einteilungen werden gesichert, personengebundene Grenzen abgeleitet, erfüllbare Wünsche einmalig katalogisiert.' }),
  Object.freeze({ id: 'model', title: 'CP-SAT-Modellbau', detail: 'Der Monatszustand wird in ein lineares Constraint-Modell mit phasenweisen Zielkomponenten übersetzt.' }),
  Object.freeze({ id: 'exact', title: 'Exakte Suche', detail: 'CP-SAT löst lexikografisch: Maximin-Fairness zuerst, dann die weichen Ziele in der Reihenfolge des Schwerpunkts.' }),
  Object.freeze({ id: 'rescue', title: 'Null-Rot-Intensivierung', detail: 'Strikte Eskalationswellen der v8.5-Heuristik verbreitern Suchstrahl und exaktes Restbacktracking.' }),
  Object.freeze({ id: 'repair', title: 'Iterative Tauschreparatur', detail: 'Einzelzüge, Paare, Dreierketten, Tagespakete und lokale Neuplanung glätten den besten Aufbau.' }),
  Object.freeze({ id: 'perfect', title: 'Adaptive ALNS-Perfektion', detail: 'Diversifizierte Ruin-and-Recreate-Stränge lernen Zerstörungs- und Wiederaufbauoperatoren online.' }),
  Object.freeze({ id: 'audit', title: 'Regelengine-Schlussaudit', detail: 'Jeder Vorschlag wird vollständig gegen die produktive Regelengine geprüft; bei Abweichung entscheidet die Zielordnung.' }),
  Object.freeze({ id: 'certify', title: 'Optimalitätsnachweis', detail: 'OPTIMAL-Status liefert eine beweisbare untere Schranke; sonst vollständiger Nachweis über die lokalen Nachbarschaften.' })
]);

const VERSION_MARKER = '20260803.4';
const OPTIMIZER_REVISION = 5;

const FOCUS_PHASE_ORDER = Object.freeze({
  balanced: ['wishes', 'bdTarget', 'weekend', 'saturday'],
  wishes: ['wishes', 'bdTarget', 'weekend', 'saturday'],
  workload: ['bdTarget', 'weekend', 'wishes', 'saturday'],
  weekends: ['weekend', 'saturday', 'wishes', 'bdTarget']
});

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

function deterministicSeed(config, state, monthData) {
  let seed = 2166136261;
  const text = `${JSON.stringify(stableValue(config))}|${planningFingerprintOf(state, monthData)}|${String(config.randomSeed ?? '')}`;
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function planningFingerprintOf(state, monthData) {
  const { planningFingerprint } = V85;
  return planningFingerprint(state, monthData);
}

function normalizeConfig(state, monthData, runConfig) {
  const validation = validateAutoPlanConfig(state, monthData, runConfig);
  if (!validation.valid) throw new Error(`Auto-Plan-Konfiguration ungültig: ${validation.errors.join(' ')}`);
  return validation.config;
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

/**
 * Baut das Ergebnis im vertraglichen Format der Engine.
 */
function makeResult({ state, baseline, plannedMonth, config, searchProfile, startedAt, cpSat = null, mus = null }) {
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
      fairnessIndex: fairnessIndex(objective),
      bdTargetPenalty: Number(objective.fairness.bdPenalty.toFixed(2)),
      combinedLoadVariance: Number(objective.fairness.combinedVariance.toFixed(3)),
      aaHgVariance: Number(objective.fairness.aaHgVariance.toFixed(3)),
      weekendVariance: Number(objective.fairness.weekendVariance.toFixed(3)),
      cpSat: cpSat || null,
      mus: mus || null,
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

function annotate(result, cpSatInfo = null, musInfo = null) {
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
  if (cpSatInfo) result.metrics.cpSat = cpSatInfo;
  if (musInfo) result.metrics.mus = musInfo;
  return result;
}

function hintsFromMonth(monthData, staffIndex) {
  const hints = [];
  for (const [key, staffId] of Object.entries(monthData?.days || {}).flatMap(([dateIso, day]) =>
    ['bd', 'hg'].map(role => [`${dateIso}|${role}`, day?.[role]]))) {
    if (staffId && staffIndex.has(staffId)) {
      const [dateIso, role] = key.split('|');
      hints.push({ dateIso, role, staffId });
    }
  }
  return hints;
}

/**
 * Ergänzt am Ergebnis die Konfigurationsabschnitte, die die Heuristik-Kette
 * sonst selbst setzt (optimizerConfig, iterativeConfig, executionConfig,
 * Fingerprints). Der CP-SAT-zertifizierte Pfad umgeht diese Kette und muss
 * den Vertrag deshalb nachziehen.
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
  if (!result.objectiveKey) {
    const objective = evaluatePlanObjective(state, result.plannedMonth, result.baseline, result.runConfig);
    result.objectiveKey = objective.key.map(value => Number(value) || 0);
  }
  return result;
}

/**
 * Führt die lexikografischen CP-SAT-Phasen aus.
 *
 * @returns {Promise<{result:object|null, trace:object[], infeasible:boolean}>}
 */
async function solveExactPhases({ state, monthData, baseline, config, model, api, onProgress, signal, randomSeed, timeBudgetMs }) {
  const trace = [];
  const fixedConstraints = [];
  const softOrder = FOCUS_PHASE_ORDER[config.optimizationFocus] || FOCUS_PHASE_ORDER.balanced;
  const phaseOrder = config.fairnessProfile === 'leximin' ? ['fairness', ...softOrder] : softOrder;
  const perPhaseBudget = Math.max(1500, Math.floor(Number(timeBudgetMs || 10000) / Math.max(1, phaseOrder.length)));
  let bestSolution = null;
  let lastValue = null;

  for (const [phaseIndex, componentId] of phaseOrder.entries()) {
    const component = model.components[componentId];
    if (!component || !component.terms.length) continue;
    if (signal?.aborted) break;
    await onProgress?.({
      phase: 'exact',
      stage: 'cp-sat',
      progress: .18 + phaseIndex * .07,
      message: `CP-SAT-Phase ${phaseIndex + 1}/${phaseOrder.length}: ${componentId} wird minimiert`,
      cpSatPhase: componentId,
      cpSatPhaseIndex: phaseIndex
    });
    const result = await solveCpSatModel(model, api, {
      timeLimitMs: perPhaseBudget,
      maxWorkers: config.cpSatWorkers || null,
      randomSeed: randomSeed + phaseIndex,
      objectiveComponentIds: [componentId],
      extraConstraints: fixedConstraints
    });
    trace.push({ componentId, status: result.statusName, objectiveValue: result.objectiveValue, bestBound: result.bestBound, wallTimeMs: result.wallTimeMs });
    if (result.statusName !== 'OPTIMAL' && result.statusName !== 'FEASIBLE') {
      if (bestSolution) break;
      return { result: null, trace, infeasible: true };
    }
    if (result.solution && Object.keys(result.solution).length) bestSolution = result.solution;
    lastValue = result.objectiveValue;
    if (Number.isFinite(Number(lastValue)) && component.terms.length) {
      const terms = component.terms.filter(([variableIndex]) => variableIndex < model.variables.length + model.auxiliary.length);
      if (terms.length) fixedConstraints.push({ id: `fix_${componentId}`, group: 'coverage', terms, lb: -Number.MAX_SAFE_INTEGER, ub: Math.round(Number(lastValue)) });
    }
  }

  return { result: bestSolution, trace, infeasible: false };
}

/**
 * Konstruktion in v9: Heuristik als Warmstart/Fallback, CP-SAT als Kern.
 */
export async function constructAutoPlan(parameters) {
  const { state, monthData, year = monthData?.year, month = monthData?.month, runConfig = null, onProgress = null, signal = null } = parameters;
  if (!state || !monthData || !Number.isInteger(year) || !Number.isInteger(month)) throw new TypeError('Auto-Plan benötigt Zustand, Monatsdaten, Jahr und Monat.');
  const config = normalizeConfig(state, monthData, runConfig);
  const baseline = cloneMonth(monthData);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const randomSeed = config.deterministic === false ? undefined : deterministicSeed(config, state, monthData);
  const slots = listOpenSlots(baseline);

  await onProgress?.({
    phase: 'analysis',
    progress: .03,
    message: `${AUTO_PLAN_ENGINE_ID} · Fixpunkte und Domänen werden katalogisiert`,
    fixed: slots.length,
    total: slots.length
  });

  // 1. Warmstart-/Fallback-Heuristik (v8.5-Pipeline, unverändert).
  // Die ursprünglichen Laufparameter bleiben erhalten: enrichedRunConfig der
  // v8.5-Schicht leitet alle abgeleiteten Felder selbst ab.
  const heuristicRunConfig = {
    ...(runConfig || {}),
    ...(randomSeed !== undefined ? { seedSalt: String(randomSeed % 100000) } : {})
  };
  const heuristic = await V85.constructAutoPlan({
    ...parameters,
    runConfig: heuristicRunConfig,
    onProgress: update => onProgress?.({
      ...update,
      stage: update.phase === 'search' || update.phase === 'propagate' ? 'heuristik-warmstart' : update.stage
    })
  });

  // 2. Exakter Pfad, sofern verfügbar und gewünscht.
  const backend = config.solverBackend || 'auto';
  const exactDesired = backend === 'auto' || backend === 'cp-sat-exact' || backend === 'cp-sat-lns';
  const api = exactDesired ? await loadCpSatSolver({ signal }) : null;
  let cpSatInfo = null;
  let musInfo = null;

  if (api && exactDesired && !signal?.aborted) {
    await onProgress?.({ phase: 'model', stage: 'cp-sat', progress: .1, message: 'CP-SAT-Modell wird gebaut · Variablen, Klauseln und Zielkomponenten' });
    const hints = config.cpSatWarmStart === 'none'
      ? []
      : hintsFromMonth(heuristic?.plannedMonth, new Set((state?.staff || []).map(person => person.id)));
    const model = buildCpSatModel({ state, monthData, baseline, config, hints });
    cpSatInfo = { available: true, model: model.counts, loadedFrom: api.loadedFrom || null };

    const exactResult = await solveExactPhases({
      state, monthData, baseline, config, model, api,
      onProgress, signal, randomSeed: randomSeed ?? 42,
      timeBudgetMs: Number(config.cpSatTimeBudgetSeconds ?? 10) * 1000
    });

    if (exactResult.infeasible) {
      const diagnosis = await diagnoseInfeasibility(model, api, { randomSeed: randomSeed ?? 42 });
      musInfo = diagnosis;
      cpSatInfo.status = 'INFEASIBLE';
      cpSatInfo.mus = diagnosis.groups;
      await onProgress?.({
        phase: 'exact',
        stage: 'cp-sat',
        progress: .45,
        message: `CP-SAT: unzulässig · ${diagnosis.detail}`
      });

      if (config.infeasibilityMode === 'relax' && diagnosis.groups.length) {
        const dropped = new Set(diagnosis.groups);
        let relaxedSolution = null;
        for (const group of relaxGroupOrder(config)) {
          if (dropped.has(group)) continue;
          dropped.add(group);
          const activeIds = model.hardConstraints
            .filter(constraint => !dropped.has(constraint.group))
            .map(constraint => constraint.id);
          const relaxed = await solveCpSatModel(model, api, {
            timeLimitMs: Math.max(1500, Number(config.cpSatTimeBudgetSeconds ?? 10) * 1000),
            maxWorkers: config.cpSatWorkers || null,
            randomSeed: randomSeed ?? 42,
            activeConstraintIds: activeIds
          });
          if (relaxed.statusName === 'OPTIMAL' || relaxed.statusName === 'FEASIBLE') {
            relaxedSolution = relaxed.solution;
            cpSatInfo.relaxedGroups = [...dropped];
            cpSatInfo.status = 'FEASIBLE_RELAXED';
            await onProgress?.({
              phase: 'exact',
              stage: 'cp-sat',
              progress: .5,
              message: `CP-SAT: Relaxierung angewendet · aufgegeben: ${[...dropped].join(', ')}`
            });
            break;
          }
        }
        exactResult.result = relaxedSolution;
      }
    } else if (exactResult.result && Object.keys(exactResult.result).length) {
      cpSatInfo.status = exactResult.trace.at(-1)?.status || 'FEASIBLE';
      cpSatInfo.trace = exactResult.trace;
      cpSatInfo.bestBound = exactResult.trace.map(entry => entry.bestBound).find(Number.isFinite) ?? null;
      cpSatInfo.optimal = cpSatInfo.status === 'OPTIMAL';
      cpSatInfo.wallTimeMs = exactResult.trace.reduce((sum, entry) => sum + (entry.wallTimeMs || 0), 0);
    }

    // 3. CP-SAT-Ergebnis in einen Monat übersetzen und auditiert vergleichen.
    if (exactResult.result && Object.keys(exactResult.result).length && !signal?.aborted) {
      await onProgress?.({ phase: 'audit', stage: 'cp-sat', progress: .62, message: 'CP-SAT-Vorschlag wird durch die Regelengine auditiert' });
      const planned = cloneMonth(baseline);
      for (const [key, staffId] of Object.entries(exactResult.result)) {
        const [dateIso, role] = key.split('|');
        if (planned.days?.[dateIso] && getStaffById(state.staff, staffId)) planned.days[dateIso][role] = staffId;
      }
      const cpResult = makeResult({ state, baseline, plannedMonth: planned, config, searchProfile: 'cp-sat-exact', startedAt });
      const cpObjective = evaluatePlanObjective(state, planned, baseline, config);
      const heuristicObjective = heuristic ? evaluatePlanObjective(state, heuristic.plannedMonth, baseline, config) : null;
      const better = heuristic && heuristicObjective
        ? (compareObjectiveKeys(cpObjective.key, heuristicObjective.key) <= 0 ? cpResult : heuristic)
        : cpResult;

      if (better === cpResult) {
        better.certified = cpSatInfo.optimal === true;
        better.metrics.cpSatUsed = true;
        better.metrics.cpSat = cpSatInfo;
        better.metrics.mus = musInfo;
        finalizeConstructed(better, state, parameters);
        annotate(better, cpSatInfo, musInfo);
      } else {
        better.metrics.cpSatUsed = false;
        better.metrics.cpSat = cpSatInfo;
        better.metrics.mus = musInfo;
        annotate(better, cpSatInfo, musInfo);
      }
      await onProgress?.({
        phase: 'complete',
        progress: .7,
        message: `v9-Konstruktion: ${better === cpResult ? 'CP-SAT exakt' : 'Heuristik'} gewinnt · ${better.changes?.length || 0} Vorschläge · ${better.metrics?.red || 0} rot`,
        improvements: better.metrics?.red === 0 ? 1 : 0
      });
      return better;
    }
  }

  // 4. Fallback: Die Heuristik ist bereits das vollständige Ergebnis.
  // Keine zweite Abschlussmeldung – die Heuristik-Kette hat ihren Endstand
  // bereits gemeldet; die Perfektionsphase meldet ihr eigenes Ende.
  annotate(heuristic, cpSatInfo, musInfo);
  heuristic.metrics.cpSatUsed = false;
  if (cpSatInfo) {
    cpSatInfo.available = Boolean(api);
    cpSatInfo.status = cpSatInfo.status || (api ? 'SKIPPED' : 'UNAVAILABLE');
  }
  await onProgress?.({
    phase: 'polish',
    stage: 'fallback',
    progress: .7,
    message: `v9-Konstruktion: Heuristik-Fallback${api ? ' (CP-SAT nicht nutzbar)' : ''} · ${heuristic?.changes?.length || 0} Vorschläge · ${heuristic?.metrics?.red || 0} rot`
  });
  return heuristic;
}

/**
 * Perfektion in v9: CP-SAT-OPTIMAL ist bereits beweisbar; sonst ALNS.
 */
export async function perfectAutoPlan(parameters) {
  const constructed = parameters.constructed;
  if (constructed?.metrics?.cpSatUsed === true && constructed?.certified) {
    finalizeConstructed(constructed, parameters.state, parameters);
    constructed.metrics ||= {};
    constructed.metrics.certification = { mode: 'cp-sat-optimal', proven: true };
    return annotate(constructed, constructed.metrics.cpSat, constructed.metrics.mus);
  }
  const runConfig = parameters?.runConfig || {};
  const config = normalizeConfig(parameters.state, parameters.constructed?.plannedMonth || parameters.monthData, runConfig);
  const randomSeed = config.deterministic === false ? undefined : deterministicSeed(config, parameters.state, parameters.constructed?.plannedMonth || parameters.monthData);
  const heuristicRunConfig = {
    ...runConfig,
    ...(randomSeed !== undefined ? { seedSalt: String(randomSeed % 100000) } : {})
  };
  const result = await V85.perfectAutoPlan({ ...parameters, runConfig: heuristicRunConfig });
  return annotate(result, result?.metrics?.cpSat || null, result?.metrics?.mus || null);
}

/**
 * Voller Lauf: Konstruktion + Perfektion.
 */
export async function buildAutoPlan(parameters) {
  const constructed = await constructAutoPlan({ ...parameters });
  if (parameters.signal?.aborted) return constructed;
  return perfectAutoPlan({ ...parameters, constructed });
}

export { isCpSatReady } from './auto-plan-cp-sat.js?v=20260803.4';
export { loadCpSatSolver } from './auto-plan-cp-sat.js?v=20260803.4';
export const AUTO_PLAN_RELEASE = VERSION_MARKER;
