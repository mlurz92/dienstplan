/**
 * Auto-Plan v9 – exakter, zeitbegrenzter Browser-Solver.
 *
 * Dieser Solver bleibt vollständig in der bestehenden Pages/KV-Architektur:
 * Er läuft im bereits vorhandenen Modul-Worker und verwendet für jede
 * Domänenentscheidung dieselbe produktive Regelengine wie die manuelle
 * Dienstvergabe. Es gibt keine zweite, vereinfachte Regelfassung und keinen
 * kostenpflichtigen Cloud-Dienst.
 *
 * Der Suchvertrag entspricht den etablierten Solverstatus:
 *
 * - OPTIMAL: Der vollständige Suchraum wurde untersucht und die beste zulässige
 *   Lösung ist bewiesen.
 * - FEASIBLE: Eine zulässige Lösung liegt vor, der Suchraum wurde wegen eines
 *   Limits aber nicht vollständig untersucht.
 * - INFEASIBLE: Der vollständige Suchraum wurde untersucht und enthält keine
 *   zulässige Lösung.
 * - UNKNOWN: Ein Limit wurde erreicht, bevor eine Lösung oder ein
 *   Unmöglichkeitsnachweis vorlag.
 *
 * Der bestehende v8.5-Plan dient als Incumbent und bevorzugte Verzweigung. v9
 * kann dadurch nie absichtlich einen schlechteren vollständigen Plan wählen.
 */

import {
  autoPlanConfigFingerprint,
  candidateEvaluationVector,
  compareObjectiveKeys,
  evaluatePlanObjective,
  listOpenSlots,
  listProposedAssignments,
  normalizeAutoPlanConfig,
  planRespectsLimits,
  planningFingerprint
} from './auto-planner-engine.js?v=20260804.9';
import {
  evaluateCandidate,
  getPlanningStaff,
  setAssignment
} from './rules.js?v=20260804.9';
import { yieldToBrowser } from './cooperative-scheduling.js?v=20260804.9';

export const V9_SOLVER_STATUSES = Object.freeze({
  OPTIMAL: 'OPTIMAL',
  FEASIBLE: 'FEASIBLE',
  INFEASIBLE: 'INFEASIBLE',
  UNKNOWN: 'UNKNOWN'
});

// Kanonischer Solvername der exakten v9-Tiefensuche. Der rohe Solver (dieses
// Modul) und der normalisierende Wrapper (auto-planner-v9.js) müssen exakt
// denselben Wert berichten, damit raw.search.solver und der normalisierte
// Wert niemals voneinander abweichen.
export const NATIVE_JS_EXACT_MRV_DFS_SOLVER_NAME = 'native-js-exact-mrv-dfs';

const LEVEL_RANK = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });
const ROLE_RANK = Object.freeze({ bd: 0, hg: 1 });
const DEFAULT_TIME_MS = 30_000;
const DEFAULT_NODE_LIMIT = 1_500_000;
const REPORT_INTERVAL = 512;
const YIELD_INTERVAL = 256;

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

function abortIfRequested(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Auto-Plan wurde abgebrochen.');
  error.name = 'AbortError';
  throw error;
}

function finiteInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : fallback;
}

function admissible(objective, allowRed) {
  if (!objective) return false;
  if (objective.limitViolations || objective.audit?.gray || objective.redLimitExceeded || objective.unfilled) return false;
  return allowRed || Number(objective.audit?.red || 0) === 0;
}

function fairnessIndex(objective) {
  if (!objective || objective.audit?.gray || objective.unfilled || objective.limitViolations) return 0;
  const fairness = objective.fairness || {};
  const penalty = Number(fairness.bdPenalty || 0) * 1.35
    + Number(fairness.combinedVariance || 0) * 8
    + Number(fairness.aaHgVariance || 0) * 5
    + Number(fairness.weekendVariance || 0) * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function redViolation(entry) {
  return {
    dateIso: entry.dateIso,
    role: entry.role,
    staffId: entry.staffId,
    level: entry.evaluation?.level,
    confirmationType: entry.evaluation?.meta?.confirmationType || 'standard',
    reasons: entry.evaluation?.reasons || []
  };
}

function fixedAssignmentCount(monthData) {
  return Object.values(monthData?.days || {}).reduce((sum, day) =>
    sum + Number(Boolean(day?.bd)) + Number(Boolean(day?.hg)), 0);
}

/**
 * Baut aus einem vollständig auditierten exakten Zustand denselben stabilen
 * Ergebnisvertrag, den die bisherige Engine liefert. Dadurch bleiben Vorschau,
 * Bestätigungsdialog, Übernahmeprüfung, Export und Tests unverändert nutzbar.
 */
export function materializeV9Result({
  state,
  baseline,
  plannedMonth,
  config,
  elapsedMs,
  search,
  incumbent = null
}) {
  const objective = evaluatePlanObjective(state, plannedMonth, baseline, config);
  const changes = listProposedAssignments(plannedMonth, baseline);
  const slots = listOpenSlots(baseline);
  const complete = !objective.limitViolations
    && !objective.audit.gray
    && !objective.unfilled
    && changes.length === slots.length
    && !objective.redLimitExceeded;
  const requiresConfirmation = complete && objective.audit.red > 0;
  const status = !complete ? 'blocked' : requiresConfirmation ? 'confirmation_required' : 'clean';
  const audit = objective.audit.entries || [];

  return {
    success: complete,
    complete,
    requiresConfirmation,
    status,
    searchProfile: `v9-${search.mode}-${search.allowRed ? 'minimal-red' : 'strict'}`,
    year: baseline.year,
    month: baseline.month,
    baselineFingerprint: planningFingerprint(state, baseline),
    runConfig: clone(config),
    runConfigFingerprint: autoPlanConfigFingerprint(config),
    baseline: clone(baseline),
    plannedMonth: clone(plannedMonth),
    changes,
    redViolations: audit.filter(entry => entry.evaluation?.level === 'red').map(redViolation),
    fixedAssignments: fixedAssignmentCount(baseline),
    openSlots: slots.length,
    elapsedMs: Math.round(elapsedMs),
    objectiveKey: [...objective.key],
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
      exactSearch: { ...search },
      incumbentEngine: incumbent?.metrics?.engine || null
    },
    audit: audit.map(entry => ({
      dateIso: entry.dateIso,
      role: entry.role,
      staffId: entry.staffId,
      level: entry.evaluation?.level,
      canSelect: entry.evaluation?.canSelect,
      confirmationType: entry.evaluation?.meta?.confirmationType || null,
      reasons: entry.evaluation?.reasons || []
    }))
  };
}

function slotCriticality(slot) {
  const day = new Date(`${slot.dateIso}T12:00:00`).getDay();
  if (slot.role === 'bd' && day === 6) return 0;
  if (day === 5 || day === 0) return 1;
  return 2;
}

function simulatedState(state, monthData) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  const months = new Map(state?.months || []);
  months.set(key, monthData);
  return { ...state, months, currentYear: monthData.year, currentMonth: monthData.month };
}

function candidateKey(candidate, hintedStaffId) {
  const vector = candidateEvaluationVector(candidate.evaluation);
  return [
    candidate.person.id === hintedStaffId ? 0 : 1,
    LEVEL_RANK[candidate.evaluation?.level] ?? 9,
    ...vector.map(value => -Number(value || 0)),
    candidate.person.id
  ];
}

function compareCandidateKeys(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (typeof a === 'string' || typeof b === 'string') {
      const order = String(a).localeCompare(String(b));
      if (order) return order;
    } else if (Number(a || 0) !== Number(b || 0)) {
      return Number(a || 0) - Number(b || 0);
    }
  }
  return 0;
}

function domainFor({ state, monthData, slot, config, allowRed, hintMonth, counters }) {
  const sandbox = simulatedState(state, monthData);
  const hintedStaffId = hintMonth?.days?.[slot.dateIso]?.[slot.role] || '';
  const candidates = [];
  for (const person of getPlanningStaff(state?.staff || [], slot.dateIso)) {
    counters.candidateEvaluations += 1;
    const evaluation = evaluateCandidate({
      state: sandbox,
      monthData,
      dateIso: slot.dateIso,
      role: slot.role,
      staffId: person.id
    });
    if (evaluation?.canSelect === false || evaluation?.level === 'gray') continue;
    if (!allowRed && evaluation?.level === 'red') continue;
    if (!planRespectsLimits(monthData, person.id, slot.role, config)) continue;
    candidates.push({ person, evaluation });
  }
  return candidates.sort((left, right) =>
    compareCandidateKeys(candidateKey(left, hintedStaffId), candidateKey(right, hintedStaffId)));
}

function orderedSlots(slots) {
  return [...slots].sort((left, right) =>
    slotCriticality(left) - slotCriticality(right)
    || left.dateIso.localeCompare(right.dateIso)
    || (ROLE_RANK[left.role] ?? 9) - (ROLE_RANK[right.role] ?? 9));
}

function chooseSlot(parameters, monthData, remaining) {
  let selected = null;
  for (const slot of orderedSlots(remaining)) {
    const domain = domainFor({ ...parameters, monthData, slot });
    if (!selected || domain.length < selected.domain.length) selected = { slot, domain };
    if (!domain.length || domain.length === 1) break;
  }
  return selected;
}

function assignmentSignature(monthData, baselineSlots) {
  return baselineSlots.map(slot => monthData.days?.[slot.dateIso]?.[slot.role] || '').join('|');
}

/**
 * Vollständige Tiefensuche mit MRV, echter Domänenprüfung und Incumbent-Hint.
 * Wird das Zeit-/Knotenlimit nicht erreicht, ist das Ergebnis ein globaler
 * Nachweis innerhalb des unveränderten fachlichen Regelmodells.
 */
export async function solveExactly({
  state,
  monthData,
  runConfig = null,
  incumbent = null,
  allowRed = false,
  stopAtFirstFeasible = false,
  stopAtFirstZeroRed = false,
  timeLimitMs = DEFAULT_TIME_MS,
  nodeLimit = DEFAULT_NODE_LIMIT,
  onProgress = null,
  signal = null
}) {
  if (!state || !monthData) throw new TypeError('Der exakte v9-Solver benötigt Zustand und Monatsdaten.');
  const baseline = clone(monthData);
  const config = normalizeAutoPlanConfig(state, baseline, runConfig);
  const baselineSlots = listOpenSlots(baseline);
  const startedAt = now();
  const deadline = startedAt + finiteInteger(timeLimitMs, DEFAULT_TIME_MS, 250, 900_000);
  const maximumNodes = finiteInteger(nodeLimit, DEFAULT_NODE_LIMIT, 1_000, 20_000_000);
  const counters = {
    nodes: 0,
    candidateEvaluations: 0,
    deadEnds: 0,
    solutions: 0,
    incumbentImprovements: 0,
    maximumDepth: 0,
    completeSearch: true,
    stoppedBy: null
  };

  let bestMonth = null;
  let bestObjective = null;
  if (incumbent?.complete && incumbent?.plannedMonth) {
    const objective = evaluatePlanObjective(state, incumbent.plannedMonth, baseline, config);
    if (admissible(objective, allowRed)) {
      bestMonth = clone(incumbent.plannedMonth);
      bestObjective = objective;
    }
  }

  const hintMonth = bestMonth || incumbent?.plannedMonth || null;
  const seenComplete = new Set();
  let stopRequested = false;

  const reachedLimit = () => {
    if (now() >= deadline) {
      counters.completeSearch = false;
      counters.stoppedBy = 'time';
      return true;
    }
    if (counters.nodes >= maximumNodes) {
      counters.completeSearch = false;
      counters.stoppedBy = 'nodes';
      return true;
    }
    return false;
  };

  const report = async (depth, remaining) => {
    if (typeof onProgress !== 'function') return;
    const elapsed = Math.max(1, now() - startedAt);
    const timeShare = Math.min(1, elapsed / Math.max(1, deadline - startedAt));
    await onProgress({
      phase: 'certify',
      stage: 'exact-search',
      progress: .82 + timeShare * .16,
      message: `Exakte v9-Suche · ${counters.nodes.toLocaleString('de-DE')} Knoten · ${remaining} Felder · ${counters.solutions} Lösungen`,
      exactNodes: counters.nodes,
      candidateEvaluations: counters.candidateEvaluations,
      deadEnds: counters.deadEnds,
      exactSolutions: counters.solutions,
      exactDepth: depth,
      exactRemaining: remaining,
      exactTimeShare: timeShare
    });
  };

  const visit = async (workingMonth, remaining, depth) => {
    abortIfRequested(signal);
    if (stopRequested || reachedLimit()) return;
    counters.nodes += 1;
    counters.maximumDepth = Math.max(counters.maximumDepth, depth);

    if (counters.nodes % YIELD_INTERVAL === 0) await yieldToBrowser();
    if (counters.nodes % REPORT_INTERVAL === 0) await report(depth, remaining.length);

    if (!remaining.length) {
      const signature = assignmentSignature(workingMonth, baselineSlots);
      if (seenComplete.has(signature)) return;
      seenComplete.add(signature);
      const objective = evaluatePlanObjective(state, workingMonth, baseline, config);
      if (!admissible(objective, allowRed)) return;
      counters.solutions += 1;
      if (!bestObjective || compareObjectiveKeys(objective.key, bestObjective.key) < 0) {
        bestMonth = clone(workingMonth);
        bestObjective = objective;
        counters.incumbentImprovements += 1;
        await onProgress?.({
          phase: 'certify',
          stage: 'exact-incumbent',
          progress: .94,
          message: `Exakte Suche verbessert den Incumbent · ${objective.audit.red} rot · ${objective.audit.orange} orange · ${objective.audit.yellow} gelb`,
          improvements: counters.incumbentImprovements,
          exactNodes: counters.nodes,
          exactSolutions: counters.solutions
        });
      }
      const zeroRedTargetReached = stopAtFirstZeroRed && Number(objective.audit?.red || 0) === 0;
      if (stopAtFirstFeasible || zeroRedTargetReached) {
        stopRequested = true;
        counters.completeSearch = false;
        counters.stoppedBy = zeroRedTargetReached && !stopAtFirstFeasible
          ? 'first-zero-red'
          : 'first-feasible';
      }
      return;
    }

    const selected = chooseSlot({ state, config, allowRed, hintMonth, counters }, workingMonth, remaining);
    if (!selected?.domain?.length) {
      counters.deadEnds += 1;
      return;
    }
    const nextRemaining = remaining.filter(slot =>
      slot.dateIso !== selected.slot.dateIso || slot.role !== selected.slot.role);

    for (const candidate of selected.domain) {
      if (stopRequested || reachedLimit()) break;
      const nextMonth = clone(workingMonth);
      setAssignment(nextMonth, selected.slot.dateIso, selected.slot.role, candidate.person.id);

      // Verlustfreies Forward Checking: Nur echte leere Domänen verwerfen.
      // Die Reihenfolge und Zahl der übrigen Optionen werden nicht beschnitten.
      let blocked = false;
      for (const futureSlot of orderedSlots(nextRemaining).slice(0, 8)) {
        if (!domainFor({
          state,
          monthData: nextMonth,
          slot: futureSlot,
          config,
          allowRed,
          hintMonth,
          counters
        }).length) {
          blocked = true;
          counters.deadEnds += 1;
          break;
        }
      }
      if (blocked) continue;
      await visit(nextMonth, nextRemaining, depth + 1);
    }
  };

  await onProgress?.({
    phase: 'certify',
    stage: 'exact-start',
    progress: .82,
    message: `Exakte v9-Zertifizierung startet · ${baselineSlots.length} offene Felder · ${Math.round((deadline - startedAt) / 1000)} s Limit`,
    exactTotal: baselineSlots.length,
    exactNodes: 0
  });
  await visit(clone(baseline), baselineSlots, 0);
  await report(counters.maximumDepth, Math.max(0, baselineSlots.length - counters.maximumDepth));

  const elapsedMs = now() - startedAt;
  const solverStatus = counters.completeSearch
    ? bestMonth ? V9_SOLVER_STATUSES.OPTIMAL : V9_SOLVER_STATUSES.INFEASIBLE
    : bestMonth ? V9_SOLVER_STATUSES.FEASIBLE : V9_SOLVER_STATUSES.UNKNOWN;
  const search = {
    solver: NATIVE_JS_EXACT_MRV_DFS_SOLVER_NAME,
    solverStatus,
    mode: stopAtFirstZeroRed
      ? 'first-zero-red'
      : stopAtFirstFeasible
        ? 'first-feasible'
        : 'lexicographic-optimize',
    allowRed,
    completeSearch: counters.completeSearch,
    stoppedBy: counters.stoppedBy,
    nodes: counters.nodes,
    candidateEvaluations: counters.candidateEvaluations,
    deadEnds: counters.deadEnds,
    solutions: counters.solutions,
    incumbentImprovements: counters.incumbentImprovements,
    maximumDepth: counters.maximumDepth,
    timeLimitMs: Math.round(deadline - startedAt),
    nodeLimit: maximumNodes,
    elapsedMs: Math.round(elapsedMs)
  };

  return {
    solverStatus,
    completeSearch: counters.completeSearch,
    bestMonth,
    bestObjective,
    search,
    result: bestMonth
      ? materializeV9Result({ state, baseline, plannedMonth: bestMonth, config, elapsedMs, search, incumbent })
      : null
  };
}
