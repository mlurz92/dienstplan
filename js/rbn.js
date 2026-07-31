/**
 * Verbindliche Auswahllisten für die beiden Rufbereitschaften Neuroradiologie.
 *
 * Die Werte werden bewusst nicht aus dem frei veränderlichen RBN-Namensspeicher
 * bezogen: RBN und 2. RBN haben unterschiedliche, fachlich festgelegte Pools.
 */
export const HELLMANN_RBN_ACTIVE_FROM = '2026-10-01';

export const RBN1_OPTIONS = Object.freeze([
  Object.freeze({ value: 'Prof. Schob' }),
  Object.freeze({ value: 'Dr. Bailis' }),
  Object.freeze({ value: 'Dr. Maybaum' }),
  Object.freeze({ value: 'Dr. Schüngel' }),
  Object.freeze({ value: 'Fr. Dalitz' }),
  Object.freeze({ value: 'Dr. Martin' }),
  Object.freeze({ value: 'Hr. El Houba' }),
  Object.freeze({ value: 'Fr. Hellmann', activeFrom: HELLMANN_RBN_ACTIVE_FROM })
]);

export const RBN2_OPTIONS = Object.freeze([
  Object.freeze({ value: 'Prof. Schob' }),
  Object.freeze({ value: 'Dr. Bailis' }),
  Object.freeze({ value: 'Dr. Maybaum' })
]);


/**
 * Nur bei diesen Erstbesetzungen ist eine zweite RBN fachlich vorgesehen.
 * Fr. Hellmann zählt erst ab ihrem regulären Aktivierungsdatum als zulässige
 * Erstbesetzung; ein historischer Altwert vor Oktober schaltet 2. RBN nicht frei.
 */
export const RBN2_TRIGGER_NAMES = Object.freeze([
  'Dr. Schüngel',
  'Fr. Hellmann',
  'Dr. Martin',
  'Hr. El Houba'
]);

const RBN2_TRIGGER_SET = new Set(RBN2_TRIGGER_NAMES);

const OPTIONS_BY_FIELD = Object.freeze({ rbn1: RBN1_OPTIONS, rbn2: RBN2_OPTIONS });
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDay(value) {
  const match = ISO_DAY.exec(String(value || ''));
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * Liefert ausschließlich die am konkreten Tag zulässigen Namen.
 * ISO-Datumsstrings können lexikographisch verglichen werden.
 */
export function getRbnOptions(field, dateIso) {
  const definitions = OPTIONS_BY_FIELD[field];
  if (!definitions || !isValidIsoDay(dateIso)) return [];
  return definitions
    .filter(option => !option.activeFrom || dateIso >= option.activeFrom)
    .map(option => option.value);
}

export function isRbnValueAllowed(field, dateIso, value) {
  const normalized = String(value ?? '').trim();
  return normalized === '' || getRbnOptions(field, dateIso).includes(normalized);
}


/**
 * Die zweite RBN darf nur bearbeitbar sein, wenn die erste RBN am konkreten
 * Datum durch eine der vier festgelegten Personen besetzt ist.
 */
export function isSecondRbnAvailable(dateIso, firstRbnValue) {
  const normalized = String(firstRbnValue ?? '').trim();
  return RBN2_TRIGGER_SET.has(normalized)
    && isRbnValueAllowed('rbn1', dateIso, normalized);
}
