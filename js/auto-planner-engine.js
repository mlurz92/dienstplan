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
const FOCUS_VALUES = new Set(['balanced', 'wishes', 'workload', 'weekends']);
const INTENSITY_VALUES = new Set(['standard', 'deep', 'maximum']);
const EPSILON = 1e-9;
const MAX_EXACT_REMAINING = 7;
const PRESETS = Object.freeze({
  standard: { beam: 48, branch: 10, deepBeam: 96, deepBranch: 15, fallbackBeam: 128, fallbackBranch: 18, exact: 3200, lookahead: 6, polish: 1 },
  deep: { beam: 72, branch: 14, deepBeam: 144, deepBranch: 20, fallbackBeam: 192, fallbackBranch: 24, exact: 9000, lookahead: 10, polish: 2 },
  maximum: { beam: 112, branch: 20, deepBeam: 224, deepBranch: 28, fallbackBeam: 320, fallbackBranch: 32, exact: 22000, lookahead: 14, polish: 3 }
});

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));
const keyForMonth = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
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

function simulatedState(state, monthData) {
  const months = new Map(state?.months || []);
  months.set(keyForMonth(monthData.year, monthData.month), monthData);
  return { ...state, months, currentYear: monthData.year, currentMonth: monthData.month };
}

function monthDates(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function openSlots(monthData) {
  const result = [];
  for (const role of ROLE_ORDER) {
    for (const dateIso of monthDates(monthData)) {
      if (!monthData.days?.[dateIso]?.[role]) result.push({ dateIso, role });
    }
  }
  return result;
}

function fixedAssignmentCount(monthData) {
  return Object.values(monthData?.days || {}).reduce((sum, day) =>
    sum + Number(Boolean(day?.bd)) + Number(Boolean(day?.hg)), 0);
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
  return JSON.stringify(stableValue({
    currentKey,
    staff: Array.isArray(state?.staff) ? state.staff : [],
    months: [...months.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, relevantMonthSnapshot(value)])
  }));
}

function monthPlanningStaff(state, monthData) {
  const result = new Map();
  for (const dateIso of monthDates(monthData)) {
    for (const person of getPlanningStaff(state?.staff || [], dateIso)) result.set(person.id, person);
  }
  return [...result.values()];
}

function normalizeCap(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function createDefaultAutoPlanConfig(state, monthData) {
  return {
    searchIntensity: 'deep',
    optimizationFocus: 'balanced',
    allowRedFallback: true,
    maxRedViolations: null,
    staffLimits: Object.fromEntries(monthPlanningStaff(state, monthData).map(person => [person.id, {
      maxBd: normalizeCap(person.maxBd),
      maxHg: null,
      maxTotal: null
    }]))
  };
}

export function normalizeAutoPlanConfig(state, monthData, input = null) {
  const defaults = createDefaultAutoPlanConfig(state, monthData);
  const source = input && typeof input === 'object' ? input : {};
  const staffLimits = {};
  for (const person of monthPlanningStaff(state, monthData)) {
    const supplied = source.staffLimits?.[person.id] || {};
    staffLimits[person.id] = {
      maxBd: supplied.maxBd === undefined ? defaults.staffLimits[person.id]?.maxBd ?? null : normalizeCap(supplied.maxBd),
      maxHg: normalizeCap(supplied.maxHg),
      maxTotal: normalizeCap(supplied.maxTotal)
    };
  }
  return {
    searchIntensity: INTENSITY_VALUES.has(source.searchIntensity) ? source.searchIntensity : defaults.searchIntensity,
    optimizationFocus: FOCUS_VALUES.has(source.optimizationFocus) ? source.optimizationFocus : defaults.optimizationFocus,
    allowRedFallback: source.allowRedFallback === undefined ? defaults.allowRedFallback : source.allowRedFallback === true,
    maxRedViolations: normalizeCap(source.maxRedViolations),
    staffLimits
  };
}

export function autoPlanConfigFingerprint(config) {
  return JSON.stringify(stableValue(config));
}

export function validateAutoPlanConfig(state, monthData, input = null) {
  const config = normalizeAutoPlanConfig(state, monthData, input);
  const errors = [];
  for (const person of monthPlanningStaff(state, monthData)) {
    const limits = config.staffLimits[person.id] || {};
    const bd = countRoleInMonth(monthData, person.id, 'bd');
    const hg = countRoleInMonth(monthData, person.id, 'hg');
    const total = bd + hg;
    if (limits.maxBd !== null && limits.maxBd < bd) {
      errors.push(`${person.short || person.name}: BD-Obergrenze ${limits.maxBd} liegt unter ${bd} bestehenden BD.`);
    }
    if (limits.maxHg !== null && limits.maxHg < hg) {
      errors.push(`${person.short || person.name}: HG-Obergrenze ${limits.maxHg} liegt unter ${hg} bestehenden HG.`);
    }
    if (limits.maxTotal !== null && limits.maxTotal < total) {
      errors.push(`${person.short || person.name}: Gesamtobergrenze ${limits.maxTotal} liegt unter ${total} bestehenden Diensten.`);
    }
    if (limits.maxTotal !== null && limits.maxBd !== null && limits.maxBd > limits.maxTotal) {
      errors.push(`${person.short || person.name}: BD-Obergrenze darf die Gesamtobergrenze nicht überschreiten.`);
    }
    if (limits.maxTotal !== null && limits.maxHg !== null && limits.maxHg > limits.maxTotal) {
      errors.push(`${person.short || person.name}: HG-Obergrenze darf die Gesamtobergrenze nicht überschreiten.`);
    }
  }
  return { valid: errors.length === 0, errors, config };
}

function vectorOf(evaluation) {
  const vector = evaluation?.meta?.recommendationVector;
  return Array.isArray(vector) ? vector.map(value => Number(value) || 0) : [0, 0, 0, 0, 0, 0];
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

function limitsAudit(monthData, config) {
  const violations = [];
  for (const [staffId, limits] of Object.entries(config.staffLimits || {})) {
    const bd = countRoleInMonth(monthData, staffId, 'bd');
    const hg = countRoleInMonth(monthData, staffId, 'hg');
    if (limits.maxBd !== null && bd > limits.maxBd) violations.push(`${staffId}: ${bd} BD > ${limits.maxBd}`);
    if (limits.maxHg !== null && hg > limits.maxHg) violations.push(`${staffId}: ${hg} HG > ${limits.maxHg}`);
    if (limits.maxTotal !== null && bd + hg > limits.maxTotal) violations.push(`${staffId}: ${bd + hg} Dienste > ${limits.maxTotal}`);
  }
  return violations;
}

function candidateKey(candidate, role, strategy) {
  const meta = candidate.evaluation?.meta || {};
  const vector = vectorOf(candidate.evaluation);
  const load = role === 'bd' ? Number(meta.currentBd || 0) : Number(meta.combinedLoad || 0);
  const aaHg = role === 'hg' ? Number(meta.aaHgCount || 0) : 0;
  const currentHg = role === 'hg' ? Number(meta.currentHg || 0) : 0;
  return strategy === 'coverage'
    ? [LEVEL_RANK[candidate.evaluation?.level] ?? 9, -vector[0], load, aaHg, currentHg, ...vector.slice(1).map(value => -value), candidate.order]
    : [LEVEL_RANK[candidate.evaluation?.level] ?? 9, ...vector.map(value => -value), load, aaHg, currentHg, candidate.order];
}

function createCandidateResolver(state, mode, strategy, config, stats) {
  const cache = new WeakMap();
  return (monthData, dateIso, role) => {
    let monthCache = cache.get(monthData);
    if (!monthCache) {
      monthCache = new Map();
      cache.set(monthData, monthCache);
    }
    const key = `${dateIso}|${role}`;
    if (monthCache.has(key)) return monthCache.get(key);
    const sandbox = simulatedState(state, monthData);
    const planningStaff = getPlanningStaff(sandbox.staff, dateIso);
    const candidates = planningStaff.map((person, order) => ({
      person,
      order,
      evaluation: evaluateCandidate({ state: sandbox, monthData, dateIso, role, staffId: person.id })
    })).filter(candidate => {
      stats.candidateEvaluations += 1;
      if (candidate.evaluation?.canSelect === false || candidate.evaluation?.level === 'gray') return false;
      if (mode === SEARCH_MODE.STRICT && candidate.evaluation?.level === 'red') return false;
      if (!respectsLimits(monthData, candidate.person.id, role, config)) {
        stats.limitRejects += 1;
        return false;
      }
      return true;
    }).sort((left, right) => compareVectors(candidateKey(left, role, strategy), candidateKey(right, role, strategy)));
    monthCache.set(key, candidates);
    return candidates;
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

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function fairnessSnapshot(state, monthData) {
  const staff = monthPlanningStaff(state, monthData);
  const dates = monthDates(monthData);
  const bdPenalty = staff.reduce((sum, person) => {
    const deviation = countRoleInMonth(monthData, person.id, 'bd') - Number(person.bdTarget || 0);
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);
  const specialists = staff.filter(person => dates.some(dateIso => getRoleProperties(person, dateIso).canHg));
  const sandbox = simulatedState(state, monthData);
  return {
    bdPenalty,
    combinedVariance: variance(specialists.map(person => countRoleInMonth(monthData, person.id, 'bd') + countRoleInMonth(monthData, person.id, 'hg'))),
    aaHgVariance: variance(specialists.map(person => countHgForAaBdExcept(sandbox, monthData, person.id, ''))),
    weekendVariance: variance(staff.map(person => computeWeekendEquivalent(monthData, person.id)))
  };
}

function saturdayVariance(state, monthData) {
  const saturdays = monthDates(monthData).filter(dateIso => parseIso(dateIso).getDay() === 6);
  const eligible = monthPlanningStaff(state, monthData).filter(person =>
    saturdays.some(dateIso => getRoleProperties(person, dateIso).canSaturdayBd));
  return variance(eligible.map(person => saturdays.filter(dateIso => monthData.days?.[dateIso]?.bd === person.id).length));
}

function wishSnapshot(state, monthData, baseline) {
  let possible = 0;
  let fulfilled = 0;
  const baselineState = simulatedState(state, baseline);
  for (const dateIso of monthDates(monthData)) {
    for (const role of ROLE_ORDER) {
      if (baseline.days?.[dateIso]?.[role]) continue;
      const assigned = monthData.days?.[dateIso]?.[role] || '';
      for (const person of getPlanningStaff(state.staff, dateIso)) {
        if (!isPositivePreference(getPreference(monthData, person.id, dateIso), role)) continue;
        const evaluation = evaluateCandidate({ state: baselineState, monthData: baseline, dateIso, role, staffId: person.id });
        if (evaluation.level === 'gray' || evaluation.canSelect === false) continue;
        possible += 1;
        if (assigned === person.id) fulfilled += 1;
      }
    }
  }
  return { possible, fulfilled, missed: Math.max(0, possible - fulfilled) };
}

function softObjectiveKey(config, audit, wishes, fairness, weekendSpread) {
  const common = [-audit.recommendation[0], -audit.recommendation[1], -audit.recommendation[2]];
  if (config.optimizationFocus === 'wishes') {
    return [-wishes.fulfilled, ...common, fairness.bdPenalty, fairness.combinedVariance, fairness.aaHgVariance, fairness.weekendVariance, weekendSpread];
  }
  if (config.optimizationFocus === 'workload') {
    return [fairness.bdPenalty, fairness.combinedVariance, fairness.aaHgVariance, -wishes.fulfilled, ...common, fairness.weekendVariance, weekendSpread];
  }
  if (config.optimizationFocus === 'weekends') {
    return [fairness.weekendVariance, weekendSpread, -wishes.fulfilled, ...common, fairness.bdPenalty, fairness.combinedVariance, fairness.aaHgVariance];
  }
  return [...common, -wishes.fulfilled, fairness.bdPenalty, fairness.combinedVariance, fairness.aaHgVariance, fairness.weekendVariance, weekendSpread];
}

function finalObjective(state, monthData, baseline, config) {
  const audit = auditProposal(state, monthData, baseline);
  const fairness = fairnessSnapshot(state, monthData);
  const wishes = wishSnapshot(state, monthData, baseline);
  const unfilled = openSlots(monthData).length;
  const limitViolations = limitsAudit(monthData, config).length;
  const redLimitExceeded = config.maxRedViolations !== null && audit.red > config.maxRedViolations;
  return {
    audit, fairness, wishes, unfilled, limitViolations, redLimitExceeded,
    key: [
      limitViolations,
      audit.gray,
      unfilled,
      redLimitExceeded ? 1 : 0,
      audit.red,
      audit.specialRed,
      audit.orange,
      audit.yellow,
      ...softObjectiveKey(config, audit, wishes, fairness, saturdayVariance(state, monthData)),
      -audit.recommendation[3],
      -audit.recommendation[4],
      -audit.recommendation[5]
    ]
  };
}

function partialObjective(state, node, baseline, config, flexibility = null) {
  const objective = finalObjective(state, node.monthData, baseline, config);
  return {
    ...objective,
    key: [
      objective.limitViolations,
      objective.audit.gray,
      objective.redLimitExceeded ? 1 : 0,
      objective.audit.red,
      objective.audit.specialRed,
      objective.audit.orange,
      objective.audit.yellow,
      flexibility?.blocked ? 1 : 0,
      -(flexibility?.minimumDomain || 0),
      -(flexibility?.domainProduct || 0),
      ...softObjectiveKey(config, objective.audit, objective.wishes, objective.fairness, saturdayVariance(state, node.monthData))
    ]
  };
}

function emptyNode(monthData) {
  return { monthData, trace: [], depth: 0 };
}

function assignNode(node, slot, candidate) {
  const monthData = clone(node.monthData);
  setAssignment(monthData, slot.dateIso, slot.role, candidate.person.id);
  return {
    monthData,
    trace: [...node.trace, { ...slot, staffId: candidate.person.id, level: candidate.evaluation.level, reasons: candidate.evaluation.reasons || [] }],
    depth: node.depth + 1
  };
}

function signature(monthData, baseline) {
  return openSlots(baseline).map(slot => `${slot.dateIso}:${slot.role}:${monthData.days?.[slot.dateIso]?.[slot.role] || ''}`).join('|');
}

function selectBest(state, nodes, baseline, config) {
  const ranked = nodes.map(node => ({ node, objective: finalObjective(state, node.monthData, baseline, config) }));
  ranked.sort((left, right) => compareVectors(left.objective.key, right.objective.key)
    || signature(left.node.monthData, baseline).localeCompare(signature(right.node.monthData, baseline)));
  return ranked[0] || null;
}

function slotCriticality(slot) {
  const weekday = parseIso(slot.dateIso).getDay();
  if (slot.role === 'bd' && weekday === 6) return 0;
  if (weekday === 5 || weekday === 0) return 1;
  return 2;
}

function selectNextSlot(node, remaining, candidatesFor) {
  return remaining.map(slot => ({ slot, domain: candidatesFor(node.monthData, slot.dateIso, slot.role).length }))
    .sort((left, right) => left.domain - right.domain
      || slotCriticality(left.slot) - slotCriticality(right.slot)
      || left.slot.dateIso.localeCompare(right.slot.dateIso)
      || ROLE_ORDER.indexOf(left.slot.role) - ROLE_ORDER.indexOf(right.slot.role))[0] || null;
}

function flexibility(node, futureSlots, candidatesFor, limit) {
  if (!futureSlots.length) return { blocked: false, minimumDomain: 99, domainProduct: 0 };
  let minimumDomain = Infinity;
  let domainProduct = 0;
  for (const slot of futureSlots.slice(0, Math.max(1, limit))) {
    const count = candidatesFor(node.monthData, slot.dateIso, slot.role).length;
    if (!count) return { blocked: true, minimumDomain: 0, domainProduct };
    minimumDomain = Math.min(minimumDomain, count);
    domainProduct += Math.log1p(count);
  }
  return { blocked: false, minimumDomain, domainProduct };
}

function admissible(objective, mode) {
  if (objective.limitViolations || objective.audit.gray || objective.redLimitExceeded) return false;
  return mode === SEARCH_MODE.CONFIRMABLE || objective.audit.red === 0;
}

function pruneBeam({ state, nodes, baseline, config, mode, futureSlots, candidatesFor, width, lookahead, stats }) {
  const pre = nodes.map(node => ({ node, objective: partialObjective(state, node, baseline, config) }))
    .filter(entry => admissible(entry.objective, mode))
    .sort((left, right) => compareVectors(left.objective.key, right.objective.key)
      || signature(left.node.monthData, baseline).localeCompare(signature(right.node.monthData, baseline)))
    .slice(0, Math.max(width, Math.ceil(width * 1.8)));
  const ranked = [];
  for (const entry of pre) {
    const forward = flexibility(entry.node, futureSlots, candidatesFor, lookahead);
    if (forward.blocked) {
      stats.deadEnds += 1;
      continue;
    }
    ranked.push({ node: entry.node, objective: partialObjective(state, entry.node, baseline, config, forward), signature: signature(entry.node.monthData, baseline) });
  }
  ranked.sort((left, right) => compareVectors(left.objective.key, right.objective.key) || left.signature.localeCompare(right.signature));
  const seen = new Set();
  const result = [];
  for (const entry of ranked) {
    if (seen.has(entry.signature)) continue;
    seen.add(entry.signature);
    result.push(entry.node);
    if (result.length >= width) break;
  }
  stats.maxBeam = Math.max(stats.maxBeam, result.length);
  return result;
}

function exactComplete({ state, seeds, baseline, config, mode, candidatesFor, budget, signal, stats }) {
  let best = null;
  let visited = 0;
  const visit = node => {
    abortIfRequested(signal);
    if (visited >= budget) return;
    visited += 1;
    stats.exactNodes += 1;
    const remaining = openSlots(node.monthData);
    if (!remaining.length) {
      const candidate = { node, objective: finalObjective(state, node.monthData, baseline, config) };
      if (!admissible(candidate.objective, mode)) return;
      if (!best || compareVectors(candidate.objective.key, best.objective.key) < 0
        || (compareVectors(candidate.objective.key, best.objective.key) === 0
          && signature(candidate.node.monthData, baseline).localeCompare(signature(best.node.monthData, baseline)) < 0)) best = candidate;
      return;
    }
    const selected = selectNextSlot(node, remaining, candidatesFor);
    if (!selected?.domain) {
      stats.deadEnds += 1;
      return;
    }
    for (const candidate of candidatesFor(node.monthData, selected.slot.dateIso, selected.slot.role)) {
      if (visited >= budget) break;
      const next = assignNode(node, selected.slot, candidate);
      const objective = partialObjective(state, next, baseline, config);
      if (!admissible(objective, mode)) {
        stats.deadEnds += 1;
        continue;
      }
      visit(next);
    }
  };
  for (const seed of seeds) {
    if (openSlots(seed.monthData).length <= MAX_EXACT_REMAINING) visit(seed);
    if (visited >= budget) break;
  }
  return best;
}

async function runPass({ state, baseline, config, mode, strategy, width, branch, exactBudget, lookahead, label, progressStart, progressSpan, passIndex, onProgress, signal }) {
  const stats = { id: `${mode}-${strategy}-${passIndex}`, mode, strategy, beamWidth: width, branchLimit: branch, exploredNodes: 0, generatedNodes: 0, candidateEvaluations: 0, limitRejects: 0, deadEnds: 0, exactNodes: 0, maxBeam: 1, complete: false };
  const candidatesFor = createCandidateResolver(state, mode, strategy, config, stats);
  let beam = [emptyNode(clone(baseline))];
  const allSlots = openSlots(baseline);
  let processed = 0;

  for (const role of ROLE_ORDER) {
    let remaining = allSlots.filter(slot => slot.role === role);
    while (remaining.length && beam.length) {
      abortIfRequested(signal);
      const selected = selectNextSlot(beam[0], remaining, candidatesFor);
      if (!selected?.domain) {
        stats.deadEnds += beam.length;
        beam = [];
        break;
      }
      const slot = selected.slot;
      const roleRemaining = remaining.filter(item => item.dateIso !== slot.dateIso || item.role !== slot.role);
      const future = [...roleRemaining, ...allSlots.filter(item => ROLE_ORDER.indexOf(item.role) > ROLE_ORDER.indexOf(role))]
        .sort((left, right) => slotCriticality(left) - slotCriticality(right) || left.dateIso.localeCompare(right.dateIso));
      const expanded = [];
      let candidateCount = 0;
      for (const node of beam) {
        const candidates = candidatesFor(node.monthData, slot.dateIso, slot.role);
        candidateCount = Math.max(candidateCount, candidates.length);
        stats.exploredNodes += 1;
        for (const candidate of candidates.slice(0, branch)) {
          expanded.push(assignNode(node, slot, candidate));
          stats.generatedNodes += 1;
        }
      }
      beam = pruneBeam({ state, nodes: expanded, baseline, config, mode, futureSlots: future, candidatesFor, width, lookahead, stats });
      remaining = roleRemaining;
      processed += 1;
      await report(onProgress, {
        phase: 'search', subphase: role, progress: progressStart + processed / Math.max(1, allSlots.length) * progressSpan,
        message: `${label} · ${role.toUpperCase()} ${slot.dateIso}: ${candidateCount} Kandidaten · ${beam.length} Varianten`,
        dateIso: slot.dateIso, role, processed, total: allSlots.length, candidateCount, beamSize: beam.length,
        exploredNodes: stats.exploredNodes, generatedNodes: stats.generatedNodes, deadEnds: stats.deadEnds, limitRejects: stats.limitRejects, passIndex
      });
      await yieldToBrowser();
    }
  }

  let best = selectBest(state, beam.length ? beam : [emptyNode(clone(baseline))], baseline, config);
  if (best?.objective.unfilled > 0 && beam.length) {
    const exact = exactComplete({ state, seeds: beam.slice(0, 8), baseline, config, mode, candidatesFor, budget: exactBudget, signal, stats });
    if (exact && compareVectors(exact.objective.key, best.objective.key) < 0) best = exact;
  }
  stats.complete = Boolean(best && !best.objective.unfilled && admissible(best.objective, mode));
  return { best, stats };
}

function clearAssignment(monthData, dateIso, role) {
  if (monthData?.days?.[dateIso]) monthData.days[dateIso][role] = '';
}

async function polish({ state, baseline, best, config, mode, passes, onProgress, signal, stats }) {
  if (!best || best.objective.unfilled || !admissible(best.objective, mode)) return best;
  let monthData = clone(best.node.monthData);
  let objective = finalObjective(state, monthData, baseline, config);
  let improvements = 0;
  let swapChecks = 0;
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    for (const change of proposedAssignments(monthData, baseline)) {
      abortIfRequested(signal);
      const current = monthData.days[change.dateIso][change.role];
      const cleared = clone(monthData);
      clearAssignment(cleared, change.dateIso, change.role);
      const localStats = { candidateEvaluations: 0, limitRejects: 0 };
      const candidatesFor = createCandidateResolver(state, mode, 'balanced', config, localStats);
      for (const candidate of candidatesFor(cleared, change.dateIso, change.role)) {
        if (candidate.person.id === current) continue;
        const trial = clone(cleared);
        setAssignment(trial, change.dateIso, change.role, candidate.person.id);
        const trialObjective = finalObjective(state, trial, baseline, config);
        if (admissible(trialObjective, mode) && compareVectors(trialObjective.key, objective.key) < 0) {
          monthData = trial;
          objective = trialObjective;
          improvements += 1;
          changed = true;
          break;
        }
      }
      stats.candidateEvaluations += localStats.candidateEvaluations;
      stats.limitRejects += localStats.limitRejects;
    }
    const changes = proposedAssignments(monthData, baseline);
    outer: for (let left = 0; left < changes.length; left += 1) {
      for (let right = left + 1; right < changes.length; right += 1) {
        if (swapChecks >= 220) break outer;
        const first = changes[left];
        const second = changes[right];
        if (first.role !== second.role || first.staffId === second.staffId) continue;
        swapChecks += 1;
        const trial = clone(monthData);
        setAssignment(trial, first.dateIso, first.role, second.staffId);
        setAssignment(trial, second.dateIso, second.role, first.staffId);
        const trialObjective = finalObjective(state, trial, baseline, config);
        if (admissible(trialObjective, mode) && compareVectors(trialObjective.key, objective.key) < 0) {
          monthData = trial;
          objective = trialObjective;
          improvements += 1;
          changed = true;
          break outer;
        }
      }
    }
    await report(onProgress, { phase: 'polish', progress: .93 + pass * .012, message: `Fairness-Politur ${pass + 1}/${passes} · ${improvements} Verbesserungen`, improvements, swapChecks });
    await yieldToBrowser();
    if (!changed) break;
  }
  stats.improvements = improvements;
  stats.swapChecks = swapChecks;
  return { node: { ...best.node, monthData }, objective };
}

function profiles(config, overrides) {
  const preset = PRESETS[config.searchIntensity];
  const baseBeam = Number.isInteger(overrides.beamWidth) ? overrides.beamWidth : preset.beam;
  const baseBranch = Number.isInteger(overrides.branchLimit) ? overrides.branchLimit : preset.branch;
  const baseExact = Number.isInteger(overrides.exactBudget) ? overrides.exactBudget : preset.exact;
  const result = [
    { id: 'strict-balanced', mode: SEARCH_MODE.STRICT, strategy: 'balanced', width: Math.max(8, baseBeam), branch: Math.max(4, baseBranch), exact: Math.max(800, Math.floor(baseExact * .35)), lookahead: preset.lookahead, start: .06, span: .30, label: 'Null-Rot-Suche' },
    { id: 'strict-coverage', mode: SEARCH_MODE.STRICT, strategy: 'coverage', width: Math.max(preset.deepBeam, baseBeam * 2), branch: Math.max(preset.deepBranch, baseBranch + 5), exact: Math.max(3000, Math.floor(baseExact * .8)), lookahead: preset.lookahead + 3, start: .37, span: .29, label: 'Vertiefte Null-Rot-Suche' }
  ];
  if (config.allowRedFallback) result.push({ id: 'confirmable-balanced', mode: SEARCH_MODE.CONFIRMABLE, strategy: 'balanced', width: Math.max(preset.fallbackBeam, baseBeam * 3), branch: Math.max(preset.fallbackBranch, baseBranch + 8), exact: Math.max(6000, baseExact), lookahead: preset.lookahead + 1, start: .69, span: .20, label: 'Minimal-Rot-Suche' });
  return result;
}

function fairnessIndex(objective) {
  if (!objective || objective.audit.gray || objective.unfilled || objective.limitViolations) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35 + objective.fairness.combinedVariance * 8 + objective.fairness.aaHgVariance * 5 + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function redViolation(entry) {
  return { dateIso: entry.dateIso, role: entry.role, staffId: entry.staffId, level: entry.evaluation.level, confirmationType: entry.evaluation.meta?.confirmationType || 'standard', reasons: entry.evaluation.reasons || [] };
}

export async function buildAutoPlan({ state, monthData, year = monthData?.year, month = monthData?.month, runConfig = null, beamWidth, branchLimit, exactBudget, onProgress = null, signal = null }) {
  if (!state || !monthData || !Number.isInteger(year) || !Number.isInteger(month)) throw new TypeError('Auto-Plan benötigt Zustand, Monatsdaten, Jahr und Monat.');
  const validation = validateAutoPlanConfig(state, monthData, runConfig);
  if (!validation.valid) throw new Error(`Auto-Plan-Konfiguration ungültig: ${validation.errors.join(' ')}`);
  const config = validation.config;
  const baseline = clone(monthData);
  const slots = openSlots(baseline);
  const fixed = fixedAssignmentCount(baseline);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  abortIfRequested(signal);
  await report(onProgress, { phase: 'analysis', progress: .025, message: `${fixed} Fixpunkte geschützt · ${slots.length} offene BD/HG-Felder`, fixed, total: slots.length, exploredNodes: 0, deadEnds: 0 });
  await yieldToBrowser();

  if (!slots.length) {
    const objective = finalObjective(state, baseline, baseline, config);
    const result = makeResult({ state, baseline, best: { node: emptyNode(clone(baseline)), objective }, config, fixed, slots, attempts: [], startedAt, searchProfile: 'no-op', aggregate: emptyStats() });
    await report(onProgress, { phase: 'complete', progress: 1, message: 'Keine offenen BD/HG-Felder · bestehender Monat ist vollständig', result });
    return result;
  }

  let best = { node: emptyNode(clone(baseline)), objective: finalObjective(state, baseline, baseline, config) };
  let selectedProfile = 'blocked';
  let selectedMode = SEARCH_MODE.STRICT;
  const attempts = [];
  for (const [index, profile] of profiles(config, { beamWidth, branchLimit, exactBudget }).entries()) {
    if (!best.objective.unfilled && !best.objective.audit.red && !best.objective.audit.gray && !best.objective.limitViolations) break;
    if (profile.mode === SEARCH_MODE.CONFIRMABLE) {
      await report(onProgress, { phase: 'repair', progress: profile.start - .012, message: 'Keine vollständige Null-Rot-Variante gefunden · Minimal-Rot-Fallback startet' });
      await yieldToBrowser();
    } else if (index > 0) {
      await report(onProgress, { phase: 'propagate', progress: profile.start - .012, message: 'Suchraum wird verbreitert · stärkere Constraint-Propagation' });
      await yieldToBrowser();
    }
    const attempt = await runPass({ state, baseline, config, mode: profile.mode, strategy: profile.strategy, width: profile.width, branch: profile.branch, exactBudget: profile.exact, lookahead: profile.lookahead, label: profile.label, progressStart: profile.start, progressSpan: profile.span, passIndex: index + 1, onProgress, signal });
    attempts.push(attempt.stats);
    if (attempt.best && (compareVectors(attempt.best.objective.key, best.objective.key) < 0 || attempt.stats.complete)) {
      best = attempt.best;
      selectedProfile = profile.id;
      selectedMode = profile.mode;
    }
    if (attempt.stats.complete && profile.mode === SEARCH_MODE.STRICT) break;
  }

  const aggregate = attempts.reduce((sum, item) => {
    for (const key of ['exploredNodes', 'generatedNodes', 'candidateEvaluations', 'limitRejects', 'deadEnds', 'exactNodes']) sum[key] += Number(item[key] || 0);
    sum.maxBeam = Math.max(sum.maxBeam, Number(item.maxBeam || 0));
    return sum;
  }, emptyStats());
  best = await polish({ state, baseline, best, config, mode: selectedMode, passes: PRESETS[config.searchIntensity].polish, onProgress, signal, stats: aggregate });
  await report(onProgress, { phase: 'audit', progress: .98, message: 'Vollständiger Schlussaudit aller Vorschläge und Laufgrenzen', exploredNodes: aggregate.exploredNodes, deadEnds: aggregate.deadEnds, exactNodes: aggregate.exactNodes, improvements: aggregate.improvements });
  await yieldToBrowser();
  const result = makeResult({ state, baseline, best, config, fixed, slots, attempts, startedAt, searchProfile: selectedProfile, aggregate });
  await report(onProgress, { phase: result.complete ? 'complete' : 'blocked', progress: 1, message: result.status === 'clean' ? `${result.changes.length} Vorschläge · 0 rote Konflikte · Fairness ${result.metrics.fairnessIndex}%` : result.status === 'confirmation_required' ? `${result.changes.length} Vorschläge vollständig · ${result.metrics.red} rote Ausnahmen benötigen Bestätigung` : `Keine vollständige technisch wählbare Belegung · ${result.metrics.unfilled} Felder offen`, exploredNodes: aggregate.exploredNodes, deadEnds: aggregate.deadEnds, exactNodes: aggregate.exactNodes, improvements: aggregate.improvements, result });
  return result;
}

function emptyStats() {
  return { exploredNodes: 0, generatedNodes: 0, candidateEvaluations: 0, limitRejects: 0, deadEnds: 0, exactNodes: 0, maxBeam: 0, improvements: 0, swapChecks: 0 };
}

function makeResult({ state, baseline, best, config, fixed, slots, attempts, startedAt, searchProfile, aggregate }) {
  const objective = finalObjective(state, best.node.monthData, baseline, config);
  const changes = proposedAssignments(best.node.monthData, baseline);
  const complete = !objective.limitViolations && !objective.audit.gray && !objective.unfilled && changes.length === slots.length && !objective.redLimitExceeded;
  const requiresConfirmation = complete && objective.audit.red > 0;
  const status = !complete ? 'blocked' : requiresConfirmation ? 'confirmation_required' : 'clean';
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
  return {
    success: complete,
    complete,
    requiresConfirmation,
    status,
    searchProfile,
    year: baseline.year,
    month: baseline.month,
    baselineFingerprint: planningFingerprint(state, baseline),
    runConfig: clone(config),
    runConfigFingerprint: autoPlanConfigFingerprint(config),
    baseline,
    plannedMonth: clone(best.node.monthData),
    changes,
    redViolations: objective.audit.entries.filter(entry => entry.evaluation.level === 'red').map(redViolation),
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
      ...aggregate,
      attempts
    },
    audit: objective.audit.entries.map(entry => ({ dateIso: entry.dateIso, role: entry.role, staffId: entry.staffId, level: entry.evaluation.level, canSelect: entry.evaluation.canSelect, confirmationType: entry.evaluation.meta?.confirmationType || null, reasons: entry.evaluation.reasons || [] }))
  };
}

export function applyAutoPlanProposal({ state, currentMonth, proposal, confirmation = null }) {
  if (!state || !currentMonth || !proposal?.success || !proposal?.complete) throw new Error('Nur ein vollständiger Auto-Plan kann übernommen werden.');
  if (planningFingerprint(state, currentMonth) !== proposal.baselineFingerprint) throw new Error('Planungsdaten, Personal oder geladene Nachbarmonate wurden seit der Berechnung verändert. Auto-Plan bitte neu berechnen.');
  const validation = validateAutoPlanConfig(state, currentMonth, proposal.runConfig);
  if (!validation.valid || autoPlanConfigFingerprint(validation.config) !== proposal.runConfigFingerprint) throw new Error('Die Auto-Plan-Laufparameter sind ungültig oder wurden verändert.');
  const config = validation.config;
  const merged = clone(currentMonth);
  const seen = new Set();
  for (const change of proposal.changes || []) {
    const key = `${change.dateIso}|${change.role}`;
    if (seen.has(key)) throw new Error(`Doppelter Auto-Plan-Vorschlag für ${key}.`);
    seen.add(key);
    if (!ROLE_ORDER.includes(change.role) || !merged.days?.[change.dateIso]) throw new Error(`Ungültiger Auto-Plan-Vorschlag für ${key}.`);
    if (!change.staffId || typeof change.staffId !== 'string') throw new Error(`Auto-Plan-Vorschlag ohne gültige Personal-ID für ${key}.`);
    if (merged.days[change.dateIso][change.role]) throw new Error(`Fixpunkt ${change.role.toUpperCase()} ${change.dateIso} wurde zwischenzeitlich belegt.`);
    if (!respectsLimits(merged, change.staffId, change.role, config)) throw new Error(`Laufobergrenze für ${change.staffId} würde überschritten.`);
    setAssignment(merged, change.dateIso, change.role, change.staffId);
  }
  const objective = finalObjective(state, merged, currentMonth, config);
  if (objective.limitViolations || objective.audit.gray || objective.unfilled || objective.audit.entries.length !== proposal.changes.length || objective.redLimitExceeded) throw new Error('Die erneute Regelprüfung hat eine nicht überschreibbare, unvollständige oder obergrenzenwidrige Belegung erkannt.');
  if (objective.audit.red > 0 && confirmation?.accepted !== true) throw new Error(`${objective.audit.red} rote Auto-Plan-Ausnahmen müssen ausdrücklich bestätigt werden.`);
  if (objective.audit.specialRed > 0 && !String(confirmation?.comment || '').trim()) throw new Error('Für besonders bestätigungspflichtige rote Auto-Plan-Ausnahmen ist ein begründender Kommentar erforderlich.');
  if (objective.audit.red > 0) {
    const timestamp = new Date().toISOString();
    const comment = String(confirmation?.comment || '').trim();
    merged.overrideLog ||= [];
    for (const entry of objective.audit.entries.filter(item => item.evaluation.level === 'red')) {
      merged.overrideLog.push({ timestamp, dateIso: entry.dateIso, role: entry.role, staffId: entry.staffId, reasons: entry.evaluation.reasons || [], comment, source: 'auto-plan', confirmationType: entry.evaluation.meta?.confirmationType || 'standard' });
    }
  }
  return merged;
}