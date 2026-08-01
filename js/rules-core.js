import { MONTH_NAMES, OPTION_TYPES, PREFERENCE_TYPES, STAFF_ORDER, toIsoDate, WEEKDAYS } from './defaults.js?v=20260801.8';
import { isFirstRegularWorkdayAfter } from './holidays.js?v=20260801.8';

export function parseIso(date) { return new Date(`${date}T00:00:00`); }
export function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
export function fmtShort(date) { return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`; }
export function toLocalIso(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export const severityRank = { green: 0, yellow: 1, orange: 2, red: 3, gray: -1 };
export const ABSENCE_FOR_CT_LEADERSHIP = new Set(['urlaub', 'fza']);

export function getStaffById(staff, id) { return staff.find(item => item.id === id); }

/**
 * Dienstfelder können neben einer Personal-ID auch einen reinen Namenstext aus
 * einem Altimport tragen. Solche Werte werden mit einem festen Präfix abgelegt:
 * Sie bleiben lesbar erhalten, lassen sich aber nie mit einer echten Person
 * verwechseln und sind in der Auswahl nicht wieder wählbar.
 */
export const EXTERNAL_ASSIGNMENT_PREFIX = 'extern:';
export function externalAssignmentValue(name) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim();
  return text ? `${EXTERNAL_ASSIGNMENT_PREFIX}${text}` : '';
}
export function isExternalAssignment(value) {
  return typeof value === 'string' && value.startsWith(EXTERNAL_ASSIGNMENT_PREFIX);
}
export function externalAssignmentLabel(value) {
  return isExternalAssignment(value) ? value.slice(EXTERNAL_ASSIGNMENT_PREFIX.length) : '';
}
/** Anzeigetext eines Dienstfelds – für Personal-IDs, Altimporte und Unbekanntes. */
export function assignmentLabel(staff, value, { short = false } = {}) {
  if (!value) return '';
  if (isExternalAssignment(value)) return externalAssignmentLabel(value);
  const person = getStaffById(staff, value);
  if (!person) return value;
  return short ? (person.short || person.name) : person.name;
}
export function getPlanningStaff(staff, dateIso) {
  const fixedOrder = new Map(STAFF_ORDER.map((id, index) => [id, index]));
  return staff
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => person?.includeInPlanning && isStaffActiveOn(person, dateIso))
    .sort((left, right) => {
      const leftOrder = fixedOrder.has(left.person.id) ? fixedOrder.get(left.person.id) : STAFF_ORDER.length + left.index;
      const rightOrder = fixedOrder.has(right.person.id) ? fixedOrder.get(right.person.id) : STAFF_ORDER.length + right.index;
      return leftOrder - rightOrder;
    })
    .map(({ person }) => person);
}

export function isStaffActiveOn(person, dateIso) {
  const date = parseIso(dateIso);
  if (person.activeFrom && date < parseIso(person.activeFrom)) return false;
  if (person.activeUntil && date > parseIso(person.activeUntil)) return false;
  return true;
}

export function getRoleProperties(person, dateIso) {
  const date = parseIso(dateIso);
  const base = { roleLabel: person.roleLabel, canHg: !!person.canHg, canSaturdayBd: !!person.canSaturdayBd };
  if (person.promotionDate && date >= parseIso(person.promotionDate)) {
    base.roleLabel = person.promotedRoleLabel || base.roleLabel;
    base.canHg = person.promotedCanHg ?? base.canHg;
    base.canSaturdayBd = person.promotedCanSaturdayBd ?? base.canSaturdayBd;
  }
  return base;
}

export function dayIso(year, month, day) { return toIsoDate(year, month, day); }

export function getAdjacentMonthData(state, delta) {
  const anchor = new Date(state.currentYear, state.currentMonth - 1 + delta, 1);
  return state.months.get(`${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`);
}

export function monthForIso(state, dateIso) {
  return state.months.get(dateIso.slice(0, 7));
}

export function getAssignment(state, dateIso, role) {
  return monthForIso(state, dateIso)?.days?.[dateIso]?.[role] || '';
}

export function setAssignment(monthData, dateIso, role, staffId) {
  if (!monthData.days[dateIso]) monthData.days[dateIso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  monthData.days[dateIso][role] = staffId;
}

export function getAbsence(monthData, staffId, dateIso) { return monthData?.absences?.[staffId]?.[dateIso] || ''; }
export function getAbsenceSource(monthData, staffId, dateIso) { return monthData?.absenceSources?.[staffId]?.[dateIso] || ''; }
export function getAbsenceFromState(state, staffId, dateIso) { return getAbsence(monthForIso(state, dateIso), staffId, dateIso); }

export function isDerivedBeckerFza(state, staffId, dateIso) {
  if (staffId !== 'becker') return false;
  return isFirstRegularWorkdayAfter(
    dateIso,
    iso => parseIso(iso).getDay() === 6 && getAssignment(state, iso, 'bd') === 'becker'
  );
}

export function getEffectiveAbsence(state, monthData, staffId, dateIso) {
  return getAbsence(monthData, staffId, dateIso)
    || (isDerivedBeckerFza(state, staffId, dateIso) ? 'fza' : '');
}

export function setAbsence(monthData, staffId, dateIso, type, source = 'manual') {
  monthData.absences ||= {};
  monthData.absenceSources ||= {};
  monthData.absences[staffId] ||= {};
  monthData.absenceSources[staffId] ||= {};
  if (type) {
    monthData.absences[staffId][dateIso] = type;
    monthData.absenceSources[staffId][dateIso] = source;
  } else {
    delete monthData.absences[staffId][dateIso];
    delete monthData.absenceSources[staffId][dateIso];
  }
}

export function getPreference(monthData, staffId, dateIso) { return monthData?.preferences?.[staffId]?.[dateIso] || ''; }
export function setPreference(monthData, staffId, dateIso, type) {
  monthData.preferences ||= {};
  monthData.preferences[staffId] ||= {};
  if (type) monthData.preferences[staffId][dateIso] = type;
  else delete monthData.preferences[staffId][dateIso];
}

export function getOptions(monthData, staffId, dateIso) {
  const raw = monthData?.options?.[staffId]?.[dateIso];
  return typeof raw === 'string' && raw ? raw.split(',').filter(Boolean) : [];
}
export function hasOption(monthData, staffId, dateIso, optionId) {
  return getOptions(monthData, staffId, dateIso).includes(optionId);
}
export function setOptions(monthData, staffId, dateIso, optionIds) {
  const known = OPTION_TYPES.map(type => type.id);
  const clean = known.filter(id => optionIds.includes(id));
  monthData.options ||= {};
  monthData.options[staffId] ||= {};
  if (clean.length) monthData.options[staffId][dateIso] = clean.join(',');
  else delete monthData.options[staffId][dateIso];
}
export function toggleOption(monthData, staffId, dateIso, optionId) {
  const current = getOptions(monthData, staffId, dateIso);
  setOptions(monthData, staffId, dateIso, current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId]);
}
export function labelForOption(type) { return OPTION_TYPES.find(item => item.id === type)?.label || type; }

export function countRoleInMonth(monthData, staffId, role) {
  return Object.values(monthData.days || {}).filter(day => day?.[role] === staffId).length;
}

export function countRoleInMonthExcept(monthData, staffId, role, exceptIso) {
  return Object.entries(monthData.days || {}).filter(([iso, day]) => iso !== exceptIso && day?.[role] === staffId).length;
}

export function weekendKey(date) {
  const friday = new Date(date);
  friday.setDate(date.getDate() - ((date.getDay() + 2) % 7));
  return toLocalIso(friday);
}

export function weekendMap(monthData, staffId, exceptIso = '') {
  const weekends = {};
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    if (iso === exceptIso) continue;
    const date = parseIso(iso);
    if (![5, 6, 0].includes(date.getDay())) continue;
    const key = weekendKey(date);
    weekends[key] ||= { bd: false, hg: false };
    if (day.bd === staffId) weekends[key].bd = true;
    if (day.hg === staffId) weekends[key].hg = true;
  }
  return weekends;
}

export function weekendEquivalentFromMap(weekends) {
  return Object.values(weekends).reduce((sum, item) => sum + (item.bd ? 1 : item.hg ? 0.5 : 0), 0);
}

export function computeWeekendEquivalent(monthData, staffId) {
  return weekendEquivalentFromMap(weekendMap(monthData, staffId));
}

export function projectedWeekendEquivalent(monthData, staffId, dateIso, role) {
  const date = parseIso(dateIso);
  const weekends = weekendMap(monthData, staffId, dateIso);
  if ([5, 6, 0].includes(date.getDay())) {
    const key = weekendKey(date);
    weekends[key] ||= { bd: false, hg: false };
    weekends[key][role] = true;
  }
  return weekendEquivalentFromMap(weekends);
}

export function listOwnRoleDates(state, staffId, role) {
  const dates = [];
  for (const month of state.months.values()) {
    for (const [iso, day] of Object.entries(month.days || {})) if (day?.[role] === staffId) dates.push(iso);
  }
  return dates.sort();
}

export function isFaOn(state, staffId, dateIso) {
  const person = getStaffById(state.staff, staffId);
  return Boolean(person && getRoleProperties(person, dateIso).canHg);
}

export function isAaOn(state, staffId, dateIso) {
  const person = getStaffById(state.staff, staffId);
  return Boolean(person?.includeInPlanning)
    && person.category === 'aa'
    && !getRoleProperties(person, dateIso).canHg;
}

export function hasBlockingPreference(monthData, staffId, dateIso, role) {
  const preference = getPreference(monthData, staffId, dateIso);
  return preference === 'kein-dienst'
    || (role === 'bd' && preference === 'kein-bd')
    || (role === 'hg' && preference === 'kein-hg');
}

export function basicallyEligiblePeers(state, monthData, dateIso, role) {
  const weekday = parseIso(dateIso).getDay();
  return getPlanningStaff(state.staff, dateIso).filter(person => {
    const props = getRoleProperties(person, dateIso);
    if (role === 'hg' && !props.canHg) return false;
    if (role === 'bd' && weekday === 6 && !props.canSaturdayBd) return false;
    if (getEffectiveAbsence(state, monthData, person.id, dateIso)) return false;
    if (hasBlockingPreference(monthData, person.id, dateIso, role)) return false;
    if (monthData.days?.[dateIso]?.[role === 'bd' ? 'hg' : 'bd'] === person.id) return false;
    if (person.id === 'polednia' && [0, 2].includes(weekday)) return false;
    if (role === 'bd' && person.maxBd != null && countRoleInMonthExcept(monthData, person.id, 'bd', dateIso) >= person.maxBd) return false;
    return true;
  });
}

export function countSaturdayBdExcept(monthData, staffId, exceptIso) {
  return Object.entries(monthData.days || {}).filter(([iso, day]) => iso !== exceptIso && day?.bd === staffId && parseIso(iso).getDay() === 6).length;
}

export function countHgForAaBdExcept(state, monthData, staffId, exceptIso) {
  return Object.entries(monthData.days || {}).filter(([iso, day]) => {
    if (iso === exceptIso || day?.hg !== staffId || !day.bd) return false;
    return isAaOn(state, day.bd, iso);
  }).length;
}

export function countServicesInLoadedYearExcept(state, staffId, year, exceptIso, throughMonth = 12) {
  let count = 0;
  for (const [key, month] of state.months.entries()) {
    if (!key.startsWith(`${year}-`)) continue;
    if (Number(key.slice(5, 7)) > throughMonth) continue;
    for (const [iso, day] of Object.entries(month.days || {})) {
      if (iso === exceptIso) continue;
      if (day.bd === staffId) count += 1;
      if (day.hg === staffId) count += 1;
    }
  }
  return count;
}

export function hasCompleteLoadedHistory(state, year, currentMonth) {
  for (let month = 1; month < currentMonth; month += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!state.months.has(key) || state.monthSources?.get(key) === 'fallback') return false;
  }
  return true;
}

export function isStaffActiveDuringMonth(person, year, month) {
  const first = parseIso(toIsoDate(year, month, 1));
  const last = parseIso(toIsoDate(year, month, new Date(year, month, 0).getDate()));
  if (person.activeFrom && parseIso(person.activeFrom) > last) return false;
  if (person.activeUntil && parseIso(person.activeUntil) < first) return false;
  return true;
}

export function hasVacationInFollowingWeek(state, staffId, dateIso) {
  const date = parseIso(dateIso);
  const daysToMonday = ((8 - date.getDay()) % 7) || 7;
  const monday = addDays(date, daysToMonday);
  return Array.from({ length: 7 }, (_, index) => toLocalIso(addDays(monday, index)))
    .some(iso => getAbsenceFromState(state, staffId, iso) === 'urlaub');
}

export function isPositivePreference(preference, role) {
  return preference === 'dienst-bevorzugt'
    || (role === 'bd' && preference === 'bd-bevorzugt')
    || (role === 'hg' && preference === 'hg-bevorzugt');
}


export function labelForAbsence(type) {
  return ({ urlaub: 'Urlaub', fza: 'FZA/Frei', weiterbildung: 'Weiterbildung', sonstige: 'Sonstige Abwesenheit' })[type] || type;
}
export function labelForPreference(type) { return PREFERENCE_TYPES.find(item => item.id === type)?.label || type; }
export function fmtGermanDate(iso) { const date = parseIso(iso); return fmtShort(date); }
export function weekdayLabel(iso) { return WEEKDAYS[parseIso(iso).getDay()]; }
export function monthTitle(year, month) { return `${MONTH_NAMES[month - 1]} ${year}`; }
