import {
  applyAutoPlanProposal as applyV3Proposal,
  buildAutoPlan as buildV3Plan
} from './auto-planner-v3.js?v=20260805.1';
import {
  computeWeekendEquivalent,
  countHgForAaBdExcept,
  countRoleInMonth,
  getPlanningStaff,
  getRoleProperties
} from './rules.js?v=20260805.1';

export * from './auto-planner-v3.js?v=20260805.1';

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
}

function monthDates(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function activeStaff(state, monthData) {
  const byId = new Map();
  for (const dateIso of monthDates(monthData)) {
    for (const person of getPlanningStaff(state.staff, dateIso)) byId.set(person.id, person);
  }
  return [...byId.values()];
}

function simulatedState(state, monthData) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  const months = new Map(state?.months || []);
  months.set(key, monthData);
  return {
    ...state,
    months,
    currentYear: monthData.year,
    currentMonth: monthData.month
  };
}

function exactFairness(state, monthData) {
  const dates = monthDates(monthData);
  const staff = activeStaff(state, monthData);
  const specialists = staff.filter(person =>
    dates.some(dateIso => getRoleProperties(person, dateIso).canHg));
  const sandbox = simulatedState(state, monthData);

  const bdPenalty = staff.reduce((sum, person) => {
    const target = Number(person.bdTarget || 0);
    const actual = countRoleInMonth(monthData, person.id, 'bd');
    const deviation = actual - target;
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);

  return {
    bdPenalty,
    combinedLoadVariance: variance(specialists.map(person =>
      countRoleInMonth(monthData, person.id, 'bd')
      + countRoleInMonth(monthData, person.id, 'hg'))),
    aaHgVariance: variance(specialists.map(person =>
      countHgForAaBdExcept(sandbox, monthData, person.id, ''))),
    weekendVariance: variance(staff.map(person =>
      computeWeekendEquivalent(monthData, person.id)))
  };
}

function refreshFairnessMetrics(state, result) {
  if (!result?.metrics || !result?.plannedMonth) return result;
  const fairness = exactFairness(state, result.plannedMonth);
  result.metrics.bdTargetPenalty = Number(fairness.bdPenalty.toFixed(2));
  result.metrics.combinedLoadVariance = Number(fairness.combinedLoadVariance.toFixed(3));
  result.metrics.aaHgVariance = Number(fairness.aaHgVariance.toFixed(3));
  result.metrics.weekendVariance = Number(fairness.weekendVariance.toFixed(3));

  if (result.metrics.gray || result.metrics.unfilled || !result.complete) {
    result.metrics.fairnessIndex = 0;
  } else {
    const penalty = fairness.bdPenalty * 1.35
      + fairness.combinedLoadVariance * 8
      + fairness.aaHgVariance * 5
      + fairness.weekendVariance * 7;
    result.metrics.fairnessIndex = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }
  result.qualityRevision = 4;
  return result;
}

function validateProposalStaff(parameters) {
  const valid = new Set((parameters?.state?.staff || []).map(person => person.id));
  for (const change of parameters?.proposal?.changes || []) {
    if (!change?.staffId || !valid.has(change.staffId)) {
      throw new Error(`Auto-Plan-Vorschlag ohne gültige Personal-ID für ${change?.role || 'Dienst'} ${change?.dateIso || 'unbekannt'}; erneute Regelprüfung erforderlich.`);
    }
  }
}

/**
 * Direkte API-Aufrufe aus Tests oder Integrationen erhalten eine kurze echte
 * iterative Prüfung, sofern sie die Rundenzahl nicht ausdrücklich festlegen.
 * Anschließend werden sämtliche Fairnesskennzahlen auf dem finalen Plan und
 * mit datumsabhängiger Qualifikation neu berechnet.
 */
export async function buildAutoPlan(parameters) {
  const supplied = parameters?.runConfig && typeof parameters.runConfig === 'object'
    ? parameters.runConfig
    : {};
  const normalized = {
    ...parameters,
    runConfig: {
      ...supplied,
      repairIterations: supplied.repairIterations ?? 2,
      localRebuildBudget: supplied.localRebuildBudget ?? 600
    }
  };
  return refreshFairnessMetrics(parameters.state, await buildV3Plan(normalized));
}

export function applyAutoPlanProposal(parameters) {
  validateProposalStaff(parameters);
  try {
    return applyV3Proposal(parameters);
  } catch (error) {
    if (/nach der Optimierung verändert/.test(error?.message || '')) {
      throw new Error(`${error.message} erneute Regelprüfung erforderlich.`);
    }
    throw error;
  }
}
