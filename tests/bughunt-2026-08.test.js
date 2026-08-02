/**
 * Regressionen aus dem Bughunt vom 02.08.2026.
 *
 * Jeder Test hält genau einen tatsächlich reproduzierten Fehler fest. Die
 * Kommentare benennen das Fehlbild, damit eine spätere Änderung erkennt, was
 * die Zusage eigentlich schützt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { analyzeWorkbook, parsePlanSheet } from '../js/excel-import.js';
import { createEmptyMonth, normalizeMonthData } from '../js/defaults.js';
import { collectIssues } from '../js/rules.js';
import { DEFAULT_STAFF } from '../js/defaults.js';

const staff = [
  { id: 'lurz', name: 'Dr. Lurz', short: 'Lurz', roleLabel: 'FA/OA', includeInPlanning: true, includeInAbsenceList: true },
  { id: 'martin', name: 'Dr. Martin', short: 'Martin', roleLabel: 'FA', includeInPlanning: true, includeInAbsenceList: true }
];

const planSheetRows = (title, days = 30) => {
  const rows = [[title], ['Tag', 'Wochentag', 'BD', 'HG', '1. RBN', '2. RBN']];
  for (let day = 1; day <= days; day += 1) rows.push([day, 'Mo', day % 2 ? 'Lurz' : 'Martin', 'Martin', '', '']);
  return rows;
};

test('ein Einzelplan wird auch dann gelesen, wenn das Blatt wie ein Monat heißt', () => {
  // Fehlbild: „April“ als Blattname erzwang die Matrixauswertung. Ein
  // vollständig lesbarer Einzelplan fiel dadurch komplett aus dem Import.
  const named = analyzeWorkbook([{ name: 'April', rows: planSheetRows('April 2026') }], { staff, fallbackYear: 2026, fallbackMonth: 4 });
  const neutral = analyzeWorkbook([{ name: 'Plan', rows: planSheetRows('April 2026') }], { staff, fallbackYear: 2026, fallbackMonth: 4 });

  assert.equal(named.imports.length, 1, 'das Blatt darf nicht ignoriert werden');
  assert.deepEqual(named.ignoredSheets, []);
  assert.equal(named.imports[0].assignments, neutral.imports[0].assignments);
  assert.equal(named.imports[0].month, 4);
  assert.equal(named.imports[0].year, 2026);
});

test('ein Matrixblatt bleibt trotz des zusätzlichen Rückfalls ein Matrixblatt', () => {
  const rows = [
    ['', '', ...Array.from({ length: 30 }, (_, index) => `${index + 1}.`)],
    ['Dr. Lurz', 'Arbeitsplatz', ...Array.from({ length: 30 }, (_, index) => (index === 0 ? 'U' : ''))],
    ['Dr. Lurz', 'Dienst/Hintergrund', ...Array.from({ length: 30 }, (_, index) => (index === 1 ? 'D' : ''))]
  ];
  const result = analyzeWorkbook([{ name: 'April', rows }], { staff, fallbackYear: 2026, fallbackMonth: 7 });
  assert.equal(result.imports.length, 1);
  assert.equal(result.imports[0].month, 4, 'der Monat kommt weiterhin aus dem Blattnamen');
  assert.equal(result.imports[0].absences, 1);
  assert.equal(result.imports[0].assignments, 1);
});

test('ein Blatt ohne Monatsangabe meldet den geratenen Monat', () => {
  // Fehlbild: Fehlte der Monat im Kopf, landete das Blatt stillschweigend im
  // gerade angezeigten Monat – bestätigt wurde nur eine fehlende Jahreszahl.
  const withMonth = parsePlanSheet('Blatt', planSheetRows('April 2026'), { staff, fallbackYear: 2025, fallbackMonth: 7 });
  assert.equal(withMonth.usedFallbackMonth, false);
  assert.equal(withMonth.month, 4);

  const withoutMonth = parsePlanSheet('Blatt', planSheetRows('Dienstplan 2026'), { staff, fallbackYear: 2025, fallbackMonth: 7 });
  assert.equal(withoutMonth.usedFallbackMonth, true);
  assert.equal(withoutMonth.usedFallbackYear, false);
  assert.equal(withoutMonth.month, 7);
});

test('Datumszellen werden als lokaler Kalendertag gelesen, nicht über UTC', async () => {
  // `toISOString()` verschiebt lokale Mitternacht in jeder Zone mit positivem
  // UTC-Versatz auf den Vortag – aus dem 1. April würde der 31. März.
  const source = await readFile(new URL('../js/excel-import.js', import.meta.url), 'utf8');
  const code = source.split('\n').filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /toISOString/, 'excel-import darf keine UTC-Formatierung verwenden');

  const rows = [[new Date(2026, 3, 1)], ['Tag', 'Wochentag', 'BD', 'HG'], [1, 'Mi', 'Lurz', 'Martin']];
  const result = parsePlanSheet('Blatt', rows, { staff, fallbackYear: 2000, fallbackMonth: 1 });
  assert.equal(result.year, 2026);
  assert.equal(result.month, 4);
});

test('die Sammeleingabe kann Markierungen auch wieder entfernen', async () => {
  // Fehlbild: Das Raster markierte bestehende Einträge vor, übernahm aber nur
  // Ergänzungen. Ein abgewählter Tag blieb gesetzt – Sammellöschen war unmöglich.
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const apply = app.slice(app.indexOf('function onApplyBatch()'), app.indexOf('function shiftMonth('));
  assert.match(apply, /for \(const iso of Object\.keys\(monthData\.days\)\)/);
  assert.match(apply, /else if \(getAbsence\(monthData, staffId, iso\) === typeId\) setAbsence\(monthData, staffId, iso, ''\)/);
  assert.match(apply, /else if \(getPreference\(monthData, staffId, iso\) === typeId\) setPreference\(monthData, staffId, iso, ''\)/);
  assert.match(apply, /options\.filter\(option => option !== typeId\)/);
});

test('der Picker benennt auch übernommene und unbekannte Besetzungen', async () => {
  // Fehlbild: Bei einem Namen aus einem Altimport meldete der Kopf „Noch nicht
  // besetzt“, während „Eintrag löschen“ gleichzeitig angeboten wurde.
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /const assignedName = assignedId \? assignmentLabel\(state\.staff, assignedId\) : '';/);
  assert.doesNotMatch(app, /getStaffById\(state\.staff, assignedId\)\?\.name/);
});

test('ein abgebrochener Konflikt bleibt nicht als offene Absicht zurück', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /\$\('#conflictDialog'\)\.addEventListener\('close', \(\) => \{ pendingConflict = null; \}\);/);
});

test('offene Besetzungen sind an einem Typ erkennbar, nicht am Titeltext', () => {
  // Fehlbild: Die Zusammenfassung zählte „offen“ über eine Textsuche im Titel.
  const monthData = createEmptyMonth(2026, 7);
  const state = { staff: DEFAULT_STAFF, months: new Map([['2026-07', monthData]]), monthSources: new Map() };
  const issues = collectIssues(state, monthData);
  assert.ok(issues.length > 0);
  assert.ok(issues.every(issue => issue.kind === 'open' || issue.kind === 'finding'));
  assert.equal(issues.filter(issue => issue.kind === 'open').length, issues.length, 'ein leerer Monat kennt nur offene Stellen');

  monthData.days['2026-07-01'].bd = 'unbekannte-id';
  const mixed = collectIssues(state, monthData);
  const findings = mixed.filter(issue => issue.kind === 'finding');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, 'red');
});

test('das Lesen eines Monats legt serverseitig nichts an', async () => {
  // Fehlbild: Der GET initialisierte fehlende Monate im KV-Speicher. Das
  // Vorladen beim Monatswechsel schrieb dadurch bis zu dreizehn leere Monate.
  const handler = await readFile(new URL('../functions/api/month/[year]/[month].js', import.meta.url), 'utf8');
  const get = handler.slice(handler.indexOf('export async function onRequestGet'), handler.indexOf('export async function onRequestPut'));
  assert.doesNotMatch(get, /getOrInit/, 'ein Lesezugriff darf nichts schreiben');
  assert.match(get, /kv\(context\)\.get\(key, 'json'\)/);
  assert.match(get, /stored === null \? empty :/);

  const put = handler.slice(handler.indexOf('export async function onRequestPut'));
  assert.match(put, /await put\(context, key, normalized\)/, 'geschrieben wird weiterhin beim PUT');
});

test('die Revision bleibt eine ganze Zahl', () => {
  assert.equal(normalizeMonthData(2026, 1, { revision: 3.7 }).revision, 3);
  assert.equal(normalizeMonthData(2026, 1, { revision: -2 }).revision, 0);
  assert.equal(normalizeMonthData(2026, 1, { revision: 'zwei' }).revision, 0);
});

test('Dateinamen und Zeitstempel verwenden lokale Kalendertage', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const backup = app.slice(app.indexOf('async function exportJsonBackup()'), app.indexOf('async function onJsonImport('));
  assert.doesNotMatch(backup, /toISOString\(\)\.slice/, 'der Dateiname darf nicht über UTC entstehen');
  assert.match(backup, /now\.getFullYear\(\)/);
});
