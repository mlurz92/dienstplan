import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_STAFF } from '../js/defaults.js';
import { analyzeWorkbook, parseMatrixSheet, parsePlanSheet, resolveRbnValue, resolveStaffId } from '../js/excel-import.js';
import { assignmentLabel, externalAssignmentValue, getAbsence, isExternalAssignment } from '../js/rules.js';

process.env.TZ = 'Europe/Berlin';

// Die Zeilen stammen unverändert aus den vom Anwender gelieferten Altdateien.
const samples = JSON.parse(readFileSync(new URL('./fixtures/excel-import-samples.json', import.meta.url), 'utf8'));
const revive = rows => rows.map(row => row.map(cell => (cell && typeof cell === 'object' && cell.__date) ? new Date(cell.__date) : cell));
const sheetsOf = key => samples[key].map(sheet => ({ name: sheet.name, rows: revive(sheet.rows) }));
const staff = structuredClone(DEFAULT_STAFF);

test('Monatsplan mit deutschem Monatsnamen im Kopf wird vollständig gelesen', () => {
  const [sheet] = sheetsOf('plan_202603');
  const parsed = parsePlanSheet(sheet.name, sheet.rows, { staff });

  assert.equal(parsed.year, 2026);
  assert.equal(parsed.month, 3);
  assert.equal(parsed.monthData.days['2026-03-01'].bd, externalAssignmentValue('Torki'));
  assert.equal(parsed.monthData.days['2026-03-01'].hg, 'dalitz');
  assert.equal(parsed.monthData.days['2026-03-02'].bd, 'lurz');
  assert.equal(parsed.monthData.days['2026-03-04'].rbn1, 'Dr. Schüngel');
  assert.equal(parsed.monthData.days['2026-03-04'].rbn2, 'Dr. Maybaum');
  // 31 Tage, jeder mit mindestens einem Dienst.
  assert.equal(Object.values(parsed.monthData.days).filter(day => day.bd).length, 31);
  assert.deepEqual(parsed.unknownNames.sort(), ['Thaler', 'Torki']);
});

test('Monatsplan mit echtem Datumswert im Kopf wird dem richtigen Monat zugeordnet', () => {
  const [sheet] = sheetsOf('plan_202604');
  const parsed = parsePlanSheet(sheet.name, sheet.rows, { staff });

  assert.equal(parsed.year, 2026);
  assert.equal(parsed.month, 4);
  assert.equal(parsed.monthData.days['2026-04-01'].bd, 'licenji');
  assert.equal(parsed.monthData.days['2026-04-02'].bd, 'elhouba');
  assert.equal(Object.keys(parsed.monthData.days).length, 30);
  assert.equal(parsed.monthData.days['2026-04-30'] !== undefined, true);
});

test('Jahresmappe: Dienste, Abwesenheiten und unbekannte Personen aus dem Monatsblatt', () => {
  const sheets = sheetsOf('jahr_2026');
  const maerz = sheets.find(sheet => sheet.name === 'Mär');
  const parsed = parseMatrixSheet(maerz.name, maerz.rows, { staff });

  assert.equal(parsed.year, 2026);
  assert.equal(parsed.month, 3);
  assert.equal(parsed.monthData.days['2026-03-01'].bd, externalAssignmentValue('Hr. Torki'));
  assert.equal(parsed.monthData.days['2026-03-01'].hg, 'dalitz');
  assert.equal(parsed.monthData.days['2026-03-02'].bd, 'lurz');
  assert.equal(parsed.monthData.days['2026-03-02'].hg, externalAssignmentValue('Fr. Thaler'));
  assert.equal(getAbsence(parsed.monthData, 'martin', '2026-03-01'), 'urlaub');
  assert.equal(getAbsence(parsed.monthData, 'lurz', '2026-03-03'), 'fza');
  assert.deepEqual(parsed.unknownNames.sort(), ['Fr. Thaler', 'Hr. Torki']);
});

test('Jahresmappe 2025 wird mit ihrem eigenen Jahr gelesen, nicht mit dem Fallback', () => {
  const sheets = sheetsOf('jahr_2025');
  const januar = sheets.find(sheet => sheet.name === 'Jan');
  const parsed = parseMatrixSheet(januar.name, januar.rows, { staff, fallbackYear: 2099 });

  assert.equal(parsed.year, 2025);
  assert.equal(parsed.month, 1);
  assert.equal(getAbsence(parsed.monthData, 'polednia', '2025-01-02'), 'urlaub');
  assert.equal(parsed.monthData.days['2025-01-08'].bd, 'polednia');
  assert.equal(parsed.monthData.days['2025-01-06'].hg, 'dalitz');
});

test('analyzeWorkbook erkennt beide Formate und meldet unbrauchbare Blätter', () => {
  const jahr = analyzeWorkbook(sheetsOf('jahr_2026'), { staff });
  assert.deepEqual(jahr.imports.map(item => `${item.year}-${item.month}`), ['2026-1', '2026-3']);
  assert.deepEqual(jahr.ignoredSheets, ['Marker']);

  const plan = analyzeWorkbook(sheetsOf('plan_202604'), { staff });
  assert.equal(plan.imports.length, 1);
  assert.equal(plan.imports[0].month, 4);
  assert.equal(plan.ignoredSheets.length, 0);
});

test('Namen werden mit und ohne Anrede aufgelöst, Unbekannte bleiben unbekannt', () => {
  assert.equal(resolveStaffId(staff, 'Dr. Lurz'), 'lurz');
  assert.equal(resolveStaffId(staff, 'Lurz'), 'lurz');
  assert.equal(resolveStaffId(staff, 'hr. el houba'), 'elhouba');
  assert.equal(resolveStaffId(staff, 'El Houba'), 'elhouba');
  assert.equal(resolveStaffId(staff, 'Torki'), null);
  assert.equal(resolveStaffId(staff, ''), null);
});

test('Externe Einträge bleiben lesbar und sind von Personal-IDs unterscheidbar', () => {
  const value = externalAssignmentValue('Hr. Torki');
  assert.equal(isExternalAssignment(value), true);
  assert.equal(assignmentLabel(staff, value), 'Hr. Torki');
  // In der Tabelle steht auch bei importierten Namen nur der Nachname.
  assert.equal(assignmentLabel(staff, value, { short: true }), 'Torki');
  assert.equal(assignmentLabel(staff, externalAssignmentValue('Fr. Thaler'), { short: true }), 'Thaler');
  assert.equal(assignmentLabel(staff, externalAssignmentValue('Torki'), { short: true }), 'Torki');
  assert.equal(assignmentLabel(staff, 'lurz', { short: true }), 'Lurz');
  assert.equal(assignmentLabel(staff, 'lurz'), 'Dr. Lurz');
  assert.equal(assignmentLabel(staff, ''), '');
  assert.equal(externalAssignmentValue('   '), '');
});

test('RBN-Namen werden auf den gültigen Tagespool abgebildet, sonst als Altwert behalten', () => {
  assert.equal(resolveRbnValue('rbn1', '2026-03-04', 'Schüngel'), 'Dr. Schüngel');
  assert.equal(resolveRbnValue('rbn1', '2026-03-04', 'Dr. Schüngel'), 'Dr. Schüngel');
  assert.equal(resolveRbnValue('rbn2', '2026-03-04', 'Bailis'), 'Dr. Bailis');
  assert.equal(resolveRbnValue('rbn1', '2026-03-04', 'Thaler'), 'Thaler');
  // Fr. Hellmann steht erst ab Oktober 2026 im RBN-Pool.
  assert.equal(resolveRbnValue('rbn1', '2026-03-04', 'Hellmann'), 'Hellmann');
  assert.equal(resolveRbnValue('rbn1', '2026-10-04', 'Hellmann'), 'Fr. Hellmann');
  assert.equal(resolveRbnValue('rbn1', '2026-03-04', ''), '');
});

test('Externe Einträge erzeugen einen Hinweis statt eines roten Datenfehlers', async () => {
  const { createEmptyMonth } = await import('../js/defaults.js');
  const { collectIssues, setAssignment } = await import('../js/rules.js');
  const month = createEmptyMonth(2026, 3);
  setAssignment(month, '2026-03-01', 'bd', externalAssignmentValue('Hr. Torki'));
  setAssignment(month, '2026-03-01', 'hg', 'unbekannte-id');
  const testState = { staff, months: new Map([['2026-03', month]]), monthSources: new Map([['2026-03', 'server']]), currentYear: 2026, currentMonth: 3 };

  const issues = collectIssues(testState, month);
  assert.ok(issues.some(issue => issue.level === 'yellow' && issue.title.includes('Hr. Torki')));
  assert.ok(issues.some(issue => issue.level === 'red' && issue.title.includes('unbekannte Personal-ID')));
});

test('Monat und Jahr werden auch aus Seriennummern und deutschen Datumstexten gelesen', async () => {
  const { detectPeriod, excelSerialToDate } = await import('../js/excel-import.js');

  // 46113 ist der 1. April 2026 in der Excel-Zeitrechnung.
  assert.equal(excelSerialToDate(46113).toISOString().slice(0, 10), '2026-04-01');
  assert.equal(excelSerialToDate(12), null);
  assert.deepEqual(detectPeriod([['Bereitschaftsdienstplan', '', '', '', 46113]]), { year: 2026, month: 4 });
  assert.deepEqual(detectPeriod([['', '', '01.04.2026']]), { year: 2026, month: 4 });
  assert.deepEqual(detectPeriod([['', '', '2026-04-01 00:00:00']]), { year: 2026, month: 4 });
  assert.deepEqual(detectPeriod([['März 2026']]), { year: 2026, month: 3 });
  assert.deepEqual(detectPeriod([['Januar 2025']]), { year: 2025, month: 1 });
  assert.deepEqual(detectPeriod([['ohne Angabe']]), { year: null, month: null });
});

test('Der Merge ersetzt abweichende Werte, lässt aber nichts verschwinden', async () => {
  const { createEmptyMonth } = await import('../js/defaults.js');
  const { getAbsence: readAbsence, setAbsence, setAssignment } = await import('../js/rules.js');
  const { readFile } = await import('node:fs/promises');

  // mergeMonthData lebt in app.js und ist ohne DOM nicht importierbar; die
  // Funktion wird deshalb aus dem Quelltext gelöst und einzeln geprüft.
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function mergeMonthData(target, source) {');
  const end = source.indexOf('function exportCurrentMonthToExcel()');
  const factory = new Function('getAbsence', 'setAbsence', `${source.slice(start, end)}; return mergeMonthData;`);
  const mergeMonthData = factory(readAbsence, setAbsence);

  const target = createEmptyMonth(2026, 3);
  setAssignment(target, '2026-03-01', 'bd', 'lurz');
  setAssignment(target, '2026-03-02', 'hg', 'becker');
  target.days['2026-03-01'].rbn1 = 'Dr. Bailis';
  setAbsence(target, 'martin', '2026-03-05', 'urlaub', 'manual');

  const incoming = createEmptyMonth(2026, 3);
  setAssignment(incoming, '2026-03-01', 'bd', 'becker');   // abweichend → ersetzt
  setAssignment(incoming, '2026-03-02', 'hg', 'becker');   // gleich → unverändert
  setAssignment(incoming, '2026-03-03', 'bd', 'martin');   // neu → ergänzt
  setAbsence(incoming, 'martin', '2026-03-05', 'fza', 'import');

  const result = mergeMonthData(target, incoming);

  assert.equal(target.days['2026-03-01'].bd, 'becker');
  assert.equal(target.days['2026-03-02'].hg, 'becker');
  assert.equal(target.days['2026-03-03'].bd, 'martin');
  // Leere Felder der Datei löschen nichts.
  assert.equal(target.days['2026-03-01'].rbn1, 'Dr. Bailis');
  assert.equal(readAbsence(target, 'martin', '2026-03-05'), 'fza');
  assert.equal(result.added, 1);
  assert.equal(result.replaced, 2);
  assert.equal(result.unchanged, 1);
  assert.equal(result.changed, 3);
});
