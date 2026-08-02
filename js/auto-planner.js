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
const DEFAULT_BEAM_WIDTH = 42;
const DEFAULT_BRANCH_LIMIT = 6;
const SCORE_EPSILON = 1e-9;

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function stateForMonth(state, year, month, monthData) {
  const months = new Map(state.months || []);
  months.set(monthKey(year, month), monthData);
  return { ...state, months, currentYear: year, currentMonth: month };
}

function assertNotAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Auto-Plan wurde abgebrochen.');
  error.name = 'AbortError';
  throw error;
}

function browserYield() {
  if (typeof scheduler === 'object' && typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof requestAnimationFrame === 'function') return new Promise(resolve => requestAnimationFrame(() => resolve()));
  return Promise.resolve();
}

async function emitProgress(onProgress, payload) {
  if (typeof onProgress !== 'function') return;
  await onProgress(payload);
}

function openSlots(monthData) {
  const dates = Object.keys(monthData?.days || {}).sort();
  const slots = [];
  for (const role of ROLE_ORDER) {
    for (const dateIso of dates) {
      if (!monthData.days[dateIso]?.[role]) slots.push({ dateIso, role });
    }
  }
  return slots;
}

function fixedAssignments(monthData) {
  let count = 0;
  for (const day of Object.values(monthData?.days || {})) {
    if (day?.bd) count += 1;
    if (day?.hg) count += 1;
  }
  return count;
}

export function fingerprintMonth(monthData) {
  const compactDays = Object.entries(monthData?.days || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([iso, day]) => [iso, day?.bd || '', day?.hg || '']);
  return JSON.stringify({
    year: monthData?.year,
    month: monthData?.month,
    revision: monthData?.revision || 0,
    updatedAt: monthData?.updatedAt || null,
    days: compactDays
  });
}

function recommendationVector(evaluation) {
  const raw = evaluation?.meta?.recommendationVector;
  return Array.isArray(raw) ? raw.map(value => Number(value) || 0) : [0, 0, 0, 0, 0, 0];
}

function compareNumber(left, right) {
  if (Math.abs(left - right) <= SCORE_EPSILON) return 0;
  return left < right ? -1 : 1;
}

function compareArrays(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = compareNumber(Number(left[index] || 0), Number(right[index] || 0));
    if (difference) return difference;
  }
  return 0;
}

function candidateSortKey(candidate, role) {
  const meta = candidate.evaluation?.meta || {};
  const vector = recommendationVector(candidate.evaluation);
  return [
    LEVEL_RANK[candidate.evaluation?.level] ?? 9,
    ...vector.map(value => -value),
    role === 'bd' ? Number(meta.currentBd || 0) : Number(meta.combinedLoad || 0),
    role === 'hg' ? Number(meta.aaHgCount || 0) : 0,
    role === 'hg' ? Number(meta.currentHg || 0) : 0,
    candidate.order
  ];
}

function selectableCandidates(state, monthData, dateIso, role) {
  const sandbox = stateForMonth(state, monthData.year, monthData.month, monthData);
  return getPlanningStaff(sandbox.staff, dateIso)
    .map((person, order) => ({
      person,
      order,
      evaluation: evaluateCandidate({ state: sandbox, monthData, dateIso, role, staffId: person.id })
    }))
    .filter(candidate => candidate.evaluation?.canSelect !== false)
    .filter(candidate => !['red', 'gray'].includes(candidate.evaluation?.level))
    .sort((left, right) => compareArrays(candidateSortKey(left, role), candidateSortKey(right, role)));
}

function emptyNode(monthData) {
  return {
    monthData,
    orange: 0,
    yellow: 0,
    recommendation: [0, 0, 0, 0, 0, 0],
    unfilled: 0,
    trace: []
  };
}

function appendCandidate(node, slot, candidate) {
  const monthData = clone(node.monthData);
  setAssignment(monthData, slot.dateIso, slot.role, candidate.person.id);
  const vector = recommendationVector(candidate.evaluation);
  return {
    monthData,
    orange: node.orange + (candidate.evaluation.level === 'orange' ? 1 : 0),
    yellow: node.yellow + (candidate.evaluation.level === 'yellow' ? 1 : 0),
    recommendation: node.recommendation.map((value, index) => value + (vector[index] || 0)),
    unfilled: node.unfilled,
    trace: [...node.trace, {
      ...slot,
      staffId: candidate.person.id,
      level: candidate.evaluation.level,
      reasons: candidate.evaluation.reasons
    }]
  };
}

function appendUnfilled(node, slot) {
  return {
    ...node,
    unfilled: node.unfilled + 1,
    trace: [...node.trace, { ...slot, staffId: '', level: 'red', reasons: ['Keine regelkonforme Besetzung gefunden'] }]
  };
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
}

function activePlanningStaffForMonth(state, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const sampleDates = [1, Math.ceil(daysInMonth / 2), daysInMonth]
    .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const byId = new Map();
  for (const dateIso of sampleDates) {
    for (const person of getPlanningStaff(state.staff, dateIso)) byId.set(person.id, person);
  }
  return [...byId.values()];
}

function preliminaryFairness(state, monthData) {
  const staff = activePlanningStaffForMonth(state, monthData.year, monthData.month);
  const bdPenalty = staff.reduce((sum, person) => {
    const target = Number(person.bdTarget || 0);
    const actual = countRoleInMonth(monthData, person.id, 'bd');
    const deviation = actual - target;
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);

  const fa = staff.filter(person => {
    const midIso = `${monthData.year}-${String(monthData.month).padStart(2, '0')}-15`;
    return getRoleProperties(person, midIso).canHg;
  });
  const combined = fa.map(person =>
    countRoleInMonth(monthData, person.id, 'bd') + countRoleInMonth(monthData, person.id, 'hg')
  );
  const aaHg = fa.map(person => countHgForAaBdExcept(
    stateForMonth(state, monthData.year, monthData.month, monthData),
    monthData,
    person.id,
    ''
  ));
  const weekend = staff.map(person => computeWeekendEquivalent(monthData, person.id));
  return {
    bdPenalty,
    combinedVariance: variance(combined),
    aaHgVariance: variance(aaHg),
    weekendVariance: variance(weekend)
  };
}

function nodeSortKey(state, node) {
  const fairness = preliminaryFairness(state, node.monthData);
  return [
    node.unfilled,
    node.orange,
    node.yellow,
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
  ];
}

function nodeSignature(node, processedSlots) {
  return processedSlots.map(({ dateIso, role }) => node.monthData.days?.[dateIso]?.[role] || '').join('|');
}

function selectBeam(state, expanded, processedSlots, beamWidth) {
  expanded.sort((left, right) => {
    const result = compareArrays(nodeSortKey(state, left), nodeSortKey(state, right));
    if (result) return result;
    return nodeSignature(left, processedSlots).localeCompare(nodeSignature(right, processedSlots));
  });
  const unique = [];
  const seen = new Set();
  for (const node of expanded) {
    const signature = nodeSignature(node, processedSlots);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(node);
    if (unique.length >= beamWidth) break;
  }
  return unique;
}

function allAssignments(monthData, baseline) {
  const changes = [];
  for (const dateIso of Object.keys(monthData?.days || {}).sort()) {
    for (const role of ROLE_ORDER) {
      const before = baseline?.days?.[dateIso]?.[role] || '';
      const after = monthData?.days?.[dateIso]?.[role] || '';
      if (!before && after) changes.push({ dateIso, role, staffId: after });
    }
  }
  return changes;
}

function auditProposal(state, monthData, baseline) {
  const sandbox = stateForMonth(state, monthData.year, monthData.month, monthData);
  const entries = allAssignments(monthData, baseline).map(change => ({
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
    gray: entries.filter(entry => entry.evaluation.level === 'gray').length,
    orange: entries.filter(entry => entry.evaluation.level === 'orange').length,
    yellow: entries.filter(entry => entry.evaluation.level === 'yellow').length,
    recommendation: entries.reduce((sum, entry) => {
      const vector = recommendationVector(entry.evaluation);
      return sum.map((value, index) => value + (vector[index] || 0));
    }, [0, 0, 0, 0, 0, 0])
  };
}

function wishMetrics(state, monthData, baseline) {
  let possible = 0;
  let fulfilled = 0;
  for (const dateIso of Object.keys(monthData?.days || {}).sort()) {
    for (const role of ROLE_ORDER) {
      if (baseline?.days?.[dateIso]?.[role]) continue;
      const assigned = monthData.days?.[dateIso]?.[role] || '';
      for (const person of getPlanningStaff(state.staff, dateIso)) {
        const preference = getPreference(monthData, person.id, dateIso);
        if (!isPositivePreference(preference, role)) continue;
        possible += 1;
        if (assigned === person.id) fulfilled += 1;
      }
    }
  }
  return { possible, fulfilled, missed: Math.max(0, possible - fulfilled) };
}

function saturdayVariance(state, monthData) {
  const saturdayCounts = activePlanningStaffForMonth(state, monthData.year, monthData.month)
    .filter(person => {
      const sampleIso = `${monthData.year}-${String(monthData.month).padStart(2, '0')}-15`;
      return getRoleProperties(person, sampleIso).canSaturdayBd;
    })
    .map(person => Object.entries(monthData.days || {}).filter(([iso, day]) =>
      parseIso(iso).getDay() === 6 && day?.bd === person.id
    ).length);
  return variance(saturdayCounts);
}

function finalObjective(state, monthData, baseline) {
  const audit = auditProposal(state, monthData, baseline);
  const fairness = preliminaryFairness(state, monthData);
  const wishes = wishMetrics(state, monthData, baseline);
  const unfilled = openSlots(monthData).length;
  const key = [
    audit.red,
    audit.gray,
    unfilled,
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
  ];
  return { key, audit, fairness, wishes, unfilled };
}

function proposalSignature(monthData, baseline) {
  return allAssignments(monthData, baseline)
    .map(change => `${change.dateIso}:${change.role}:${change.staffId}`)
    .join('|');
}

function chooseBestFinal(state, beam, baseline) {
  const ranked = beam.map(node => ({ node, objective: finalObjective(state, node.monthData, baseline) }));
  ranked.sort((left, right) => {
    const result = compareArrays(left.objective.key, right.objective.key);
    if (result) return result;
    return proposalSignature(left.node.monthData, baseline).localeCompare(proposalSignature(right.node.monthData, baseline));
  });
  return ranked[0];
}

function fairnessIndex(objective) {
  if (!objective || objective.red || objective.gray || objective.unfilled) return 0;
  const rawPenalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - rawPenalty)));
}

export async function buildAutoPlan({
  state,
  monthData,
  year = monthData?.year,
  month = monthData?.month,
  beamWidth = DEFAULT_BEAM_WIDTH,
  branchLimit = DEFAULT_BRANCH_LIMIT,
  onProgress = null,
  signal = null
}) {
  if (!state || !monthData || !Number.isInteger(year) || !Number.isInteger(month)) {
    throw new TypeError('Auto-Plan benötigt Zustand, Monatsdaten, Jahr und Monat.');
  }
  assertNotAborted(signal);

  const baseline = clone(monthData);
  const slots = openSlots(baseline);
  const fixed = fixedAssignments(baseline);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  await emitProgress(onProgress, {
    phase: 'analysis',
    progress: 0.03,
    message: `${fixed} Fixpunkte geschützt · ${slots.length} offene BD/HG-Felder`,
    fixed,
    total: slots.length
  });
  await browserYield();

  let beam = [emptyNode(clone(baseline))];
  const processedSlots = [];
  let processed = 0;

  for (const role of ROLE_ORDER) {
    const roleSlots = slots.filter(slot => slot.role === role);
    await emitProgress(onProgress, {
      phase: role === 'bd' ? 'bd' : 'hg',
      progress: 0.08 + (processed / Math.max(1, slots.length)) * 0.68,
      message: role === 'bd'
        ? 'Globale BD-Verteilung mit Soll-, Wunsch- und Wochenendbalance'
        : 'HG-Verteilung mit kombinierter Last und AA-HG-Ausgleich'
    });

    for (const slot of roleSlots) {
      assertNotAborted(signal);
      const expanded = [];
      let maximumCandidates = 0;
      for (const node of beam) {
        const candidates = selectableCandidates(state, node.monthData, slot.dateIso, slot.role);
        maximumCandidates = Math.max(maximumCandidates, candidates.length);
        if (!candidates.length) {
          expanded.push(appendUnfilled(node, slot));
          continue;
        }
        for (const candidate of candidates.slice(0, Math.max(1, branchLimit))) {
          expanded.push(appendCandidate(node, slot, candidate));
        }
      }
      processedSlots.push(slot);
      beam = selectBeam(state, expanded, processedSlots, Math.max(4, beamWidth));
      processed += 1;

      await emitProgress(onProgress, {
        phase: role === 'bd' ? 'bd' : 'hg',
        progress: 0.08 + (processed / Math.max(1, slots.length)) * 0.68,
        message: `${slot.role.toUpperCase()} ${slot.dateIso}: ${maximumCandidates} regelkonforme Kandidaten · ${beam.length} globale Varianten`,
        dateIso: slot.dateIso,
        role: slot.role,
        processed,
        total: slots.length,
        candidateCount: maximumCandidates,
        beamSize: beam.length
      });
      await browserYield();
    }
  }

  assertNotAborted(signal);
  await emitProgress(onProgress, {
    phase: 'polish',
    progress: 0.82,
    message: 'Fairness-Politur und lexikografischer Variantenvergleich'
  });
  await browserYield();

  const best = chooseBestFinal(state, beam, baseline);
  if (!best) throw new Error('Der Auto-Planer konnte keine Variante erzeugen.');

  await emitProgress(onProgress, {
    phase: 'audit',
    progress: 0.92,
    message: 'Vollständiger Schlussaudit aller vorgeschlagenen BD/HG-Einteilungen'
  });
  await browserYield();

  const changes = allAssignments(best.node.monthData, baseline);
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
  const success = best.objective.red === 0
    && best.objective.gray === 0
    && best.objective.unfilled === 0
    && changes.length === slots.length;

  const result = {
    success,
    year,
    month,
    baselineFingerprint: fingerprintMonth(baseline),
    baseline,
    plannedMonth: clone(best.node.monthData),
    changes,
    fixedAssignments: fixed,
    openSlots: slots.length,
    elapsedMs: Math.round(elapsed),
    metrics: {
      proposed: changes.length,
      unfilled: best.objective.unfilled,
      red: best.objective.audit.red,
      gray: best.objective.audit.gray,
      orange: best.objective.audit.orange,
      yellow: best.objective.audit.yellow,
      wishesFulfilled: best.objective.wishes.fulfilled,
      wishesPossible: best.objective.wishes.possible,
      fairnessIndex: fairnessIndex(best.objective),
      bdTargetPenalty: Number(best.objective.fairness.bdPenalty.toFixed(2)),
      combinedLoadVariance: Number(best.objective.fairness.combinedVariance.toFixed(3)),
      aaHgVariance: Number(best.objective.fairness.aaHgVariance.toFixed(3)),
      weekendVariance: Number(best.objective.fairness.weekendVariance.toFixed(3))
    },
    audit: best.objective.audit.entries.map(entry => ({
      dateIso: entry.dateIso,
      role: entry.role,
      staffId: entry.staffId,
      level: entry.evaluation.level,
      reasons: entry.evaluation.reasons
    }))
  };

  await emitProgress(onProgress, {
    phase: success ? 'complete' : 'blocked',
    progress: 1,
    message: success
      ? `${changes.length} Vorschläge · 0 rote Konflikte · Fairness ${result.metrics.fairnessIndex}%`
      : `Keine vollständig regelkonforme Komplettbelegung möglich · ${result.metrics.unfilled} Felder offen`,
    result
  });
  return result;
}

export function applyAutoPlanProposal(currentMonth, proposal) {
  if (!proposal?.success) throw new Error('Nur ein vollständig regelkonformer Auto-Plan kann übernommen werden.');
  if (fingerprintMonth(currentMonth) !== proposal.baselineFingerprint) {
    throw new Error('Der Monatsplan wurde seit der Berechnung verändert. Auto-Plan bitte neu berechnen.');
  }
  const merged = clone(currentMonth);
  for (const change of proposal.changes) {
    if (merged.days?.[change.dateIso]?.[change.role]) {
      throw new Error(`Fixpunkt ${change.role.toUpperCase()} ${change.dateIso} wurde zwischenzeitlich belegt.`);
    }
    setAssignment(merged, change.dateIso, change.role, change.staffId);
  }
  return merged;
}
