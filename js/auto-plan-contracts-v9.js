/** Auto-Plan v9 – Transportverträge und sichere Ergebnis-Hydrierung. */
import {
  evaluatePlanObjective,
  listProposedAssignments
} from './auto-planner-engine.js?v=20260803.4';
import { setAssignment } from './rules.js?v=20260803.4';
import {
  AUTO_PLAN_V9_RULESET_VERSION,
  AUTO_PLAN_V9_SCHEMA_VERSION,
  stableFingerprint
} from './constraint-registry-v9.js?v=20260804.1';

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

export const AUTO_PLAN_V9_ENGINE_ID = 'v9-cpsat-guided-exact-lns';

export function isAutoPlanV9Response(value) {
  return Boolean(value)
    && Number(value.schemaVersion) === AUTO_PLAN_V9_SCHEMA_VERSION
    && typeof value.status === 'string'
    && Array.isArray(value.assignments);
}

function fairnessIndex(objective) {
  if (!objective || objective.audit.gray || objective.unfilled || objective.limitViolations) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function applyAssignments(baseline, assignments) {
  const monthData = clone(baseline);
  for (const assignment of assignments || []) {
    if (!assignment?.dateIso || !['bd', 'hg'].includes(assignment.role) || !assignment.staffId) continue;
    if (baseline.days?.[assignment.dateIso]?.[assignment.role]) continue;
    setAssignment(monthData, assignment.dateIso, assignment.role, assignment.staffId);
  }
  return monthData;
}

function auditEntries(objective) {
  return (objective?.audit?.entries || []).map(entry => ({
    dateIso: entry.dateIso,
    role: entry.role,
    staffId: entry.staffId,
    level: entry.evaluation.level,
    canSelect: entry.evaluation.canSelect,
    confirmationType: entry.evaluation.meta?.confirmationType || null,
    reasons: entry.evaluation.reasons || []
  }));
}

function solverStatus(value) {
  const normalized = String(value || 'UNKNOWN').toUpperCase();
  return ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'MODEL_INVALID', 'UNKNOWN'].includes(normalized)
    ? normalized
    : 'UNKNOWN';
}

function objectiveGap(metadata = {}) {
  const objective = Number(metadata.objectiveValue);
  const bound = Number(metadata.bestBound);
  if (!Number.isFinite(objective) || !Number.isFinite(bound)) return null;
  if (Math.abs(objective) < 1e-9) return Math.abs(bound) < 1e-9 ? 0 : null;
  return Math.max(0, Math.abs(objective - bound) / Math.max(1, Math.abs(objective)));
}

function materializeOne({ state, baseline, runConfig, remote, assignmentSet, alternativeIndex = 0 }) {
  const plannedMonth = applyAssignments(baseline, assignmentSet);
  const objective = evaluatePlanObjective(state, plannedMonth, baseline, runConfig);
  const audit = auditEntries(objective);
  const changes = listProposedAssignments(plannedMonth, baseline);
  const redViolations = audit.filter(entry => entry.level === 'red');
  const status = solverStatus(remote.status);
  const complete = objective.unfilled === 0 && objective.audit.gray === 0 && objective.limitViolations === 0;
  const admissible = complete && (runConfig.allowRedFallback === true || objective.audit.red === 0);
  const gap = objectiveGap(remote.metadata || remote);
  const certified = status === 'OPTIMAL' && gap === 0;
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
    bdTargetPenalty: Number(objective.fairness.bdPenalty.toFixed(2)),
    combinedLoadVariance: Number(objective.fairness.combinedVariance.toFixed(3)),
    aaHgVariance: Number(objective.fairness.aaHgVariance.toFixed(3)),
    weekendVariance: Number(objective.fairness.weekendVariance.toFixed(3)),
    fairnessIndex: fairnessIndex(objective),
    objectiveValue: Number(remote.metadata?.objectiveValue ?? remote.objectiveValue),
    bestBound: Number(remote.metadata?.bestBound ?? remote.bestBound),
    relativeGap: gap,
    conflicts: Number(remote.metadata?.conflicts || 0),
    branches: Number(remote.metadata?.branches || 0),
    deterministicTime: Number(remote.metadata?.deterministicTime || 0),
    exactLns: remote.metadata?.exactLns || null,
    lexicographicStages: Array.isArray(remote.metadata?.lexicographicStages)
      ? remote.metadata.lexicographicStages
      : [],
    conflictCore: Array.isArray(remote.conflictCore) ? remote.conflictCore : [],
    relaxationSuggestions: Array.isArray(remote.relaxationSuggestions) ? remote.relaxationSuggestions : [],
    optimizer: {
      rounds: Number(remote.metadata?.exactLns?.rounds || 0),
      moves: Number(remote.metadata?.exactLns?.neighborhoods || 0),
      improvements: Number(remote.metadata?.exactLns?.improvements || 0),
      evaluations: Number(remote.metadata?.branches || 0),
      accepted: Number(remote.metadata?.exactLns?.accepted || 0),
      rejected: Number(remote.metadata?.exactLns?.rejected || 0),
      restarts: Number(remote.metadata?.exactLns?.restarts || 0),
      certified,
      skipped: false,
      operatorLearning: remote.metadata?.exactLns?.operatorLearning || {}
    }
  };

  return {
    success: admissible,
    complete,
    status: !complete ? 'blocked' : redViolations.length ? 'confirmation_required' : 'clean',
    requiresConfirmation: redViolations.length > 0,
    certified,
    algorithmRevision: 9,
    engineRevision: 9,
    solverStatus: status,
    year: baseline.year,
    month: baseline.month,
    baseline: clone(baseline),
    plannedMonth,
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
      deterministic: remote.metadata?.deterministic === true
    },
    metrics,
    objectiveKey: objective.key.map(value => Number(value) || 0),
    searchProfile: `CP-SAT v9${remote.metadata?.exactLns?.enabled ? ' + adaptive Exact-LNS' : ''}${certified ? ' · global optimal' : status === 'FEASIBLE' ? ' · beste gefundene Lösung' : ''}`,
    elapsedMs: Number(remote.metadata?.wallTimeMs || 0),
    proposalFingerprint: stableFingerprint({
      baseline: remote.baselineFingerprint,
      alternativeIndex,
      changes
    })
  };
}

/**
 * Der Browser rekonstruiert jede Remotezuordnung und auditiert sie vollständig
 * mit der produktiven JavaScript-Regelengine. Ein Remoteergebnis, das dadurch
 * unzulässig wird, wird nicht als Erfolg an die Oberfläche weitergereicht.
 */
export function materializeAutoPlanV9Result({ state, baseline, runConfig, remote }) {
  if (!isAutoPlanV9Response(remote)) throw new Error('Ungültige Auto-Plan-v9-Solverantwort.');
  const primary = materializeOne({
    state,
    baseline,
    runConfig,
    remote,
    assignmentSet: remote.assignments,
    alternativeIndex: 0
  });

  primary.alternatives = (remote.alternatives || []).map((alternative, index) => materializeOne({
    state,
    baseline,
    runConfig,
    remote: {
      ...remote,
      status: alternative.status || remote.status,
      metadata: { ...(remote.metadata || {}), ...(alternative.metadata || {}) }
    },
    assignmentSet: alternative.assignments || [],
    alternativeIndex: index + 1
  })).filter(result => result.complete && result.metrics.gray === 0);

  if (primary.metrics.gray > 0 || primary.metrics.unfilled > 0 || !primary.complete) {
    const error = new Error('Der Remotevorschlag bestand den unabhängigen Browseraudit nicht.');
    error.name = 'RemoteAuditError';
    error.result = primary;
    throw error;
  }
  if (!runConfig.allowRedFallback && primary.metrics.red > 0) {
    const error = new Error('Der Remotevorschlag enthält rote Abweichungen, obwohl der Fallback gesperrt ist.');
    error.name = 'RemoteAuditError';
    error.result = primary;
    throw error;
  }
  return primary;
}
