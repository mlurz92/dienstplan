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
const DEFAULT_BEAM_WIDTH = 56;
const DEFAULT_BRANCH_LIMIT = 12;
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

function candidatesFor(state, monthData, dateIso, role, mode) {
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
    .filter(candidate => candidate.evaluation?.level !== 'gray')
    .filter(candidate => mode === SEARCH_MODE.CONFIRMABLE || candidate.evaluation?.level !== 'red')
    .sort((left, right) => compareVectors(candidateKey(left, role), candidateKey(right, role)));
}

function emptyNode(monthData) {
  return {
    monthData,
    red: 0,
    specialRed: 0,
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
  const confirmationType = candidate.evaluation?.meta?.confirmationType || null;
  return {
    monthData,
    red: node.red + Number(candidate.evaluation.level === 'red'),
    specialRed: node.specialRed + Number(candidate.evaluation.level === 'red' && confirmationType === 'special'),
    orange: node.orange + Number(candidate.evaluation.level === 'orange'),
    yellow: node.yellow + Number(candidate.evaluation.level === 'yellow'),
    unfilled: node.unfilled,
    recommendation: node.recommendation.map((value, index) => value + (recommendation[index] || 0)),
    trace: [...node.trace, {
      ...slot,
      staffId: candidate.person.id,
      level: candidate.evaluation.level,
      confirmationType,
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
      confirmationType: null,
      reasons: ['Keine technisch wählbare Besetzung gefunden']
    }]
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

function partialNodeKey(state, node) {
  const fairness = fairnessSnapshot(state, node.monthData);
  return [
    node.unfilled,
    node.red,
    node.specialRed,
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
  const ranked = expanded.map(node => ({
    node,
    key: partialNodeKey(state, node),
    signature: nodeSignature(node, processedSlots)
  }));
  ranked.sort((left, right) =>
    compareVectors(left.key, right.key) || left.signature.localeCompare(right.signature));

  const result = [];
  const seen = new Set();
  for (const entry of ranked) {
    if (seen.has(entry.signature)) continue;
    seen.add(entry.signature);
    result.push(entry.node);
    if (result.length >= beamWidth) break;
  }
  return result;
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
    gray: entries.filter(entry => entry.evaluation.level === 'gray' || entry.evaluation.canSelect === false).length,
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

function completeSignature(monthData, baseline) {
  return proposedAssignments(monthData, baseline)
    .map(change => `${change.dateIso}:${change.role}:${change.staffId}`)
    .join('|');
}

function selectBestFinal(state, beam, baseline) {
  const ranked = beam.map(node => ({ node, objective: finalObjective(state, node.monthData, baseline) }));
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

function orderSlots(state, baseline, slots, role, mode) {
  return slots
    .filter(slot => slot.role === role)
    .map(slot => ({
      slot,
      domain: candidatesFor(state, baseline, slot.dateIso, role, mode).length,
      criticality: slotCriticality(slot)
    }))
    .sort((left, right) =>
      left.domain - right.domain
      || left.criticality - right.criticality
      || left.slot.dateIso.localeCompare(right.slot.dateIso))
    .map(entry => entry.slot);
}

async function runBeamPass({
  state,
  baseline,
  slots,
  mode,
  beamWidth,
  branchLimit,
  onProgress,
  signal,
  progressStart,
  progressSpan,
  label
}) {
  let beam = [emptyNode(clone(baseline))];
  const processedSlots = [];
  let processed = 0;

  for (const role of ROLE_ORDER) {
    const roleSlots = orderSlots(state, baseline, slots, role, mode);
    await report(onProgress, {
      phase: role,
      progress: progressStart + (processed / Math.max(1, slots.length)) * progressSpan,
      message: `${label} · ${role === 'bd' ? 'BD-Verteilung' : 'HG-Verteilung'}`
    });

    for (const slot of roleSlots) {
      abortIfRequested(signal);
      const expanded = [];
      let candidateCount = 0;

      for (const node of beam) {
        const candidates = candidatesFor(state, node.monthData, slot.dateIso, slot.role, mode);
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
        progress: progressStart + (processed / Math.max(1, slots.length)) * progressSpan,
        message: `${label} · ${role.toUpperCase()} ${slot.dateIso}: ${candidateCount} Kandidaten · ${beam.length} Varianten`,
        dateIso: slot.dateIso,
        role,
        processed,
        total: slots.length,
        candidateCount,
        beamSize: beam.length,
        searchMode: mode
      });
      await yieldToBrowser();
    }
  }

  return selectBestFinal(state, beam, baseline);
}

function isCompleteAndSelectable(best, slots) {
  if (!best) return false;
  const changes = proposedAssignments(best.node.monthData, best.baseline || {});
  return best.objective.audit.gray === 0
    && best.objective.unfilled === 0
    && (!slots || changes.length === slots.length);
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
  const attempts = [];

  await report(onProgress, {
    phase: 'analysis',
    progress: 0.03,
    message: `${fixed} Fixpunkte geschützt · ${slots.length} offene BD/HG-Felder`,
    fixed,
    total: slots.length
  });
  await yieldToBrowser();

  let best = await runBeamPass({
    state,
    baseline,
    slots,
    mode: SEARCH_MODE.STRICT,
    beamWidth,
    branchLimit,
    onProgress,
    signal,
    progressStart: 0.06,
    progressSpan: 0.44,
    label: 'Null-Rot-Suche'
  });
  attempts.push({ mode: SEARCH_MODE.STRICT, beamWidth, complete: Boolean(best && best.objective.unfilled === 0) });

  if (!best || best.objective.unfilled > 0 || best.objective.audit.red > 0) {
    const deepWidth = Math.max(112, beamWidth * 2);
    best = await runBeamPass({
      state,
      baseline,
      slots,
      mode: SEARCH_MODE.STRICT,
      beamWidth: deepWidth,
      branchLimit,
      onProgress,
      signal,
      progressStart: 0.50,
      progressSpan: 0.23,
      label: 'Vertiefte Null-Rot-Suche'
    });
    attempts.push({ mode: SEARCH_MODE.STRICT, beamWidth: deepWidth, complete: Boolean(best && best.objective.unfilled === 0) });
  }

  if (!best || best.objective.unfilled > 0 || best.objective.audit.red > 0) {
    const fallbackWidth = Math.max(144, beamWidth * 3);
    await report(onProgress, {
      phase: 'analysis',
      progress: 0.74,
      message: 'Keine vollständige Null-Rot-Variante gefunden · Minimal-Rot-Fallback wird geprüft'
    });
    await yieldToBrowser();
    best = await runBeamPass({
      state,
      baseline,
      slots,
      mode: SEARCH_MODE.CONFIRMABLE,
      beamWidth: fallbackWidth,
      branchLimit,
      onProgress,
      signal,
      progressStart: 0.75,
      progressSpan: 0.13,
      label: 'Minimal-Rot-Suche'
    });
    attempts.push({ mode: SEARCH_MODE.CONFIRMABLE, beamWidth: fallbackWidth, complete: Boolean(best && best.objective.unfilled === 0) });
  }

  abortIfRequested(signal);
  await report(onProgress, {
    phase: 'polish',
    progress: 0.90,
    message: 'Lexikografischer Gesamtvergleich und Fairness-Politur'
  });
  await yieldToBrowser();

  if (!best) throw new Error('Der Auto-Planer konnte keine Variante erzeugen.');

  await report(onProgress, {
    phase: 'audit',
    progress: 0.95,
    message: 'Vollständiger Schlussaudit aller vorgeschlagenen BD/HG-Einteilungen'
  });
  await yieldToBrowser();

  const changes = proposedAssignments(best.node.monthData, baseline);
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
  const complete = best.objective.audit.gray === 0
    && best.objective.unfilled === 0
    && changes.length === slots.length;
  const requiresConfirmation = complete && best.objective.audit.red > 0;
  const status = !complete ? 'blocked' : requiresConfirmation ? 'confirmation_required' : 'clean';
  const redViolations = best.objective.audit.entries
    .filter(entry => entry.evaluation.level === 'red')
    .map(redViolation);

  const result = {
    success: complete,
    complete,
    requiresConfirmation,
    status,
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
      unfilled: best.objective.unfilled,
      red: best.objective.audit.red,
      specialRed: best.objective.audit.specialRed,
      gray: best.objective.audit.gray,
      orange: best.objective.audit.orange,
      yellow: best.objective.audit.yellow,
      wishesFulfilled: best.objective.wishes.fulfilled,
      wishesPossible: best.objective.wishes.possible,
      fairnessIndex: fairnessIndex(best.objective),
      bdTargetPenalty: Number(best.objective.fairness.bdPenalty.toFixed(2)),
      combinedLoadVariance: Number(best.objective.fairness.combinedVariance.toFixed(3)),
      aaHgVariance: Number(best.objective.fairness.aaHgVariance.toFixed(3)),
      weekendVariance: Number(best.objective.fairness.weekendVariance.toFixed(3)),
      attempts
    },
    audit: best.objective.audit.entries.map(entry => ({
      dateIso: entry.dateIso,
      role: entry.role,
      staffId: entry.staffId,
      level: entry.evaluation.level,
      canSelect: entry.evaluation.canSelect,
      confirmationType: entry.evaluation.meta?.confirmationType || null,
      reasons: entry.evaluation.reasons
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
