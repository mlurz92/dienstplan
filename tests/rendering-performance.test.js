/**
 * Zusagen für die Flüssigkeit des Monatswechsels.
 *
 * Gemessen wurde am gefüllten Monat: Die Sammelprüfung kostete rund 18 ms, das
 * erneute Bewerten aller belegten Zellen rund 13 ms, und das Übernehmen der bis
 * zu dreizehn vorgeladenen Monate blockierte den Hauptthread am Stück – alles
 * mitten in der laufenden Wechselanimation. Diese Tests halten die daraus
 * entstandenen Regeln fest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DEFAULT_STAFF, createEmptyMonth } from '../js/defaults.js';
import { collectIssues } from '../js/rules.js';

test('die Sammelprüfung nutzt die Bewertungen der Tabelle mit', () => {
  const monthData = createEmptyMonth(2026, 7);
  monthData.days['2026-07-01'].bd = 'lurz';
  monthData.days['2026-07-01'].hg = 'martin';
  monthData.days['2026-07-02'].bd = 'dalitz';
  const state = { staff: DEFAULT_STAFF, months: new Map([['2026-07', monthData]]), monthSources: new Map() };

  const seen = [];
  const cache = new Map();
  const evaluate = parameters => {
    const key = `${parameters.dateIso}|${parameters.role}|${parameters.staffId}`;
    seen.push(key);
    if (!cache.has(key)) cache.set(key, { level: 'green', reasons: ['Keine relevanten Konflikte'], canSelect: true, meta: {} });
    return cache.get(key);
  };

  const issues = collectIssues(state, monthData, { evaluate });
  assert.equal(seen.length, 3, 'jede belegte Zelle wird genau einmal bewertet');
  assert.deepEqual([...new Set(seen)], seen);
  assert.ok(issues.every(issue => issue.kind === 'open' || issue.kind === 'finding'));

  // Ohne Einspeisung bleibt das Verhalten unverändert.
  assert.ok(collectIssues(state, monthData).length > 0);
});

test('die teuerste Auswertung liegt nicht im ersten sichtbaren Frame', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const render = app.slice(app.indexOf('function render() {'), app.indexOf('function scheduleIssueRender('));
  assert.match(render, /renderPlanTable\(monthData\)/);
  assert.match(render, /renderStats\(monthData\)/);
  assert.match(render, /scheduleIssueRender\(monthData, generation\)/);
  assert.doesNotMatch(render, /renderIssues\(monthData\)/, 'die Sammelprüfung darf den Renderpfad nicht blockieren');

  const schedule = app.slice(app.indexOf('function scheduleIssueRender('), app.indexOf('function renderPlanTable('));
  assert.match(schedule, /requestIdleCallback/);
  assert.match(schedule, /generation !== renderGeneration/, 'ein überholter Lauf darf nicht mehr zeichnen');
});

test('jede Zelle wird je Renderlauf nur einmal bewertet', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /function evaluateCached\(parameters\)/);
  assert.match(app, /evaluationCache = new Map\(\);/);
  assert.match(app, /evaluateCached\(\{ state, monthData, dateIso, role, staffId \}\)/);
  assert.match(app, /collectIssues\(state, monthData, \{ evaluate: evaluateCached \}\)/);
});

test('die Tabelle wird in einem Zug eingehängt', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const renderTable = app.slice(app.indexOf('function renderPlanTable('), app.indexOf('function weekdayLabelLong('));
  assert.match(renderTable, /createDocumentFragment\(\)/);
  assert.match(renderTable, /tbody\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(renderTable, /tbody\.appendChild/, 'einzeln eingehängte Zeilen kosten je Zeile einen Tabellenumbruch');
});

test('vorgeladene Monate werden einzeln übernommen und geben den Hauptthread frei', async () => {
  const source = await readFile(new URL('../js/state.js', import.meta.url), 'utf8');
  const warm = source.slice(source.indexOf('export async function warmAdjacentMonths('), source.indexOf('export function scheduleSave('));
  assert.match(warm, /await yieldToBrowser\(\);/);
  assert.doesNotMatch(warm, /Promise\.allSettled/, 'dreizehn Monate am Stück blockieren die Bewegung');
  assert.match(source, /function yieldToBrowser\(\)/);
  assert.match(source, /scheduler\?\.yield/);
});

test('eigene Änderungen werden sofort lokal gesichert, Serverstände gebündelt', async () => {
  const source = await readFile(new URL('../js/state.js', import.meta.url), 'utf8');
  const setter = source.slice(source.indexOf('export function setMonthData('), source.indexOf('export function readLocalMonth('));
  assert.match(setter, /if \(source === 'local' \|\| state\.dirtyMonths\.has\(key\)\)/);
  assert.match(setter, /storageSet\(`\$\{LOCAL_KEY_PREFIX\}month:\$\{key\}`, JSON\.stringify\(normalized\)\)/);
  assert.match(setter, /scheduleLocalMonthWrite\(key, normalized\)/);
  assert.match(source, /export function flushLocalMonthWrites\(\)/);

  // Vor jedem Auslesen und vor jedem Serverschreibvorgang muss die Sammlung leer sein.
  assert.match(source, /export function readLocalMonth\(year, month\) \{\r?\n  flushLocalMonthWrites\(\);/);
  assert.match(source, /export function readAllLocalMonths\(\) \{\r?\n  flushLocalMonthWrites\(\);/);
});
