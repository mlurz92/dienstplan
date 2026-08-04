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
  setAssignment,
  setPeerGroupCacheToken
} from './rules.js?v=20260803.4';
import { createPacer, yieldToBrowser } from './cooperative-scheduling.js?v=20260803.4';
import { AUTO_PLAN_BD_LIMITS } from './defaults.js?v=20260803.4';
import {
  baselineOpenSlots,
  buildLedger,
  cloneLedger as cloneLedgerCounts,
  internStaffId,
  monthDatesOf,
  primeStaffIds,
  planToken,
  spread
} from './auto-plan-index.js?v=20260803.4';

const LEVEL_RANK = Object.freeze({ green: 0, yellow: 1, orange: 2, red: 3, gray: 4 });
const ROLE_ORDER = Object.freeze(['bd', 'hg']);
const SEARCH_MODE = Object.freeze({ STRICT: 'strict', CONFIRMABLE: 'confirmable' });
const FOCUS_VALUES = new Set(['balanced', 'wishes', 'workload', 'weekends']);
const INTENSITY_VALUES = new Set(['standard', 'deep', 'maximum']);
const EPSILON = 1e-9;
const MAX_EXACT_REMAINING = 7;
const assignmentLedgers = new WeakMap();
/**
 * Suchstrahlbreiten der Konstruktionsphase.
 *
 * Die Konstruktion liefert den Ausgangspunkt, nicht das Ergebnis: Die eigentliche
 * Qualität entsteht in der nachgelagerten iterativen Optimierung, die den
 * gesamten Zeitrahmen bekommt. Sehr breite Suchstrahlen kosten hier
 * überproportional viel Zeit – jede zusätzliche Variante braucht eigene
 * Regelbewertungen für Kandidaten und Vorwärts-Checking – und verbessern den
 * Startpunkt nur noch marginal. Die Breiten bleiben deshalb bewusst moderat.
 */
const PRESETS = Object.freeze({
  standard: { beam: 10, branch: 5, deepBeam: 18, deepBranch: 7, fallbackBeam: 24, fallbackBranch: 9, exact: 3200, lookahead: 3, polish: 1 },
  deep: { beam: 16, branch: 6, deepBeam: 28, deepBranch: 9, fallbackBeam: 36, fallbackBranch: 11, exact: 9000, lookahead: 4, polish: 2 },
  maximum: { beam: 24, branch: 8, deepBeam: 44, deepBranch: 12, fallbackBeam: 56, fallbackBranch: 14, exact: 22000, lookahead: 5, polish: 3 }
});


/**
 * Gemeinsame Marke für den Vergleichsgruppen-Speicher der Regelbewertung.
 *
 * Alle Stufen des Auto-Plans verwenden dieselbe Marke. Zwei verschiedene
 * Markenformate würden sich gegenseitig verwerfen und den Speicher wirkungslos
 * machen. Die Marke beschreibt den vollständigen Belegungszustand eines Monats
 * und trägt zusätzlich die laufende Nummer des Planungslaufs, damit ein
 * späterer Lauf mit anderen Abwesenheiten oder Wünschen nie auf Einträge des
 * vorigen trifft.
 *
 * Aufzurufen ist sie vor jeder Stelle, die bewertet – und zwar mit genau dem
 * Monat, der bewertet wird.
 */
let evaluationEpoch = 0;

export function beginEvaluationEpoch(staff = null) {
  evaluationEpoch += 1;
  primeStaffIds(staff);
  setPeerGroupCacheToken(null);
}

/**
 * Meldet den Belegungszustand an den Vergleichsgruppen-Speicher.
 *
 * Die Marke war zuvor eine fortlaufend verkettete Zeichenkette über alle Tage
 * des Monats – gebildet in jedem einzelnen Bewertungspfad. Sie entsteht jetzt
 * verlustfrei aus internierten Personal-Kennungen über ein vorbelegtes Feld.
 * Der Inhalt der Marke ist unverändert eindeutig; nur ihre Bildung kostet nicht
 * mehr in jeder Bewertung einen vollständigen Satz Zwischenzeichenketten.
 */
export function syncPeerCache(monthData) {
  if (!monthData?.days) {
    setPeerGroupCacheToken(null);
    return;
  }
  setPeerGroupCacheToken(planToken(monthData, evaluationEpoch));
}

/**
 * Direktes Setzen einer bereits bekannten Marke.
 *
 * Wer genau einen Schreibtrichter in den Arbeitsmonat besitzt, kennt seinen
 * Zustand exakt und muss ihn nicht aus den Daten ableiten. Der
 * Perfektionsoptimierer nutzt das; für alle anderen bleibt `syncPeerCache` der
 * einzige Weg.
 */
export function adoptPeerCacheToken(token) {
  setPeerGroupCacheToken(token);
}

export function currentEvaluationEpoch() {
  return evaluationEpoch;
}

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

async function report(onProgress, payload) {
  if (typeof onProgress === 'function') await onProgress(payload);
}

function simulatedState(state, monthData) {
  const months = new Map(state?.months || []);
  months.set(keyForMonth(monthData.year, monthData.month), monthData);
  return { ...state, months, currentYear: monthData.year, currentMonth: monthData.month };
}

/**
 * Die sortierten Kalendertage eines Monats.
 *
 * Zuvor sortierte jeder Aufruf neu. Da die Funktion aus `openSlots`,
 * `proposedAssignments`, `auditProposal` und der Fairnessbewertung heraus
 * aufgerufen wird, fiel das je Zielfunktionsauswertung mehrfach an. Das
 * Ergebnis hängt allein am Monatsobjekt und wird deshalb dort gehalten.
 */
function monthDates(monthData) {
  return monthDatesOf(monthData);
}

const buildAssignmentLedger = buildLedger;
const cloneLedger = cloneLedgerCounts;

function ledgerFor(monthData, stats = null) {
  let ledger = assignmentLedgers.get(monthData);
  if (ledger) {
    if (stats) stats.assignmentLedgerHits += 1;
    return ledger;
  }
  ledger = buildAssignmentLedger(monthData);
  assignmentLedgers.set(monthData, ledger);
  if (stats) stats.assignmentLedgerMisses += 1;
  return ledger;
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

/**
 * Zugänge für die nachgelagerte Perfektionsphase.
 *
 * Zielfunktion, Vergleich und Zulässigkeitsprüfung existieren bewusst nur an
 * einer Stelle: Konstruktion und iterative Optimierung müssen dieselbe Ordnung
 * verwenden, sonst verbessert die eine Phase, was die andere für schlechter
 * hält.
 */
export function evaluatePlanObjective(state, monthData, baseline, config) {
  return finalObjective(state, monthData, baseline, config);
}

export function compareObjectiveKeys(left, right) {
  return compareVectors(left, right);
}

export function isObjectiveAdmissible(objective, allowRed) {
  return admissible(objective, allowRed ? SEARCH_MODE.CONFIRMABLE : SEARCH_MODE.STRICT);
}

export function listOpenSlots(monthData) {
  return openSlots(monthData);
}

export function listProposedAssignments(monthData, baseline) {
  return proposedAssignments(monthData, baseline);
}

export function planRespectsLimits(monthData, staffId, role, config) {
  return respectsLimits(monthData, staffId, role, config);
}

export function planningContextFor(state, baseline) {
  return planningContext(state, baseline);
}

export function candidateEvaluationVector(evaluation) {
  return vectorOf(evaluation);
}

/**
 * Die Kennungen der Suchläufe eines Monats, in der Reihenfolge ihrer Stufe.
 * Der Läufer verteilt sie auf eigene Arbeitsstränge.
 */
export function planProfileIds(state, monthData, runConfig = null) {
  const config = normalizeAutoPlanConfig(state, monthData, runConfig);
  return profiles(config, {}).map(profile => profile.id);
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

function invalidCap(value) {
  if (value === null || value === undefined || value === '') return false;
  const number = Number(value);
  return !Number.isFinite(number) || !Number.isInteger(number) || number < 0;
}

/**
 * Vorgeschlagene BD-Obergrenze einer Person.
 *
 * Zusammengeführt werden das im Personalstamm hinterlegte harte Monatsmaximum
 * und die für den Auto-Plan festgelegte Vorgabe; es gilt der strengere Wert.
 * Bereits gesetzte Dienste heben die Grenze bei Bedarf an – eine Vorgabe, die
 * unter dem bestehenden Stand liegt, würde sonst bei jedem Öffnen des Studios
 * den Start blockieren, ohne dass jemand etwas falsch gemacht hätte.
 */
function defaultBdLimit(monthData, person) {
  const configured = [normalizeCap(person.maxBd), normalizeCap(AUTO_PLAN_BD_LIMITS[person.id])]
    .filter(value => value !== null);
  if (!configured.length) return null;
  return Math.max(Math.min(...configured), countRoleInMonth(monthData, person.id, 'bd'));
}

/**
 * Vorgeschlagene HG-Obergrenze einer Person.
 *
 * Wer im gesamten Monat an keinem einzigen Tag HG-berechtigt ist, bekommt die
 * Grenze null: Assistenzärztinnen und Assistenzärzte planen keinen
 * Hintergrunddienst. Abgeleitet wird das aus der datumsabhängigen
 * Qualifikation und nicht aus einer festen Namensliste – eine Beförderung im
 * laufenden Monat hebt die Vorgabe damit von selbst wieder auf.
 */
function defaultHgLimit(state, monthData, person) {
  const dates = monthDates(monthData);
  if (dates.some(dateIso => getRoleProperties(person, dateIso).canHg)) return null;
  return Math.max(0, countRoleInMonth(monthData, person.id, 'hg'));
}

export function createDefaultAutoPlanConfig(state, monthData) {
  return {
    searchIntensity: 'deep',
    optimizationFocus: 'balanced',
    allowRedFallback: true,
    maxRedViolations: null,
    solverBackend: 'auto',
    cpSatTimeBudgetSeconds: 10,
    cpSatWorkers: null,
    cpSatWarmStart: 'heuristic',
    fairnessProfile: 'leximin',
    deterministic: true,
    infeasibilityMode: 'mus',
    repairOnEdit: true,
    explanationDepth: 'detailed',
    randomSeed: null,
    staffLimits: Object.fromEntries(monthPlanningStaff(state, monthData).map(person => [person.id, {
      maxBd: defaultBdLimit(monthData, person),
      maxHg: defaultHgLimit(state, monthData, person),
      maxTotal: null
    }]))
  };
}

const SOLVER_BACKENDS = new Set(['auto', 'cp-sat-exact', 'cp-sat-lns', 'heuristic-alns']);
const FAIRNESS_PROFILES = new Set(['leximin', 'spread', 'variance', 'owa']);
const INFEASIBILITY_MODES = new Set(['mus', 'relax', 'report']);
const EXPLANATION_DEPTHS = new Set(['short', 'detailed', 'llm']);

export function normalizeAutoPlanConfig(state, monthData, input = null) {
  const defaults = createDefaultAutoPlanConfig(state, monthData);
  const source = input && typeof input === 'object' ? input : {};
  const settings = state?.settings?.autoPlan && typeof state.settings.autoPlan === 'object' ? state.settings.autoPlan : {};
  const pick = key => (source[key] === undefined ? settings[key] : source[key]);
  const staffLimits = {};
  for (const person of monthPlanningStaff(state, monthData)) {
    const supplied = source.staffLimits?.[person.id] || {};
    staffLimits[person.id] = {
      maxBd: supplied.maxBd === undefined ? defaults.staffLimits[person.id]?.maxBd ?? null : normalizeCap(supplied.maxBd),
      maxHg: supplied.maxHg === undefined ? defaults.staffLimits[person.id]?.maxHg ?? null : normalizeCap(supplied.maxHg),
      maxTotal: supplied.maxTotal === undefined ? defaults.staffLimits[person.id]?.maxTotal ?? null : normalizeCap(supplied.maxTotal)
    };
  }
  const cpSatTimeBudgetSeconds = Number(pick('cpSatTimeBudgetSeconds'));
  const cpSatWorkers = pick('cpSatWorkers');
  const rawRandomSeed = pick('randomSeed');
  const randomSeed = rawRandomSeed === null || rawRandomSeed === undefined || rawRandomSeed === ''
    ? null
    : Number.isFinite(Number(rawRandomSeed))
      ? Number(rawRandomSeed)
      : null;
  return {
    searchIntensity: INTENSITY_VALUES.has(source.searchIntensity) ? source.searchIntensity : defaults.searchIntensity,
    optimizationFocus: FOCUS_VALUES.has(source.optimizationFocus) ? source.optimizationFocus : defaults.optimizationFocus,
    allowRedFallback: source.allowRedFallback === undefined ? defaults.allowRedFallback : source.allowRedFallback === true,
    maxRedViolations: normalizeCap(source.maxRedViolations),
    solverBackend: SOLVER_BACKENDS.has(source.solverBackend ?? settings.solverBackend)
      ? (source.solverBackend ?? settings.solverBackend)
      : defaults.solverBackend,
    cpSatTimeBudgetSeconds: Number.isFinite(cpSatTimeBudgetSeconds)
      ? Math.max(1, Math.min(60, Math.round(cpSatTimeBudgetSeconds)))
      : defaults.cpSatTimeBudgetSeconds,
    cpSatWorkers: Number.isInteger(cpSatWorkers) ? Math.max(1, Math.min(8, cpSatWorkers)) : null,
    cpSatWarmStart: pick('cpSatWarmStart') === 'none' ? 'none' : 'heuristic',
    fairnessProfile: FAIRNESS_PROFILES.has(pick('fairnessProfile')) ? pick('fairnessProfile') : defaults.fairnessProfile,
    deterministic: pick('deterministic') === false ? false : true,
    infeasibilityMode: INFEASIBILITY_MODES.has(pick('infeasibilityMode')) ? pick('infeasibilityMode') : defaults.infeasibilityMode,
    repairOnEdit: pick('repairOnEdit') === false ? false : true,
    explanationDepth: EXPLANATION_DEPTHS.has(pick('explanationDepth')) ? pick('explanationDepth') : defaults.explanationDepth,
    randomSeed,
    staffLimits
  };
}

export function autoPlanConfigFingerprint(config) {
  return JSON.stringify(stableValue(config));
}

export function validateAutoPlanConfig(state, monthData, input = null) {
  const config = normalizeAutoPlanConfig(state, monthData, input);
  const errors = [];
  if (invalidCap(input?.maxRedViolations)) {
    errors.push('Maximal rote Vorschläge müssen eine nichtnegative ganze Zahl oder leer sein.');
  }
  for (const person of monthPlanningStaff(state, monthData)) {
    const limits = config.staffLimits[person.id] || {};
    const supplied = input?.staffLimits?.[person.id] || {};
    for (const [field, label] of [['maxBd', 'BD-Obergrenze'], ['maxHg', 'HG-Obergrenze'], ['maxTotal', 'Gesamtobergrenze']]) {
      if (invalidCap(supplied[field])) {
        errors.push(`${person.short || person.name}: ${label} muss eine nichtnegative ganze Zahl oder leer sein.`);
      }
    }
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

/**
 * Unveränderlicher Planungskontext eines Laufs.
 *
 * Alles, was ausschließlich vom Ausgangsmonat abhängt, wird genau einmal
 * bestimmt: die Tagesliste, die offenen Felder, der Kreis der Fachärzte, die
 * Samstage und vor allem der Katalog erfüllbarer Wünsche. Letzterer erforderte
 * zuvor je Zwischenbewertung einen vollständigen Regeldurchlauf über alle
 * Wunschzellen des Monats und dominierte damit die Laufzeit.
 */
const planningContextCache = new WeakMap();

function planningContext(state, baseline) {
  let cached = planningContextCache.get(baseline);
  if (cached && cached.state === state) return cached;
  const dates = monthDates(baseline);
  const staff = monthPlanningStaff(state, baseline);
  const baselineState = simulatedState(state, baseline);
  const possibleWishes = [];
  syncPeerCache(baseline);
  for (const dateIso of dates) {
    for (const role of ROLE_ORDER) {
      if (baseline.days?.[dateIso]?.[role]) continue;
      for (const person of getPlanningStaff(state.staff, dateIso)) {
        if (!isPositivePreference(getPreference(baseline, person.id, dateIso), role)) continue;
        const evaluation = evaluateCandidate({ state: baselineState, monthData: baseline, dateIso, role, staffId: person.id });
        if (evaluation.level === 'gray' || evaluation.canSelect === false) continue;
        possibleWishes.push({ dateIso, role, staffId: person.id });
      }
    }
  }
  cached = {
    state,
    dates,
    staff,
    openSlots: baselineOpenSlots(baseline),
    specialists: staff.filter(person => dates.some(dateIso => getRoleProperties(person, dateIso).canHg)),
    saturdays: dates.filter(dateIso => parseIso(dateIso).getDay() === 6),
    possibleWishes
  };
  cached.saturdayStaff = cached.staff.filter(person =>
    cached.saturdays.some(dateIso => getRoleProperties(person, dateIso).canSaturdayBd));
  planningContextCache.set(baseline, cached);
  return cached;
}

function respectsLimits(monthData, staffId, role, config, ledger = null) {
  const limits = config.staffLimits?.[staffId];
  if (!limits) return true;
  const bd = (ledger ? Number(ledger.bd[staffId] || 0) : countRoleInMonth(monthData, staffId, 'bd')) + Number(role === 'bd');
  const hg = (ledger ? Number(ledger.hg[staffId] || 0) : countRoleInMonth(monthData, staffId, 'hg')) + Number(role === 'hg');
  return (limits.maxBd === null || bd <= limits.maxBd)
    && (limits.maxHg === null || hg <= limits.maxHg)
    && (limits.maxTotal === null || bd + hg <= limits.maxTotal);
}

function limitsAudit(monthData, config, ledger = null) {
  const violations = [];
  for (const [staffId, limits] of Object.entries(config.staffLimits || {})) {
    const bd = ledger ? Number(ledger.bd[staffId] || 0) : countRoleInMonth(monthData, staffId, 'bd');
    const hg = ledger ? Number(ledger.hg[staffId] || 0) : countRoleInMonth(monthData, staffId, 'hg');
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
    syncPeerCache(monthData);
    const planningStaff = getPlanningStaff(sandbox.staff, dateIso);
    const candidates = planningStaff.map((person, order) => ({
      person,
      order,
      evaluation: evaluateCandidate({ state: sandbox, monthData, dateIso, role, staffId: person.id })
    })).filter(candidate => {
      stats.candidateEvaluations += 1;
      if (candidate.evaluation?.canSelect === false || candidate.evaluation?.level === 'gray') return false;
      if (mode === SEARCH_MODE.STRICT && candidate.evaluation?.level === 'red') return false;
      if (!respectsLimits(monthData, candidate.person.id, role, config, ledgerFor(monthData, stats))) {
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

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function fairnessSnapshot(state, monthData, context, ledger = null) {
  const staff = context?.staff || monthPlanningStaff(state, monthData);
  const specialists = context?.specialists
    || staff.filter(person => monthDates(monthData).some(dateIso => getRoleProperties(person, dateIso).canHg));
  const bdPenalty = staff.reduce((sum, person) => {
    const deviation = (ledger ? Number(ledger.bd[person.id] || 0) : countRoleInMonth(monthData, person.id, 'bd')) - Number(person.bdTarget || 0);
    return sum + (deviation < 0 ? deviation ** 2 : 1.3 * deviation ** 2);
  }, 0);
  const sandbox = simulatedState(state, monthData);
  const bdLoads = staff.map(person => ledger
    ? Number(ledger.bd[person.id] || 0)
    : countRoleInMonth(monthData, person.id, 'bd'));
  const combinedLoads = specialists.map(person => ledger
    ? Number(ledger.bd[person.id] || 0) + Number(ledger.hg[person.id] || 0)
    : countRoleInMonth(monthData, person.id, 'bd') + countRoleInMonth(monthData, person.id, 'hg'));
  const weekendLoads = staff.map(person => computeWeekendEquivalent(monthData, person.id));
  return {
    bdPenalty,
    combinedVariance: variance(combinedLoads),
    aaHgVariance: variance(specialists.map(person => countHgForAaBdExcept(sandbox, monthData, person.id, ''))),
    weekendVariance: variance(weekendLoads),
    /**
     * Spannweiten als nachrangige Gerechtigkeitsmaße.
     *
     * Varianz allein unterscheidet zwei Pläne nicht, bei denen dieselbe Streuung
     * einmal auf viele kleine und einmal auf einen großen Abstand entfällt.
     * Wahrgenommen wird aber genau der Abstand zwischen der am stärksten und der
     * am schwächsten belasteten Person. Die Spannweiten stehen deshalb am Ende
     * der Zielordnung: Sie ändern nichts an bestehenden Entscheidungen und
     * entscheiden nur dort, wo bisher der Zufall der Reihenfolge entschied.
     */
    bdSpread: spread(bdLoads),
    combinedSpread: spread(combinedLoads),
    weekendSpread: Number(spread(weekendLoads).toFixed(4))
  };
}

function saturdayVariance(state, monthData, context) {
  const saturdays = context?.saturdays || monthDates(monthData).filter(dateIso => parseIso(dateIso).getDay() === 6);
  const eligible = context?.saturdayStaff || monthPlanningStaff(state, monthData).filter(person =>
    saturdays.some(dateIso => getRoleProperties(person, dateIso).canSaturdayBd));
  return variance(eligible.map(person => saturdays.filter(dateIso => monthData.days?.[dateIso]?.bd === person.id).length));
}

function wishSnapshot(state, monthData, baseline) {
  const context = planningContext(state, baseline);
  const possible = context.possibleWishes.length;
  const fulfilled = context.possibleWishes.filter(wish =>
    monthData.days?.[wish.dateIso]?.[wish.role] === wish.staffId).length;
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
  const context = planningContext(state, baseline);
  const audit = auditProposal(state, monthData, baseline);
  const fairness = fairnessSnapshot(state, monthData, context);
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
      ...softObjectiveKey(config, audit, wishes, fairness, saturdayVariance(state, monthData, context)),
      -audit.recommendation[3],
      -audit.recommendation[4],
      -audit.recommendation[5],
      fairness.bdSpread,
      fairness.combinedSpread,
      fairness.weekendSpread
    ]
  };
}

/**
 * Zusammenfassung der Bewertungen, die beim Setzen entstanden sind.
 *
 * Jede Kandidatenbewertung wird bei der Auswahl ohnehin berechnet und im
 * Suchpfad des Knotens mitgeführt. Für das Ranking eines Zwischenzustands genügt
 * diese Mitschrift: Sie ist ohne einen einzigen weiteren Regeldurchlauf
 * verfügbar. Verbindlich ist sie nicht – spätere Belegungen können frühere
 * Bewertungen verschieben –, deshalb wird jede Endlösung anschließend mit
 * `finalObjective` vollständig neu geprüft.
 */
function traceAudit(node) {
  const recommendation = [0, 0, 0, 0, 0, 0];
  let red = 0;
  let specialRed = 0;
  let orange = 0;
  let yellow = 0;
  let gray = 0;
  for (const step of node.trace) {
    if (step.level === 'red') red += 1;
    if (step.level === 'red' && step.confirmationType === 'special') specialRed += 1;
    if (step.level === 'orange') orange += 1;
    if (step.level === 'yellow') yellow += 1;
    if (step.level === 'gray') gray += 1;
    const vector = step.vector;
    if (vector) for (let index = 0; index < recommendation.length; index += 1) recommendation[index] += vector[index] || 0;
  }
  return { red, specialRed, orange, yellow, gray, recommendation, entries: node.trace };
}

/**
 * Rangfolge eines Zwischenzustands ohne vollständiges Monats-Audit.
 *
 * Zuvor bewertete diese Stelle jeden erzeugten Nachfolger mit einem kompletten
 * Regeldurchlauf über alle bereits gesetzten Felder. Bei einigen hundert
 * Nachfolgern je Dienstfeld und rund sechzig Dienstfeldern ergab das
 * Millionen von Regelauswertungen und Laufzeiten jenseits jeder Nutzbarkeit.
 * Gezählt wird jetzt ausschließlich, was bereits vorliegt oder sich in
 * Zählschritten ergibt.
 */
function partialObjective(state, node, baseline, config, flexibility = null) {
  const context = planningContext(state, baseline);
  const audit = traceAudit(node);
  const fairness = fairnessSnapshot(state, node.monthData, context, node.ledger);
  const wishes = wishSnapshot(state, node.monthData, baseline);
  const limitViolations = limitsAudit(node.monthData, config, node.ledger).length;
  const redLimitExceeded = config.maxRedViolations !== null && audit.red > config.maxRedViolations;
  return {
    audit, fairness, wishes, limitViolations, redLimitExceeded,
    unfilled: 0,
    key: [
      limitViolations,
      audit.gray,
      redLimitExceeded ? 1 : 0,
      audit.red,
      audit.specialRed,
      audit.orange,
      audit.yellow,
      flexibility?.blocked ? 1 : 0,
      -(flexibility?.minimumDomain || 0),
      -(flexibility?.domainProduct || 0),
      ...softObjectiveKey(config, audit, wishes, fairness, saturdayVariance(state, node.monthData, context))
    ]
  };
}

function emptyNode(monthData, stats = null) {
  return { monthData, ledger: ledgerFor(monthData, stats), trace: [], depth: 0 };
}

function assignNode(node, slot, candidate) {
  const monthData = clone(node.monthData);
  setAssignment(monthData, slot.dateIso, slot.role, candidate.person.id);
  const ledger = cloneLedger(node.ledger || ledgerFor(node.monthData));
  ledger[slot.role][candidate.person.id] = (ledger[slot.role][candidate.person.id] || 0) + 1;
  assignmentLedgers.set(monthData, ledger);
  return {
    monthData,
    ledger,
    trace: [...node.trace, {
      ...slot,
      staffId: candidate.person.id,
      level: candidate.evaluation.level,
      confirmationType: candidate.evaluation.meta?.confirmationType || null,
      vector: vectorOf(candidate.evaluation),
      reasons: candidate.evaluation.reasons || []
    }],
    depth: node.depth + 1
  };
}

/**
 * Verlustfreie Kennung einer Belegung, bezogen auf die offenen Felder.
 *
 * Sie entdoppelt den Suchstrahl und ordnet gleichwertige Varianten stabil. Der
 * Aufbau erfolgt über ein vorbelegtes Feld aus internierten Personal-Kennungen:
 * Die frühere Fassung setzte für jeden erzeugten Nachfolger eine Zeichenkette
 * aus Datum, Rolle und Name zusammen – bei Suchstrahlbreite mal
 * Verzweigungsgrad je Dienstfeld war das der teuerste Einzelposten der
 * Konstruktion. Eindeutig bleibt sie unverändert: Die Felderfolge ist fest, und
 * jede Kennung hat genau eine Zahl.
 */
function signature(monthData, baseline) {
  const slots = baselineOpenSlots(baseline);
  const parts = new Array(slots.length);
  const days = monthData.days;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    parts[index] = internStaffId(days?.[slot.dateIso]?.[slot.role] || '');
  }
  return parts.join('.');
}

/**
 * Der beste Endzustand einer Suchwelle.
 *
 * Vorgefiltert wird mit der inkrementellen Mitschrift, entschieden ausschließlich
 * mit dem vollständigen Regel-Audit: Nur die aussichtsreichsten Varianten
 * durchlaufen die teure Endbewertung, das Ergebnis bleibt aber eine exakt
 * geprüfte Belegung.
 */
const EXACT_FINALISTS = 24;

function selectBest(state, nodes, baseline, config) {
  const shortlist = nodes.length <= EXACT_FINALISTS
    ? nodes
    : nodes
      .map(node => ({ node, objective: partialObjective(state, node, baseline, config) }))
      .sort((left, right) => compareVectors(left.objective.key, right.objective.key)
        || signature(left.node.monthData, baseline).localeCompare(signature(right.node.monthData, baseline)))
      .slice(0, EXACT_FINALISTS)
      .map(entry => entry.node);
  const ranked = shortlist.map(node => ({ node, objective: finalObjective(state, node.monthData, baseline, config) }));
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

/**
 * Auswahl der Nachfolger einer Suchwelle.
 *
 * Das Vorwärts-Checking ist der teuerste Schritt der Konstruktion: Es besetzt
 * probeweise künftige Dienstfelder und braucht dafür echte Regelbewertungen.
 * Es läuft deshalb erst, nachdem billig gerankt und entdoppelt wurde, und nur
 * für so viele Varianten, wie tatsächlich in den Suchstrahl passen. Fällt eine
 * Variante als Sackgasse aus, rückt begrenzt aus der Warteliste nach.
 */
function pruneBeam({ state, nodes, baseline, config, mode, futureSlots, candidatesFor, width, lookahead, stats }) {
  const ordered = nodes.map(node => ({
    node,
    objective: partialObjective(state, node, baseline, config),
    signature: signature(node.monthData, baseline)
  }))
    .filter(entry => admissible(entry.objective, mode))
    .sort((left, right) => compareVectors(left.objective.key, right.objective.key)
      || left.signature.localeCompare(right.signature));

  const seen = new Set();
  const shortlist = [];
  for (const entry of ordered) {
    if (seen.has(entry.signature)) continue;
    seen.add(entry.signature);
    shortlist.push(entry);
  }

  const checkLimit = width + Math.min(width, 24);
  const ranked = [];
  for (const entry of shortlist) {
    if (ranked.length >= width || stats.forwardChecks - stats.forwardChecksAtSlot >= checkLimit) break;
    stats.forwardChecks += 1;
    const forward = flexibility(entry.node, futureSlots, candidatesFor, lookahead);
    if (forward.blocked) {
      stats.deadEnds += 1;
      continue;
    }
    ranked.push({
      node: entry.node,
      objective: partialObjective(state, entry.node, baseline, config, forward),
      signature: entry.signature
    });
  }
  stats.forwardChecksAtSlot = stats.forwardChecks;

  ranked.sort((left, right) => compareVectors(left.objective.key, right.objective.key) || left.signature.localeCompare(right.signature));
  const result = ranked.slice(0, width).map(entry => entry.node);
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
  const stats = { id: `${mode}-${strategy}-${passIndex}`, mode, strategy, beamWidth: width, branchLimit: branch, exploredNodes: 0, generatedNodes: 0, candidateEvaluations: 0, limitRejects: 0, deadEnds: 0, exactNodes: 0, forwardChecks: 0, forwardChecksAtSlot: 0, maxBeam: 1, assignmentLedgerHits: 0, assignmentLedgerMisses: 0, complete: false };
  const candidatesFor = createCandidateResolver(state, mode, strategy, config, stats);
  let beam = [emptyNode(clone(baseline), stats)];
  const allSlots = baselineOpenSlots(baseline);
  let processed = 0;

  let remaining = [...allSlots];
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
      const future = [...roleRemaining]
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
        phase: 'search', subphase: slot.role, progress: progressStart + processed / Math.max(1, allSlots.length) * progressSpan,
        message: `${label} · ${slot.role.toUpperCase()} ${slot.dateIso}: ${candidateCount} Kandidaten · ${beam.length} Varianten`,
        dateIso: slot.dateIso, role: slot.role, processed, total: allSlots.length, candidateCount, beamSize: beam.length,
        exploredNodes: stats.exploredNodes, generatedNodes: stats.generatedNodes, deadEnds: stats.deadEnds, limitRejects: stats.limitRejects, passIndex
      });
      await yieldToBrowser();
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
  const pace = createPacer();
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
        await pace();
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
        await pace();
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
    { id: 'strict-coverage', mode: SEARCH_MODE.STRICT, strategy: 'coverage', width: Math.max(preset.deepBeam, baseBeam * 2), branch: Math.max(preset.deepBranch, baseBranch + 5), exact: Math.max(3000, Math.floor(baseExact * .8)), lookahead: preset.lookahead + 1, start: .37, span: .29, label: 'Vertiefte Null-Rot-Suche' }
  ];
  if (config.allowRedFallback) result.push({ id: 'confirmable-balanced', mode: SEARCH_MODE.CONFIRMABLE, strategy: 'balanced', width: Math.max(preset.fallbackBeam, baseBeam * 3), branch: Math.max(preset.fallbackBranch, baseBranch + 8), exact: Math.max(6000, baseExact), lookahead: preset.lookahead + 1, start: .69, span: .20, label: 'Minimal-Rot-Suche' });
  /**
   * Beschränkung auf einen einzelnen Suchlauf.
   *
   * Nacheinander ausgeführt sind die Läufe eine Kette: Der nächste startet nur,
   * wenn der vorige keine vollständige Belegung fand. Auf mehreren Kernen
   * lassen sie sich stattdessen gleichzeitig starten und der beste behalten –
   * bei schwierigen Monaten, die alle Stufen durchlaufen, verkürzt das die
   * Wartezeit auf die des längsten statt auf die Summe aller.
   */
  if (Array.isArray(overrides.profileFilter) && overrides.profileFilter.length) {
    const wanted = new Set(overrides.profileFilter);
    const filtered = result.filter(profile => wanted.has(profile.id));
    if (filtered.length) return filtered;
  }
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
  beginEvaluationEpoch(state?.staff);
  const baseline = clone(monthData);
  const slots = baselineOpenSlots(baseline);
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
  for (const [index, profile] of profiles(config, { beamWidth, branchLimit, exactBudget, profileFilter: runConfig?.profileFilter }).entries()) {
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
    /**
     * Übernommen wird ausschließlich, was in der lexikografischen Zielordnung
     * echt besser ist. Die frühere Fassung übernahm zusätzlich jeden als
     * vollständig gemeldeten Lauf – auch einen schlechteren. Sobald das
     * Worker-Portfolio einzelne Profile getrennt startet, ist genau dieser Fall
     * erreichbar: Ein später gemeldeter Minimal-Rot-Lauf verdrängte dann eine
     * bereits gefundene Null-Rot-Lösung.
     */
    if (attempt.best && compareVectors(attempt.best.objective.key, best.objective.key) < 0) {
      best = attempt.best;
      selectedProfile = profile.id;
      selectedMode = profile.mode;
    }
    if (attempt.stats.complete && profile.mode === SEARCH_MODE.STRICT) break;
  }

  const aggregate = attempts.reduce((sum, item) => {
    for (const key of ['exploredNodes', 'generatedNodes', 'candidateEvaluations', 'limitRejects', 'deadEnds', 'exactNodes', 'assignmentLedgerHits', 'assignmentLedgerMisses']) sum[key] += Number(item[key] || 0);
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
  return { exploredNodes: 0, generatedNodes: 0, candidateEvaluations: 0, limitRejects: 0, deadEnds: 0, exactNodes: 0, assignmentLedgerHits: 0, assignmentLedgerMisses: 0, maxBeam: 0, improvements: 0, swapChecks: 0 };
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
