/**
 * Auto-Plan v9 – versionierte Constraint Registry und Solver-Snapshot.
 *
 * Der native Solver erhält keine frei erfundenen Eignungsregeln. Statische
 * Kandidatendomänen, Schweregrade, Bestätigungsarten und Begründungen werden aus
 * derselben produktiven Regelengine kompiliert, die auch die manuelle Auswahl
 * und den abschließenden Browseraudit verwendet. Zeitliche Relationen werden
 * zusätzlich als explizite, versionierte Constraints übertragen.
 */
import {
  addDays,
  evaluateCandidate,
  getPlanningStaff,
  getRoleProperties,
  parseIso,
  toLocalIso
} from './rules.js?v=20260803.4';

export const AUTO_PLAN_V9_RULESET_VERSION = '5.0.0';
export const AUTO_PLAN_V9_SCHEMA_VERSION = 9;

export const AUTO_PLAN_V9_LEVEL_WEIGHT = Object.freeze({
  green: 0,
  yellow: 100,
  orange: 10_000,
  red: 1_000_000,
  gray: 1_000_000_000
});

export const AUTO_PLAN_V9_CONSTRAINTS = Object.freeze([
  Object.freeze({ id: 'SLOT_COVERAGE', category: 'technical-hard', relaxable: false, title: 'Jedes offene Dienstfeld genau einmal belegen' }),
  Object.freeze({ id: 'QUALIFICATION_REQUIRED', category: 'technical-hard', relaxable: false, title: 'Datumsabhängige Qualifikation erforderlich' }),
  Object.freeze({ id: 'ACTIVE_STAFF_REQUIRED', category: 'technical-hard', relaxable: false, title: 'Nur aktive Mitarbeitende einteilen' }),
  Object.freeze({ id: 'NO_SAME_DAY_BD_HG', category: 'technical-hard', relaxable: false, title: 'Kein gleichzeitiger BD und HG' }),
  Object.freeze({ id: 'NO_CONSECUTIVE_BD', category: 'technical-hard', relaxable: false, title: 'Keine direkt aufeinanderfolgenden BD' }),
  Object.freeze({ id: 'PERSON_MAX_BD', category: 'business-hard', relaxable: true, title: 'Personengebundene BD-Obergrenze' }),
  Object.freeze({ id: 'PERSON_MAX_HG', category: 'business-hard', relaxable: true, title: 'Personengebundene HG-Obergrenze' }),
  Object.freeze({ id: 'PERSON_MAX_TOTAL', category: 'business-hard', relaxable: true, title: 'Personengebundene Gesamtobergrenze' }),
  Object.freeze({ id: 'WEEKDAY_HG_BEFORE_OWN_BD', category: 'confirmable', relaxable: true, title: 'Werktäglicher HG unmittelbar vor eigenem BD' }),
  Object.freeze({ id: 'STATIC_CANDIDATE_LEVEL', category: 'quality', relaxable: true, title: 'Produktive Kandidatenbewertung' }),
  Object.freeze({ id: 'BD_TARGET_DEVIATION', category: 'fairness', relaxable: true, title: 'Abweichung vom persönlichen BD-Soll' }),
  Object.freeze({ id: 'TOTAL_LOAD_SPREAD', category: 'fairness', relaxable: true, title: 'Spannweite der Gesamtbelastung' }),
  Object.freeze({ id: 'WEEKEND_LOAD_SPREAD', category: 'fairness', relaxable: true, title: 'Spannweite der Wochenendbelastung' }),
  Object.freeze({ id: 'PLAN_STABILITY', category: 'stability', relaxable: true, title: 'Änderungen gegenüber dem Ausgangsplan' }),
  Object.freeze({ id: 'ALTERNATIVE_DISTANCE', category: 'diversity', relaxable: true, title: 'Mindestabstand zwischen Varianten' })
]);

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Map) return [...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(stableValue);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

export function stableFingerprint(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}:${text.length}`;
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function sandboxState(state, monthData) {
  const months = new Map(state?.months || []);
  months.set(monthKey(monthData.year, monthData.month), monthData);
  return {
    ...state,
    months,
    currentYear: monthData.year,
    currentMonth: monthData.month
  };
}

function limitsFor(staffId, runConfig) {
  const source = runConfig?.staffLimits?.[staffId] || {};
  const normalized = value => value === null || value === undefined || value === ''
    ? null
    : Math.max(0, Math.round(Number(value) || 0));
  return {
    maxBd: normalized(source.maxBd),
    maxHg: normalized(source.maxHg),
    maxTotal: normalized(source.maxTotal)
  };
}

function rolePropertiesByDate(person, dates) {
  return Object.fromEntries(dates.map(dateIso => {
    const properties = getRoleProperties(person, dateIso);
    return [dateIso, {
      canBd: properties.canBd !== false,
      canHg: properties.canHg === true,
      canSaturdayBd: properties.canSaturdayBd === true,
      category: properties.category || person.category || null,
      roleLabel: properties.roleLabel || person.roleLabel || null
    }];
  }));
}

function fixedAssignments(monthData) {
  const result = [];
  for (const dateIso of Object.keys(monthData?.days || {}).sort()) {
    for (const role of ['bd', 'hg']) {
      const staffId = monthData.days?.[dateIso]?.[role] || '';
      if (staffId) result.push({ dateIso, role, staffId });
    }
  }
  return result;
}

function compileRelations(dates) {
  const dateSet = new Set(dates);
  const relations = [];
  for (const dateIso of dates) {
    const date = parseIso(dateIso);
    const nextIso = toLocalIso(addDays(date, 1));
    relations.push({ id: 'NO_SAME_DAY_BD_HG', dateIso, roles: ['bd', 'hg'] });
    if (dateSet.has(nextIso)) {
      relations.push({ id: 'NO_CONSECUTIVE_BD', leftDateIso: dateIso, rightDateIso: nextIso, role: 'bd' });
      if (date.getDay() >= 1 && date.getDay() <= 4) {
        relations.push({ id: 'WEEKDAY_HG_BEFORE_OWN_BD', leftDateIso: dateIso, leftRole: 'hg', rightDateIso: nextIso, rightRole: 'bd' });
      }
    }
  }
  return relations;
}

function objectiveConfig(runConfig = {}, settings = {}) {
  const v9 = settings?.autoPlan?.v9 || settings?.v9 || {};
  const bounded = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  };
  const mode = ['quick', 'balanced', 'intensive', 'proof'].includes(v9.mode) ? v9.mode : 'balanced';
  const defaults = {
    quick: { alternatives: 1, exactLns: true, targetGapPermille: 100 },
    balanced: { alternatives: 3, exactLns: true, targetGapPermille: 20 },
    intensive: { alternatives: 5, exactLns: true, targetGapPermille: 10 },
    proof: { alternatives: 3, exactLns: true, targetGapPermille: 0 }
  }[mode];
  return {
    mode,
    goal: ['new-plan', 'repair', 'minimal-change'].includes(v9.goal) ? v9.goal : 'new-plan',
    timeBudgetMs: bounded(runConfig.timeBudgetMs, 10_000, 900_000, 60_000),
    allowRedFallback: runConfig.allowRedFallback === true,
    maxRedViolations: runConfig.maxRedViolations === null || runConfig.maxRedViolations === undefined
      ? null
      : bounded(runConfig.maxRedViolations, 0, 62, 0),
    alternatives: bounded(v9.alternatives, 1, 5, defaults.alternatives),
    minimumAlternativeDistance: bounded(v9.minimumAlternativeDistance, 1, 20, 5),
    targetGapPermille: bounded(v9.targetGapPermille, 0, 500, defaults.targetGapPermille),
    deterministic: v9.deterministic === true,
    exactLns: v9.exactLns === undefined ? defaults.exactLns : v9.exactLns === true,
    lnsMinSize: bounded(v9.lnsMinSize, 4, 30, 8),
    lnsMaxSize: bounded(v9.lnsMaxSize, 8, 62, 24),
    maxChanges: v9.maxChanges === null || v9.maxChanges === undefined || v9.maxChanges === ''
      ? null
      : bounded(v9.maxChanges, 0, 62, 62),
    optimizationFocus: runConfig.optimizationFocus || 'balanced',
    seed: bounded(v9.seed, 0, 2_147_483_647, 0),
    relaxationPolicy: {
      absence: v9.relaxAbsence !== false,
      hardMaximum: v9.relaxHardMaximum === true,
      organizational: v9.relaxOrganizational !== false
    }
  };
}

/**
 * Erstellt den transportfähigen, vollständig versionierten Solver-Snapshot.
 */
export function compileAutoPlanV9Snapshot({ state, monthData, runConfig = {} }) {
  if (!state || !monthData?.days) throw new TypeError('Auto-Plan v9 benötigt Zustand und Monatsdaten.');
  const dates = Object.keys(monthData.days).sort();
  const sandbox = sandboxState(state, clone(monthData));
  const staffMap = new Map();
  for (const dateIso of dates) {
    for (const person of getPlanningStaff(state.staff || [], dateIso)) staffMap.set(person.id, person);
  }
  const staff = [...staffMap.values()].map(person => ({
    id: person.id,
    name: person.name,
    short: person.short,
    category: person.category,
    bdTarget: Math.max(0, Math.round(Number(person.bdTarget) || 0)),
    limits: limitsFor(person.id, runConfig),
    roleProperties: rolePropertiesByDate(person, dates)
  }));

  const slots = [];
  for (const dateIso of dates) {
    for (const role of ['bd', 'hg']) {
      const fixedStaffId = monthData.days?.[dateIso]?.[role] || '';
      const candidates = [];
      if (!fixedStaffId) {
        for (const person of getPlanningStaff(state.staff || [], dateIso)) {
          const evaluation = evaluateCandidate({
            state: sandbox,
            monthData,
            dateIso,
            role,
            staffId: person.id
          });
          candidates.push({
            staffId: person.id,
            level: evaluation.level,
            canSelect: evaluation.canSelect !== false,
            confirmationType: evaluation.meta?.confirmationType || null,
            recommendationScore: Math.round(Number(evaluation.meta?.recommendationScore) || 0),
            recommendationVector: Array.isArray(evaluation.meta?.recommendationVector)
              ? evaluation.meta.recommendationVector.map(value => Math.round(Number(value) || 0))
              : [],
            reasons: Array.isArray(evaluation.reasons) ? evaluation.reasons.map(String) : []
          });
        }
      }
      slots.push({ dateIso, role, fixedStaffId: fixedStaffId || null, candidates });
    }
  }

  const baseline = clone(monthData);
  const config = objectiveConfig(runConfig, state.settings || {});
  const payload = {
    schemaVersion: AUTO_PLAN_V9_SCHEMA_VERSION,
    rulesetVersion: AUTO_PLAN_V9_RULESET_VERSION,
    generatedAt: new Date().toISOString(),
    year: monthData.year,
    month: monthData.month,
    dates,
    staff,
    slots,
    relations: compileRelations(dates),
    fixedAssignments: fixedAssignments(monthData),
    baseline,
    config
  };
  payload.baselineFingerprint = stableFingerprint({
    year: monthData.year,
    month: monthData.month,
    revision: monthData.revision || 0,
    days: monthData.days,
    absences: monthData.absences || {},
    preferences: monthData.preferences || {},
    options: monthData.options || {},
    staff: staff.map(person => ({ id: person.id, category: person.category, bdTarget: person.bdTarget, limits: person.limits, roleProperties: person.roleProperties }))
  });
  payload.configFingerprint = stableFingerprint(config);
  payload.requestFingerprint = stableFingerprint({
    baselineFingerprint: payload.baselineFingerprint,
    configFingerprint: payload.configFingerprint,
    rulesetVersion: payload.rulesetVersion
  });
  return payload;
}

export function constraintDescriptor(id) {
  return AUTO_PLAN_V9_CONSTRAINTS.find(item => item.id === id) || null;
}
