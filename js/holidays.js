/**
 * Feiertage in Sachsen und der Begriff „regulärer Werktag".
 *
 * Diese Logik lag zuvor doppelt vor: eine Osterformel und eine Werktagsprüfung
 * in app.js für die Anzeige, eine zweite Osterformel in rules.js für die
 * Regelbewertung. Die beiden Fassungen widersprachen sich – die Anzeige kannte
 * Feiertage, die Regel nicht. Dadurch wurde in der Tabelle ein anderer Tag als
 * Freizeitausgleich ausgewiesen als der, den die Regelprüfung sperrte.
 *
 * Alle Berechnungen laufen über lokale Kalendertage. `toISOString()` ist hier
 * verboten: In jeder Zeitzone mit positivem UTC-Versatz – ganzjährig in
 * Deutschland – liegt lokale Mitternacht in UTC noch am Vortag.
 */

export const HOLIDAY_REGION = 'SN';

export function parseIsoDate(dateIso) {
  return new Date(`${dateIso}T00:00:00`);
}

export function toIsoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Ostersonntag nach der Gaußschen Osterformel, als lokaler Kalendertag.
 */
export function easterSunday(year) {
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

const holidayCache = new Map();

/**
 * Alle gesetzlichen Feiertage eines Jahres in Sachsen als Map ISO-Datum → Name.
 */
export function saxonyHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const holidays = new Map([
    [`${year}-01-01`, 'Neujahr'],
    [`${year}-05-01`, 'Tag der Arbeit'],
    [`${year}-10-03`, 'Tag der Deutschen Einheit'],
    [`${year}-10-31`, 'Reformationstag'],
    [`${year}-12-25`, '1. Weihnachtsfeiertag'],
    [`${year}-12-26`, '2. Weihnachtsfeiertag']
  ]);
  const easter = easterSunday(year);
  holidays.set(toIsoDay(addDays(easter, -2)), 'Karfreitag');
  holidays.set(toIsoDay(addDays(easter, 1)), 'Ostermontag');
  holidays.set(toIsoDay(addDays(easter, 39)), 'Christi Himmelfahrt');
  holidays.set(toIsoDay(addDays(easter, 50)), 'Pfingstmontag');
  // Buß- und Bettag: der Mittwoch vor dem 23. November.
  const november23 = new Date(year, 10, 23);
  const offsetToWednesday = (november23.getDay() - 3 + 7) % 7 || 7;
  holidays.set(toIsoDay(addDays(november23, -offsetToWednesday)), 'Buß- und Bettag');
  holidayCache.set(year, holidays);
  return holidays;
}

export function holidayName(dateIso) {
  return saxonyHolidays(Number(dateIso.slice(0, 4))).get(dateIso) || '';
}

export function isHoliday(dateIso) {
  return Boolean(holidayName(dateIso));
}

/**
 * Regulärer Werktag: Montag bis Freitag und kein gesetzlicher Feiertag.
 */
export function isRegularWorkdayIso(dateIso) {
  const weekday = parseIsoDate(dateIso).getDay();
  if (weekday === 0 || weekday === 6) return false;
  return !isHoliday(dateIso);
}

export function isRegularWorkday(date) {
  return isRegularWorkdayIso(toIsoDay(date));
}

/**
 * Ist `dateIso` der erste reguläre Werktag nach einem Tag, auf den `matches`
 * zutrifft?
 *
 * Sucht bis zu `lookbackDays` rückwärts und bricht ab, sobald ein regulärer
 * Werktag dazwischenliegt – ein Wochenende oder ein Feiertagsblock unterbricht
 * die Kette also nicht, ein normaler Arbeitstag schon.
 */
export function isFirstRegularWorkdayAfter(dateIso, matches, lookbackDays = 7) {
  if (!isRegularWorkdayIso(dateIso)) return false;
  const target = parseIsoDate(dateIso);
  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const candidateIso = toIsoDay(addDays(target, -offset));
    if (matches(candidateIso)) return true;
    if (isRegularWorkdayIso(candidateIso)) return false;
  }
  return false;
}

/**
 * Die beiden alternierenden Feiertagsblöcke eines Jahres, als ISO-Daten.
 */
export function holidayBlocks(year) {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  return {
    easterBlock: [goodFriday, addDays(goodFriday, 1), easter, addDays(easter, 1)].map(toIsoDay),
    pentecostBlock: [addDays(easter, 48), addDays(easter, 49), addDays(easter, 50)].map(toIsoDay)
  };
}
