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
const DEFAULT_BEAM_WIDTH = 48;
const DEFAULT_BRANCH_LIMIT = 10;
const EPSILON = 1e-9;

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

function openSlots(monthData) {
  const dates = Object.keys(monthData?.days || {}).sort();
  const result = [];
  for (const role of ROLE_ORDER) {
    for (const dateIso of dates) {
      if (!monthData.days[dateIso]?.[role]) result.push({ dateIso, role });
    }
  }
  return result;
}

function fixedAssignmentCount(monthData) {
  return Object.values(monthData?.days || {}).reduce((sum, day) =>
    sum + Number(Boolean(day?.bd)) + Number(Boolean(day?.hg)), 0);
}

export function fingerprintMonth(monthData) {
  return JSON.stringify({
    year: monthData?.year,
    month: monthData?.month,
    revision: monthData?.revision || 0,
    updatedAt: monthData?.updatedAt || null,
    days: Object.entries(monthData?.days || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dateIso, day]) => [dateIso, day?.bd || '', day?.hg || ''])
  });
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

function candidateKey(candidate, role) {
  const meta = candidate.evaluation?.meta || {};
  return [
    LEVEL_RANK[candidate.evaluation?.level] ?? 9,
    ...vectorOf(candidate.evaluation).map(value => -value),
    role === 'bd' ? Number(meta.currentBd || 0) : Number(meta.combinedLoad || 0),
    role === 'hg' ? Number(meta.aaHgCount || 0) : 0,
    role === 'hg' ? Number(meta.currentHg || 0) : 0,
    candidate.order
  ];
}

function candidatesFor(state, monthData, dateIso, role) {
  const sandbox = simulatedState(state, monthData);
  return getPlanningStaff(sandbox.staff, dateIso)
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
    .filter(candidate => !['red', 'gray'].includes(candidate.evaluation?.level))
    .sort((left, right) => compareVectors(candidateKey(left, role), candidateKey(right, role)));
}

function emptyNode(monthData) {
  return {
    monthData,
    orange: 0,
    yellow: 0,
    unfilled: 0,
    recommendation: [0, 0, 0, 0, 0, 0],
    trace: []
  };
}

function assignNode(node, slot, candidate) {
  const monthData = clone(node.monthData);
  setAssignment(monthData, slot.dateIso, slot.role, candidate.person.id);
  const recommendation = vectorOf(candidate.evaluation);
  return {
    monthData,
    orange: node.orange + Number(candidate.evaluation.level === 'orange'),
    yellow: node.yellow + Number(candidate.evaluation.level === 'yellow'),
    unfilled: node.unfilled,
    recommendation: node.recommendation.map((value, index) => value + (recommendation[index] || 0)),
    trace: [...node.trace, {
      ...slot,
      staffId: candidate.person.id,
      level: candidate.evaluation.level,
      reasons: candidate.evaluation.reasons
    }]
  };
}

function leaveUnfilled(node, slot) {
  return {
    ...node,
    unfilled: node.unfilled + 1,
    trace: [...node.trace, {
      ...slot,
      staffId: '',
      level: 'red',
      reasons: ['Keine regelkonforme Besetzung gefunden']
    }]
  };
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
}

function activeStaffForMonth(state, year, month) {
  const days = new Date(year, month, 0).getDate();
  const samples = [1, Math.ceil(days / 2), days]
    .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const byId = new Map();
  for (const dateIso of samples) {
    for (const person of getPlanningStaff(state.staff, dateIso)) byId.set(person.id, person);
  }
  return [...byId.values()];
}

function fairnessSnapshot(state, monthData) {
  const staff = activeStaffForMonth(state, monthData.year, monthData.month);
  const bdPenalty = staff.reduce((sum, person) => {
    const target = Number(person.bdTarget || 0);
    const actual = countRoleInMonth(monthData, person.id, 'bd');
    const deviation = actual - target;
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);

  const middleIso = `${monthData.year}-${String(monthData.month).padStart(2, '0')}-15`;
  const specialists = staff.filter(person => getRoleProperties(person, middleIso).canHg);
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

function partialNodeKey(state, node) {
  const fairness = fairnessSnapshot(state, node.monthData);
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
  return processedSlots
    .map(({ dateIso, role }) => node.monthData.days?.[dateIso]?.[role] || '')
    .join('|');
}

function pruneBeam(state, expanded, processedSlots, beamWidth) {
  expanded.sort((left, right) => {
    const comparison = compareVectors(partialNodeKey(state, left), partialNodeKey(state, right));
    return comparison || nodeSignature(left, processedSlots).localeCompare(nodeSignature(right, processedSlots));
  });

  const result = [];
  const seen = new Set();
  for (const node of expanded) {
    const signature = nodeSignature(node, processedSlots);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(node);
    if (result.length >= beamWidth) break;
  }
  return result;
}

function proposedAssignments(monthData, baseline) {
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
    gray: entries.filter(entry => entry.evaluation.level === 'gray').length,
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
  for (const dateIso of Object.keys(monthData?.days || {}).sort()) {
    for (const role of ROLE_ORDER) {
      if (baseline?.days?.[dateIso]?.[role]) continue;
      const assigned = monthData.days?.[dateIso]?.[role] || '';
      for (const person of getPlanningStaff(state.staff, dateIso)) {
        if (!isPositivePreference(getPreference(monthData, person.id, dateIso), role)) continue;
        possible += 1;
        if (assigned === person.id) fulfilled += 1;
      }
    }
  }
  return { possible, fulfilled, missed: Math.max(0, possible - fulfilled) };
}

function saturdayVariance(state, monthData) {
  const sampleIso = `${monthData.year}-${String(monthData.month).padStart(2, '0')}-15`;
  const counts = activeStaffForMonth(state, monthData.year, monthData.month)
    .filter(person => getRoleProperties(person, sampleIso).canSaturdayBd)
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
    ]
  };
}

function completeSignature(monthData, baseline) {
  return proposedAssignments(monthData, baseline)
    .map(change => `${change.dateIso}:${change.role}:${change.staffId}`)
    .join('|');
}

function selectBestFinal(state, beam, baseline) {
  const ranked = beam.map(node => ({ node, objective: finalObjective(state, node.monthData, baseline) }));
  ranked.sort((left, right) => {
    const comparison = compareVectors(left.objective.key, right.objective.key);
    return comparison || completeSignature(left.node.monthData, baseline)
      .localeCompare(completeSignature(right.node.monthData, baseline));
  });
  return ranked[0] || null;
}

function fairnessIndex(objective) {
  if (!objective || objective.audit.red || objective.audit.gray || objective.unfilled) return 0;
  const penalty = objective.fairness.bdPenalty * 1.35
    + objective.fairness.combinedVariance * 8
    + objective.fairness.aaHgVariance * 5
    + objective.fairness.weekendVariance * 7;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
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
  abortIfRequested(signal);

  const baseline = clone(monthData);
  const slots = openSlots(baseline);
  const fixed = fixedAssignmentCount(baseline);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  await report(onProgress, {
    phase: 'analysis',
    progress: 0.03,
    message: `${fixed} Fixpunkte geschützt · ${slots.length} offene BD/HG-Felder`,
    fixed,
    total: slots.length
  });
  await yieldToBrowser();

  let beam = [emptyNode(clone(baseline))];
  const processedSlots = [];
  let processed = 0;

  for (const role of ROLE_ORDER) {
    const roleSlots = slots.filter(slot => slot.role === role);
    await report(onProgress, {
      phase: role,
      progress: 0.08 + (processed / Math.max(1, slots.length)) * 0.68,
      message: role === 'bd'
        ? 'Globale BD-Verteilung mit Soll-, Wunsch- und Wochenendbalance'
        : 'HG-Verteilung mit kombinierter Last und AA-HG-Ausgleich'
    });

    for (const slot of roleSlots) {
      abortIfRequested(signal);
      const expanded = [];
      let candidateCount = 0;

      for (const node of beam) {
        const candidates = candidatesFor(state, node.monthData, slot.dateIso, slot.role);
        candidateCount = Math.max(candidateCount, candidates.length);
        if (!candidates.length) {
          expanded.push(leaveUnfilled(node, slot));
          continue;
        }
        for (const candidate of candidates.slice(0, Math.max(1, branchLimit))) {
          expanded.push(assignNode(node, slot, candidate));
        }
      }

      processedSlots.push(slot);
      beam = pruneBeam(state, expanded, processedSlots, Math.max(4, beamWidth));
      processed += 1;
      await report(onProgress, {
        phase: role,
        progress: 0.08 + (processed / Math.max(1, slots.length)) * 0.68,
        message: `${role.toUpperCase()} ${slot.dateIso}: ${candidateCount} regelkonforme Kandidaten · ${beam.length} globale Varianten`,
        dateIso: slot.dateIso,
        role,
        processed,
        total: slots.length,
        candidateCount,
        beamSize: beam.length
      });
      await yieldToBrowser();
    }
  }

  abortIfRequested(signal);
  await report(onProgress, {
    phase: 'polish',
    progress: 0.82,
    message: 'Fairness-Politur und lexikografischer Variantenvergleich'
  });
  await yieldToBrowser();

  const best = selectBestFinal(state, beam, baseline);
  if (!best) throw new Error('Der Auto-Planer konnte keine Variante erzeugen.');

  await report(onProgress, {
    phase: 'audit',
    progress: 0.92,
    message: 'Vollständiger Schlussaudit aller vorgeschlagenen BD/HG-Einteilungen'
  });
  await yieldToBrowser();

  const changes = proposedAssignments(best.node.monthData, baseline);
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
  const success = best.objective.audit.red === 0
    && best.objective.audit.gray === 0
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

  await report(onProgress, {
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
