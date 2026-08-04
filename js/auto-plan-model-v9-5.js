/**
 * Auto-Plan v9.5 – solverunabhängiges Boolean-Zuordnungsmodell.
 *
 * Anders als die v9 verwendet dieses Modell keine numerischen Personenindizes
 * als Slotwert. Für jede tatsächlich mögliche Kombination aus Dienstfeld und
 * Person existiert eine eigene 0/1-Variable:
 *
 *   x[Datum, Rolle, Person] = 1  ⇔  die Person übernimmt dieses Dienstfeld.
 *
 * Dadurch zählen Obergrenzen, Sollabweichungen, Wünsche und Fairness immer die
 * Dienste der richtigen Person. Interne Reihenfolge und Kennungen der Personen
 * können die mathematische Bedeutung nicht mehr verändern.
 */

import {
  getPlanningStaff,
  getPreference,
  getRoleProperties,
  isPositivePreference,
  parseIso
} from './rules-core.js?v=20260803.4';
import { evaluateCandidate } from './rules.js?v=20260803.4';

export const AUTO_PLAN_MODEL_REVISION = 95;
export const AUTO_PLAN_MODEL_ID = 'v9.5-boolean-assignment-ir';

const ROLES = Object.freeze(['bd', 'hg']);
const MAX_BOUND = 1_000_000;

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function keyForMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function simulatedState(state, monthData) {
  const months = new Map(state?.months || []);
  months.set(keyForMonth(monthData.year, monthData.month), monthData);
  return {
    ...state,
    months,
    currentYear: monthData.year,
    currentMonth: monthData.month
  };
}

function sortedDays(monthData) {
  return Object.keys(monthData?.days || {}).sort();
}

function weekday(dateIso) {
  return parseIso(dateIso).getDay();
}

function addIsoDays(dateIso, amount) {
  const date = parseIso(dateIso);
  date.setDate(date.getDate() + amount);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function countFixedRole(baseline, staffId, role) {
  let count = 0;
  for (const day of Object.values(baseline?.days || {})) {
    if (day?.[role] === staffId) count += 1;
  }
  return count;
}

function countFixedTotal(baseline, staffId) {
  return countFixedRole(baseline, staffId, 'bd') + countFixedRole(baseline, staffId, 'hg');
}

function countFixedWeekend(baseline, staffId) {
  let count = 0;
  for (const [dateIso, day] of Object.entries(baseline?.days || {})) {
    if (![5, 6, 0].includes(weekday(dateIso))) continue;
    if (day?.bd === staffId) count += 1;
    if (day?.hg === staffId) count += 1;
  }
  return count;
}

function normalizeCap(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function fingerprint(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}:${text.length}`;
}

function emptyComponent(id, label, priority) {
  return { id, label, priority, terms: [], constant: 0 };
}

function levelWeight(level, confirmationType = null) {
  if (level === 'red') return confirmationType === 'special' ? 25 : 12;
  if (level === 'orange') return 5;
  if (level === 'yellow') return 2;
  return 0;
}

/**
 * Baut die reine Modellrepräsentation. Sie enthält keinerlei Objekte aus einer
 * konkreten Solverbibliothek und kann deshalb vollständig in Node getestet,
 * serialisiert und in einen Worker übertragen werden.
 */
export function buildBooleanAutoPlanModel({
  state,
  monthData,
  baseline = monthData,
  config = {},
  hints = [],
  allowedSlots = null
} = {}) {
  if (!state || !monthData?.days || !baseline?.days) {
    throw new TypeError('Boolean-Modell benötigt Zustand, Monatsdaten und Baseline.');
  }

  const days = sortedDays(baseline);
  const openSlots = days.flatMap(dateIso => ROLES
    .filter(role => !baseline.days?.[dateIso]?.[role])
    .map(role => ({ dateIso, role, key: `${dateIso}|${role}` })))
    .filter(slot => !allowedSlots || allowedSlots.has(slot.key));
  const openSlotKeys = new Set(openSlots.map(slot => slot.key));

  const staffById = new Map();
  for (const dateIso of days) {
    for (const person of getPlanningStaff(state.staff || [], dateIso)) staffById.set(person.id, person);
  }
  const staff = [...staffById.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const variables = [];
  const assignmentVariables = [];
  const auxiliaryVariables = [];
  const assignmentByKey = new Map();
  const assignmentsBySlot = new Map();
  const assignmentsByStaff = new Map(staff.map(person => [person.id, []]));
  const structuralConflicts = [];
  const constraints = [];
  const explanations = {};

  const components = {
    confirmations: emptyComponent('confirmations', 'Bestätigbare rote Ausnahmen', 10),
    orange: emptyComponent('orange', 'Orange Regelhinweise', 20),
    yellow: emptyComponent('yellow', 'Gelbe Regelhinweise', 30),
    fairnessMax: emptyComponent('fairnessMax', 'Maximale BD-Sollabweichung', 40),
    targetDeviation: emptyComponent('targetDeviation', 'Gesamte Sollabweichung', 50),
    splitWeekend: emptyComponent('splitWeekend', 'Freitag-BD · Samstag frei · Sonntag-BD', 60),
    combinedSpread: emptyComponent('combinedSpread', 'Spannweite der Gesamtbelastung', 70),
    weekendSpread: emptyComponent('weekendSpread', 'Spannweite der Wochenendbelastung', 80),
    wishes: emptyComponent('wishes', 'Nicht erfüllte Dienstwünsche', 90),
    recommendations: emptyComponent('recommendations', 'Positive Regel-Empfehlungen', 100)
  };

  const addVariable = ({ name, lb = 0, ub = 1, kind, ...meta }) => {
    const index = variables.length;
    const variable = { index, name, lb, ub, kind, ...meta };
    variables.push(variable);
    if (kind === 'assignment') assignmentVariables.push(variable);
    else auxiliaryVariables.push(variable);
    return index;
  };

  const addAuxiliary = (name, lb, ub, meta = {}) => addVariable({
    name,
    lb,
    ub,
    kind: 'auxiliary',
    ...meta
  });

  const addConstraint = ({ id, group, terms = [], lb = -MAX_BOUND, ub = MAX_BOUND, constant = 0, detail, relaxable = false }) => {
    const compact = new Map();
    for (const [variableIndex, coefficient] of terms) {
      if (!Number.isFinite(coefficient) || coefficient === 0) continue;
      compact.set(variableIndex, (compact.get(variableIndex) || 0) + coefficient);
    }
    const normalizedTerms = [...compact.entries()].filter(([, coefficient]) => coefficient !== 0);
    const normalized = {
      id,
      group,
      terms: normalizedTerms,
      lb: Number.isFinite(lb) ? lb - constant : -MAX_BOUND,
      ub: Number.isFinite(ub) ? ub - constant : MAX_BOUND,
      detail,
      relaxable
    };
    if (!normalizedTerms.length && !(normalized.lb <= 0 && normalized.ub >= 0)) {
      structuralConflicts.push({ id, group, detail, reason: 'constant-constraint-infeasible' });
    }
    constraints.push(normalized);
    explanations[id] = { id, group, detail, relaxable };
    return normalized;
  };

  const sandbox = simulatedState(state, baseline);

  // Boolean-Zuordnungsvariablen nur für tatsächlich wählbare Kombinationen.
  for (const slot of openSlots) {
    const candidates = [];
    for (const person of getPlanningStaff(state.staff || [], slot.dateIso)) {
      const evaluation = evaluateCandidate({
        state: sandbox,
        monthData: baseline,
        dateIso: slot.dateIso,
        role: slot.role,
        staffId: person.id
      });
      if (evaluation?.canSelect === false || evaluation?.level === 'gray') continue;
      if (evaluation?.level === 'red' && config.allowRedFallback === false) continue;
      const assignmentKey = `${slot.key}|${person.id}`;
      const variableIndex = addVariable({
        name: `x_${slot.dateIso}_${slot.role}_${person.id}`,
        kind: 'assignment',
        slot: { ...slot },
        staffId: person.id,
        initialEvaluation: {
          level: evaluation?.level || 'green',
          confirmationType: evaluation?.meta?.confirmationType || null,
          reasons: evaluation?.reasons || [],
          recommendationScore: Number(evaluation?.meta?.recommendationScore || 0)
        }
      });
      assignmentByKey.set(assignmentKey, variableIndex);
      candidates.push(variableIndex);
      assignmentsByStaff.get(person.id)?.push(variableIndex);

      const severity = levelWeight(evaluation?.level, evaluation?.meta?.confirmationType);
      if (evaluation?.level === 'red') components.confirmations.terms.push([variableIndex, severity || 1]);
      if (evaluation?.level === 'orange') components.orange.terms.push([variableIndex, severity || 1]);
      if (evaluation?.level === 'yellow') components.yellow.terms.push([variableIndex, severity || 1]);
      const recommendation = Number(evaluation?.meta?.recommendationScore || 0);
      if (recommendation > 0) components.recommendations.terms.push([variableIndex, -recommendation]);
    }
    assignmentsBySlot.set(slot.key, candidates);
    addConstraint({
      id: `coverage:${slot.key}`,
      group: 'coverage',
      terms: candidates.map(index => [index, 1]),
      lb: 1,
      ub: 1,
      detail: `${slot.role.toUpperCase()} am ${slot.dateIso} muss genau einmal besetzt werden.`
    });
  }

  const literalFor = (dateIso, role, staffId) => {
    const slotKey = `${dateIso}|${role}`;
    const fixed = baseline.days?.[dateIso]?.[role] || '';
    if (fixed) return { constant: fixed === staffId ? 1 : 0, variableIndex: null };
    if (!openSlotKeys.has(slotKey)) return { constant: 0, variableIndex: null };
    const variableIndex = assignmentByKey.get(`${slotKey}|${staffId}`);
    return variableIndex === undefined
      ? { constant: 0, variableIndex: null }
      : { constant: 0, variableIndex };
  };

  const addAtMostOne = (id, group, literals, detail) => {
    const terms = [];
    let constant = 0;
    for (const literal of literals) {
      constant += literal.constant || 0;
      if (literal.variableIndex !== null && literal.variableIndex !== undefined) terms.push([literal.variableIndex, 1]);
    }
    addConstraint({ id, group, terms, constant, lb: 0, ub: 1, detail });
  };

  // Gleiche Person darf am selben Tag nicht BD und HG übernehmen.
  for (const dateIso of days) {
    for (const person of staff) {
      addAtMostOne(
        `same-day-exclusive:${dateIso}:${person.id}`,
        'sequence',
        [literalFor(dateIso, 'bd', person.id), literalFor(dateIso, 'hg', person.id)],
        `${person.short || person.name} darf am ${dateIso} nicht gleichzeitig BD und HG übernehmen.`
      );
    }
  }

  // Keine direkt aufeinanderfolgenden BD – einschließlich Monatsgrenzen,
  // soweit der Nachbartag im geladenen Plan vorhanden ist.
  for (let index = 0; index < days.length - 1; index += 1) {
    const first = days[index];
    const second = days[index + 1];
    for (const person of staff) {
      addAtMostOne(
        `consecutive-bd:${first}:${second}:${person.id}`,
        'sequence',
        [literalFor(first, 'bd', person.id), literalFor(second, 'bd', person.id)],
        `${person.short || person.name} darf nicht an zwei aufeinanderfolgenden Tagen BD übernehmen.`
      );
    }
  }

  // HG Montag bis Donnerstag vor eigenem BD am Folgetag ist ausgeschlossen.
  for (let index = 0; index < days.length - 1; index += 1) {
    const first = days[index];
    if (weekday(first) < 1 || weekday(first) > 4) continue;
    const second = days[index + 1];
    for (const person of staff) {
      addAtMostOne(
        `weekday-hg-before-bd:${first}:${second}:${person.id}`,
        'sequence',
        [literalFor(first, 'hg', person.id), literalFor(second, 'bd', person.id)],
        `${person.short || person.name}: HG am Werktag ${first} schließt eigenen BD am ${second} aus.`
      );
    }
  }

  // Personenbezogene Grenzen zählen ausschließlich die Variablen der Person.
  for (const person of staff) {
    const limits = config.staffLimits?.[person.id] || {};
    const bdTerms = assignmentVariables
      .filter(variable => variable.staffId === person.id && variable.slot.role === 'bd')
      .map(variable => [variable.index, 1]);
    const hgTerms = assignmentVariables
      .filter(variable => variable.staffId === person.id && variable.slot.role === 'hg')
      .map(variable => [variable.index, 1]);
    const totalTerms = [...bdTerms, ...hgTerms];
    const maxBd = normalizeCap(limits.maxBd ?? person.maxBd);
    const maxHg = normalizeCap(limits.maxHg);
    const maxTotal = normalizeCap(limits.maxTotal);
    if (maxBd !== null) addConstraint({
      id: `monthly-bd-limit:${person.id}`,
      group: 'limits',
      terms: bdTerms,
      lb: 0,
      ub: maxBd - countFixedRole(baseline, person.id, 'bd'),
      detail: `${person.short || person.name}: höchstens ${maxBd} BD im Monat.`
    });
    if (maxHg !== null) addConstraint({
      id: `monthly-hg-limit:${person.id}`,
      group: 'limits',
      terms: hgTerms,
      lb: 0,
      ub: maxHg - countFixedRole(baseline, person.id, 'hg'),
      detail: `${person.short || person.name}: höchstens ${maxHg} HG im Monat.`
    });
    if (maxTotal !== null) addConstraint({
      id: `monthly-total-limit:${person.id}`,
      group: 'limits',
      terms: totalTerms,
      lb: 0,
      ub: maxTotal - countFixedTotal(baseline, person.id),
      detail: `${person.short || person.name}: höchstens ${maxTotal} Dienste im Monat.`
    });
  }

  // Exakte BD-Sollabweichungen und Maximin-Vorstufe.
  const maxBdDeviation = addAuxiliary('fairness_max_bd_deviation', 0, 62, { objective: 'fairnessMax' });
  components.fairnessMax.terms.push([maxBdDeviation, 1]);
  for (const person of staff) {
    const bdTerms = assignmentVariables
      .filter(variable => variable.staffId === person.id && variable.slot.role === 'bd')
      .map(variable => [variable.index, 1]);
    const fixed = countFixedRole(baseline, person.id, 'bd');
    const target = Math.max(0, Math.round(Number(person.bdTarget || 0)));
    const deviation = addAuxiliary(`bd_deviation_${person.id}`, 0, 62, { staffId: person.id, objective: 'targetDeviation' });
    addConstraint({
      id: `bd-target-high:${person.id}`,
      group: 'fairness',
      terms: [...bdTerms, [deviation, -1]],
      lb: -MAX_BOUND,
      ub: target - fixed,
      detail: `${person.short || person.name}: positive BD-Sollabweichung.`
    });
    addConstraint({
      id: `bd-target-low:${person.id}`,
      group: 'fairness',
      terms: [...bdTerms.map(([index, coefficient]) => [index, -coefficient]), [deviation, -1]],
      lb: -MAX_BOUND,
      ub: fixed - target,
      detail: `${person.short || person.name}: negative BD-Sollabweichung.`
    });
    addConstraint({
      id: `bd-target-max:${person.id}`,
      group: 'fairness',
      terms: [[deviation, 1], [maxBdDeviation, -1]],
      lb: -MAX_BOUND,
      ub: 0,
      detail: `${person.short || person.name}: Abweichung fließt in die maximale Belastungsabweichung ein.`
    });
    components.targetDeviation.terms.push([deviation, 1]);
  }

  // Spannweite der kombinierten Dienstzahl für HG-fähige Personen.
  const specialists = staff.filter(person => days.some(dateIso => getRoleProperties(person, dateIso).canHg));
  if (specialists.length > 1) {
    const maximum = addAuxiliary('combined_load_max', 0, 124, { objective: 'combinedSpread' });
    const minimum = addAuxiliary('combined_load_min', 0, 124, { objective: 'combinedSpread' });
    components.combinedSpread.terms.push([maximum, 1], [minimum, -1]);
    for (const person of specialists) {
      const terms = assignmentVariables
        .filter(variable => variable.staffId === person.id)
        .map(variable => [variable.index, 1]);
      const fixed = countFixedTotal(baseline, person.id);
      addConstraint({
        id: `combined-load-max:${person.id}`,
        group: 'fairness',
        terms: [...terms, [maximum, -1]],
        constant: fixed,
        lb: -MAX_BOUND,
        ub: 0,
        detail: `${person.short || person.name}: kombinierte Last liegt unter dem Gruppenmaximum.`
      });
      addConstraint({
        id: `combined-load-min:${person.id}`,
        group: 'fairness',
        terms: [...terms, [minimum, -1]],
        constant: fixed,
        lb: 0,
        ub: MAX_BOUND,
        detail: `${person.short || person.name}: kombinierte Last liegt über dem Gruppenminimum.`
      });
    }
  }

  // Spannweite der Wochenenddienste.
  if (staff.length > 1) {
    const maximum = addAuxiliary('weekend_load_max', 0, 62, { objective: 'weekendSpread' });
    const minimum = addAuxiliary('weekend_load_min', 0, 62, { objective: 'weekendSpread' });
    components.weekendSpread.terms.push([maximum, 1], [minimum, -1]);
    for (const person of staff) {
      const terms = assignmentVariables
        .filter(variable => variable.staffId === person.id && [5, 6, 0].includes(weekday(variable.slot.dateIso)))
        .map(variable => [variable.index, 1]);
      const fixed = countFixedWeekend(baseline, person.id);
      addConstraint({
        id: `weekend-load-max:${person.id}`,
        group: 'fairness',
        terms: [...terms, [maximum, -1]],
        constant: fixed,
        lb: -MAX_BOUND,
        ub: 0,
        detail: `${person.short || person.name}: Wochenendlast liegt unter dem Gruppenmaximum.`
      });
      addConstraint({
        id: `weekend-load-min:${person.id}`,
        group: 'fairness',
        terms: [...terms, [minimum, -1]],
        constant: fixed,
        lb: 0,
        ub: MAX_BOUND,
        detail: `${person.short || person.name}: Wochenendlast liegt über dem Gruppenminimum.`
      });
    }
  }

  // Freitag-BD, Samstag frei, Sonntag-BD derselben Person möglichst vermeiden.
  // Die AND-Linearisierung erzeugt exakt dann eine Strafvariable, wenn beide
  // BD-Zuordnungen derselben Person aktiv sind.
  for (const fridayIso of days.filter(dateIso => weekday(dateIso) === 5)) {
    const sundayIso = addIsoDays(fridayIso, 2);
    if (!baseline.days?.[sundayIso]) continue;
    for (const person of staff) {
      const friday = literalFor(fridayIso, 'bd', person.id);
      const sunday = literalFor(sundayIso, 'bd', person.id);
      if ((friday.constant || 0) === 0 && friday.variableIndex === null) continue;
      if ((sunday.constant || 0) === 0 && sunday.variableIndex === null) continue;
      if (friday.constant === 1 && sunday.constant === 1) {
        components.splitWeekend.constant += Number(config.v95SplitWeekendWeight || 8);
        continue;
      }
      if (friday.constant === 1 && sunday.variableIndex !== null) {
        components.splitWeekend.terms.push([sunday.variableIndex, Number(config.v95SplitWeekendWeight || 8)]);
        continue;
      }
      if (sunday.constant === 1 && friday.variableIndex !== null) {
        components.splitWeekend.terms.push([friday.variableIndex, Number(config.v95SplitWeekendWeight || 8)]);
        continue;
      }
      if (friday.variableIndex === null || sunday.variableIndex === null) continue;
      const both = addAuxiliary(`split_weekend_${fridayIso}_${person.id}`, 0, 1, {
        objective: 'splitWeekend',
        staffId: person.id,
        fridayIso,
        sundayIso
      });
      addConstraint({
        id: `split-weekend-upper-friday:${fridayIso}:${person.id}`,
        group: 'pattern',
        terms: [[both, 1], [friday.variableIndex, -1]],
        lb: -MAX_BOUND,
        ub: 0,
        detail: 'Split-Wochenende: Hilfsvariable höchstens Freitag-BD.'
      });
      addConstraint({
        id: `split-weekend-upper-sunday:${fridayIso}:${person.id}`,
        group: 'pattern',
        terms: [[both, 1], [sunday.variableIndex, -1]],
        lb: -MAX_BOUND,
        ub: 0,
        detail: 'Split-Wochenende: Hilfsvariable höchstens Sonntag-BD.'
      });
      addConstraint({
        id: `split-weekend-lower:${fridayIso}:${person.id}`,
        group: 'pattern',
        terms: [[both, 1], [friday.variableIndex, -1], [sunday.variableIndex, -1]],
        lb: -1,
        ub: MAX_BOUND,
        detail: `${person.short || person.name}: Freitag-BD und Sonntag-BD desselben Wochenendes werden als unerwünschte Kombination gewertet.`
      });
      components.splitWeekend.terms.push([both, Number(config.v95SplitWeekendWeight || 8)]);
    }
  }

  // Wünsche als echte Erfüllungsindikatoren statt Abstand von Personenindizes.
  for (const person of staff) {
    for (const dateIso of days) {
      const preference = getPreference(baseline, person.id, dateIso);
      const requestedRoles = ROLES.filter(role => isPositivePreference(preference, role));
      if (!requestedRoles.length) continue;
      const fixedFulfilled = requestedRoles.some(role => baseline.days?.[dateIso]?.[role] === person.id);
      if (fixedFulfilled) continue;
      const targetVariables = requestedRoles
        .map(role => assignmentByKey.get(`${dateIso}|${role}|${person.id}`))
        .filter(index => index !== undefined);
      if (!targetVariables.length) {
        components.wishes.constant += 1;
        continue;
      }
      const missed = addAuxiliary(`missed_wish_${dateIso}_${person.id}`, 0, 1, {
        objective: 'wishes',
        staffId: person.id,
        dateIso
      });
      addConstraint({
        id: `wish-satisfaction:${dateIso}:${person.id}`,
        group: 'wishes',
        terms: [[missed, 1], ...targetVariables.map(index => [index, 1])],
        lb: 1,
        ub: 1,
        detail: `${person.short || person.name}: Wunsch am ${dateIso} wird erfüllt oder als verfehlt gezählt.`
      });
      components.wishes.terms.push([missed, 1]);
    }
  }

  const hintMap = {};
  for (const hint of hints || []) {
    const slotKey = `${hint.dateIso}|${hint.role}`;
    const chosen = assignmentByKey.get(`${slotKey}|${hint.staffId}`);
    for (const variableIndex of assignmentsBySlot.get(slotKey) || []) hintMap[variableIndex] = variableIndex === chosen ? 1 : 0;
  }

  const phaseOrder = [
    'confirmations',
    'orange',
    'yellow',
    'fairnessMax',
    'targetDeviation',
    'splitWeekend',
    'combinedSpread',
    'weekendSpread',
    'wishes',
    'recommendations'
  ];

  const model = {
    revision: AUTO_PLAN_MODEL_REVISION,
    id: AUTO_PLAN_MODEL_ID,
    variables,
    assignmentVariables,
    auxiliaryVariables,
    assignmentByKey,
    assignmentsBySlot,
    assignmentsByStaff,
    constraints,
    structuralConflicts,
    components,
    phaseOrder,
    hintMap,
    staff: staff.map(person => ({ id: person.id, name: person.name, short: person.short, bdTarget: person.bdTarget || 0 })),
    openSlots,
    explanations,
    counts: {
      staff: staff.length,
      openSlots: openSlots.length,
      assignmentVariables: assignmentVariables.length,
      auxiliaryVariables: auxiliaryVariables.length,
      constraints: constraints.length,
      structuralConflicts: structuralConflicts.length
    }
  };

  model.fingerprint = fingerprint({
    revision: model.revision,
    variables: variables.map(variable => ({ name: variable.name, lb: variable.lb, ub: variable.ub, kind: variable.kind })),
    constraints,
    phaseOrder,
    config: {
      allowRedFallback: config.allowRedFallback,
      staffLimits: config.staffLimits,
      v95SplitWeekendWeight: config.v95SplitWeekendWeight
    }
  });

  return model;
}

export function assignmentHintsFromMonth(monthData, baseline) {
  const hints = [];
  for (const [dateIso, day] of Object.entries(monthData?.days || {})) {
    for (const role of ROLES) {
      if (baseline?.days?.[dateIso]?.[role]) continue;
      if (day?.[role]) hints.push({ dateIso, role, staffId: day[role] });
    }
  }
  return hints;
}

export function materializeBooleanSolution(model, baseline, solution) {
  const monthData = clone(baseline);
  for (const [slotKey, staffId] of Object.entries(solution || {})) {
    const [dateIso, role] = slotKey.split('|');
    if (monthData.days?.[dateIso] && ROLES.includes(role)) monthData.days[dateIso][role] = staffId;
  }
  return monthData;
}

export function objectiveValueForComponent(model, componentId, values) {
  const component = model?.components?.[componentId];
  if (!component) return 0;
  return component.constant + component.terms.reduce((sum, [index, coefficient]) =>
    sum + Number(values?.[index] || 0) * coefficient, 0);
}

export function assignmentValueMap(model, solution) {
  const result = new Map();
  for (const variable of model?.assignmentVariables || []) {
    const selected = solution?.[variable.slot.key] === variable.staffId;
    result.set(variable.index, selected ? 1 : 0);
  }
  return result;
}
