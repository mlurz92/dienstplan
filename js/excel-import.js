/**
 * Auswertung importierter Excel-Arbeitsmappen.
 *
 * Das Modul arbeitet bewusst auf reinen Zeilenmatrizen (`string[][]` je Blatt)
 * und nicht auf SheetJS-Objekten. Nur so ist die Erkennungslogik ohne Browser
 * und ohne die CDN-Bibliothek prüfbar – die Regressionstests speisen exakt die
 * Zeilen ein, die aus den echten Altdateien stammen.
 *
 * Unterstützt werden zwei historisch gewachsene Formate:
 *
 * 1. Jahresmappe mit Monatsblättern (Jan … Dez). Je Person zwei Zeilen:
 *    „Arbeitsplatz“ mit Abwesenheitskürzeln und „Dienst/Hintergrund“ mit D/HG.
 *    Die Tage stehen als Spaltenköpfe („1.“, „2.“, …).
 * 2. Monatsblatt eines einzelnen Dienstplans mit den Spalten Tag, Wochentag,
 *    BD, HG, RBN und 2. RBN – sowohl in der Fassung der Anwendung selbst als
 *    auch in den älteren Handfassungen.
 *
 * Personen, die die Anwendung nicht kennt, gehen nicht verloren: Ihr Name wird
 * als externer Eintrag in das Dienstfeld geschrieben (siehe
 * `externalAssignmentValue`). Abwesenheiten sind an eine Personal-ID gebunden
 * und können für Unbekannte nicht abgelegt werden; sie werden gemeldet.
 */
import { MONTH_NAMES, SHEET_NAMES, createEmptyMonth, toIsoDate } from './defaults.js?v=20260803.6';
import { externalAssignmentValue, setAbsence, setAssignment } from './rules-core.js?v=20260803.6';
import { getRbnOptions, rbnDisplayName } from './rbn.js?v=20260803.6';

const SHEET_NAME_ALIASES = { mrz: 3, mär: 3, maerz: 3, sept: 9, dez: 12 };
const ABSENCE_CODES = {
  U: 'urlaub',
  F: 'fza',
  FZA: 'fza',
  FREI: 'fza',
  WB: 'weiterbildung',
  FB: 'weiterbildung',
  K: 'sonstige',
  KK: 'sonstige',
  ZU: 'sonstige',
  DR: 'sonstige',
  '§15C': 'sonstige'
};
const SALUTATIONS = /^(?:(?:prof\.|priv\.-doz\.|pd|dr\.|med\.|habil\.|fr\.|hr\.|frau|herr)\s+)+/u;

/**
 * Monatsnummer eines Blattnamens. Die Mappen schreiben den März je nach
 * Herkunft „Mrz“, „Mär“ oder „März“; erkannt werden alle Schreibweisen.
 */
export function monthFromSheetName(name) {
  const wanted = normalize(name);
  if (!wanted) return null;
  const short = SHEET_NAMES.findIndex(entry => entry.toLowerCase() === wanted);
  if (short >= 0) return short + 1;
  if (SHEET_NAME_ALIASES[wanted]) return SHEET_NAME_ALIASES[wanted];
  if (wanted.length < 3) return null;
  const full = MONTH_NAMES.findIndex(entry => entry.toLowerCase().startsWith(wanted));
  return full >= 0 ? full + 1 : null;
}

const text = value => {
  if (value === null || value === undefined) return '';
  // Bewusst lokale Kalenderwerte: `toISOString()` verschiebt eine Zelle mit
  // lokaler Mitternacht in jeder Zone mit positivem UTC-Versatz auf den Vortag –
  // aus dem 01. April würde der 31. März und damit der falsche Monat.
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value);
};
const normalize = value => text(value).replace(/\s+/g, ' ').trim().toLowerCase();
const withoutSalutation = value => normalize(value).replace(SALUTATIONS, '').trim();

function parseDayNumber(value) {
  if (value instanceof Date) return value.getDate();
  const match = text(value).trim().match(/^(\d{1,2})/);
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

/**
 * Jahr und Monat aus dem Blattkopf. Erkannt werden echte Datumswerte,
 * „März 2026“, „Mrz 2026“ und reine Jahreszahlen.
 */
/**
 * Excel-Seriennummer in ein Datum. Nötig, weil eine Mappe je nach Leseoption
 * ein echtes Datum, einen Text oder eben die nackte Seriennummer liefert.
 */
export function excelSerialToDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function detectPeriod(rows, { maxRows = 8, maxCols = 14 } = {}) {
  let year = null;
  let month = null;
  for (const row of (rows || []).slice(0, maxRows)) {
    for (const cell of (row || []).slice(0, maxCols)) {
      if (cell instanceof Date) return { year: cell.getFullYear(), month: cell.getMonth() + 1 };
      const raw = text(cell).trim();
      if (!raw) continue;
      const isoDate = raw.match(/^(20\d{2})-(\d{2})-(\d{2})/);
      if (isoDate) return { year: Number(isoDate[1]), month: Number(isoDate[2]) };
      const germanDate = raw.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
      if (germanDate) return { year: Number(germanDate[3]), month: Number(germanDate[2]) };
      if (typeof cell === 'number') {
        const serial = excelSerialToDate(cell);
        if (serial) return { year: serial.getUTCFullYear(), month: serial.getUTCMonth() + 1 };
      }
      const lower = normalize(raw);
      const monthIndex = MONTH_NAMES.findIndex(name => lower.startsWith(name.toLowerCase()));
      const shortIndex = SHEET_NAMES.findIndex(name => lower.startsWith(name.toLowerCase()));
      const yearMatch = raw.match(/\b(20\d{2})\b/);
      if (monthIndex >= 0 || shortIndex >= 0) {
        month ??= (monthIndex >= 0 ? monthIndex : shortIndex) + 1;
        if (yearMatch) year ??= Number(yearMatch[1]);
        if (year && month) return { year, month };
      }
      if (yearMatch) year ??= Number(yearMatch[1]);
    }
  }
  return { year, month };
}

/** Personal-ID zu einem Namen aus der Datei, sonst null. */
export function resolveStaffId(staff, rawName) {
  const wanted = normalize(rawName);
  if (!wanted) return null;
  const wantedBare = withoutSalutation(rawName);
  for (const person of staff || []) {
    const candidates = [person.id, person.name, person.short];
    if (candidates.some(candidate => normalize(candidate) === wanted)) return person.id;
  }
  for (const person of staff || []) {
    const candidates = [person.name, person.short];
    if (candidates.some(candidate => withoutSalutation(candidate) === wantedBare)) return person.id;
  }
  return null;
}

/** Rufbereitschaftsname auf den am Tag gültigen Pool abbilden, sonst Rohwert. */
export function resolveRbnValue(field, dateIso, rawValue) {
  const raw = text(rawValue).replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const wanted = normalize(raw);
  const wantedBare = withoutSalutation(raw);
  for (const option of getRbnOptions(field, dateIso)) {
    if (normalize(option) === wanted) return option;
    if (withoutSalutation(option) === wantedBare) return option;
    if (normalize(rbnDisplayName(option)) === wantedBare) return option;
  }
  return raw;
}

function emptyResult(sheetName, year, month) {
  return {
    sheetName,
    year,
    month,
    monthData: createEmptyMonth(year, month),
    assignments: 0,
    absences: 0,
    rbnValues: 0,
    unknownNames: [],
    skippedAbsenceNames: [],
    usedFallbackYear: false,
    usedFallbackMonth: false
  };
}

/**
 * Jahresmappen-Monatsblatt: Personenzeilen mit „Arbeitsplatz“ und
 * „Dienst/Hintergrund“, Tage als Spaltenköpfe.
 */
export function parseMatrixSheet(sheetName, rows, { staff = [], fallbackYear } = {}) {
  const month = monthFromSheetName(sheetName);
  if (!month) return null;
  const dayRowIndex = (rows || []).findIndex(row =>
    (row || []).slice(2).filter(cell => parseDayNumber(cell) !== null).length >= 15
  );
  if (dayRowIndex < 0) return null;

  const period = detectPeriod(rows);
  const year = period.year || fallbackYear;
  if (!year) return null;
  const result = emptyResult(sheetName, year, month);
  result.usedFallbackYear = !period.year;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayColumns = [];
  (rows[dayRowIndex] || []).forEach((cell, index) => {
    if (index < 2) return;
    const day = parseDayNumber(cell);
    if (day !== null && day <= daysInMonth) dayColumns.push({ column: index, iso: toIsoDate(year, month, day) });
  });
  if (!dayColumns.length) return null;

  const unknownNames = new Set();
  const skippedAbsenceNames = new Set();
  for (let rowIndex = dayRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const rawName = text(row[0]).trim();
    if (!rawName || !normalize(row[1]).startsWith('arbeitsplatz')) continue;
    const dutyRow = normalize((rows[rowIndex + 1] || [])[1]).startsWith('dienst') ? rows[rowIndex + 1] : [];
    const staffId = resolveStaffId(staff, rawName);
    if (!staffId) unknownNames.add(rawName);

    for (const { column, iso } of dayColumns) {
      const workplace = text(row[column]).trim().toUpperCase();
      const duty = text(dutyRow[column]).trim().toUpperCase();
      if (ABSENCE_CODES[workplace]) {
        if (staffId) {
          setAbsence(result.monthData, staffId, iso, ABSENCE_CODES[workplace], 'import');
          result.absences += 1;
        } else {
          skippedAbsenceNames.add(rawName);
        }
      }
      const role = duty === 'D' ? 'bd' : (duty === 'HG' ? 'hg' : '');
      if (!role) continue;
      setAssignment(result.monthData, iso, role, staffId || externalAssignmentValue(rawName));
      result.assignments += 1;
    }
  }
  result.unknownNames = [...unknownNames];
  result.skippedAbsenceNames = [...skippedAbsenceNames];
  return result;
}

/**
 * Einzelmonatsblatt mit den Spalten Tag, Wochentag, BD, HG, RBN und 2. RBN.
 * Der Blattname trägt hier keine Information – Monat und Jahr stehen im Kopf.
 */
export function parsePlanSheet(sheetName, rows, { staff = [], fallbackYear, fallbackMonth } = {}) {
  const headerIndex = (rows || []).findIndex(row => {
    const cells = (row || []).map(normalize);
    return cells.includes('bd') && cells.includes('hg');
  });
  if (headerIndex < 0) return null;
  const header = (rows[headerIndex] || []).map(normalize);
  const columns = {
    day: header.indexOf('tag') >= 0 ? header.indexOf('tag') : 0,
    bd: header.indexOf('bd'),
    hg: header.indexOf('hg'),
    rbn1: header.findIndex(cell => /^(?:1\.\s*)?rbn$/.test(cell)),
    rbn2: header.findIndex(cell => /^2\.\s*rbn$/.test(cell))
  };

  const period = detectPeriod(rows.slice(0, headerIndex + 1), { maxRows: headerIndex + 1, maxCols: 14 });
  const year = period.year || fallbackYear;
  const month = period.month || fallbackMonth;
  if (!year || !month) return null;

  const result = emptyResult(sheetName, year, month);
  result.usedFallbackYear = !period.year;
  // Der Monat eines Einzelblatts steht nur im Kopf. Fehlt er dort, wird der
  // angezeigte Monat angenommen – das muss der Import genauso ausweisen wie
  // eine fehlende Jahreszahl, sonst landen Daten unbemerkt im falschen Monat.
  result.usedFallbackMonth = !period.month;
  const daysInMonth = new Date(year, month, 0).getDate();
  const unknownNames = new Set();
  const seenDays = new Set();

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const day = parseDayNumber(row[columns.day]);
    if (day === null || day > daysInMonth || seenDays.has(day)) continue;
    // Ohne besetzte Dienstspalte ist die Zeile kein Tag, sondern Beiwerk
    // (Statistikblock, Fußnote) mit zufällig führender Zahl.
    const bdRaw = text(row[columns.bd]).trim();
    const hgRaw = text(row[columns.hg]).trim();
    const rbn1Raw = columns.rbn1 >= 0 ? text(row[columns.rbn1]).trim() : '';
    const rbn2Raw = columns.rbn2 >= 0 ? text(row[columns.rbn2]).trim() : '';
    if (!bdRaw && !hgRaw && !rbn1Raw && !rbn2Raw) continue;
    seenDays.add(day);
    const iso = toIsoDate(year, month, day);

    for (const [role, raw] of [['bd', bdRaw], ['hg', hgRaw]]) {
      if (!raw) continue;
      const staffId = resolveStaffId(staff, raw);
      if (!staffId) unknownNames.add(raw);
      setAssignment(result.monthData, iso, role, staffId || externalAssignmentValue(raw));
      result.assignments += 1;
    }
    if (rbn1Raw) {
      result.monthData.days[iso].rbn1 = resolveRbnValue('rbn1', iso, rbn1Raw);
      result.rbnValues += 1;
    }
    if (rbn2Raw) {
      result.monthData.days[iso].rbn2 = resolveRbnValue('rbn2', iso, rbn2Raw);
      result.rbnValues += 1;
    }
  }
  if (!seenDays.size) return null;
  result.unknownNames = [...unknownNames];
  return result;
}

/**
 * Gesamte Mappe auswerten. `sheets` ist eine Liste aus `{ name, rows }`.
 * Monatsblätter einer Jahresmappe haben Vorrang; jedes andere Blatt wird als
 * Einzelmonatsplan versucht.
 */
export function analyzeWorkbook(sheets, { staff = [], fallbackYear, fallbackMonth } = {}) {
  const imports = [];
  const ignoredSheets = [];
  for (const sheet of sheets || []) {
    const rows = sheet?.rows || [];
    const name = sheet?.name || '';
    // Der Blattname bestimmt nur die Reihenfolge der Versuche, nicht das Format.
    // Ein Monatsblatt heißt „April“, ein Einzelplan darf aber ebenso heißen:
    // Ohne den zweiten Versuch fiel ein vollständig lesbarer Einzelplan allein
    // wegen seines Namens aus dem Import heraus.
    const parsers = monthFromSheetName(name)
      ? [() => parseMatrixSheet(name, rows, { staff, fallbackYear }),
         () => parsePlanSheet(name, rows, { staff, fallbackYear, fallbackMonth: monthFromSheetName(name) || fallbackMonth })]
      : [() => parsePlanSheet(name, rows, { staff, fallbackYear, fallbackMonth }),
         () => parseMatrixSheet(name, rows, { staff, fallbackYear })];

    let parsed = null;
    for (const parse of parsers) {
      parsed = parse();
      if (parsed) break;
    }
    if (parsed) imports.push(parsed);
    else ignoredSheets.push(name || '(ohne Namen)');
  }
  return { imports, ignoredSheets };
}
