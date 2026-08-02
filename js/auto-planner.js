import {
  computeWeekendEquivalent,
  countHgForAaBdExcept,
  countRoleInMonth,
  evaluateCandidate,
  getPlanningStaff,
  getPreference,
  getRoleProperties,
  isPositivePreference,
  parseIso,
  setAssignment
} from './rules.js?v=20260801.11';

const LEVEL_RANK = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });
const ROLE_ORDER = Object.freeze(['bd', 'hg']);
const SEARCH_MODE = Object.freeze({ STRICT: 'strict', CONFIRMABLE: 'confirmable' });
const EPSILON = 1e-9;
const DEFAULT_BEAM_WIDTH = 72;
const DEFAULT_BRANCH_LIMIT = 14;
const DEFAULT_EXACT_BUDGET = 12000;
const MAX_EXACT_REMAINING = 8;
const POLISH_PASSES = 2;
const MAX_SWAP_CHECKS = 180;

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

const keyForMonth = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

function simulatedState(state, monthData) {
  const months = new Map(state.months || []);
  months.set(keyForMonth(monthData.year, monthData.month), monthData);
  return { ...state, months, currentYear: monthData.year, currentMonth: monthData.month };
}

function abortIfRequested(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Auto-Plan wurde abgebrochen.');
  error.name = 'AbortError';
  throw error;
}

function yieldToBrowser() {
  if (typeof scheduler === 'object' && typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof requestAnimationFrame === 'function') return new Promise(resolve => requestAnimationFrame(resolve));
  return Promise.resolve();
}

async function report(onProgress, payload) {
  if (typeof onProgress === 'function') await onProgress(payload);
}

function monthDates(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function openSlots(monthData) {
  const result = [];
  for (const role of ROLE_ORDER) {
    for (const dateIso of monthDates(monthData)) {
      if (!monthData.days[dateIso]?.[role]) result.push({ dateIso, role });
    }
  }
  return result;
}

function fixedAssignmentCount(monthData) {
  return Object.values(monthData?.days || {}).reduce((sum, day) =>
    sum + Number(Boolean(day?.bd)) + Number(Boolean(day?.hg)), 0);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function relevantMonthSnapshot(monthData) {
  return stableValue({
    schemaVersion: monthData?.schemaVersion || 1,
    year: monthData?.year,
    month: monthData?.month,
    revision: monthData?.revision || 0,
    updatedAt: monthData?.updatedAt || null,
    days: Object.fromEntries(monthDates(monthData).map(dateIso => [dateIso, {
      bd: monthData.days?.[dateIso]?.bd || '',
      hg: monthData.days?.[dateIso]?.hg || ''
    }])),
    absences: monthData?.absences || {},
    preferences: monthData?.preferences || {},
    options: monthData?.options || {}
  });
}

export function fingerprintMonth(monthData) {
  return JSON.stringify(relevantMonthSnapshot(monthData));
}

export function planningFingerprint(state, monthData) {
  const currentKey = keyForMonth(monthData.year, monthData.month);
  const months = new Map(state?.months || []);
  months.set(currentKey, monthData);
  const monthSnapshots = [...months.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, relevantMonthSnapshot(value)]);
  return JSON.stringify(stableValue({
    currentKey,
    staff: Array.isArray(state?.staff) ? state.staff : [],
    months: monthSnapshots
  }));
}

function vectorOf(evaluation) {
  const vector = evaluation?.meta?.recommendationVector;
  return Array.isArray(vector)
    ? vector.map(value => Number(value) || 0)
    : [0, 0, 0, 0, 0, 0];
}

function compareNumber(left, right) {
  if (Math.abs(left - right) <= EPSILON) return 0;
  return left < right ? -1 : 1;
}

function compareVectors(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = compareNumber(Number(left[index] || 0), Number(right[index] || 0));
    if (difference) return difference;
  }
  return 0;
}

function candidateKey(candidate, role, strategy = 'balanced') {
  const meta = candidate.evaluation?.meta || {};
  const recommendation = vectorOf(candidate.evaluation);
  const load = role === 'bd'
    ? Number(meta.currentBd || 0)
    : Number(meta.combinedLoad || 0);
  const secondaryLoad = role === 'hg'
    ? Number(meta.aaHgCount || 0)
    : 0;
  const pureRoleLoad = role === 'hg'
    ? Number(meta.currentHg || 0)
    : 0;

  if (strategy === 'coverage') {
    return [
      LEVEL_RANK[candidate.evaluation?.level] ?? 9,
      -recommendation[0],
      load,
      secondaryLoad,
      pureRoleLoad,
      -recommendation[1],
      -recommendation[2],
      -recommendation[3],
      -recommendation[4],
      -recommendation[5],
      candidate.order
    ];
  }

  return [
    LEVEL_RANK[candidate.evaluation?.level] ?? 9,
    ...recommendation.map(value => -value),
    load,
    secondaryLoad,
    pureRoleLoad,
    candidate.order
  ];
}

function createCandidateResolver(state, mode, strategy, stats) {
  const cache = new WeakMap();

  return function candidatesFor(monthData, dateIso, role) {
    let monthCache = cache.get(monthData);
    if (!monthCache) {
      monthCache = new Map();
      cache.set(monthData, monthCache);
    }
    const key = `${dateIso}|${role}|${mode}|${strategy}`;
    if (monthCache.has(key)) return monthCache.get(key);

    const sandbox = simulatedState(state, monthData);
    const planningStaff = getPlanningStaff(sandbox.staff, dateIso);
    const candidates = planningStaff
      .map((person, order) => ({
        person,
        order,
        evaluation: evaluateCandidate({
          state: sandbox,
          monthData,
          dateIso,
          role,
          staffId: person.id
        })
      }))
      .filter(candidate => candidate.evaluation?.canSelect !== false)
      .filter(candidate => candidate.evaluation?.level !== 'gray')
      .filter(candidate => mode === SEARCH_MODE.CONFIRMABLE || candidate.evaluation?.level !== 'red')
      .sort((left, right) =>
        compareVectors(candidateKey(left, role, strategy), candidateKey(right, role, strategy)));

    stats.candidateEvaluations += planningStaff.length;
    monthCache.set(key, candidates);
    return candidates;
  };
}

function emptyNode(monthData) {
  return {
    monthData,
    recommendation: [0, 0, 0, 0, 0, 0],
    trace: [],
    depth: 0
  };
}

function assignNode(node, slot, candidate) {
  const monthData = clone(node.monthData);
  setAssignment(monthData, slot.dateIso, slot.role, candidate.person.id);
  const recommendation = vectorOf(candidate.evaluation);
  return {
    monthData,
    recommendation: node.recommendation.map((value, index) => value + (recommendation[index] || 0)),
    trace: [...node.trace, {
      ...slot,
      staffId: candidate.person.id,
      level: candidate.evaluation.level,
      confirmationType: candidate.evaluation?.meta?.confirmationType || null,
      reasons: candidate.evaluation.reasons || []
    }],
    depth: node.depth + 1
  };
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
}

function activeStaffForMonth(state, monthData) {
  const byId = new Map();
  for (const dateIso of monthDates(monthData)) {
    for (const person of getPlanningStaff(state.staff, dateIso)) byId.set(person.id, person);
  }
  return [...byId.values()];
}

function hgEligibleStaffForMonth(state, monthData) {
  const dates = monthDates(monthData);
  return activeStaffForMonth(state, monthData)
    .filter(person => dates.some(dateIso => getRoleProperties(person, dateIso).canHg));
}

function saturdayEligibleStaffForMonth(state, monthData) {
  const saturdays = monthDates(monthData).filter(dateIso => parseIso(dateIso).getDay() === 6);
  return activeStaffForMonth(state, monthData)
    .filter(person => saturdays.some(dateIso => getRoleProperties(person, dateIso).canSaturdayBd));
}

function fairnessSnapshot(state, monthData) {
  const staff = activeStaffForMonth(state, monthData);
  const bdPenalty = staff.reduce((sum, person) => {
    const target = Number(person.bdTarget || 0);
    const actual = countRoleInMonth(monthData, person.id, 'bd');
    const deviation = actual - target;
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);

  const specialists = hgEligibleStaffForMonth(state, monthData);
  const sandbox = simulatedState(state, monthData);
  const combined = specialists.map(person =>
    countRoleInMonth(monthData, person.id, 'bd') + countRoleInMonth(monthData, person.id, 'hg'));
  const aaHg = specialists.map(person => countHgForAaBdExcept(sandbox, monthData, person.id, ''));
  const weekend = staff.map(person => computeWeekendEquivalent(monthData, person.id));

  return {
    bdPenalty,
    combinedVariance: variance(combined),
    aaHgVariance: variance(aaHg),
    weekendVariance: variance(weekend)
  };
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

function auditProposal(state, monthData, baseline) {
  const sandbox = simulatedState(state, monthData);
  const entries = proposedAssignments(monthData, baseline).map(change => ({
    ...change,
    evaluation: evaluateCandidate({
      state: sandbox,
      monthData,
      dateIso: change.dateIso,
      role: change.role,
      staffId: change.staffId
    })
  }));

  return {
    entries,
    red: entries.filter(entry => entry.evaluation.level === 'red').length,
    specialRed: entries.filter(entry =>
      entry.evaluation.level === 'red' && entry.evaluation.meta?.confirmationType === 'special').length,
    gray: entries.filter(entry =>
      entry.evaluation.level === 'gray' || entry.evaluation.canSelect === false).length,
    orange: entries.filter(entry => entry.evaluation.level === 'orange').length,
    yellow: entries.filter(entry => entry.evaluation.level === 'yellow').length,
    recommendation: entries.reduce((sum, entry) => {
      const vector = vectorOf(entry.evaluation);
      return sum.map((value, index) => value + (vector[index] || 0));
    }, [0, 0, 0, 0, 0, 0])
  };
}

function wishSnapshot(state, monthData, baseline) {
  let possible = 0;
  let fulfilled = 0;
  const baselineState = simulatedState(state, baseline);
  for (const dateIso of monthDates(monthData)) {
    for (const role of ROLE_ORDER) {
      if (baseline?.days?.[dateIso]?.[role]) continue;
      const assigned = monthData.days?.[dateIso]?.[role] || '';
      for (const person of getPlanningStaff(state.staff, dateIso)) {
        if (!isPositivePreference(getPreference(monthData, person.id, dateIso), role)) continue;
        const evaluation = evaluateCandidate({
          state: baselineState,
          monthData: baseline,
          dateIso,
          role,
          staffId: person.id
        });
        if (evaluation.level === 'gray' || evaluation.canSelect === false) continue;
        possible += 1;
        if (assigned === person.id) fulfilled += 1;
      }
    }
  }
  return { possible, fulfilled, missed: Math.max(0, possible - fulfilled) };
}

function saturdayVariance(state, monthData) {
  const counts = saturdayEligibleStaffForMonth(state, monthData)
    .map(person => Object.entries(monthData.days || {}).filter(([dateIso, day]) =>
      parseIso(dateIso).getDay() === 6 && day?.bd === person.id).length);
  return variance(counts);
}

function finalObjective(state, monthData, baseline) {
  const audit = auditProposal(state, monthData, baseline);
  const fairness = fairnessSnapshot(state, monthData);
  const wishes = wishSnapshot(state, monthData, baseline);
  const unfilled = openSlots(monthData).length;
  return {
    audit,
    fairness,
    wishes,
    unfilled,
    key: [
      audit.gray,
      unfilled,
      audit.red,
      audit.specialRed,
      audit.orange,
      audit.yellow,
      -audit.recommendation[0],
      -wishes.fulfilled,
      -audit.recommendation[1],
      -audit.recommendation[2],
      fairness.bdPenalty,
      fairness.combinedVariance,
      fairness.aaHgVariance,
      fairness.weekendVariance,
      saturdayVariance(state, monthData),
      -audit.recommendation[3],
      -audit.recommendation[4],
      -audit.recommendation[5]
    ]
  };
}

function partialObjective(state, node, baseline, flexibility = null) {
  const audit = auditProposal(state, node.monthData, baseline);
  const fairness = fairnessSnapshot(state, node.monthData);
  const remaining = openSlots(node.monthData).length;
  return {
    audit,
    fairness,
    remaining,
    key: [
      audit.gray,
      remaining,
      audit.red,
      audit.specialRed,
      audit.orange,
      audit.yellow,
      flexibility?.blocked ? 1 : 0,
      -(flexibility?.minimumDomain || 0),
      -(flexibility?.logDomainSum || 0),
      -node.recommendation[0],
      -node.recommendation[1],
      -node.recommendation[2],
      fairness.bdPenalty,
      fairness.combinedVariance,
      fairness.aaHgVariance,
      fairness.weekendVariance,
      -node.recommendation[3],
      -node.recommendation[4],
      -node.recommendation[5]
    ]
  };
}

function completeSignature(monthData, baseline) {
  const slots = openSlots(baseline);
  return slots.map(slot =>
    `${slot.dateIso}:${slot.role}:${monthData.days?.[slot.dateIso]?.[slot.role] || ''}`).join('|');
}

function selectBestFinal(state, nodes, baseline) {
  const ranked = nodes.map(node => ({ node, objective: finalObjective(state, node.monthData, baseline) }));
  ranked.sort((left, right) =>
    compareVectors(left.objective.key, right.objective.key)
      || completeSignature(left.node.monthData, baseline)
        .localeCompare(completeSignature(right.node.monthData, baseline)));
  return ranked[0] || null;
}

function fairnessIndex(objective) {
  if (!objective || objective.audit.gray || objective.unfilled) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function slotCriticality(slot) {
  const weekday = parseIso(slot.dateIso).getDay();
  if (slot.role === 'bd' && weekday === 6) return 0;
  if (weekday === 5 || weekday === 0) return 1;
  return 2;
}

function selectNextSlot(representative, remainingSlots, candidatesFor) {
  const ranked = remainingSlots.map(slot => {
    const domain = candidatesFor(representative.monthData, slot.dateIso, slot.role);
    return {
      slot,
      domain: domain.length,
      criticality: slotCriticality(slot)
    };
  });
  ranked.sort((left, right) =>
    left.domain - right.domain
      || left.criticality - right.criticality
      || left.slot.dateIso.localeCompare(right.slot.dateIso)
      || ROLE_ORDER.indexOf(left.slot.role) - ROLE_ORDER.indexOf(right.slot.role));
  return ranked[0] || null;
}

function flexibilitySummary(node, futureSlots, candidatesFor, lookaheadLimit) {
  if (!futureSlots.length) return { blocked: false, minimumDomain: 99, logDomainSum: 0 };
  const checkedSlots = [...futureSlots]
    .sort((left, right) =>
      slotCriticality(left) - slotCriticality(right)
        || left.dateIso.localeCompare(right.dateIso)
        || ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role))
    .slice(0, Math.max(1, lookaheadLimit));
  let minimumDomain = Infinity;
  let logDomainSum = 0;
  for (const slot of checkedSlots) {
    const count = candidatesFor(node.monthData, slot.dateIso, slot.role).length;
    if (count === 0) return { blocked: true, minimumDomain: 0, logDomainSum };
    minimumDomain = Math.min(minimumDomain, count);
    logDomainSum += Math.log1p(count);
  }
  return { blocked: false, minimumDomain, logDomainSum };
}

function pruneBeam({
  state,
  expanded,
  baseline,
  futureSlots,
  candidatesFor,
  mode,
  beamWidth,
  lookaheadLimit,
  stats
}) {
  const preRanked = expanded.map(node => ({
    node,
    objective: partialObjective(state, node, baseline)
  }));
  preRanked.sort((left, right) =>
    compareVectors(left.objective.key, right.objective.key)
      || completeSignature(left.node.monthData, baseline)
        .localeCompare(completeSignature(right.node.monthData, baseline)));

  const preLimit = Math.max(beamWidth, Math.min(preRanked.length, Math.ceil(beamWidth * 1.75)));
  const checked = [];
  for (const entry of preRanked.slice(0, preLimit)) {
    if (entry.objective.audit.gray > 0) {
      stats.deadEnds += 1;
      continue;
    }
    if (mode === SEARCH_MODE.STRICT && entry.objective.audit.red > 0) {
      stats.deadEnds += 1;
      continue;
    }
    const flexibility = flexibilitySummary(entry.node, futureSlots, candidatesFor, lookaheadLimit);
    if (flexibility.blocked) {
      stats.deadEnds += 1;
      continue;
    }
    checked.push({
      node: entry.node,
      objective: partialObjective(state, entry.node, baseline, flexibility),
      signature: completeSignature(entry.node.monthData, baseline)
    });
  }

  checked.sort((left, right) =>
    compareVectors(left.objective.key, right.objective.key)
      || left.signature.localeCompare(right.signature));

  const result = [];
  const seen = new Set();
  for (const entry of checked) {
    if (seen.has(entry.signature)) continue;
    seen.add(entry.signature);
    result.push(entry.node);
    if (result.length >= beamWidth) break;
  }
  stats.maxBeam = Math.max(stats.maxBeam, result.length);
  return result;
}

function exactComplete({
  state,
  seedNodes,
  baseline,
  mode,
  strategy,
  nodeBudget,
  signal,
  stats
}) {
  const candidatesFor = createCandidateResolver(state, mode, strategy, stats);
  let best = null;
  let visited = 0;

  function visit(node) {
    abortIfRequested(signal);
    if (visited >= nodeBudget) return;
    visited += 1;
    stats.exactNodes += 1;

    const remaining = openSlots(node.monthData);
    if (!remaining.length) {
      const candidate = {
        node,
        objective: finalObjective(state, node.monthData, baseline)
      };
      if (candidate.objective.audit.gray > 0) return;
      if (mode === SEARCH_MODE.STRICT && candidate.objective.audit.red > 0) return;
      if (!best
        || compareVectors(candidate.objective.key, best.objective.key) < 0
        || (compareVectors(candidate.objective.key, best.objective.key) === 0
          && completeSignature(candidate.node.monthData, baseline)
            .localeCompare(completeSignature(best.node.monthData, baseline)) < 0)) {
        best = candidate;
      }
      return;
    }

    const selected = selectNextSlot(node, remaining, candidatesFor);
    if (!selected || selected.domain === 0) {
      stats.deadEnds += 1;
      return;
    }
    const slot = selected.slot;
    const candidates = candidatesFor(node.monthData, slot.dateIso, slot.role);
    for (const candidate of candidates) {
      if (visited >= nodeBudget) break;
      const next = assignNode(node, slot, candidate);
      const audit = auditProposal(state, next.monthData, baseline);
      if (audit.gray > 0 || (mode === SEARCH_MODE.STRICT && audit.red > 0)) {
        stats.deadEnds += 1;
        continue;
      }
      visit(next);
    }
  }

  for (const seed of seedNodes) {
    if (openSlots(seed.monthData).length > MAX_EXACT_REMAINING) continue;
    visit(seed);
    if (visited >= nodeBudget) break;
  }
  return best;
}

async function runSearchPass({
  state,
  baseline,
  slots,
  mode,
  strategy,
  beamWidth,
  branchLimit,
  exactBudget,
  lookaheadLimit,
  onProgress,
  signal,
  progressStart,
  progressSpan,
  label,
  passIndex
}) {
  const stats = {
    id: `${mode}-${strategy}-${passIndex}`,
    mode,
    strategy,
    beamWidth,
    branchLimit,
    generatedNodes: 0,
    exploredNodes: 0,
    candidateEvaluations: 0,
    deadEnds: 0,
    exactNodes: 0,
    maxBeam: 1,
    complete: false
  };
  const candidatesFor = createCandidateResolver(state, mode, strategy, stats);
  let beam = [emptyNode(clone(baseline))];
  let processed = 0;

  for (const role of ROLE_ORDER) {
    let remaining = slots.filter(slot => slot.role === role);
    while (remaining.length && beam.length) {
      abortIfRequested(signal);
      const representative = beam[0];
      const selected = selectNextSlot(representative, remaining, candidatesFor);
      if (!selected) break;
      const slot = selected.slot;
      const afterCurrent = remaining.filter(candidate =>
        candidate.dateIso !== slot.dateIso || candidate.role !== slot.role);
      const futureSlots = [
        ...afterCurrent,
        ...slots.filter(candidate =>
          ROLE_ORDER.indexOf(candidate.role) > ROLE_ORDER.indexOf(role))
      ];

      const expanded = [];
      let candidateCount = 0;
      for (const node of beam) {
        const candidates = candidatesFor(node.monthData, slot.dateIso, slot.role);
        candidateCount = Math.max(candidateCount, candidates.length);
        stats.exploredNodes += 1;
        for (const candidate of candidates.slice(0, Math.max(1, branchLimit))) {
          expanded.push(assignNode(node, slot, candidate));
          stats.generatedNodes += 1;
        }
      }

      beam = pruneBeam({
        state,
        expanded,
        baseline,
        futureSlots,
        candidatesFor,
        mode,
        beamWidth: Math.max(4, beamWidth),
        lookaheadLimit,
        stats
      });
      remaining = afterCurrent;
      processed += 1;

      await report(onProgress, {
        phase: 'search',
        subphase: role,
        progress: progressStart + (processed / Math.max(1, slots.length)) * progressSpan,
        message: `${label} · ${role.toUpperCase()} ${slot.dateIso}: ${candidateCount} Kandidaten · ${beam.length} Varianten`,
        dateIso: slot.dateIso,
        role,
        processed,
        total: slots.length,
        candidateCount,
        beamSize: beam.length,
        exploredNodes: stats.exploredNodes,
        generatedNodes: stats.generatedNodes,
        deadEnds: stats.deadEnds,
        searchMode: mode,
        passIndex
      });
      await yieldToBrowser();
    }
  }

  let best = selectBestFinal(state, beam.length ? beam : [emptyNode(clone(baseline))], baseline);
  if (best?.objective.unfilled > 0) {
    const seeds = (beam.length ? beam : [best.node])
      .slice(0, Math.min(8, beam.length || 1))
      .filter(Boolean);
    const exact = exactComplete({
      state,
      seedNodes: seeds,
      baseline,
      mode,
      strategy,
      nodeBudget: exactBudget,
      signal,
      stats
    });
    if (exact && (!best || compareVectors(exact.objective.key, best.objective.key) < 0)) {
      best = exact;
    }
  }

  stats.complete = Boolean(best
    && best.objective.unfilled === 0
    && best.objective.audit.gray === 0
    && (mode === SEARCH_MODE.CONFIRMABLE || best.objective.audit.red === 0));
  return { best, beam, stats };
}

function betterObjective(candidate, current) {
  return compareVectors(candidate.key, current.key) < 0;
}

function clearAssignment(monthData, dateIso, role) {
  if (!monthData?.days?.[dateIso]) return;
  monthData.days[dateIso][role] = '';
}

async function polishPlan({
  state,
  baseline,
  best,
  mode,
  onProgress,
  signal,
  stats
}) {
  if (!best || best.objective.unfilled > 0 || best.objective.audit.gray > 0) return best;
  let monthData = clone(best.node.monthData);
  let objective = finalObjective(state, monthData, baseline);
  let improvements = 0;
  let swapChecks = 0;

  for (let pass = 0; pass < POLISH_PASSES; pass += 1) {
    let changed = false;
    const changes = proposedAssignments(monthData, baseline);
    for (const change of changes) {
      abortIfRequested(signal);
      const currentStaff = monthData.days[change.dateIso][change.role];
      const cleared = clone(monthData);
      clearAssignment(cleared, change.dateIso, change.role);
      const resolverStats = {
        candidateEvaluations: 0, exactNodes: 0, deadEnds: 0, maxBeam: 0
      };
      const candidatesFor = createCandidateResolver(state, mode, 'balanced', resolverStats);
      const alternatives = candidatesFor(cleared, change.dateIso, change.role);
      stats.candidateEvaluations += resolverStats.candidateEvaluations;

      for (const candidate of alternatives) {
        if (candidate.person.id === currentStaff) continue;
        const trial = clone(cleared);
        setAssignment(trial, change.dateIso, change.role, candidate.person.id);
        const trialObjective = finalObjective(state, trial, baseline);
        if (trialObjective.audit.gray > 0 || trialObjective.unfilled > 0) continue;
        if (mode === SEARCH_MODE.STRICT && trialObjective.audit.red > 0) continue;
        if (betterObjective(trialObjective, objective)) {
          monthData = trial;
          objective = trialObjective;
          improvements += 1;
          changed = true;
          break;
        }
      }
    }

    const sameRole = proposedAssignments(monthData, baseline);
    outer:
    for (let left = 0; left < sameRole.length; left += 1) {
      for (let right = left + 1; right < sameRole.length; right += 1) {
        if (swapChecks >= MAX_SWAP_CHECKS) break outer;
        const first = sameRole[left];
        const second = sameRole[right];
        if (first.role !== second.role || first.staffId === second.staffId) continue;
        swapChecks += 1;
        const trial = clone(monthData);
        setAssignment(trial, first.dateIso, first.role, second.staffId);
        setAssignment(trial, second.dateIso, second.role, first.staffId);
        const trialObjective = finalObjective(state, trial, baseline);
        if (trialObjective.audit.gray > 0 || trialObjective.unfilled > 0) continue;
        if (mode === SEARCH_MODE.STRICT && trialObjective.audit.red > 0) continue;
        if (betterObjective(trialObjective, objective)) {
          monthData = trial;
          objective = trialObjective;
          improvements += 1;
          changed = true;
          break outer;
        }
      }
    }

    await report(onProgress, {
      phase: 'polish',
      progress: 0.93 + pass * 0.015,
      message: `Fairness-Politur ${pass + 1}/${POLISH_PASSES} · ${improvements} Verbesserungen`,
      improvements,
      swapChecks
    });
    await yieldToBrowser();
    if (!changed) break;
  }

  stats.improvements = improvements;
  stats.swapChecks = swapChecks;
  return {
    node: {
      ...best.node,
      monthData
    },
    objective
  };
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

function buildProfiles(beamWidth, branchLimit, exactBudget) {
  return [
    {
      id: 'strict-balanced',
      mode: SEARCH_MODE.STRICT,
      strategy: 'balanced',
      beamWidth: Math.max(8, beamWidth),
      branchLimit: Math.max(4, branchLimit),
      exactBudget: Math.max(1200, Math.floor(exactBudget * 0.25)),
      lookaheadLimit: 7,
      progressStart: 0.06,
      progressSpan: 0.31,
      label: 'Null-Rot-Suche'
    },
    {
      id: 'strict-coverage',
      mode: SEARCH_MODE.STRICT,
      strategy: 'coverage',
      beamWidth: Math.max(96, beamWidth * 2),
      branchLimit: Math.max(18, branchLimit + 6),
      exactBudget: Math.max(5000, Math.floor(exactBudget * 0.75)),
      lookaheadLimit: 11,
      progressStart: 0.38,
      progressSpan: 0.29,
      label: 'Vertiefte Null-Rot-Suche'
    },
    {
      id: 'confirmable-balanced',
      mode: SEARCH_MODE.CONFIRMABLE,
      strategy: 'balanced',
      beamWidth: Math.max(160, beamWidth * 3),
      branchLimit: Math.max(22, branchLimit + 10),
      exactBudget: Math.max(9000, exactBudget),
      lookaheadLimit: 9,
      progressStart: 0.70,
      progressSpan: 0.19,
      label: 'Minimal-Rot-Suche'
    }
  ];
}

export async function buildAutoPlan({
  state,
  monthData,
  year = monthData?.year,
  month = monthData?.month,
  beamWidth = DEFAULT_BEAM_WIDTH,
  branchLimit = DEFAULT_BRANCH_LIMIT,
  exactBudget = DEFAULT_EXACT_BUDGET,
  onProgress = null,
  signal = null
}) {
  if (!state || !monthData || !Number.isInteger(year) || !Number.isInteger(month)) {
    throw new TypeError('Auto-Plan benötigt Zustand, Monatsdaten, Jahr und Monat.');
  }
  abortIfRequested(signal);

  const baseline = clone(monthData);
  const slots = openSlots(baseline);
  const fixed = fixedAssignmentCount(baseline);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const profiles = buildProfiles(beamWidth, branchLimit, exactBudget);
  const attempts = [];
  let best = {
    node: emptyNode(clone(baseline)),
    objective: finalObjective(state, baseline, baseline)
  };
  let selectedProfile = profiles[0];

  await report(onProgress, {
    phase: 'analysis',
    progress: 0.025,
    message: `${fixed} Fixpunkte geschützt · ${slots.length} offene BD/HG-Felder`,
    fixed,
    total: slots.length,
    exploredNodes: 0,
    generatedNodes: 0,
    deadEnds: 0
  });
  await yieldToBrowser();

  if (slots.length === 0) {
    const result = {
      success: true,
      complete: true,
      requiresConfirmation: false,
      status: 'clean',
      year,
      month,
      baselineFingerprint: planningFingerprint(state, baseline),
      baseline,
      plannedMonth: clone(baseline),
      changes: [],
      redViolations: [],
      fixedAssignments: fixed,
      openSlots: 0,
      elapsedMs: 0,
      metrics: {
        proposed: 0,
        unfilled: 0,
        red: 0,
        specialRed: 0,
        gray: 0,
        orange: 0,
        yellow: 0,
        wishesFulfilled: 0,
        wishesPossible: 0,
        fairnessIndex: fairnessIndex(best.objective),
        bdTargetPenalty: Number(best.objective.fairness.bdPenalty.toFixed(2)),
        combinedLoadVariance: Number(best.objective.fairness.combinedVariance.toFixed(3)),
        aaHgVariance: Number(best.objective.fairness.aaHgVariance.toFixed(3)),
        weekendVariance: Number(best.objective.fairness.weekendVariance.toFixed(3)),
        exploredNodes: 0,
        generatedNodes: 0,
        candidateEvaluations: 0,
        deadEnds: 0,
        exactNodes: 0,
        improvements: 0,
        swapChecks: 0,
        maxBeam: 1,
        attempts: []
      },
      audit: []
    };
    await report(onProgress, {
      phase: 'complete',
      progress: 1,
      message: 'Keine offenen BD/HG-Felder · bestehender Monat ist vollständig',
      result
    });
    return result;
  }

  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    if (profile.mode === SEARCH_MODE.CONFIRMABLE
      && best.objective.unfilled === 0
      && best.objective.audit.red === 0
      && best.objective.audit.gray === 0) {
      break;
    }

    if (profile.mode === SEARCH_MODE.CONFIRMABLE) {
      await report(onProgress, {
        phase: 'repair',
        progress: profile.progressStart - 0.015,
        message: 'Keine vollständige Null-Rot-Variante gefunden · bestätigbarer Minimal-Rot-Fallback startet'
      });
      await yieldToBrowser();
    } else if (index > 0) {
      await report(onProgress, {
        phase: 'propagate',
        progress: profile.progressStart - 0.015,
        message: 'Suchraum wird verbreitert · stärkere Constraint-Propagation und alternative Kandidatenordnung'
      });
      await yieldToBrowser();
    }

    const attempt = await runSearchPass({
      state,
      baseline,
      slots,
      mode: profile.mode,
      strategy: profile.strategy,
      beamWidth: profile.beamWidth,
      branchLimit: profile.branchLimit,
      exactBudget: profile.exactBudget,
      lookaheadLimit: profile.lookaheadLimit,
      onProgress,
      signal,
      progressStart: profile.progressStart,
      progressSpan: profile.progressSpan,
      label: profile.label,
      passIndex: index + 1
    });
    attempts.push(attempt.stats);

    if (attempt.best && (
      compareVectors(attempt.best.objective.key, best.objective.key) < 0
      || (profile.mode === SEARCH_MODE.STRICT
        && attempt.best.objective.unfilled === 0
        && attempt.best.objective.audit.red === 0
        && attempt.best.objective.audit.gray === 0)
    )) {
      best = attempt.best;
      selectedProfile = profile;
    }

    if (attempt.best
      && attempt.best.objective.unfilled === 0
      && attempt.best.objective.audit.gray === 0
      && (profile.mode === SEARCH_MODE.CONFIRMABLE || attempt.best.objective.audit.red === 0)) {
      best = attempt.best;
      selectedProfile = profile;
      if (profile.mode === SEARCH_MODE.STRICT) break;
    }
  }

  abortIfRequested(signal);
  const aggregateStats = attempts.reduce((sum, attempt) => ({
    exploredNodes: sum.exploredNodes + Number(attempt.exploredNodes || 0),
    generatedNodes: sum.generatedNodes + Number(attempt.generatedNodes || 0),
    candidateEvaluations: sum.candidateEvaluations + Number(attempt.candidateEvaluations || 0),
    deadEnds: sum.deadEnds + Number(attempt.deadEnds || 0),
    exactNodes: sum.exactNodes + Number(attempt.exactNodes || 0),
    maxBeam: Math.max(sum.maxBeam, Number(attempt.maxBeam || 0)),
    improvements: 0,
    swapChecks: 0
  }), {
    exploredNodes: 0,
    generatedNodes: 0,
    candidateEvaluations: 0,
    deadEnds: 0,
    exactNodes: 0,
    maxBeam: 0,
    improvements: 0,
    swapChecks: 0
  });

  best = await polishPlan({
    state,
    baseline,
    best,
    mode: selectedProfile.mode,
    onProgress,
    signal,
    stats: aggregateStats
  });

  await report(onProgress, {
    phase: 'audit',
    progress: 0.98,
    message: 'Vollständiger Schlussaudit aller vorgeschlagenen BD/HG-Einteilungen',
    exploredNodes: aggregateStats.exploredNodes,
    generatedNodes: aggregateStats.generatedNodes,
    deadEnds: aggregateStats.deadEnds,
    exactNodes: aggregateStats.exactNodes,
    improvements: aggregateStats.improvements
  });
  await yieldToBrowser();

  const changes = proposedAssignments(best.node.monthData, baseline);
  const objective = finalObjective(state, best.node.monthData, baseline);
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
  const complete = objective.audit.gray === 0
    && objective.unfilled === 0
    && changes.length === slots.length;
  const requiresConfirmation = complete && objective.audit.red > 0;
  const status = !complete ? 'blocked' : requiresConfirmation ? 'confirmation_required' : 'clean';
  const redViolations = objective.audit.entries
    .filter(entry => entry.evaluation.level === 'red')
    .map(redViolation);

  const result = {
    success: complete,
    complete,
    requiresConfirmation,
    status,
    searchProfile: selectedProfile.id,
    year,
    month,
    baselineFingerprint: planningFingerprint(state, baseline),
    baseline,
    plannedMonth: clone(best.node.monthData),
    changes,
    redViolations,
    fixedAssignments: fixed,
    openSlots: slots.length,
    elapsedMs: Math.round(elapsed),
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
      exploredNodes: aggregateStats.exploredNodes,
      generatedNodes: aggregateStats.generatedNodes,
      candidateEvaluations: aggregateStats.candidateEvaluations,
      deadEnds: aggregateStats.deadEnds,
      exactNodes: aggregateStats.exactNodes,
      improvements: aggregateStats.improvements,
      swapChecks: aggregateStats.swapChecks,
      maxBeam: aggregateStats.maxBeam,
      attempts
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

  await report(onProgress, {
    phase: complete ? 'complete' : 'blocked',
    progress: 1,
    message: status === 'clean'
      ? `${changes.length} Vorschläge · 0 rote Konflikte · Fairness ${result.metrics.fairnessIndex}%`
      : status === 'confirmation_required'
        ? `${changes.length} Vorschläge vollständig · ${result.metrics.red} rote Ausnahmen benötigen Bestätigung`
        : `Keine vollständige technisch wählbare Belegung · ${result.metrics.unfilled} Felder offen`,
    exploredNodes: aggregateStats.exploredNodes,
    generatedNodes: aggregateStats.generatedNodes,
    deadEnds: aggregateStats.deadEnds,
    exactNodes: aggregateStats.exactNodes,
    improvements: aggregateStats.improvements,
    result
  });
  return result;
}

export function applyAutoPlanProposal({
  state,
  currentMonth,
  proposal,
  confirmation = null
}) {
  if (!state || !currentMonth || !proposal?.success || !proposal?.complete) {
    throw new Error('Nur ein vollständiger Auto-Plan kann übernommen werden.');
  }
  if (planningFingerprint(state, currentMonth) !== proposal.baselineFingerprint) {
    throw new Error('Planungsdaten, Personal oder geladene Nachbarmonate wurden seit der Berechnung verändert. Auto-Plan bitte neu berechnen.');
  }

  const merged = clone(currentMonth);
  const seen = new Set();
  for (const change of proposal.changes || []) {
    const key = `${change.dateIso}|${change.role}`;
    if (seen.has(key)) throw new Error(`Doppelter Auto-Plan-Vorschlag für ${key}.`);
    seen.add(key);
    if (!ROLE_ORDER.includes(change.role) || !merged.days?.[change.dateIso]) {
      throw new Error(`Ungültiger Auto-Plan-Vorschlag für ${key}.`);
    }
    if (!change.staffId || typeof change.staffId !== 'string') {
      throw new Error(`Auto-Plan-Vorschlag ohne gültige Personal-ID für ${key}.`);
    }
    if (merged.days[change.dateIso][change.role]) {
      throw new Error(`Fixpunkt ${change.role.toUpperCase()} ${change.dateIso} wurde zwischenzeitlich belegt.`);
    }
    setAssignment(merged, change.dateIso, change.role, change.staffId);
  }

  const audit = auditProposal(state, merged, currentMonth);
  const unfilled = openSlots(merged).length;
  if (audit.gray > 0 || unfilled > 0 || audit.entries.length !== proposal.changes.length) {
    throw new Error('Die erneute Regelprüfung hat eine nicht überschreibbare oder unvollständige Belegung erkannt.');
  }
  if (audit.red > 0 && confirmation?.accepted !== true) {
    throw new Error(`${audit.red} rote Auto-Plan-Ausnahmen müssen ausdrücklich bestätigt werden.`);
  }
  if (audit.specialRed > 0 && !String(confirmation?.comment || '').trim()) {
    throw new Error('Für besonders bestätigungspflichtige rote Auto-Plan-Ausnahmen ist ein begründender Kommentar erforderlich.');
  }

  if (audit.red > 0) {
    const timestamp = new Date().toISOString();
    const comment = String(confirmation?.comment || '').trim();
    merged.overrideLog ||= [];
    for (const entry of audit.entries.filter(item => item.evaluation.level === 'red')) {
      merged.overrideLog.push({
        timestamp,
        dateIso: entry.dateIso,
        role: entry.role,
        staffId: entry.staffId,
        reasons: entry.evaluation.reasons || [],
        comment,
        source: 'auto-plan',
        confirmationType: entry.evaluation.meta?.confirmationType || 'standard'
      });
    }
  }

  return merged;
}