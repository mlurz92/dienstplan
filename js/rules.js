import { MONTH_NAMES, PREFERENCE_TYPES, STAFF_ORDER, toIsoDate, WEEKDAYS } from './defaults.js?v=20260730.1';
import { holidayBlocks, isFirstRegularWorkdayAfter, isRegularWorkdayIso } from './holidays.js?v=20260730.1';

function parseIso(date) { return new Date(`${date}T00:00:00`); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function fmtShort(date) { return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth()+1).padStart(2, '0')}.${date.getFullYear()}`; }

/**
 * Kalendertag eines Date-Objekts als ISO-Datum – in LOKALER Zeit.
 *
 * `toISOString()` darf hier nicht verwendet werden. Alle Datumsobjekte dieser
 * Datei entstehen über `parseIso` als lokale Mitternacht. In jeder Zeitzone mit
 * positivem UTC-Versatz – also ganzjährig in Deutschland – liegt diese
 * Mitternacht in UTC noch am Vortag: Der 04.07.2026 wird zu "2026-07-03".
 * Sämtliche Abstands-, Wochenend- und Feiertagsblockregeln haben dadurch den
 * jeweils falschen Tag geprüft. In UTC, der Standardzeitzone von Testläufern,
 * fällt das nicht auf – deshalb erzwingt tests/timezone.test.js Europe/Berlin.
 */
function toLocalIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSameDay(a, b) { return a && b ? toLocalIso(a) === toLocalIso(b) : false; }

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
export function getAbsenceSource(monthData, staffId, dateIso) { return monthData.absenceSources?.[staffId]?.[dateIso] || ''; }
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

/**
 * Zählt die Dienste einer Person im Monat OHNE einen bestimmten Tag.
 *
 * Die Kontingentprüfung fragt: „Wie viele hat die Person außer an diesem Tag?"
 * Zählte man den bewerteten Tag mit, meldete die bereits eingetragene, völlig
 * reguläre Einteilung sich selbst als Überschreitung – der dritte von drei
 * Soll-BD wurde gelb gewarnt, der zweite von zwei erlaubten BD sogar rot als
 * Regelverstoß. Ohne den eigenen Tag ist die Bewertung identisch, egal ob die
 * Einteilung schon existiert oder gerade erst gewählt wird.
 */
export function countRoleInMonthExcept(monthData, staffId, role, exceptIso) {
  return Object.entries(monthData.days || {})
    .filter(([iso, day]) => iso !== exceptIso && day?.[role] === staffId).length;
}

export function computeWeekendEquivalent(monthData, staffId) {
  const weekends = {};
  for (const [iso, day] of Object.entries(monthData.days || {})) {
    const date = parseIso(iso);
    const weekday = date.getDay();
    if (![5,6,0].includes(weekday)) continue;
    const friday = new Date(date);
    friday.setDate(date.getDate() - ((weekday + 2) % 7));
    const wk = toLocalIso(friday);
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

export function evaluateCandidate({ state, monthData, dateIso, role, staffId }) {
  const person = getStaffById(state.staff, staffId);
  if (!person) return { level: 'gray', reasons: ['Unbekannte Person'], canSelect: false };
  const roleProps = getRoleProperties(person, dateIso);
  const date = parseIso(dateIso);
  const weekday = date.getDay();
  let level = 'green';
  let blocked = false;
  const reasons = [];
  const push = (nextLevel, reason) => {
    // "gray" hat den Rang -1 und konnte den Ausgangswert "green" nie
    // überschreiben: Eine Person außerhalb ihres Aktivzeitraums wurde dadurch
    // als "geeignet" ausgewiesen, obwohl die Begründung das Gegenteil sagte.
    // Grau ist kein Schweregrad, sondern ein Ausschluss und wird deshalb
    // gesondert geführt.
    if (nextLevel === 'gray') blocked = true;
    else if (severityRank[nextLevel] > severityRank[level]) level = nextLevel;
    reasons.push(reason);
  };
  if (!person.includeInPlanning) push('gray', 'Nicht im aktiven Dienstpool');
  if (!isStaffActiveOn(person, dateIso)) push('gray', 'Zu diesem Zeitpunkt noch nicht bzw. nicht mehr aktiv');
  const currentBd = countRoleInMonthExcept(monthData, staffId, 'bd', dateIso);
  const currentHg = countRoleInMonthExcept(monthData, staffId, 'hg', dateIso);
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

  const prevDateIso = toLocalIso(addDays(date, -1));
  const prev2DateIso = toLocalIso(addDays(date, -2));
  const prev3DateIso = toLocalIso(addDays(date, -3));
  if (role === 'bd') {
    const ownBdDates = listOwnRoleDates(state, staffId, 'bd').filter(iso => iso !== dateIso).concat(dateIso).sort();
    const idx = ownBdDates.indexOf(dateIso);
    if (idx > 0) {
      const prevBd = parseIso(ownBdDates[idx - 1]);
      const diff = Math.round((date - prevBd) / 86400000);
      const fzaDate = addDays(date, -1);
      const fzaIso = toLocalIso(fzaDate);
      const fzaMonthKey = `${fzaDate.getFullYear()}-${String(fzaDate.getMonth()+1).padStart(2,'0')}`;
      const fzaMonth = state.months.get(fzaMonthKey);
      const isWeekdayPattern = [prevBd, fzaDate, date].every(item => item.getDay() >= 1 && item.getDay() <= 5);
      const isBdFzaBd = diff === 2 && isWeekdayPattern && getAbsence(fzaMonth || monthData, staffId, fzaIso) === 'fza';

      if (diff === 1) push('yellow', 'BD bereits am Vortag');
      else if (isBdFzaBd) push('yellow', 'BD–FZA–BD werktags');
      else if (diff > 1 && diff < 4) push('yellow', 'Kurzer Abstand zum letzten BD');
    }
    // Auch nach vorn prüfen. Zuvor wurde ausschließlich der vorhergehende
    // eigene BD betrachtet: Wer den Dienst am Tag VOR einem bereits
    // eingetragenen eigenen BD besetzte, bekam überhaupt keinen Hinweis,
    // während der umgekehrte Weg gewarnt hat – dieselbe Dienstfolge wurde je
    // nach Eingabereihenfolge unterschiedlich bewertet.
    if (idx >= 0 && idx < ownBdDates.length - 1) {
      const nextBd = parseIso(ownBdDates[idx + 1]);
      const diffForward = Math.round((nextBd - date) / 86400000);
      if (diffForward === 1) push('yellow', 'BD bereits am Folgetag');
      else if (diffForward > 1 && diffForward < 4) push('yellow', 'Kurzer Abstand zum nächsten BD');
    }
    if (person.maxBd && currentBd >= person.maxBd) push('red', `Monatsmaximum von ${person.maxBd} BD bereits erreicht`);
    else if (person.bdTarget && currentBd >= person.bdTarget) push('yellow', `BD-Richtwert ${person.bdTarget} bereits erreicht`);
    const nextDay = addDays(date, 1);
    const nextIso = toLocalIso(nextDay);
    const firstVacationDay = getAbsence(monthData, staffId, nextIso) === 'urlaub';
    if (firstVacationDay) push('orange', 'BD unmittelbar vor Urlaubsbeginn');
    // Sperre für Dr. Becker am ersten regulären Werktag nach eigenem
    // Samstags-BD. Die frühere Fassung kannte weder Feiertage noch den Begriff
    // des Werktags: Sie schlug auch sonntags an und sperrte bei einem
    // Feiertagsmontag den Feiertag statt des darauffolgenden Arbeitstags. Die
    // Anzeige in der Tabelle rechnete dagegen bereits feiertagsbewusst – der
    // Plan wies also einen anderen Tag als Freizeitausgleich aus als den, den
    // die Regel sperrte. Beide nutzen jetzt dieselbe Funktion.
    if (person.id === 'becker'
      && isFirstRegularWorkdayAfter(dateIso, iso => parseIso(iso).getDay() === 6 && getAssignment(state, iso, 'bd') === 'becker')) {
      push('red', 'Nächster regulärer Werktag nach Samstags-BD für Dr. Becker für BD gesperrt');
    }
    // Gegenstück zur HG-Regel: Ein eigener HG am Vortag ist dieselbe Belastung,
    // egal von welcher Seite sie eingetragen wird. Ausgenommen bleibt das
    // eingespielte Muster Freitag-HG vor Samstags-BD.
    if (getAssignment(state, prevDateIso, 'hg') === staffId && weekday !== 6) {
      push('orange', 'Eigener HG am Vortag');
    }
    applyWeekendWarnings(state, staffId, date, 'bd', push);
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  if (role === 'hg') {
    // Die Häufung wird in BEIDE Richtungen betrachtet. Zuvor zählten nur die
    // Vortage: Ein HG, der eine bestehende Kette von vorn verlängerte, blieb
    // ohne Hinweis, während derselbe Dienst von hinten angehängt gemeldet
    // wurde – dieselbe Dienstfolge war je nach Eingabereihenfolge grün oder
    // orange.
    const hgAt = offset => getAssignment(state, toLocalIso(addDays(date, offset)), 'hg') === staffId;
    const nachbarn = [-3, -2, -1, 1, 2, 3].filter(hgAt);
    const dreiInFolge = (hgAt(-2) && hgAt(-1)) || (hgAt(-1) && hgAt(1)) || (hgAt(1) && hgAt(2));
    if (dreiInFolge) push('orange', 'Dritter HG an drei aufeinanderfolgenden Tagen');
    else if (nachbarn.length) push('yellow', 'Erneuter HG innerhalb von 3 Kalendertagen');
    const isFridayHgBeforeSaturdayBd = weekday === 5 && getAssignment(state, toLocalIso(addDays(date,1)), 'bd') === staffId;
    if (getAssignment(state, toLocalIso(addDays(date,1)), 'bd') === staffId && !isFridayHgBeforeSaturdayBd) push('orange', 'HG am Tag vor eigenem BD');
    applyWeekendWarnings(state, staffId, date, 'hg', push);
    applyHolidayBlockWarnings(state, staffId, date, push);
  }

  if (level === 'green' && reasons.length === 0) reasons.push('Keine relevanten Konflikte');
  if (blocked) return { level: 'gray', reasons, canSelect: false, meta: { currentBd, currentHg } };
  return { level, reasons, canSelect: true, meta: { currentBd, currentHg } };
}

/**
 * Wochenenddienste an unmittelbar benachbarten Wochenenden.
 *
 * Geprüft wird das Wochenende davor UND das danach. Zuvor zählte nur das
 * vorhergehende: Wer ein Wochenende vor einem bereits belegten Wochenende
 * besetzte, bekam gar keinen Hinweis, während dieselbe Paarung in umgekehrter
 * Eingabereihenfolge als roter Konflikt erschien. Die Belastung ist in beiden
 * Fällen dieselbe.
 */
function applyWeekendWarnings(state, staffId, date, role, push) {
  const weekday = date.getDay();
  if (![5,6,0].includes(weekday)) return;
  const friday = new Date(date);
  friday.setDate(date.getDate() - ((weekday + 2) % 7));

  const wochenende = versatz => {
    const start = addDays(friday, versatz);
    const tage = [0, 1, 2].map(i => toLocalIso(addDays(start, i)));
    return {
      bd: tage.some(iso => getAssignment(state, iso, 'bd') === staffId),
      hg: tage.some(iso => getAssignment(state, iso, 'hg') === staffId)
    };
  };

  const nachbarn = [wochenende(-7), wochenende(7)];
  const angrenzenderBd = nachbarn.some(item => item.bd);
  const angrenzenderDienst = nachbarn.some(item => item.bd || item.hg);
  if (!angrenzenderDienst) return;
  if (role === 'bd' && angrenzenderBd) push('red', 'BD-Wochenende direkt neben BD-Wochenende');
  else push('orange', 'Dienst an aufeinanderfolgenden Wochenenden');
}

function applyHolidayBlockWarnings(state, staffId, date, push) {
  const { easterBlock, pentecostBlock } = holidayBlocks(date.getFullYear());
  const iso = toLocalIso(date);
  const inEaster = easterBlock.includes(iso);
  const inPentecost = pentecostBlock.includes(iso);
  if (!inEaster && !inPentecost) return;
  const targetBlock = inEaster ? pentecostBlock : easterBlock;
  const hadOtherBlock = targetBlock.some(day => getAssignment(state, day, 'bd') === staffId || getAssignment(state, day, 'hg') === staffId);
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
  // Nur über EINE der beiden Personen laufen. Die frühere Fassung iterierte
  // über beide und meldete denselben Tag deshalb zweimal. Feiertage zählen
  // zudem nicht als Arbeitstag – an ihnen ist ohnehin niemand in der Regelbesetzung.
  for (const iso of Object.keys(monthData.absences?.becker || {})) {
    if (!isRegularWorkdayIso(iso)) continue;
    if (!getAbsence(monthData, 'martin', iso)) continue;
    issues.push({
      level: 'red',
      title: `${fmtGermanDate(iso)} · Becker/Martin gleichzeitig abwesend`,
      details: 'CT-Leitungsbesetzung prüfen.'
    });
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
