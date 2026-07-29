import { MONTH_NAMES, PREFERENCE_TYPES, STAFF_ORDER, toIsoDate, WEEKDAYS } from './defaults.js';

function parseIso(date) { return new Date(`${date}T00:00:00`); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function fmtShort(date) { return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth()+1).padStart(2, '0')}.${date.getFullYear()}`; }
function isSameDay(a, b) { return a?.toISOString?.().slice(0,10) === b?.toISOString?.().slice(0,10); }

const severityRank = { green: 0, yellow: 1, orange: 2, red: 3, gray: -1 };

export function getStaffById(staff, id) { return staff.find(item => item.id === id); }
export function getPlanningStaff(staff, dateIso) {
  return STAFF_ORDER
    .map(id => getStaffById(staff, id))
    .filter(Boolean)
    .filter(person => person.includeInPlanning)
    .filter(person => isStaffActiveOn(person, dateIso));
}

export function isStaffActiveOn(person, dateIso) {
  const date = parseIso(dateIso);
  if (person.activeFrom && date < parseIso(person.activeFrom)) return false;
  if (person.activeUntil && date > parseIso(person.activeUntil)) return false;
  return true;
}

export function getRoleProperties(person, dateIso) {
  const date = parseIso(dateIso);
  const base = {
    roleLabel: person.roleLabel,
    canHg: !!person.canHg,
    canSaturdayBd: !!person.canSaturdayBd
  };
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
  const key = `${anchor.getFullYear()}-${String(anchor.getMonth()+1).padStart(2,'0')}`;
  return state.months.get(key);
}

export function getAssignment(state, dateIso, role) {
  const d = parseIso(dateIso);
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const month = state.months.get(key);
  return month?.days?.[dateIso]?.[role] || '';
}

export function setAssignment(monthData, dateIso, role, staffId) {
  if (!monthData.days[dateIso]) monthData.days[dateIso] = { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' };
  monthData.days[dateIso][role] = staffId;
}

export function getAbsence(monthData, staffId, dateIso) { return monthData.absences?.[staffId]?.[dateIso] || ''; }
export function setAbsence(monthData, staffId, dateIso, type) {
  monthData.absences ||= {};
  monthData.absences[staffId] ||= {};
  if (type) monthData.absences[staffId][dateIso] = type;
  else delete monthData.absences[staffId][dateIso];
}
export function getPreference(monthData, staffId, dateIso) { return monthData.preferences?.[staffId]?.[dateIso] || ''; }
export function setPreference(monthData, staffId, dateIso, type) {
  monthData.preferences ||= {};
  monthData.preferences[staffId] ||= {};
  if (type) monthData.preferences[staffId][dateIso] = type;
  else delete monthData.preferences[staffId][dateIso];
}

export function countRoleInMonth(monthData, staffId, role) {
  return Object.values(monthData.days || {}).filter(day => day?.[role] === staffId).length;
}

export function computeWeekendEquivalent(monthData, staffId) {
  const weekends = {};
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    const date = parseIso(iso);
    const weekday = date.getDay();
    if (![5,6,0].includes(weekday)) continue;
    const friday = new Date(date);
    friday.setDate(date.getDate() - ((weekday + 2) % 7));
    const wk = friday.toISOString().slice(0,10);
    weekends[wk] ||= { bd: false, hg: false };
    if (day.bd === staffId) weekends[wk].bd = true;
    if (day.hg === staffId) weekends[wk].hg = true;
  }
  return Object.values(weekends).reduce((sum, wk) => sum + (wk.bd ? 1 : wk.hg ? 0.5 : 0), 0);
}

function listOwnRoleDates(state, staffId, role) {
  const dates = [];
  for (const month of state.months.values()) {
    for (const [iso, day] of Object.entries(month.days || {})) {
      if (day?.[role] === staffId) dates.push(iso);
    }
  }
  return dates.sort();
}

function getHolidayDates(year) {
  const easter = calcEaster(year);
  const karfreitag = addDays(easter, -2);
  const ostermontag = addDays(easter, 1);
  const pfingstsamstag = addDays(easter, 48);
  const pfingstsonntag = addDays(easter, 49);
  const pfingstmontag = addDays(easter, 50);
  return {
    easterBlock: [karfreitag, addDays(karfreitag, 1), easter, ostermontag],
    pentecostBlock: [pfingstsamstag, pfingstsonntag, pfingstmontag]
  };
}

function calcEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function inBlock(date, block) { return block.some(item => isSameDay(item, date)); }

export function evaluateCandidate({ state, monthData, dateIso, role, staffId }) {
  const person = getStaffById(state.staff, staffId);
  if (!person) return { level: 'gray', reasons: ['Unbekannte Person'], canSelect: false };
  const roleProps = getRoleProperties(person, dateIso);
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  let level = 'green';
  const reasons = [];
  const push = (nextLevel, reason) => {
    if (severityRank[nextLevel] > severityRank[level]) level = nextLevel;
    reasons.push(reason);
  };
  if (!person.includeInPlanning) push('gray', 'Nicht im aktiven Dienstpool');
  if (!isStaffActiveOn(person, dateIso)) push('gray', 'Zu diesem Zeitpunkt noch nicht bzw. nicht mehr aktiv');
  const currentBd = countRoleInMonth(monthData, staffId, 'bd');
  const currentHg = countRoleInMonth(monthData, staffId, 'hg');
  if (role === 'bd' && monthData.days[dateIso]?.hg === staffId) push('red', 'Gleichzeitige Einteilung in HG und BD am selben Tag');
  if (role === 'hg' && monthData.days[dateIso]?.bd === staffId) push('red', 'Gleichzeitige Einteilung in BD und HG am selben Tag');
  const absence = getAbsence(monthData, staffId, dateIso);
  if (absence) push('red', `${labelForAbsence(absence)} eingetragen`);
  const preference = getPreference(monthData, staffId, dateIso);
  if (preference === 'kein-dienst') push('red', 'Wunsch: kein Dienst');
  if (preference === 'kein-bd' && role === 'bd') push('red', 'Wunsch: kein BD');
  if (preference === 'kein-hg' && role === 'hg') push('red', 'Wunsch: kein HG');
  if (preference === 'bd-bevorzugt' && role === 'bd') push('green', 'Wunsch: BD bevorzugt');
  if (preference === 'hg-bevorzugt' && role === 'hg') push('green', 'Wunsch: HG bevorzugt');
  if (preference === 'dienst-bevorzugt') push('green', 'Wunsch: Dienst bevorzugt');

  if (role === 'hg' && !roleProps.canHg) push('red', 'HG nur für Fachärzte zulässig');
  if (role === 'bd' && weekday === 6 && !roleProps.canSaturdayBd) push('red', 'Samstags-BD nur für Fachärzte zulässig');

  if (person.id === 'polednia' && [0,2].includes(weekday) && (role === 'bd' || role === 'hg')) push('red', 'Dr. Polednia dienstags und sonntags weder BD noch HG');
  if (person.id === 'becker' && role === 'bd' && weekday === 6) push('orange', 'Samstags-BD für Dr. Becker nur nachrangig');
  if (person.id === 'dalitz' && role === 'hg' && [0,1].includes(weekday) && monthData.days[dateIso]?.bd === 'sebastian') push('orange', 'Dalitz-HG an So/Mo bei Sebastian-BD nur nachrangig');

  const prevDateIso = addDays(date, -1).toISOString().slice(0,10);
  const prev2DateIso = addDays(date, -2).toISOString().slice(0,10);
  const prev3DateIso = addDays(date, -3).toISOString().slice(0,10);
  if (role === 'bd') {
    if (getAssignment(state, prevDateIso, 'bd') === staffId) push('red', 'BD am Vortag – erneuter BD am Folgetag unzulässig');
    const ownBdDates = listOwnRoleDates(state, staffId, 'bd').concat(dateIso).sort();
    const idx = ownBdDates.indexOf(dateIso);
    if (idx > 0) {
      const prevBd = parseIso(ownBdDates[idx - 1]);
      const diff = Math.round((date - prevBd) / 86400000);
      const fzaDate = addDays(date, -1);
      const fzaIso = fzaDate.toISOString().slice(0,10);
      const fzaMonthKey = `${fzaDate.getFullYear()}-${String(fzaDate.getMonth()+1).padStart(2,'0')}`;
      const fzaMonth = state.months.get(fzaMonthKey);
      const isWeekdayPattern = [prevBd, fzaDate, date].every(item => item.getDay() >= 1 && item.getDay() <= 5);
      const isBdFzaBd = diff === 2 && isWeekdayPattern && getAbsence(fzaMonth || monthData, staffId, fzaIso) === 'fza';
      if (isBdFzaBd) push('yellow', 'BD–FZA–BD werktags');
      else if (diff > 1 && diff < 4) push('orange', 'Weniger als 3 dienstfreie Tage seit letztem BD');
    }
    if (person.maxBd && currentBd >= person.maxBd) push('red', `Monatsmaximum von ${person.maxBd} BD bereits erreicht`);
    else if (person.bdTarget && currentBd >= person.bdTarget) push('yellow', `BD-Richtwert ${person.bdTarget} bereits erreicht`);
    const nextDay = addDays(date, 1);
    const nextIso = nextDay.toISOString().slice(0,10);
    const firstVacationDay = getAbsence(monthData, staffId, nextIso) === 'urlaub';
    if (firstVacationDay) push('orange', 'BD unmittelbar vor Urlaubsbeginn');
    if (person.id === 'becker') {
      for (let offset = 1; offset <= 3; offset++) {
        const previous = addDays(date, -offset);
        if (previous.getDay() === 6 && getAssignment(state, previous.toISOString().slice(0,10), 'bd') === 'becker') {
          const intervening = Array.from({ length: offset - 1 }, (_, index) => addDays(previous, index + 1));
          if (intervening.every(item => [0,6].includes(item.getDay()))) push('red', 'Nächster regulärer Werktag nach Samstags-BD für Dr. Becker für BD gesperrt');
          break;
        }
      }
    }
    applyWeekendWarnings(state, staffId, date, 'bd', push);
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  if (role === 'hg') {
    const prevHg1 = getAssignment(state, prevDateIso, 'hg') === staffId;
    const prevHg2 = getAssignment(state, prev2DateIso, 'hg') === staffId;
    const prevHg3 = getAssignment(state, prev3DateIso, 'hg') === staffId;
    if (prevHg1 && prevHg2) push('orange', 'Dritter HG an drei aufeinanderfolgenden Tagen');
    else if (prevHg1 || prevHg2 || prevHg3) push('yellow', 'Erneuter HG innerhalb von 3 Kalendertagen');
    const isFridayHgBeforeSaturdayBd = weekday === 5 && getAssignment(state, addDays(date,1).toISOString().slice(0,10), 'bd') === staffId;
    if (getAssignment(state, addDays(date,1).toISOString().slice(0,10), 'bd') === staffId && !isFridayHgBeforeSaturdayBd) push('orange', 'HG am Tag vor eigenem BD');
    applyWeekendWarnings(state, staffId, date, 'hg', push);
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  if (level === 'green' && reasons.length === 0) reasons.push('Keine relevanten Konflikte');
  return { level, reasons, canSelect: true, meta: { currentBd, currentHg } };
}

function applyWeekendWarnings(state, staffId, date, role, push) {
  const weekday = date.getDay();
  if (![5,6,0].includes(weekday)) return;
  const friday = new Date(date);
  friday.setDate(date.getDate() - ((weekday + 2) % 7));
  const prevWeekendFriday = addDays(friday, -7);
  const prevWeekendDates = [0,1,2].map(i => addDays(prevWeekendFriday, i).toISOString().slice(0,10));
  const hadPrevWeekendBd = prevWeekendDates.some(iso => getAssignment(state, iso, 'bd') === staffId);
  const hadPrevWeekendHg = prevWeekendDates.some(iso => getAssignment(state, iso, 'hg') === staffId);
  if (hadPrevWeekendBd || hadPrevWeekendHg) {
    if (role === 'bd' && hadPrevWeekendBd) push('red', 'BD-Wochenende direkt nach BD-Wochenende');
    else push('orange', 'Dienst an aufeinanderfolgenden Wochenenden');
  }
}

function applyHolidayBlockWarnings(state, staffId, date, push) {
  const { easterBlock, pentecostBlock } = getHolidayDates(date.getFullYear());
  const inEaster = inBlock(date, easterBlock);
  const inPentecost = inBlock(date, pentecostBlock);
  if (!inEaster && !inPentecost) return;
  const targetBlock = inEaster ? pentecostBlock : easterBlock;
  const blockDates = targetBlock.map(d => d.toISOString().slice(0,10));
  const hadOtherBlock = blockDates.some(iso => getAssignment(state, iso, 'bd') === staffId || getAssignment(state, iso, 'hg') === staffId);
  if (hadOtherBlock) push('orange', 'Bereits Dienst im alternierenden Oster-/Pfingstblock');
}

export function collectIssues(state, monthData) {
  const issues = [];
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    if (!day.hg) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: HG offen`, details: 'Kein HG eingetragen.' });
    if (!day.bd) issues.push({ level: 'yellow', title: `${fmtGermanDate(iso)}: BD offen`, details: 'Kein BD eingetragen.' });
    for (const role of ['bd', 'hg']) {
      const staffId = day[role];
      if (!staffId) continue;
      const evaluation = evaluateCandidate({ state, monthData, dateIso: iso, role, staffId });
      if (['orange', 'red'].includes(evaluation.level)) issues.push({
        level: evaluation.level,
        title: `${fmtGermanDate(iso)} · ${role.toUpperCase()} · ${getStaffById(state.staff, staffId)?.name || staffId}`,
        details: evaluation.reasons.join(' · ')
      });
    }
  }
  for (const [staffId, absMap] of Object.entries(monthData.absences || {})) {
    if (staffId !== 'becker' && staffId !== 'martin') continue;
    for (const [iso, type] of Object.entries(absMap)) {
      const other = staffId === 'becker' ? 'martin' : 'becker';
      const isWorkday = ![0,6].includes(parseIso(iso).getDay());
      if (isWorkday && getAbsence(monthData, other, iso)) issues.push({
        level: 'red',
        title: `${fmtGermanDate(iso)} · Becker/Martin gleichzeitig abwesend`,
        details: 'CT-Leitungsbesetzung prüfen.'
      });
    }
  }
  return issues.sort((a,b) => severityRank[b.level]-severityRank[a.level]);
}

export function buildStats(state, monthData) {
  return state.staff.filter(s => s.includeInPlanning && isStaffActiveOn(s, dayIso(monthData.year, monthData.month, 1))).map(person => ({
    id: person.id,
    name: person.name,
    roleLabel: getRoleProperties(person, dayIso(monthData.year, monthData.month, 15)).roleLabel,
    bd: countRoleInMonth(monthData, person.id, 'bd'),
    hg: countRoleInMonth(monthData, person.id, 'hg'),
    weekendEq: Number(computeWeekendEquivalent(monthData, person.id).toFixed(1)),
    bdTarget: person.bdTarget || 0,
    bdRemaining: person.bdTarget ? (person.bdTarget - countRoleInMonth(monthData, person.id, 'bd')) : null
  }));
}

export function labelForAbsence(type) {
  return ({ urlaub: 'Urlaub', fza: 'FZA/Frei', weiterbildung: 'Weiterbildung', sonstige: 'Sonstige Abwesenheit' })[type] || type;
}
export function labelForPreference(type) {
  return PREFERENCE_TYPES.find(item => item.id === type)?.label || type;
}
export function fmtGermanDate(iso) {
  const date = parseIso(iso);
  return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`;
}
export function weekdayLabel(iso) { return WEEKDAYS[parseIso(iso).getDay()]; }
export function monthTitle(year, month) { return `${MONTH_NAMES[month-1]} ${year}`; }
