/** Auto-Plan v9 – Transportvertrag und unabhängige Ergebnisprüfung. */
import { evaluatePlanObjective, listProposedAssignments } from './auto-planner-engine.js?v=20260803.4';
import { setAssignment } from './rules.js?v=20260803.4';
import {
  AUTO_PLAN_V9_RULESET_VERSION,
  AUTO_PLAN_V9_SCHEMA_VERSION,
  stableFingerprint
} from './constraint-registry-v9.js?v=20260803.4';

export const AUTO_PLAN_V9_ENGINE_ID = 'v9-cpsat-guided-exact-lns';
const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

export function isAutoPlanV9Response(value) {
  return Boolean(value)
    && Number(value.schemaVersion) === AUTO_PLAN_V9_SCHEMA_VERSION
    && typeof value.status === 'string'
    && Array.isArray(value.assignments);
}

function normalizeStatus(value) {
  const status = String(value || 'UNKNOWN').toUpperCase();
  return ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'MODEL_INVALID', 'UNKNOWN'].includes(status)
    ? status
    : 'UNKNOWN';
}

function relativeGap(metadata = {}) {
  const objective = Number(metadata.objectiveValue);
  const bound = Number(metadata.bestBound);
  if (!Number.isFinite(objective) || !Number.isFinite(bound)) return null;
  if (Math.abs(objective) < 1e-9) return Math.abs(bound) < 1e-9 ? 0 : null;
  return Math.max(0, Math.abs(objective - bound) / Math.max(1, Math.abs(objective)));
}

function plannedMonth(baseline, assignments) {
  const monthData = clone(baseline);
  for (const item of assignments || []) {
    if (!item?.dateIso || !['bd', 'hg'].includes(item.role) || !item.staffId) continue;
    if (baseline.days?.[item.dateIso]?.[item.role]) continue;
    setAssignment(monthData, item.dateIso, item.role, item.staffId);
  }
  return monthData;
}

function auditRows(objective) {
  return (objective?.audit?.entries || []).map(item => ({
    dateIso: item.dateIso,
    role: item.role,
    staffId: item.staffId,
    level: item.evaluation.level,
    canSelect: item.evaluation.canSelect,
    confirmationType: item.evaluation.meta?.confirmationType || null,
    reasons: item.evaluation.reasons || []
  }));
}

function fairnessIndex(objective) {
  if (!objective || objective.unfilled || objective.audit.gray || objective.limitViolations) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function materialize({ state, baseline, runConfig, remote, assignments, alternativeIndex }) {
  const monthData = plannedMonth(baseline, assignments);
  const objective = evaluatePlanObjective(state, monthData, baseline, runConfig);
  const audit = auditRows(objective);
  const changes = listProposedAssignments(monthData, baseline);
  const redViolations = audit.filter(item => item.level === 'red');
  const status = normalizeStatus(remote.status);
  const gap = relativeGap(remote.metadata || remote);
  const complete = objective.unfilled === 0
    && objective.audit.gray === 0
    && objective.limitViolations === 0;
  const certified = status === 'OPTIMAL' && gap === 0;
  const metadata = remote.metadata || {};
  const exactLns = metadata.exactLns || {};
  const metrics = {
    engine: AUTO_PLAN_V9_ENGINE_ID,
    solverStatus: status,
    solverVersion: remote.solverVersion || null,
    rulesetVersion: remote.rulesetVersion || AUTO_PLAN_V9_RULESET_VERSION,
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
    objectiveValue: Number(metadata.objectiveValue),
    bestBound: Number(metadata.bestBound),
    relativeGap: gap,
    conflicts: Number(metadata.conflicts || 0),
    branches: Number(metadata.branches || 0),
    deterministicTime: Number(metadata.deterministicTime || 0),
    lexicographicStages: Array.isArray(metadata.lexicographicStages) ? metadata.lexicographicStages : [],
    conflictCore: Array.isArray(remote.conflictCore) ? remote.conflictCore : [],
    relaxationSuggestions: Array.isArray(remote.relaxationSuggestions) ? remote.relaxationSuggestions : [],
    exactLns,
    optimizer: {
      rounds: Number(exactLns.rounds || 0),
      moves: Number(exactLns.neighborhoods || 0),
      improvements: Number(exactLns.improvements || 0),
      accepted: Number(exactLns.accepted || 0),
      rejected: Number(exactLns.rejected || 0),
      restarts: Number(exactLns.restarts || 0),
      evaluations: Number(metadata.branches || 0),
      operatorLearning: exactLns.operatorLearning || {},
      certified,
      skipped: false
    }
  };
  return {
    success: complete && (runConfig.allowRedFallback === true || metrics.red === 0),
    complete,
    status: !complete ? 'blocked' : metrics.red ? 'confirmation_required' : 'clean',
    requiresConfirmation: redViolations.length > 0,
    certified,
    algorithmRevision: 9,
    engineRevision: 9,
    solverStatus: status,
    year: baseline.year,
    month: baseline.month,
    baseline: clone(baseline),
    plannedMonth: monthData,
    changes,
    audit,
    redViolations,
    runConfig: clone(runConfig),
    iterativeConfig: {
      repairIterations: Number(runConfig.repairIterations || 0),
      localRebuildBudget: Number(runConfig.localRebuildBudget || 0)
    },
    optimizerConfig: {
      timeBudgetMs: Number(runConfig.timeBudgetMs || 0),
      lateAcceptanceSize: Number(runConfig.lateAcceptanceSize || 0),
      perfectionEnabled: true
    },
    executionConfig: {
      performanceProfile: runConfig.performanceProfile || 'adaptive',
      remoteSolver: true,
      deterministic: metadata.deterministic === true
    },
    metrics,
    objectiveKey: objective.key.map(value => Number(value) || 0),
    searchProfile: `CP-SAT v9${exactLns.enabled ? ' + adaptive Exact-LNS' : ''}`,
    elapsedMs: Number(metadata.wallTimeMs || 0),
    proposalFingerprint: stableFingerprint({
      baseline: remote.baselineFingerprint,
      alternativeIndex,
      changes
    })
  };
}

export function materializeAutoPlanV9Result({ state, baseline, runConfig, remote }) {
  if (!isAutoPlanV9Response(remote)) throw new Error('Ungültige Auto-Plan-v9-Solverantwort.');
  const primary = materialize({
    state,
    baseline,
    runConfig,
    remote,
    assignments: remote.assignments,
    alternativeIndex: 0
  });
  primary.alternatives = (remote.alternatives || []).map((item, index) => materialize({
    state,
    baseline,
    runConfig,
    remote: {
      ...remote,
      status: item.status || remote.status,
      metadata: { ...(remote.metadata || {}), ...(item.metadata || {}) }
    },
    assignments: item.assignments || [],
    alternativeIndex: index + 1
  })).filter(item => item.complete && item.metrics.gray === 0);

  if (!primary.complete || primary.metrics.gray > 0) {
    const error = new Error('Der Remotevorschlag bestand den unabhängigen Browseraudit nicht.');
    error.name = 'RemoteAuditError';
    error.result = primary;
    throw error;
  }
  if (!runConfig.allowRedFallback && primary.metrics.red > 0) {
    const error = new Error('Der Remotevorschlag enthält gesperrte rote Abweichungen.');
    error.name = 'RemoteAuditError';
    error.result = primary;
    throw error;
  }
  return primary;
}
