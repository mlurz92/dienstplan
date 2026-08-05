export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const SHEET_NAMES = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Anwendungseinstellungen.
 *
 * Jede Einstellung hier ist tatsächlich verdrahtet – es gibt bewusst keinen
 * Schalter, der nur gespeichert und nirgends gelesen wird. Die drei Gruppen
 * trennen, worauf sie wirken:
 *
 * - `appearance` wirkt auf die Oberfläche und wird über Datenattribute an der
 *   Wurzel wirksam, damit das Stylesheet allein entscheidet.
 * - `workflow` wirkt auf das Arbeitsverhalten der Anwendung, etwa auf den
 *   Zeitpunkt des automatischen Speicherns.
 * - `autoPlan` liefert die Voreinstellungen jedes Auto-Plan-Laufs; im Studio
 *   bleibt jeder Wert pro Lauf änderbar.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 4,
  appearance: Object.freeze({
    density: 'comfortable',
    motion: 'system',
    richTooltips: true,
    /**
     * Monatsfarbsystem. `spectrum` ist der Trend-Atlas des Color Directors,
     * `classic` die feste Monatspalette, `neutral` schaltet die Einfärbung ab.
     */
    monthColors: 'spectrum',
    weekendEmphasis: true,
    ambientBackdrop: true
  }),
  workflow: Object.freeze({
    autoSaveDelayMs: 1100,
    algorithmCommentary: true,
    studioVisualizer: true
  }),
  autoPlan: Object.freeze({
    performanceProfile: 'adaptive',
    searchIntensity: 'deep',
    optimizationFocus: 'balanced',
    timeBudgetSeconds: 120,
    allowRedFallback: true,
    maxRedViolations: null,
    perfectionEnabled: true,
    parallelSearches: null,
    certificationRounds: 4,
    portfolioDiversity: true,
    solverBackend: 'auto',
    cpSatTimeBudgetSeconds: 10,
    cpSatWorkers: null,
    cpSatWarmStart: 'heuristic',
    fairnessProfile: 'leximin',
    deterministic: true,
    infeasibilityMode: 'mus',
    repairOnEdit: true,
    explanationDepth: 'detailed',
    cpSatFairnessWeight: 90,
    protectBaseline: true,
    cpSatPerturbationWeight: 45,
    cpSatCtLeadershipWeight: 70,
    cpSatWeekendChainWeight: 100,
    relaxationDepth: 'deep',
    musAutoRelax: false
  })
});

export const STAFF_ORDER = [
  'lurz', 'polednia', 'dalitz', 'becker', 'hellmann', 'martin', 'elhouba', 'licenji', 'sebastian'
];

/**
 * Vorgabe der monatlichen BD-Obergrenze je Person für den Auto-Plan.
 *
 * Diese Werte füllen die Laufgrenzen im Studio vor. Sie sind dort frei
 * änderbar und ersetzen weder das im Personalstamm hinterlegte harte
 * Monatsmaximum noch eine fachliche Regel: Liegt beides vor, gilt der
 * jeweils strengere Wert.
 */
export const AUTO_PLAN_BD_LIMITS = Object.freeze({
  lurz: 5,
  dalitz: 5,
  polednia: 4,
  becker: 3,
  martin: 4,
  elhouba: 4,
  licenji: 4,
  sebastian: 4,
  hellmann: 2
});

export const DEFAULT_STAFF = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'polednia', name: 'Dr. Polednia', short: 'Polednia', category: 'fa', roleLabel: 'FA/OA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'dalitz', name: 'Fr. Dalitz', short: 'Dalitz', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'becker', name: 'Dr. Becker', short: 'Becker', category: 'fa', roleLabel: 'FÄ/OÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 3, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'hellmann', name: 'Fr. Hellmann', short: 'Hellmann', category: 'fa', roleLabel: 'FÄ', activeFrom: '2026-10-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 2, maxBd: 2, canHg: true, canSaturdayBd: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', category: 'fa', roleLabel: 'FA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: true, canSaturdayBd: true },
  { id: 'elhouba', name: 'Hr. El Houba', short: 'El Houba', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false, promotionDate: '2026-09-22', promotedRoleLabel: 'FA', promotedCanHg: true, promotedCanSaturdayBd: true },
  { id: 'licenji', name: 'Fr. Licenji', short: 'Licenji', category: 'aa', roleLabel: 'AÄ', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false },
  { id: 'sebastian', name: 'Hr. Sebastian', short: 'Sebastian', category: 'aa', roleLabel: 'AA', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: true, includeInAbsenceList: true, bdTarget: 4, maxBd: null, canHg: false, canSaturdayBd: false }
];

export const ABSENCE_TYPES = [
  { id: 'urlaub', label: 'Urlaub' },
  { id: 'fza', label: 'FZA/Frei' },
  { id: 'weiterbildung', label: 'Weiterbildung' },
  { id: 'sonstige', label: 'Sonstige Abwesenheit' }
];

export const PREFERENCE_TYPES = [
  { id: 'kein-bd', label: 'Kein BD' },
  { id: 'kein-hg', label: 'Kein HG' },
  { id: 'kein-dienst', label: 'Kein Dienst' },
  { id: 'bd-bevorzugt', label: 'BD bevorzugt' },
  { id: 'hg-bevorzugt', label: 'HG bevorzugt' },
  { id: 'dienst-bevorzugt', label: 'Dienst bevorzugt' }
];

export const OPTION_TYPES = [
  { id: 'bd-moeglich', label: 'BD möglich' },
  { id: 'hg-moeglich', label: 'HG möglich' }
];

export function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const STAFF_ID = /^[a-z0-9][a-z0-9_-]{0,49}$/i;

export function isValidIsoDay(value) {
  const match = ISO_DAY.exec(String(value || ''));
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizedDate(value, field, strict) {
  if (value === null || value === undefined || value === '') return null;
  if (isValidIsoDay(value)) return String(value);
  if (strict) throw new Error(`„${field}“ muss ein gültiges ISO-Datum YYYY-MM-DD sein.`);
  return null;
}

function normalizedNonNegativeInteger(value, fallback, field, strict, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const number = Number(value);
  if (Number.isInteger(number) && number >= 0) return number;
  if (strict && value !== undefined) throw new Error(`„${field}“ muss eine nichtnegative ganze Zahl sein.`);
  return fallback;
}

function normalizedBoolean(value, fallback, field, strict) {
  if (typeof value === 'boolean') return value;
  if (strict && value !== undefined) throw new Error(`„${field}“ muss true oder false sein.`);
  return fallback;
}

function normalizedEnum(value, allowed, fallback, field, strict) {
  if (allowed.has(value)) return value;
  if (strict && value !== undefined) throw new Error(`„${field}“ enthält einen nicht unterstützten Wert.`);
  return fallback;
}

function normalizedBoundedInteger(value, fallback, min, max, field, strict, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const number = Number(value);
  if (Number.isInteger(number) && number >= min && number <= max) return number;
  if (strict && value !== undefined) throw new Error(`„${field}“ muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  if (Number.isFinite(number) && number >= 0) return Math.max(min, Math.min(max, Math.round(number)));
  return fallback;
}

function normalizedText(value, fallback, field, strict, required = false) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (required && strict) throw new Error(`„${field}“ darf nicht leer sein.`);
  return fallback;
}

export function normalizeSettings(value, { strict = false } = {}) {
  if (!isPlainRecord(value)) {
    if (strict) throw new Error('„settings“ muss ein JSON-Objekt sein.');
    return structuredClone(DEFAULT_SETTINGS);
  }
  const appearance = isPlainRecord(value.appearance) ? value.appearance : {};
  const workflow = isPlainRecord(value.workflow) ? value.workflow : {};
  const autoPlan = isPlainRecord(value.autoPlan) ? value.autoPlan : {};
  if (strict && value.appearance !== undefined && !isPlainRecord(value.appearance)) {
    throw new Error('„settings.appearance“ muss ein JSON-Objekt sein.');
  }
  if (strict && value.workflow !== undefined && !isPlainRecord(value.workflow)) {
    throw new Error('„settings.workflow“ muss ein JSON-Objekt sein.');
  }
  if (strict && value.autoPlan !== undefined && !isPlainRecord(value.autoPlan)) {
    throw new Error('„settings.autoPlan“ muss ein JSON-Objekt sein.');
  }
  normalizedNonNegativeInteger(value.schemaVersion, DEFAULT_SETTINGS.schemaVersion, 'settings.schemaVersion', strict);
  return {
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    appearance: {
      density: normalizedEnum(appearance.density, new Set(['comfortable', 'compact']), DEFAULT_SETTINGS.appearance.density, 'settings.appearance.density', strict),
      motion: normalizedEnum(appearance.motion, new Set(['system', 'reduced']), DEFAULT_SETTINGS.appearance.motion, 'settings.appearance.motion', strict),
      richTooltips: normalizedBoolean(appearance.richTooltips, DEFAULT_SETTINGS.appearance.richTooltips, 'settings.appearance.richTooltips', strict),
      monthColors: normalizedEnum(appearance.monthColors, new Set(['spectrum', 'classic', 'neutral']), DEFAULT_SETTINGS.appearance.monthColors, 'settings.appearance.monthColors', strict),
      weekendEmphasis: normalizedBoolean(appearance.weekendEmphasis, DEFAULT_SETTINGS.appearance.weekendEmphasis, 'settings.appearance.weekendEmphasis', strict),
      ambientBackdrop: normalizedBoolean(appearance.ambientBackdrop, DEFAULT_SETTINGS.appearance.ambientBackdrop, 'settings.appearance.ambientBackdrop', strict)
    },
    workflow: {
      autoSaveDelayMs: normalizedBoundedInteger(workflow.autoSaveDelayMs, DEFAULT_SETTINGS.workflow.autoSaveDelayMs, 300, 5000, 'settings.workflow.autoSaveDelayMs', strict),
      algorithmCommentary: normalizedBoolean(workflow.algorithmCommentary, DEFAULT_SETTINGS.workflow.algorithmCommentary, 'settings.workflow.algorithmCommentary', strict),
      studioVisualizer: normalizedBoolean(workflow.studioVisualizer, DEFAULT_SETTINGS.workflow.studioVisualizer, 'settings.workflow.studioVisualizer', strict)
    },
    autoPlan: {
      performanceProfile: normalizedEnum(autoPlan.performanceProfile, new Set(['responsive', 'adaptive', 'power']), DEFAULT_SETTINGS.autoPlan.performanceProfile, 'settings.autoPlan.performanceProfile', strict),
      searchIntensity: normalizedEnum(autoPlan.searchIntensity, new Set(['standard', 'deep', 'maximum']), DEFAULT_SETTINGS.autoPlan.searchIntensity, 'settings.autoPlan.searchIntensity', strict),
      optimizationFocus: normalizedEnum(autoPlan.optimizationFocus, new Set(['balanced', 'wishes', 'workload', 'weekends']), DEFAULT_SETTINGS.autoPlan.optimizationFocus, 'settings.autoPlan.optimizationFocus', strict),
      timeBudgetSeconds: normalizedBoundedInteger(autoPlan.timeBudgetSeconds, DEFAULT_SETTINGS.autoPlan.timeBudgetSeconds, 10, 900, 'settings.autoPlan.timeBudgetSeconds', strict),
      allowRedFallback: normalizedBoolean(autoPlan.allowRedFallback, DEFAULT_SETTINGS.autoPlan.allowRedFallback, 'settings.autoPlan.allowRedFallback', strict),
      maxRedViolations: normalizedBoundedInteger(autoPlan.maxRedViolations, DEFAULT_SETTINGS.autoPlan.maxRedViolations, 0, 62, 'settings.autoPlan.maxRedViolations', strict, true),
      perfectionEnabled: normalizedBoolean(autoPlan.perfectionEnabled, DEFAULT_SETTINGS.autoPlan.perfectionEnabled, 'settings.autoPlan.perfectionEnabled', strict),
      parallelSearches: normalizedBoundedInteger(autoPlan.parallelSearches, DEFAULT_SETTINGS.autoPlan.parallelSearches, 1, 8, 'settings.autoPlan.parallelSearches', strict, true),
      certificationRounds: normalizedBoundedInteger(autoPlan.certificationRounds, DEFAULT_SETTINGS.autoPlan.certificationRounds, 1, 8, 'settings.autoPlan.certificationRounds', strict),
      portfolioDiversity: normalizedBoolean(autoPlan.portfolioDiversity, DEFAULT_SETTINGS.autoPlan.portfolioDiversity, 'settings.autoPlan.portfolioDiversity', strict),
      solverBackend: normalizedEnum(autoPlan.solverBackend, new Set(['auto', 'cp-sat-exact', 'cp-sat-lns', 'heuristic-alns']), DEFAULT_SETTINGS.autoPlan.solverBackend, 'settings.autoPlan.solverBackend', strict),
      cpSatTimeBudgetSeconds: normalizedBoundedInteger(autoPlan.cpSatTimeBudgetSeconds, DEFAULT_SETTINGS.autoPlan.cpSatTimeBudgetSeconds, 1, 60, 'settings.autoPlan.cpSatTimeBudgetSeconds', strict),
      cpSatWorkers: normalizedBoundedInteger(autoPlan.cpSatWorkers, DEFAULT_SETTINGS.autoPlan.cpSatWorkers, 1, 8, 'settings.autoPlan.cpSatWorkers', strict, true),
      cpSatWarmStart: normalizedEnum(autoPlan.cpSatWarmStart, new Set(['heuristic', 'none']), DEFAULT_SETTINGS.autoPlan.cpSatWarmStart, 'settings.autoPlan.cpSatWarmStart', strict),
      fairnessProfile: normalizedEnum(autoPlan.fairnessProfile, new Set(['leximin', 'spread', 'variance', 'owa']), DEFAULT_SETTINGS.autoPlan.fairnessProfile, 'settings.autoPlan.fairnessProfile', strict),
      deterministic: normalizedBoolean(autoPlan.deterministic, DEFAULT_SETTINGS.autoPlan.deterministic, 'settings.autoPlan.deterministic', strict),
      infeasibilityMode: normalizedEnum(autoPlan.infeasibilityMode, new Set(['mus', 'relax', 'report']), DEFAULT_SETTINGS.autoPlan.infeasibilityMode, 'settings.autoPlan.infeasibilityMode', strict),
      repairOnEdit: normalizedBoolean(autoPlan.repairOnEdit, DEFAULT_SETTINGS.autoPlan.repairOnEdit, 'settings.autoPlan.repairOnEdit', strict),
      explanationDepth: normalizedEnum(autoPlan.explanationDepth, new Set(['short', 'detailed', 'llm']), DEFAULT_SETTINGS.autoPlan.explanationDepth, 'settings.autoPlan.explanationDepth', strict),
      cpSatFairnessWeight: normalizedBoundedInteger(autoPlan.cpSatFairnessWeight, DEFAULT_SETTINGS.autoPlan.cpSatFairnessWeight, 1, 100, 'settings.autoPlan.cpSatFairnessWeight', strict),
      protectBaseline: normalizedBoolean(autoPlan.protectBaseline, DEFAULT_SETTINGS.autoPlan.protectBaseline, 'settings.autoPlan.protectBaseline', strict),
      cpSatPerturbationWeight: normalizedBoundedInteger(autoPlan.cpSatPerturbationWeight, DEFAULT_SETTINGS.autoPlan.cpSatPerturbationWeight, 0, 100, 'settings.autoPlan.cpSatPerturbationWeight', strict),
      cpSatCtLeadershipWeight: normalizedBoundedInteger(autoPlan.cpSatCtLeadershipWeight, DEFAULT_SETTINGS.autoPlan.cpSatCtLeadershipWeight, 0, 100, 'settings.autoPlan.cpSatCtLeadershipWeight', strict),
      cpSatWeekendChainWeight: normalizedBoundedInteger(autoPlan.cpSatWeekendChainWeight, DEFAULT_SETTINGS.autoPlan.cpSatWeekendChainWeight, 0, 200, 'settings.autoPlan.cpSatWeekendChainWeight', strict),
      relaxationDepth: normalizedEnum(autoPlan.relaxationDepth, new Set(['shallow', 'deep']), DEFAULT_SETTINGS.autoPlan.relaxationDepth, 'settings.autoPlan.relaxationDepth', strict),
      musAutoRelax: normalizedBoolean(autoPlan.musAutoRelax, DEFAULT_SETTINGS.autoPlan.musAutoRelax, 'settings.autoPlan.musAutoRelax', strict)
    }
  };
}

export function normalizeRbnNames(value, { strict = false } = {}) {
  if (!Array.isArray(value)) {
    if (strict) throw new Error('„rbnNames“ muss ein Array sein.');
    return [];
  }
  const result = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) {
      if (strict) throw new Error('Jeder Eintrag in „rbnNames“ muss ein nichtleerer Text sein.');
      continue;
    }
    const normalized = entry.trim();
    const key = normalized.toLocaleLowerCase('de');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeStaffEntry(entry, index, strict) {
  if (!isPlainRecord(entry)) {
    if (strict) throw new Error(`Personal-Eintrag ${index + 1} muss ein JSON-Objekt sein.`);
    return null;
  }
  const id = normalizedText(entry.id, '', `staff[${index}].id`, strict, true);
  if (!STAFF_ID.test(id)) {
    if (strict) throw new Error(`„staff[${index}].id“ enthält unzulässige Zeichen.`);
    return null;
  }
  const name = normalizedText(entry.name, '', `staff[${index}].name`, strict, true);
  if (!name) return null;
  const activeFrom = normalizedDate(entry.activeFrom, `staff[${index}].activeFrom`, strict);
  const activeUntil = normalizedDate(entry.activeUntil, `staff[${index}].activeUntil`, strict);
  const promotionDate = normalizedDate(entry.promotionDate, `staff[${index}].promotionDate`, strict);
  if (activeFrom && activeUntil && activeUntil < activeFrom) {
    if (strict) throw new Error(`Personal-Eintrag „${id}“ endet vor seinem Aktivierungsdatum.`);
    return null;
  }
  return {
    id,
    name,
    short: normalizedText(entry.short, name, `staff[${index}].short`, strict),
    category: normalizedText(entry.category, 'custom', `staff[${index}].category`, strict),
    roleLabel: normalizedText(entry.roleLabel, '', `staff[${index}].roleLabel`, strict),
    activeFrom,
    activeUntil,
    includeInPlanning: normalizedBoolean(entry.includeInPlanning, false, `staff[${index}].includeInPlanning`, strict),
    includeInAbsenceList: normalizedBoolean(entry.includeInAbsenceList, true, `staff[${index}].includeInAbsenceList`, strict),
    bdTarget: normalizedNonNegativeInteger(entry.bdTarget, 0, `staff[${index}].bdTarget`, strict),
    maxBd: normalizedNonNegativeInteger(entry.maxBd, null, `staff[${index}].maxBd`, strict, true),
    canHg: normalizedBoolean(entry.canHg, false, `staff[${index}].canHg`, strict),
    canSaturdayBd: normalizedBoolean(entry.canSaturdayBd, false, `staff[${index}].canSaturdayBd`, strict),
    promotionDate,
    promotedRoleLabel: normalizedText(entry.promotedRoleLabel, '', `staff[${index}].promotedRoleLabel`, strict),
    promotedCanHg: entry.promotedCanHg === undefined ? undefined : normalizedBoolean(entry.promotedCanHg, false, `staff[${index}].promotedCanHg`, strict),
    promotedCanSaturdayBd: entry.promotedCanSaturdayBd === undefined ? undefined : normalizedBoolean(entry.promotedCanSaturdayBd, false, `staff[${index}].promotedCanSaturdayBd`, strict)
  };
}

/**
 * Aus dem Personalstamm entfernte Personen.
 *
 * Prof. Schäfer war ausschließlich in der Abwesenheitsliste geführt und kann
 * in keiner Rolle gesetzt werden. Seit v9 wird er vollständig aus dem Stamm
 * entfernt; gespeicherte Stände, Server-Bootstraps und Sicherungen werden
 * beim Einlesen bereinigt. Historische Einträge in Monatsplänen bleiben als
 * externe Fixpunkte lesbar, werden aber nicht mehr als Personal-ID
 * interpretiert.
 */
export const RETIRED_STAFF_IDS = Object.freeze(['schaefer']);

export function normalizeStaffList(value, { strict = false } = {}) {
  if (!Array.isArray(value)) {
    if (strict) throw new Error('„staff“ muss ein Array sein.');
    return structuredClone(DEFAULT_STAFF);
  }
  const result = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const normalized = normalizeStaffEntry(value[index], index, strict);
    if (!normalized) continue;
    if (RETIRED_STAFF_IDS.includes(normalized.id)) continue;
    if (seen.has(normalized.id)) {
      if (strict) throw new Error(`Personal-ID „${normalized.id}“ ist doppelt vorhanden.`);
      continue;
    }
    seen.add(normalized.id);
    result.push(normalized);
  }
  if (!result.length) {
    if (strict) throw new Error('„staff“ muss mindestens einen gültigen Personal-Eintrag enthalten.');
    return structuredClone(DEFAULT_STAFF);
  }
  return result;
}

export function createEmptyMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = {};
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toIsoDate(year, month, day);
    days[iso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  }
  return {
    schemaVersion: 1,
    year,
    month,
    revision: 0,
    updatedAt: null,
    days,
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function normalizePerStaffDateMap(value, validDates) {
  if (!isPlainRecord(value)) return {};
  const normalized = {};
  for (const [staffId, entries] of Object.entries(value)) {
    if (!STAFF_ID.test(staffId) || !isPlainRecord(entries)) continue;
    const clean = {};
    for (const [iso, entry] of Object.entries(entries)) {
      if (!validDates.has(iso) || typeof entry !== 'string' || !entry.trim()) continue;
      clean[iso] = entry.trim();
    }
    if (Object.keys(clean).length) normalized[staffId] = clean;
  }
  return normalized;
}

const OPTION_IDS = new Set(OPTION_TYPES.map(type => type.id));

function normalizeOptionMap(value, validDates) {
  const base = normalizePerStaffDateMap(value, validDates);
  const normalized = {};
  for (const [staffId, entries] of Object.entries(base)) {
    const clean = {};
    for (const [iso, entry] of Object.entries(entries)) {
      const ids = [...new Set(entry.split(',').map(item => item.trim()).filter(item => OPTION_IDS.has(item)))];
      if (ids.length) clean[iso] = ids.join(',');
    }
    if (Object.keys(clean).length) normalized[staffId] = clean;
  }
  return normalized;
}

function normalizePreferencesAndOptions(source, validDates) {
  const preferences = normalizePerStaffDateMap(source.preferences, validDates);
  const options = normalizeOptionMap(source.options, validDates);
  for (const [staffId, entries] of Object.entries(preferences)) {
    for (const [iso, entry] of Object.entries(entries)) {
      if (!OPTION_IDS.has(entry)) continue;
      delete entries[iso];
      const existing = options[staffId]?.[iso];
      const ids = new Set(existing ? existing.split(',') : []);
      ids.add(entry);
      options[staffId] ||= {};
      options[staffId][iso] = [...ids].join(',');
    }
    if (!Object.keys(entries).length) delete preferences[staffId];
  }
  return { preferences, options };
}

export function normalizeMonthData(year, month, payload) {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2200) throw new Error('Jahr außerhalb des unterstützten Bereichs 2000–2200.');
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) throw new Error('Monat muss zwischen 1 und 12 liegen.');
  const base = createEmptyMonth(normalizedYear, normalizedMonth);
  const source = isPlainRecord(payload) ? payload : {};
  const sourceDays = isPlainRecord(source.days) ? source.days : {};
  const days = {};
  for (const [iso, emptyDay] of Object.entries(base.days)) {
    const raw = isPlainRecord(sourceDays[iso]) ? sourceDays[iso] : {};
    days[iso] = {
      bd: typeof raw.bd === 'string' ? raw.bd.trim() : emptyDay.bd,
      hg: typeof raw.hg === 'string' ? raw.hg.trim() : emptyDay.hg,
      rbn1: typeof raw.rbn1 === 'string' ? raw.rbn1.trim() : emptyDay.rbn1,
      rbn2: typeof raw.rbn2 === 'string' ? raw.rbn2.trim() : emptyDay.rbn2,
      notes: typeof raw.notes === 'string' ? raw.notes : emptyDay.notes
    };
  }
  const validDates = new Set(Object.keys(days));
  const revision = Number(source.revision);
  const schemaVersion = Number(source.schemaVersion);
  return {
    ...base,
    ...source,
    schemaVersion: Number.isInteger(schemaVersion) && schemaVersion > 0 ? schemaVersion : base.schemaVersion,
    year: normalizedYear,
    month: normalizedMonth,
    revision: Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : base.revision,
    updatedAt: typeof source.updatedAt === 'string' || source.updatedAt === null ? source.updatedAt : base.updatedAt,
    days,
    absences: normalizePerStaffDateMap(source.absences, validDates),
    absenceSources: normalizePerStaffDateMap(source.absenceSources, validDates),
    ...normalizePreferencesAndOptions(source, validDates),
    overrideLog: Array.isArray(source.overrideLog) ? source.overrideLog.filter(isPlainRecord) : [],
    importLog: Array.isArray(source.importLog) ? source.importLog.filter(isPlainRecord) : []
  };
}

export function normalizeBackupPayload(payload, { strict = true } = {}) {
  if (!isPlainRecord(payload)) throw new Error('Die Wurzel muss ein JSON-Objekt sein.');
  const normalized = {};
  if ('settings' in payload) normalized.settings = normalizeSettings(payload.settings, { strict });
  if ('staff' in payload) normalized.staff = normalizeStaffList(payload.staff, { strict });
  if ('rbnNames' in payload) normalized.rbnNames = normalizeRbnNames(payload.rbnNames, { strict });
  if ('months' in payload && !Array.isArray(payload.months)) throw new Error('„months“ muss ein Array sein.');
  const months = [];
  const seenMonths = new Set();
  for (const entry of payload.months || []) {
    if (!Array.isArray(entry) || entry.length !== 2 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(entry[0]) || !isPlainRecord(entry[1])) throw new Error('Jeder Monat muss als [„YYYY-MM“, Monatsobjekt] vorliegen.');
    if (seenMonths.has(entry[0])) throw new Error(`Monat „${entry[0]}“ ist in der Sicherung doppelt vorhanden.`);
    seenMonths.add(entry[0]);
    const [entryYear, entryMonth] = entry[0].split('-').map(Number);
    months.push([entry[0], normalizeMonthData(entryYear, entryMonth, entry[1])]);
  }
  if ('months' in payload) normalized.months = months;
  return normalized;
}

export function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
