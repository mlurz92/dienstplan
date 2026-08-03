import {
  applyAutoPlanProposal as applyBaseProposal,
  autoPlanConfigFingerprint,
  buildAutoPlan as buildBasePlan,
  createDefaultAutoPlanConfig,
  fingerprintMonth,
  normalizeAutoPlanConfig,
  planningFingerprint,
  validateAutoPlanConfig
} from './auto-planner-engine.js?v=20260803.5';
import {
  computeWeekendEquivalent,
  countHgForAaBdExcept,
  countRoleInMonth,
  evaluateCandidate,
  getPlanningStaff,
  getPreference,
  isPositivePreference,
  setAssignment
} from './rules.js?v=20260803.5';
import { createPacer } from './cooperative-scheduling.js?v=20260803.5';
import { syncPeerCache } from './auto-planner-engine.js?v=20260803.5';

export {
  autoPlanConfigFingerprint,
  createDefaultAutoPlanConfig,
  fingerprintMonth,
  normalizeAutoPlanConfig,
  planningFingerprint,
  validateAutoPlanConfig
};

const ROLE_ORDER = ['bd', 'hg'];
const LEVEL_RANK = { green: 0, yellow: 1, orange: 2, red: 3, gray: 4 };
const EPSILON = 1e-9;
const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));
const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function compareVectors(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = Number(left[index] || 0);
    const b = Number(right[index] || 0);
    if (Math.abs(a - b) <= EPSILON) continue;
    return a < b ? -1 : 1;
  }
  return 0;
}

function simulatedState(state, monthData) {
  const months = new Map(state?.months || []);
  months.set(`${monthData.year}-${String(monthData.month).padStart(2, '0')}`, monthData);
  return { ...state, months, currentYear: monthData.year, currentMonth: monthData.month };
}

function monthDates(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function proposedAssignments(monthData, baseline) {
  const changes = [];
  for (const dateIso of monthDates(monthData)) {
    for (const role of ROLE_ORDER) {
      const before = baseline?.days?.[dateIso]?.[role] || '';
      const after = monthData?.days?.[dateIso]?.[role] || '';
      if (!before && after) changes.push({ dateIso, role, staffId: after });
    }
  }
  return changes;
}

function openCount(monthData, baseline) {
  let count = 0;
  for (const dateIso of monthDates(baseline)) {
    for (const role of ROLE_ORDER) {
      if (!baseline.days?.[dateIso]?.[role] && !monthData.days?.[dateIso]?.[role]) count += 1;
    }
  }
  return count;
}

function vectorOf(evaluation) {
  const vector = evaluation?.meta?.recommendationVector;
  return Array.isArray(vector) ? vector.map(value => Number(value) || 0) : [0, 0, 0, 0, 0, 0];
}

function auditPlan(state, monthData, baseline) {
  const sandbox = simulatedState(state, monthData);
  syncPeerCache(monthData);
  const entries = proposedAssignments(monthData, baseline).map(change => ({
    ...change,
    evaluation: evaluateCandidate({ state: sandbox, monthData, ...change })
  }));
  return {
    entries,
    red: entries.filter(entry => entry.evaluation.level === 'red').length,
    specialRed: entries.filter(entry => entry.evaluation.level === 'red' && entry.evaluation.meta?.confirmationType === 'special').length,
    gray: entries.filter(entry => entry.evaluation.level === 'gray' || entry.evaluation.canSelect === false).length,
    orange: entries.filter(entry => entry.evaluation.level === 'orange').length,
    yellow: entries.filter(entry => entry.evaluation.level === 'yellow').length,
    recommendation: entries.reduce((sum, entry) => {
      const vector = vectorOf(entry.evaluation);
      return sum.map((value, index) => value + (vector[index] || 0));
    }, [0, 0, 0, 0, 0, 0])
  };
}

function monthStaff(state, monthData) {
  const staff = new Map();
  for (const dateIso of monthDates(monthData)) {
    for (const person of getPlanningStaff(state.staff, dateIso)) staff.set(person.id, person);
  }
  return [...staff.values()];
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function fairness(state, monthData) {
  const staff = monthStaff(state, monthData);
  const sandbox = simulatedState(state, monthData);
  const specialists = staff.filter(person => person.canHg || person.promotedCanHg);
  const bdPenalty = staff.reduce((sum, person) => {
    const deviation = countRoleInMonth(monthData, person.id, 'bd') - Number(person.bdTarget || 0);
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);
  return {
    bdPenalty,
    combinedVariance: variance(specialists.map(person => countRoleInMonth(monthData, person.id, 'bd') + countRoleInMonth(monthData, person.id, 'hg'))),
    aaHgVariance: variance(specialists.map(person => countHgForAaBdExcept(sandbox, monthData, person.id, ''))),
    weekendVariance: variance(staff.map(person => computeWeekendEquivalent(monthData, person.id)))
  };
}

function wishes(state, monthData, baseline) {
  let possible = 0;
  let fulfilled = 0;
  const baselineState = simulatedState(state, baseline);
  syncPeerCache(baseline);
  for (const dateIso of monthDates(baseline)) {
    for (const role of ROLE_ORDER) {
      if (baseline.days?.[dateIso]?.[role]) continue;
      for (const person of getPlanningStaff(state.staff, dateIso)) {
        if (!isPositivePreference(getPreference(baseline, person.id, dateIso), role)) continue;
        const evaluation = evaluateCandidate({ state: baselineState, monthData: baseline, dateIso, role, staffId: person.id });
        if (evaluation.level === 'gray' || evaluation.canSelect === false) continue;
        possible += 1;
        if (monthData.days?.[dateIso]?.[role] === person.id) fulfilled += 1;
      }
    }
  }
  return { possible, fulfilled };
}

function limitViolations(monthData, config) {
  let count = 0;
  for (const [staffId, limits] of Object.entries(config.staffLimits || {})) {
    const bd = countRoleInMonth(monthData, staffId, 'bd');
    const hg = countRoleInMonth(monthData, staffId, 'hg');
    if (limits.maxBd !== null && bd > limits.maxBd) count += 1;
    if (limits.maxHg !== null && hg > limits.maxHg) count += 1;
    if (limits.maxTotal !== null && bd + hg > limits.maxTotal) count += 1;
  }
  return count;
}

function objective(state, monthData, baseline, config) {
  const audit = auditPlan(state, monthData, baseline);
  const balance = fairness(state, monthData);
  const preference = wishes(state, monthData, baseline);
  const hard = [
    limitViolations(monthData, config),
    audit.gray,
    openCount(monthData, baseline),
    config.maxRedViolations !== null && audit.red > config.maxRedViolations ? 1 : 0,
    audit.red,
    audit.specialRed,
    audit.orange,
    audit.yellow
  ];
  const recommendation = [-audit.recommendation[0], -audit.recommendation[1], -audit.recommendation[2]];
  const load = [balance.bdPenalty, balance.combinedVariance, balance.aaHgVariance];
  const weekend = [balance.weekendVariance];
  const soft = config.optimizationFocus === 'wishes'
    ? [-preference.fulfilled, ...recommendation, ...load, ...weekend]
    : config.optimizationFocus === 'workload'
      ? [...load, -preference.fulfilled, ...recommendation, ...weekend]
      : config.optimizationFocus === 'weekends'
        ? [...weekend, -preference.fulfilled, ...recommendation, ...load]
        : [...recommendation, -preference.fulfilled, ...load, ...weekend];
  return {
    audit,
    balance,
    preference,
    key: [...hard, ...soft, -audit.recommendation[3], -audit.recommendation[4], -audit.recommendation[5]]
  };
}

function respectsLimits(monthData, staffId, role, config) {
  const limits = config.staffLimits?.[staffId];
  if (!limits) return true;
  const bd = countRoleInMonth(monthData, staffId, 'bd') + Number(role === 'bd');
  const hg = countRoleInMonth(monthData, staffId, 'hg') + Number(role === 'hg');
  return (limits.maxBd === null || bd <= limits.maxBd)
    && (limits.maxHg === null || hg <= limits.maxHg)
    && (limits.maxTotal === null || bd + hg <= limits.maxTotal);
}

function eligibleCandidates(state, monthData, dateIso, role, config, allowRed) {
  const sandbox = simulatedState(state, monthData);
  syncPeerCache(monthData);
  return getPlanningStaff(state.staff, dateIso).map((person, order) => ({
    person,
    order,
    evaluation: evaluateCandidate({ state: sandbox, monthData, dateIso, role, staffId: person.id })
  })).filter(candidate => candidate.evaluation.canSelect !== false
    && candidate.evaluation.level !== 'gray'
    && (allowRed || candidate.evaluation.level !== 'red')
    && respectsLimits(monthData, candidate.person.id, role, config))
    .sort((left, right) => {
      const level = (LEVEL_RANK[left.evaluation.level] ?? 9) - (LEVEL_RANK[right.evaluation.level] ?? 9);
      if (level) return level;
      const vectors = compareVectors(vectorOf(left.evaluation).map(value => -value), vectorOf(right.evaluation).map(value => -value));
      return vectors || left.order - right.order;
    });
}

function iterativeDefaults(runConfig) {
  const fallback = runConfig?.searchIntensity === 'maximum' ? 18 : runConfig?.searchIntensity === 'standard' ? 5 : 11;
  return {
    repairIterations: clampInt(runConfig?.repairIterations, 0, 30, fallback),
    localRebuildBudget: clampInt(runConfig?.localRebuildBudget, 200, 12000, runConfig?.searchIntensity === 'maximum' ? 7000 : 3200)
  };
}

function iterativeFingerprint(config) {
  return JSON.stringify(stableValue(config));
}

function mutableChanges(monthData, baseline) {
  return proposedAssignments(monthData, baseline).sort((left, right) =>
    left.dateIso.localeCompare(right.dateIso) || left.role.localeCompare(right.role));
}

function tryMonth(state, trial, baseline, config, current, stats, kind) {
  stats.neighbors += 1;
  const next = objective(state, trial, baseline, config);
  if (compareVectors(next.key, current.objective.key) >= 0) return current;
  stats.improvements += 1;
  stats[kind] += 1;
  return { monthData: trial, objective: next };
}

async function singleReassignments(state, current, baseline, config, allowRed, stats, budget, pace) {
  let best = current;
  const severity = new Map(best.objective.audit.entries.map(entry => [`${entry.dateIso}|${entry.role}`, LEVEL_RANK[entry.evaluation.level] || 0]));
  const changes = mutableChanges(best.monthData, baseline).sort((left, right) =>
    (severity.get(`${right.dateIso}|${right.role}`) || 0) - (severity.get(`${left.dateIso}|${left.role}`) || 0)
    || left.dateIso.localeCompare(right.dateIso));
  for (const change of changes) {
    if (stats.neighbors >= budget) break;
    await pace();
    const cleared = clone(best.monthData);
    cleared.days[change.dateIso][change.role] = '';
    for (const candidate of eligibleCandidates(state, cleared, change.dateIso, change.role, config, allowRed).slice(0, 6)) {
      if (candidate.person.id === change.staffId || stats.neighbors >= budget) continue;
      const trial = clone(cleared);
      setAssignment(trial, change.dateIso, change.role, candidate.person.id);
      best = tryMonth(state, trial, baseline, config, best, stats, 'reassignments');
    }
  }
  return best;
}

async function pairAndChainMoves(state, current, baseline, config, stats, budget, pace) {
  let best = current;
  const changes = mutableChanges(best.monthData, baseline);
  for (let left = 0; left < changes.length && stats.neighbors < budget; left += 1) {
    for (let right = left + 1; right < changes.length && stats.neighbors < budget; right += 1) {
      await pace();
      const first = changes[left];
      const second = changes[right];
      if (first.role !== second.role || first.staffId === second.staffId) continue;
      const trial = clone(best.monthData);
      setAssignment(trial, first.dateIso, first.role, second.staffId);
      setAssignment(trial, second.dateIso, second.role, first.staffId);
      best = tryMonth(state, trial, baseline, config, best, stats, 'swaps');
    }
  }

  const refreshed = mutableChanges(best.monthData, baseline);
  for (let a = 0; a < refreshed.length && stats.neighbors < budget; a += 1) {
    for (let b = a + 1; b < refreshed.length && stats.neighbors < budget; b += 1) {
      for (let c = b + 1; c < refreshed.length && stats.neighbors < budget; c += 1) {
        await pace();
        const first = refreshed[a];
        const second = refreshed[b];
        const third = refreshed[c];
        if (first.role !== second.role || second.role !== third.role) continue;
        if (new Set([first.staffId, second.staffId, third.staffId]).size < 2) continue;
        const trial = clone(best.monthData);
        setAssignment(trial, first.dateIso, first.role, third.staffId);
        setAssignment(trial, second.dateIso, second.role, first.staffId);
        setAssignment(trial, third.dateIso, third.role, second.staffId);
        best = tryMonth(state, trial, baseline, config, best, stats, 'chains');
      }
    }
  }
  return best;
}

async function dayBundleMoves(state, current, baseline, config, stats, budget, pace) {
  let best = current;
  const dates = monthDates(best.monthData).filter(dateIso =>
    !baseline.days?.[dateIso]?.bd && !baseline.days?.[dateIso]?.hg
    && best.monthData.days?.[dateIso]?.bd && best.monthData.days?.[dateIso]?.hg);
  for (let left = 0; left < dates.length && stats.neighbors < budget; left += 1) {
    for (let right = left + 1; right < dates.length && stats.neighbors < budget; right += 1) {
      await pace();
      const firstDate = dates[left];
      const secondDate = dates[right];
      const trial = clone(best.monthData);
      for (const role of ROLE_ORDER) {
        const value = trial.days[firstDate][role];
        trial.days[firstDate][role] = trial.days[secondDate][role];
        trial.days[secondDate][role] = value;
      }
      best = tryMonth(state, trial, baseline, config, best, stats, 'dayBundles');
    }
  }
  return best;
}

function localRebuild(state, current, baseline, config, allowRed, iterative, stats, signal) {
  const ordered = current.objective.audit.entries
    .filter(entry => ['red', 'orange', 'yellow'].includes(entry.evaluation.level))
    .sort((left, right) => (LEVEL_RANK[right.evaluation.level] || 0) - (LEVEL_RANK[left.evaluation.level] || 0)
      || left.dateIso.localeCompare(right.dateIso));
  const selectedDates = [...new Set(ordered.slice(0, 3).map(entry => entry.dateIso))];
  if (!selectedDates.length) return current;

  const seed = clone(current.monthData);
  const slots = [];
  for (const dateIso of selectedDates) {
    for (const role of ROLE_ORDER) {
      if (baseline.days?.[dateIso]?.[role] || !seed.days?.[dateIso]?.[role]) continue;
      seed.days[dateIso][role] = '';
      slots.push({ dateIso, role });
    }
  }
  if (!slots.length) return current;

  let visited = 0;
  let best = current;
  const visit = (monthData, remaining) => {
    if (signal?.aborted || visited >= iterative.localRebuildBudget) return;
    visited += 1;
    if (!remaining.length) {
      best = tryMonth(state, monthData, baseline, config, best, stats, 'localRebuilds');
      return;
    }
    const domains = remaining.map(slot => ({
      slot,
      candidates: eligibleCandidates(state, monthData, slot.dateIso, slot.role, config, allowRed)
    })).sort((left, right) => left.candidates.length - right.candidates.length
      || left.slot.dateIso.localeCompare(right.slot.dateIso));
    const selected = domains[0];
    if (!selected?.candidates.length) return;
    const nextRemaining = remaining.filter(slot => slot !== selected.slot);
    for (const candidate of selected.candidates.slice(0, 8)) {
      if (visited >= iterative.localRebuildBudget) break;
      const trial = clone(monthData);
      setAssignment(trial, selected.slot.dateIso, selected.slot.role, candidate.person.id);
      const blocked = nextRemaining.some(slot =>
        eligibleCandidates(state, trial, slot.dateIso, slot.role, config, allowRed).length === 0);
      if (!blocked) visit(trial, nextRemaining);
    }
  };
  visit(seed, slots);
  stats.localNodes += visited;
  return best;
}

async function iterativeImprove({ state, result, runConfig, onProgress, signal }) {
  const iterative = iterativeDefaults(runConfig);
  const config = result.runConfig;
  const allowRed = result.requiresConfirmation;
  let current = {
    monthData: clone(result.plannedMonth),
    objective: objective(state, result.plannedMonth, result.baseline, config)
  };
  const stats = {
    rounds: 0,
    neighbors: 0,
    improvements: 0,
    reassignments: 0,
    swaps: 0,
    chains: 0,
    dayBundles: 0,
    localRebuilds: 0,
    localNodes: 0
  };
  const pace = createPacer();
  let stableRounds = 0;
  const perRoundBudget = runConfig?.searchIntensity === 'maximum' ? 420 : runConfig?.searchIntensity === 'standard' ? 120 : 260;

  for (let round = 1; round <= iterative.repairIterations; round += 1) {
    if (signal?.aborted) {
      const error = new Error('Auto-Plan wurde abgebrochen.');
      error.name = 'AbortError';
      throw error;
    }
    stats.rounds = round;
    const before = [...current.objective.key];
    const budget = stats.neighbors + perRoundBudget;

    // Eine Runde dauert mehrere Sekunden. Ohne Zwischenmeldungen stünde der
    // Balken solange still und die Kommentierung schwiege – beides liest sich
    // wie ein Hänger. Deshalb meldet jeder der vier Schritte seinen Beginn,
    // aufgeteilt auf den Fortschrittsabschnitt dieser Runde.
    const roundSpan = .065 / Math.max(1, iterative.repairIterations);
    const roundBase = .91 + (round - 1) * roundSpan;
    const step = async (index, label) => {
      await onProgress?.({
        phase: 'polish',
        progress: roundBase + roundSpan * (index / 5),
        message: `Tauschrunde ${round}/${iterative.repairIterations} · ${label}`,
        improvements: stats.improvements,
        swapChecks: stats.swaps + stats.chains + stats.dayBundles,
        iterativeRound: round,
        iterativeRounds: iterative.repairIterations,
        localNodes: stats.localNodes
      });
    };

    await step(0, 'Einzelumsetzungen werden geprüft');
    current = await singleReassignments(state, current, result.baseline, config, allowRed, stats, budget, pace);
    await step(1, 'Paartausche und Dreierketten werden geprüft');
    current = await pairAndChainMoves(state, current, result.baseline, config, stats, budget, pace);
    await step(2, 'Tagespakete werden geprüft');
    current = await dayBundleMoves(state, current, result.baseline, config, stats, budget, pace);
    await step(3, 'Auffällige Tage werden lokal neu geplant');
    current = localRebuild(state, current, result.baseline, config, allowRed, iterative, stats, signal);
    const improved = compareVectors(current.objective.key, before) < 0;
    stableRounds = improved ? 0 : stableRounds + 1;
    await onProgress?.({
      phase: 'polish',
      progress: roundBase + roundSpan,
      message: `Tauschrunde ${round}/${iterative.repairIterations} abgeschlossen · ${stats.neighbors.toLocaleString('de-DE')} Nachbarschaften · ${stats.improvements} Verbesserungen`,
      improvements: stats.improvements,
      swapChecks: stats.swaps + stats.chains + stats.dayBundles,
      iterativeRound: round,
      iterativeRounds: iterative.repairIterations,
      localNodes: stats.localNodes
    });
    if (stableRounds >= 2) break;
  }
  return { current, iterative, stats };
}

function updateResult(result, improved) {
  const { current, iterative, stats } = improved;
  const audit = current.objective.audit;
  result.plannedMonth = clone(current.monthData);
  result.changes = proposedAssignments(current.monthData, result.baseline);
  result.audit = audit.entries.map(entry => ({
    dateIso: entry.dateIso,
    role: entry.role,
    staffId: entry.staffId,
    level: entry.evaluation.level,
    canSelect: entry.evaluation.canSelect,
    confirmationType: entry.evaluation.meta?.confirmationType || null,
    reasons: entry.evaluation.reasons || []
  }));
  result.redViolations = result.audit.filter(entry => entry.level === 'red').map(entry => ({ ...entry }));
  result.metrics.red = audit.red;
  result.metrics.specialRed = audit.specialRed;
  result.metrics.gray = audit.gray;
  result.metrics.orange = audit.orange;
  result.metrics.yellow = audit.yellow;
  result.metrics.wishesFulfilled = current.objective.preference.fulfilled;
  result.metrics.wishesPossible = current.objective.preference.possible;
  result.metrics.bdTargetPenalty = Number(current.objective.balance.bdPenalty.toFixed(2));
  result.metrics.combinedLoadVariance = Number(current.objective.balance.combinedVariance.toFixed(3));
  result.metrics.aaHgVariance = Number(current.objective.balance.aaHgVariance.toFixed(3));
  result.metrics.weekendVariance = Number(current.objective.balance.weekendVariance.toFixed(3));
  result.metrics.iterative = stats;
  result.iterativeConfig = iterative;
  result.iterativeConfigFingerprint = iterativeFingerprint(iterative);
  result.requiresConfirmation = audit.red > 0;
  result.status = result.requiresConfirmation ? 'confirmation_required' : 'clean';
  result.searchProfile = `${result.searchProfile || 'Auto-Plan'} + iterative Tauschreparatur`;
  result.proposalFingerprint = JSON.stringify(stableValue({
    baselineFingerprint: result.baselineFingerprint,
    runConfigFingerprint: result.runConfigFingerprint,
    iterativeConfigFingerprint: result.iterativeConfigFingerprint,
    changes: result.changes
  }));
  return result;
}

export async function buildAutoPlan(parameters) {
  const runConfig = parameters?.runConfig || null;
  const result = await buildBasePlan(parameters);
  if (!result.complete || !result.changes.length) {
    const iterative = iterativeDefaults(runConfig);
    result.iterativeConfig = iterative;
    result.iterativeConfigFingerprint = iterativeFingerprint(iterative);
    result.metrics.iterative = { rounds: 0, neighbors: 0, improvements: 0, reassignments: 0, swaps: 0, chains: 0, dayBundles: 0, localRebuilds: 0, localNodes: 0 };
    result.proposalFingerprint = JSON.stringify(stableValue({
      baselineFingerprint: result.baselineFingerprint,
      runConfigFingerprint: result.runConfigFingerprint,
      iterativeConfigFingerprint: result.iterativeConfigFingerprint,
      changes: result.changes
    }));
    return result;
  }
  return updateResult(result, await iterativeImprove({
    state: parameters.state,
    result,
    runConfig,
    onProgress: parameters.onProgress,
    signal: parameters.signal
  }));
}

export function applyAutoPlanProposal(parameters) {
  const proposal = parameters?.proposal;
  if (!proposal?.iterativeConfig || iterativeFingerprint(proposal.iterativeConfig) !== proposal.iterativeConfigFingerprint) {
    throw new Error('Die iterative Auto-Plan-Konfiguration ist ungültig oder wurde verändert.');
  }
  const expected = JSON.stringify(stableValue({
    baselineFingerprint: proposal.baselineFingerprint,
    runConfigFingerprint: proposal.runConfigFingerprint,
    iterativeConfigFingerprint: proposal.iterativeConfigFingerprint,
    changes: proposal.changes
  }));
  if (expected !== proposal.proposalFingerprint) throw new Error('Der Auto-Plan-Vorschlag wurde nach der Optimierung verändert.');
  return applyBaseProposal(parameters);
}
