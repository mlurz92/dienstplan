export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const SHEET_NAMES = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  holidayRegion: 'SN',
  fixedMenuOrder: true,
  appName: 'DienstplanRAD'
};

export const STAFF_ORDER = [
  'lurz',
  'polednia',
  'dalitz',
  'becker',
  'hellmann',
  'martin',
  'elhouba',
  'licenji',
  'sebastian'
];

export const DEFAULT_STAFF = [
  { id: 'schaefer', name: 'Prof. Schäfer', short: 'Schäfer', category: 'urlaub-only', roleLabel: 'Chefarzt', activeFrom: '2025-01-01', activeUntil: null, includeInPlanning: false, includeInAbsenceList: true },
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

export function createEmptyMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = toIsoDate(year, month, d);
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
    overrideLog: [],
    importLog: []
  };
}


function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePerStaffDateMap(value, validDates) {
  if (!isPlainRecord(value)) return {};
  const normalized = {};
  for (const [staffId, entries] of Object.entries(value)) {
    if (!isPlainRecord(entries)) continue;
    const clean = {};
    for (const [iso, entry] of Object.entries(entries)) {
      if (!validDates.has(iso) || typeof entry !== 'string' || !entry.trim()) continue;
      clean[iso] = entry;
    }
    if (Object.keys(clean).length) normalized[staffId] = clean;
  }
  return normalized;
}

/**
 * Normalisiert geladene, importierte oder ältere Monatsdaten auf das vollständige
 * aktuelle Schema. Fehlende Tagesfelder werden ergänzt, ungültige Typen verworfen
 * und außerhalb des Monats liegende Tageswerte nicht übernommen.
 */
export function normalizeMonthData(year, month, payload) {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  const base = createEmptyMonth(normalizedYear, normalizedMonth);
  const source = isPlainRecord(payload) ? payload : {};
  const sourceDays = isPlainRecord(source.days) ? source.days : {};
  const days = {};

  for (const [iso, emptyDay] of Object.entries(base.days)) {
    const raw = isPlainRecord(sourceDays[iso]) ? sourceDays[iso] : {};
    days[iso] = {
      bd: typeof raw.bd === 'string' ? raw.bd : emptyDay.bd,
      hg: typeof raw.hg === 'string' ? raw.hg : emptyDay.hg,
      rbn1: typeof raw.rbn1 === 'string' ? raw.rbn1 : emptyDay.rbn1,
      rbn2: typeof raw.rbn2 === 'string' ? raw.rbn2 : emptyDay.rbn2,
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
    revision: Number.isFinite(revision) && revision >= 0 ? revision : base.revision,
    updatedAt: typeof source.updatedAt === 'string' || source.updatedAt === null ? source.updatedAt : base.updatedAt,
    days,
    absences: normalizePerStaffDateMap(source.absences, validDates),
    absenceSources: normalizePerStaffDateMap(source.absenceSources, validDates),
    preferences: normalizePerStaffDateMap(source.preferences, validDates),
    overrideLog: Array.isArray(source.overrideLog) ? source.overrideLog.filter(isPlainRecord) : [],
    importLog: Array.isArray(source.importLog) ? source.importLog.filter(isPlainRecord) : []
  };
}

export function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
